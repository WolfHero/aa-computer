<template>
  <div class="room-detail">
    <AppNavBar
      :title="room?.name || routeRoomName || '账单'"
      back-to="/"
      :right-actions="rightActions"
    />

    <div v-if="offlineView" class="expired-banner">
      <van-icon name="info-o" /> 网络异常，正在显示本地缓存（只读）
    </div>
    <div v-else-if="roomMode === 'local'" class="local-banner">
      <van-icon name="shield-o" /> 本地房间 · 数据仅保存在本机
    </div>
    <div v-else-if="roomMode === 'expired'" class="expired-banner">
      <van-icon name="info-o" /> 房间已过期，数据仅保存在本地（只读模式）
    </div>
    <div v-else-if="roomMode === 'legacy'" class="expired-banner">
      <van-icon name="info-o" /> 旧版本地数据（只读），可在菜单中迁移为本地房间
    </div>

    <BillFilter
      v-if="(roomMode === 'local' || roomMode === 'online') && !offlineView"
      :members="members"
      @update="onFilterUpdate"
    />

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh" :disabled="roomMode !== 'online'">
      <van-list
        v-model:loading="listLoading"
        :finished="listFinished"
        :immediate-check="false"
        finished-text="没有更多了"
        @load="onLoad"
      >
        <div v-for="bill in mergedBills" :key="bill.local_id || bill.id" class="bill-item">
          <BillCard
            :bill="bill"
            :members="members"
            :show-local-badge="roomMode === 'online'"
            @click="onBillEdit(bill)"
          />
        </div>

        <div v-if="mergedBills.length === 0 && !listLoading" class="empty-state">
          <van-icon name="bill-o" size="48" color="#c8c9cc" />
          <p>暂无账单记录</p>
        </div>
      </van-list>
    </van-pull-refresh>

    <div v-if="roomMode === 'online'" class="bottom-notice">服务端数据将于最后一次编辑的七天后清除</div>

    <van-button
      class="calculate-aa-btn"
      round
      size="small"
      @click="onCalculateAAButtonClick"
    >
      <van-icon name="balance-o" /> 计算AA
    </van-button>

    <van-back-top :bottom="80" />

    <BillForm
      v-model:show="showBillForm"
      :room-id="roomId"
      :members="members"
      :editing-bill="editingBill"
      :creator-name="myMember?.name ?? ''"
      :creator-id="myMember?.id ?? ''"
      :online="roomMode === 'online'"
      @saved="onBillSaved"
      @delete="onDeleteBill"
      @closed="editingBill = null"
    />

    <RoomSettingsActionSheet
      v-model:show="showActionSheet"
      :room-id="roomId"
      :sort-mode="sortMode"
      :mode="actionSheetMode"
      :legacy="roomMode === 'legacy'"
      @update:sort-mode="onSortModeChange"
      @submit-bills="onBillsSubmitted"
      @delete-local="onDeleteLocal"
      @rebuild="onRebuild"
      @export="onExport"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabaseClient'
import { useRooms } from '@/composables/useRooms'
import { useLocalBills } from '@/composables/useLocalBills'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useLocalBackup } from '@/composables/useLocalBackup'
import { useRoomLifecycle } from '@/composables/useRoomLifecycle'
import { useRemoteBills } from '@/composables/useRemoteBills'
import { useAuth } from '@/composables/useAuth'
import AppNavBar from '@/components/AppNavBar.vue'
import BillCard from '@/components/BillCard.vue'
import BillForm from '@/components/BillForm.vue'
import BillFilter from '@/components/BillFilter.vue'
import RoomSettingsActionSheet from '@/components/RoomSettingsActionSheet.vue'
import { PAGE_SIZE, STORAGE_KEYS } from '@/utils/constants'
import type {
  Bill,
  BillFilter as BillFilterType,
  LocalRoom,
  RoomMember,
  RoomMode,
  SortMode,
} from '@/lib/types'

