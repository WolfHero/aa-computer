<template>
  <div class="room-detail">
    <AppNavBar
      :title="room?.name ?? '账单'"
      :right-actions="[
        { text: '新增', onClick: () => { checkAndShowBillForm() } },
        { text: '菜单', onClick: () => showActionSheet = true },
      ]"
    />

    <div v-if="roomExpired" class="expired-banner">
      <van-icon name="info-o" /> 房间已过期，数据仅保存在本地，无法同步
    </div>

    <BillFilter
      v-if="!roomExpired"
      :members="members"
      @update="onFilterUpdate"
    />

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh" :disabled="roomExpired">
      <van-list
        v-model:loading="listLoading"
        :finished="listFinished"
        :immediate-check="false"
        finished-text="没有更多了"
        @load="onLoad"
      >
        <div v-for="bill in mergedBills" :key="bill.local_id || bill.id" class="bill-item">
          <BillCard :bill="bill" :members="members" @click="onBillEdit(bill)" />
        </div>

        <div v-if="mergedBills.length === 0 && !listLoading" class="empty-state">
          <van-icon name="bill-o" size="48" color="#c8c9cc" />
          <p>暂无账单记录</p>
        </div>
      </van-list>
    </van-pull-refresh>

    <div class="bottom-notice">服务端数据将于最后一次编辑的七天后清除</div>

    <van-back-top />

    <BillForm
      v-model:show="showBillForm"
      :room-id="roomId"
      :members="members"
      :editing-bill="editingBill"
      :creator-name="myMember?.name ?? ''"
      :creator-id="myMember?.id ?? ''"
      @saved="onBillSaved"
      @delete="onDeleteBill"
      @closed="editingBill = null"
    />

    <RoomSettingsActionSheet
      v-model:show="showActionSheet"
      :room-id="roomId"
      :sort-mode="sortMode"
      :room-expired="roomExpired"
      @update:sort-mode="onSortModeChange"
      @submit-bills="onBillsSubmitted"
      @calculate-aa="onCalculateAA"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showConfirmDialog } from 'vant'
import { supabase } from '@/lib/supabaseClient'
import { useRooms } from '@/composables/useRooms'
import { useLocalBills } from '@/composables/useLocalBills'
import { useRemoteBills } from '@/composables/useRemoteBills'
import { useAuth } from '@/composables/useAuth'
import AppNavBar from '@/components/AppNavBar.vue'
import BillCard from '@/components/BillCard.vue'
import BillForm from '@/components/BillForm.vue'
import BillFilter from '@/components/BillFilter.vue'
import RoomSettingsActionSheet from '@/components/RoomSettingsActionSheet.vue'
import { PAGE_SIZE, STORAGE_KEYS } from '@/utils/constants'
import type { Bill, BillFilter as BillFilterType, RoomMember, RoomWithMembers, SortMode } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const roomId = computed(() => route.params.id as string)
const { getRoomById } = useRooms()
const { getBills, getUnsyncedBills, syncBillsFromServer, mergeFetchedBills, deleteBill } = useLocalBills()
const { submitBills, markForNextBill, checkUnsubmittedMembers, fetchBills } = useRemoteBills()
const { userId } = useAuth()

type MemberInfo = { id: string; name: string; user_id: string; is_unsubmitted: boolean; created_at: string }
const room = ref<RoomWithMembers | null>(null)
const myMember = ref<MemberInfo | null>(null)
const roomExpired = ref(false)
const members = ref<Pick<RoomMember, 'id' | 'name'>[]>([])

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

// Merged bills: local unsynced + remote synced
const mergedBills = computed(() => {
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

async function loadRoom() {
  try {
    room.value = await getRoomById(roomId.value)
    myMember.value = room.value.members.find(m => m.user_id === userId.value) ?? null
    members.value = room.value.members.map(m => ({ id: m.id, name: m.name }))
    roomExpired.value = false
  } catch (e) {
    roomExpired.value = true
    console.error('加载房间失败', e)
    showToast('无权限访问')
    router.replace('/')
  }
}

async function loadRemoteBills(refresh = false) {
  if (roomExpired.value) return
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
    // Full refresh with no filters: replace cached synced data
    // Otherwise: merge new data into cache (additive, for pagination/filters)
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
  loadRemoteBills()
}

function onFilterUpdate(newFilters: BillFilterType) {
  filters.value = { ...newFilters }
  loadRemoteBills(true)
}

function onSortModeChange(newMode: SortMode) {
  sortMode.value = newMode
  loadRemoteBills(true)
}

async function checkAndShowBillForm() {
  if (!myMember.value) return
  if (hasSubmittedBefore.value) {
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
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }

  if (bill.id) {
    // Synced bill: delete from DB + version increment (transactional)
    const { error } = await supabase.rpc('delete_bill', {
      p_bill_id: bill.id,
      p_room_id: roomId.value,
    })
    if (error) throw error
  }
  deleteBill(roomId.value, bill.local_id)
  onBillSaved()
}

async function onBillSaved() {
  hasSubmittedBefore.value = true
  await loadRemoteBills(true)
  await saveCurrentRoomVersion()
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

async function onCalculateAA() {
  if (!roomExpired.value) {
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

async function onRefresh() {
  refreshing.value = true
  await loadRoom()
  await loadRemoteBills(true)
  await saveCurrentRoomVersion()
  refreshing.value = false
}

onMounted(async () => {
  if (!userId.value) {
    showToast('无权限访问')
    router.replace('/')
    return
  }

  await loadRoom()
  if (!roomExpired.value && room.value) {
    if (room.value.version !== lastBillsVersion.value) {
      await loadRemoteBills(true)
      lastBillsVersion.value = room.value.version
      saveRoomVersion(room.value.version)
    } else {
      // Version unchanged, load from localStorage cache
      syncedBills.value = getBills(roomId.value)
        .filter(b => b.synced && b.id)
        .map(b => ({ ...b, local_id: b.id, synced: true }))
      listFinished.value = true
    }
  }
})
</script>

<style scoped>
.room-detail {
  min-height: 100vh;
  background: var(--color-bg);
}
.expired-banner {
  padding: 12px 16px;
  background: #fff7e6;
  color: #fa8c16;
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
</style>