const route = useRoute()
const router = useRouter()
const roomId = computed(() => route.params.id as string)
const routeRoomName = (history.state as Record<string, unknown> | null)?.roomName as string | undefined
const { getRoomById } = useRooms()
const { getBills, getUnsyncedBills, syncBillsFromServer, mergeFetchedBills, deleteBill } = useLocalBills()
const { submitBills, markForNextBill, checkUnsubmittedMembers, fetchBills } = useRemoteBills()
const { getRoom, saveRoom, getLegacyRoomData, markExpired } = useLocalRooms()
const { removeRoomData, rebuildFromExpired, migrateLegacyRoom } = useRoomLifecycle()
const { downloadLocalRoom } = useLocalBackup()
const { userId } = useAuth()

type MemberInfo = Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted' | 'created_at'>
type RoomView = {
  id: string
  name: string
  description: string
  version: number
  members: MemberInfo[]
  mode: RoomMode | 'legacy'
  self_member_id?: string | null
}

const room = ref<RoomView | null>(null)
const roomMode = ref<RoomMode | 'legacy'>('online')
const offlineView = ref(false)
const legacyData = ref<ReturnType<typeof getLegacyRoomData>>(null)
const myMember = ref<MemberInfo | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name' | 'user_id'>[]>([])

// Bill list state
const syncedBills = ref<any[]>([])
const listLoading = ref(false)
const listFinished = ref(false)
const refreshing = ref(false)
const remotePage = ref(0)
const hasMoreRemote = ref(true)

// Sort & filter
const sortMode = ref<SortMode>('created_at')
const filters = ref<BillFilterType>({ content: '', creator_id: null, paid_at_start: null, paid_at_end: null })

// UI state
const showBillForm = ref(false)
const showActionSheet = ref(false)
const hasSubmittedBefore = ref(false)

// Bill edit/delete
const editingBill = ref<Bill | null>(null)

function loadRoomVersion(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_VERSIONS)
    return raw ? (JSON.parse(raw)[roomId.value] ?? -1) : -1
  } catch { return -1 }
}
function saveRoomVersion(v: number) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_VERSIONS)
    const map = raw ? JSON.parse(raw) : {}
    map[roomId.value] = v
    localStorage.setItem(STORAGE_KEYS.ROOM_VERSIONS, JSON.stringify(map))
  } catch { /* ignore */ }
}

const lastBillsVersion = ref(loadRoomVersion())

function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError
    || (e instanceof Error && /failed to fetch|network|load failed/i.test(e.message))
}

function applyLocalRoom(v2: LocalRoom) {
  roomMode.value = v2.mode
  room.value = {
    id: v2.id,
    name: v2.name,
    description: v2.description,
    version: v2.version,
    members: v2.members,
    mode: v2.mode,
    self_member_id: v2.self_member_id,
  }
  members.value = v2.members.map(m => ({ id: m.id, name: m.name, user_id: m.user_id }))
  myMember.value = v2.members.find(m => m.id === v2.self_member_id)
    ?? v2.members.find(m => m.user_id === userId.value)
    ?? null
}

function applyLegacy(data: NonNullable<ReturnType<typeof getLegacyRoomData>>) {
  roomMode.value = 'legacy'
  legacyData.value = data
  room.value = {
    id: data.room.id,
    name: data.room.name,
    description: data.room.description,
    version: data.version,
    members: data.room.members,
    mode: 'legacy',
    self_member_id: null,
  }
  members.value = data.room.members.map(m => ({ id: m.id, name: m.name, user_id: m.user_id }))
  myMember.value = data.room.members.find(m => m.user_id === userId.value) ?? null
}

// Merged bills
const mergedBills = computed(() => {
  if (roomMode.value !== 'online') {
    const all = roomMode.value === 'legacy'
      ? (legacyData.value?.bills ?? [])
      : getBills(roomId.value)
    return all
      .map(b => ({ ...b, local_id: b.local_id || b.id! }))
      .filter(b => {
        if (filters.value.content && !b.content.includes(filters.value.content)) return false
        if (filters.value.creator_id && b.created_by !== filters.value.creator_id) return false
        if (filters.value.paid_at_start && b.paid_at < filters.value.paid_at_start) return false
        if (filters.value.paid_at_end && b.paid_at > filters.value.paid_at_end) return false
        return true
      })
      .sort((a, b) => {
        const da = sortMode.value === 'paid_at' ? new Date(b.paid_at).getTime() : new Date(b.created_at).getTime()
        const db = sortMode.value === 'paid_at' ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime()
        return da - db
      })
  }

  const local = getUnsyncedBills(roomId.value)
  const remote = syncedBills.value ?? []
  const seen = new Set<string>()
  const all: Bill[] = []

  for (const b of local) {
    all.push(b)
    if (b.id) seen.add(b.id)
  }
  for (const b of remote) {
    if (!seen.has(b.id)) {
      all.push({ ...b, local_id: b.id, synced: true })
    }
  }

  const mode = sortMode.value
  all.sort((a, b) => {
    const da = mode === 'paid_at' ? new Date(b.paid_at).getTime() : new Date(b.created_at).getTime()
    const db = mode === 'paid_at' ? new Date(a.paid_at).getTime() : new Date(a.created_at).getTime()
    return da - db
  })

  // Apply filters client-side for local bills
  return all.filter(b => {
    if (b.synced) return true
    if (filters.value.content && !b.content.includes(filters.value.content)) return false
    if (filters.value.creator_id && b.created_by !== filters.value.creator_id) return false
    if (filters.value.paid_at_start && b.paid_at < filters.value.paid_at_start) return false
    if (filters.value.paid_at_end && b.paid_at > filters.value.paid_at_end) return false
    return true
  })
})

async function loadOnlineRoom(cached: LocalRoom | null) {
  try {
    const remote = await getRoomById(roomId.value)
    offlineView.value = false
    roomMode.value = 'online'
    room.value = { ...remote, mode: 'online', self_member_id: null }
    members.value = remote.members.map(m => ({ id: m.id, name: m.name, user_id: m.user_id }))
    myMember.value = remote.members.find(m => m.user_id === userId.value) ?? null
    saveRoom({ ...remote, mode: 'online', self_member_id: null })
    if (remote.version !== lastBillsVersion.value) {
      await loadRemoteBills(true)
      lastBillsVersion.value = remote.version
      saveRoomVersion(remote.version)
    } else {
      loadSyncedBillsFromLocal()
    }
  } catch (e: unknown) {
    if (isNetworkError(e) && cached) {
      offlineView.value = true
      applyLocalRoom({ ...cached, mode: 'online' })
      syncedBills.value = getBills(roomId.value)
        .filter(b => b.synced && b.id)
        .map(b => ({ ...b, local_id: b.id, synced: true }))
      listFinished.value = true
      showToast('网络异常，显示本地缓存')
      return
    }
    markExpired(roomId.value, userId.value)
    const expired = getRoom(roomId.value)
    if (expired) {
      applyLocalRoom(expired)
      showToast('房间已过期，数据仅保存在本地（只读模式）')
      return
    }
    showToast('无权限访问')
    router.replace('/')
  }
}

async function loadView() {
  lastBillsVersion.value = loadRoomVersion()
  const v2 = getRoom(roomId.value)
  if (v2 && v2.mode !== 'online') {
    applyLocalRoom(v2)
    return
  }

  const legacy = getLegacyRoomData(roomId.value)
  if (legacy) {
    let migrate = false
    try {
      await showConfirmDialog({
        title: '发现旧版本地数据',
        message: '此房间来自旧版本缓存。是否迁移为可编辑的本地房间？选择“暂不迁移”将以只读方式查看。',
        confirmButtonText: '迁移',
        cancelButtonText: '暂不迁移',
      })
      migrate = true
    } catch {
      migrate = false
    }
    if (migrate) {
      try {
        const newRoom = migrateLegacyRoom(roomId.value, userId.value)
        showToast('已迁移为本地房间')
        if (newRoom.id === roomId.value) {
          loadView()
        } else {
          router.replace(`/room/${newRoom.id}`)
        }
        return
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : '迁移失败')
      }
    }
    applyLegacy(legacy)
    return
  }

  if (!userId.value) {
    showToast('无权限访问')
    router.replace('/')
    return
  }
  await loadOnlineRoom(v2)
}

async function loadRemoteBills(refresh = false) {
  if (roomMode.value !== 'online' || offlineView.value) return
  if (refresh) {
    remotePage.value = 0
    syncedBills.value = []
    hasMoreRemote.value = true
    listFinished.value = false
  }
  if (!hasMoreRemote.value) return

  listLoading.value = true
  try {
    const data = await fetchBills(roomId.value, {
      sortBy: sortMode.value,
      page: remotePage.value,
      pageSize: PAGE_SIZE,
      filters: filters.value,
    })
    if (data.length < PAGE_SIZE) {
      hasMoreRemote.value = false
      listFinished.value = true
    }
    if (refresh) {
      syncedBills.value = data
    } else {
      syncedBills.value = [...(syncedBills.value ?? []), ...data]
    }
    if (refresh && !filters.value.content && !filters.value.creator_id) {
      syncBillsFromServer(roomId.value, data)
    } else {
      mergeFetchedBills(roomId.value, data)
    }
    remotePage.value++
  } catch (e: unknown) {
    console.error('加载账单失败', e)
    showToast(e instanceof Error ? e.message : '加载失败')
  }
  listLoading.value = false
}

function onLoad() {
  if (roomMode.value !== 'online' || offlineView.value) {
    listLoading.value = false
    listFinished.value = true
    return
  }
  loadRemoteBills()
}

function onFilterUpdate(newFilters: BillFilterType) {
  filters.value = { ...newFilters }
  if (roomMode.value === 'online') {
    loadRemoteBills(true)
  }
}

function onSortModeChange(newMode: SortMode) {
  sortMode.value = newMode
  if (roomMode.value === 'online') {
    loadRemoteBills(true)
  }
}

const rightActions = computed(() => {
  if (roomMode.value === 'local' || (roomMode.value === 'online' && !offlineView.value)) {
    return [
      { text: '新增', onClick: checkAndShowBillForm },
      { text: '菜单', onClick: () => showActionSheet.value = true },
    ]
  }
  return [{ text: '菜单', onClick: () => showActionSheet.value = true }]
})

const actionSheetMode = computed<RoomMode>(() => {
  if (roomMode.value === 'legacy') return 'expired'
  return roomMode.value
})

async function checkAndShowBillForm() {
  if (offlineView.value) return
  if (!myMember.value) return
  if (roomMode.value === 'online' && hasSubmittedBefore.value) {
    try {
      await markForNextBill(roomId.value)
    } catch {
      // ignore mark errors
    }
  }
  editingBill.value = null
  showBillForm.value = true
}

function onBillEdit(bill: Bill) {
  if (offlineView.value) return
  if (roomMode.value !== 'local' && roomMode.value !== 'online') return
  editingBill.value = bill
  showBillForm.value = true
}

async function onDeleteBill() {
  const bill = editingBill.value
  if (!bill) return
  showBillForm.value = false

  try {
    await showConfirmDialog({
      title: '删除账单',
      message: `确定删除「${bill.content}」吗？`,
      confirmButtonColor: 'var(--color-danger)',
    })
  } catch {
    return
  }

  if (roomMode.value === 'online') {
    if (bill.id) {
      try {
        const { error } = await supabase.rpc('delete_bill', {
          p_bill_id: bill.id,
          p_room_id: roomId.value,
        })
        if (error) throw error
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : '删除失败')
        return
      }
    }
  }
  deleteBill(roomId.value, bill.local_id)
  onBillSaved()
}

async function onBillSaved() {
  if (roomMode.value === 'online') {
    hasSubmittedBefore.value = true
    await loadRemoteBills(true)
    await saveCurrentRoomVersion()
  }
}

async function onBillsSubmitted() {
  hasSubmittedBefore.value = true
  await loadRemoteBills(true)
  await saveCurrentRoomVersion()
}

async function saveCurrentRoomVersion() {
  try {
    const refreshed = await getRoomById(roomId.value)
    lastBillsVersion.value = refreshed.version
    saveRoomVersion(refreshed.version)
  } catch (e) {
    console.error('更新房间版本号失败', e)
  }
}

const hasBills = computed(() => {
  if (roomMode.value === 'legacy') {
    return (legacyData.value?.bills.length ?? 0) > 0
  }
  return getBills(roomId.value).length > 0 || (syncedBills.value?.length ?? 0) > 0
})

function onCalculateAAButtonClick() {
  if (!hasBills.value) {
    showToast('请先添加账单')
    return
  }
  onCalculateAA()
}

async function onCalculateAA() {
  if (roomMode.value === 'online' && !offlineView.value) {
    try {
      await submitBills(roomId.value)
      hasSubmittedBefore.value = true
    } catch {
      showToast('提交账单失败')
      return
    }

    const unsubmitted = await checkUnsubmittedMembers(roomId.value)
    if (unsubmitted) {
      showToast(unsubmitted)
      return
    }
  }

  router.push(`/room/${roomId.value}/aa`)
}

async function onDeleteLocal() {
  try {
    await showConfirmDialog({
      title: '删除本地数据',
      message: '确定删除此房间的本地缓存和所有本地账单数据吗？此操作不可恢复。',
      confirmButtonColor: 'var(--color-danger)',
    })
  } catch { return }

  removeRoomData(roomId.value, roomMode.value === 'legacy')
  router.replace('/')
}

async function onRebuild() {
  if (roomMode.value === 'legacy') {
    try {
      await showConfirmDialog({
        title: '迁移为本地房间',
        message: '将旧缓存转换为可编辑的本地房间，原旧缓存将被移除。',
        confirmButtonText: '迁移',
      })
    } catch { return }
    try {
      const newRoom = migrateLegacyRoom(roomId.value, userId.value)
      showToast('已迁移为本地房间')
      if (newRoom.id === roomId.value) {
        loadView()
      } else {
        router.replace(`/room/${newRoom.id}`)
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : '迁移失败')
    }
    return
  }

  try {
    await showConfirmDialog({
      title: '重建为本地房间',
      message: '将复制成员和账单生成一个新的本地房间，原过期房间条目将被移除。',
      confirmButtonColor: 'var(--color-danger)',
    })
  } catch { return }

  try {
    const newRoom = rebuildFromExpired(roomId.value)
    showToast('已重建为本地房间')
    router.replace(`/room/${newRoom.id}`)
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '重建失败')
  }
}

function onExport() {
  try {
    downloadLocalRoom(roomId.value)
    showToast('已导出本地房间文件')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '导出失败')
  }
}

async function onRefresh() {
  refreshing.value = true
  if (offlineView.value) {
    offlineView.value = false
  }
  await loadView()
  refreshing.value = false
}

function loadSyncedBillsFromLocal() {
  syncedBills.value = getBills(roomId.value)
    .filter(b => b.synced && b.id)
    .map(b => ({ ...b, local_id: b.id, synced: true }))
  listFinished.value = true
}

onMounted(() => {
  loadView()
})

watch(() => route.params.id, () => {
  room.value = null
  roomMode.value = 'online'
  offlineView.value = false
  legacyData.value = null
  myMember.value = null
  members.value = []
  syncedBills.value = []
  listLoading.value = false
  listFinished.value = false
  hasMoreRemote.value = true
  remotePage.value = 0
  editingBill.value = null
  showBillForm.value = false
  showActionSheet.value = false
  loadView()
})
</script>

<style scoped>
.room-detail {
  min-height: 100vh;
  background: var(--color-bg);
}
.local-banner {
  padding: 12px 16px;
  background: var(--color-tint-info-bg);
  color: var(--color-tint-info-text);
  font-size: 13px;
  text-align: center;
}
.expired-banner {
  padding: 12px 16px;
  background: var(--color-tint-warning-bg);
  color: var(--color-tint-warning-text);
  font-size: 13px;
  text-align: center;
}
.bill-item {
  padding: 0 16px;
  margin-top: 8px;
}
:deep(.bill-item .van-cell) {
  border-radius: 8px;
}
.empty-state {
  text-align: center;
  padding: 60px 16px;
  color: var(--color-text-secondary);
}
.empty-state p {
  margin-top: 16px;
  font-size: 14px;
}
.calculate-aa-btn {
  position: fixed;
  right: 30px;
  bottom: 40px;
  z-index: 100;
  background: var(--van-primary-color, var(--color-primary, #1989fa));
  color: #fff;
  border: none;
  padding: 0 14px;
  line-height: 36px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
</style>
