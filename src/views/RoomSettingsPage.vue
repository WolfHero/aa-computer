<template>
  <div class="settings-page">
    <AppNavBar title="房间设置" :back-to="`/room/${roomId}`" />

    <div class="page-content">
      <div v-if="roomMode === 'local'" class="local-banner">
        <van-icon name="shield-o" /> 本地房间 · 数据仅保存在本机
      </div>
      <div v-else-if="roomMode === 'expired'" class="expired-banner">
        <van-icon name="info-o" /> 房间已过期，数据仅保存在本地（只读模式）
      </div>
      <div v-else-if="roomMode === 'legacy'" class="expired-banner">
        <van-icon name="info-o" /> 旧版本地数据（只读），可迁移为本地房间
      </div>

      <van-cell-group inset title="房间信息">
        <van-cell title="房间名称" :value="room?.name" />
        <van-cell title="房间简介" :value="room?.description || '无'" />
        <van-cell title="创建时间" :value="room?.created_at ? formatDate(room.created_at) : ''" />
        <van-cell title="版本" :value="String(room?.version ?? 0)" />
      </van-cell-group>

      <van-cell-group inset title="成员列表">
        <template v-for="m in members" :key="m.id">
          <van-cell center>
            <template #title>
              <div class="member-name-row">
                <span class="member-name">{{ m.name }}</span>
                <span v-if="m.id === selfMemberId" class="self-badge">你</span>
                <span v-if="roomMode === 'online' && m.user_id === room?.owner_id" class="owner-badge">房主</span>
                <span v-if="m.user_id && roomMode === 'online'" class="self-badge">已绑定</span>
                <span v-if="!m.user_id" class="unbound-badge">未绑定</span>
                <span v-if="m.is_unsubmitted && roomMode === 'online'" class="unsubmitted-badge">未提交</span>
              </div>
            </template>
            <template #right-icon>
              <div v-if="canManageMembers" class="member-actions">
                <van-icon
                  v-if="roomMode === 'local' || m.user_id === userId || isOwner"
                  name="edit"
                  class="action-icon"
                  @click="onEditName(m)"
                />
                <van-icon
                  v-if="!m.user_id && m.id !== selfMemberId && (roomMode === 'local' || isOwner)"
                  name="link-o"
                  class="action-icon"
                  @click="onGenerateInviteLink(m)"
                />
                <van-icon
                  v-if="canDeleteMember(m)"
                  name="delete-o"
                  class="action-icon delete-icon"
                  @click="onRemoveMember(m)"
                />
              </div>
            </template>
          </van-cell>
        </template>

        <van-cell v-if="canManageMembers" clickable @click="showAddMember = true">
          <template #title>
            <div class="add-member">
              <van-icon name="plus" /> 添加成员
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <div style="margin: 32px 16px; display: flex; flex-direction: column; gap: 12px">
        <van-button
          v-if="roomMode === 'local' || roomMode === 'online'"
          round
          block
          type="primary"
          plain
          icon="link-o"
          @click="onCopyInviteLink"
        >
          复制公共邀请链接
        </van-button>
        <van-button
          v-if="roomMode === 'local'"
          round
          block
          type="primary"
          plain
          icon="down"
          @click="onExportLocal"
        >
          导出本地房间
        </van-button>
        <van-button
          v-if="roomMode === 'legacy'"
          round
          block
          type="primary"
          plain
          icon="exchange"
          @click="onMigrateLegacy"
        >
          迁移为本地房间
        </van-button>
        <van-button
          v-if="roomMode !== 'online'"
          round
          block
          type="danger"
          plain
          icon="delete-o"
          @click="onDeleteLocal"
        >
          删除本地数据
        </van-button>
      </div>
    </div>

    <!-- Edit name dialog -->
    <van-dialog
      v-model:show="showNameEdit"
      title="修改昵称"
      show-cancel-button
      :before-close="onNameEditConfirm"
    >
      <div class="dialog-body">
        <van-field
          v-model="editName"
          placeholder="请输入昵称"
          maxlength="20"
          :rules="[{ required: true, message: '昵称不能为空' }]"
        />
      </div>
    </van-dialog>

    <!-- Add member dialog -->
    <van-dialog
      v-model:show="showAddMember"
      title="添加成员"
      show-cancel-button
      :before-close="onAddMemberConfirm"
    >
      <div class="dialog-body">
        <van-field
          v-model="newMemberName"
          placeholder="请输入成员昵称"
          maxlength="20"
          :rules="[{ required: true, message: '请输入昵称' }]"
        />
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { showToast } from '@/utils/toast'
import { useRooms } from '@/composables/useRooms'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useLocalBills } from '@/composables/useLocalBills'
import { useLocalBackup } from '@/composables/useLocalBackup'
import { useRoomLifecycle } from '@/composables/useRoomLifecycle'
import { useAuth } from '@/composables/useAuth'
import AppNavBar from '@/components/AppNavBar.vue'
import { formatDate } from '@/utils/format'
import type { LocalRoom, RoomMember, RoomMode, RoomWithMembers } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const roomId = computed(() => route.params.id as string)
const { getRoomById, addMember, updateMemberName, removeMember, generateInviteToken, convertLocalRoomToOnline } = useRooms()
const { getRoom, saveRoom, bumpRoomVersion, getLegacyRoomData } = useLocalRooms()
const { getBills } = useLocalBills()
const { downloadLocalRoom } = useLocalBackup()
const { removeRoomData, migrateLegacyRoom } = useRoomLifecycle()
const { userId } = useAuth()

type MemberInfo = Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted' | 'created_at'>

const room = ref<LocalRoom | RoomWithMembers | null>(null)
const roomMode = ref<RoomMode | 'legacy'>('online')
const members = ref<MemberInfo[]>([])

const selfMemberId = computed(() => {
  if (roomMode.value === 'local' || roomMode.value === 'expired') {
    return (room.value as LocalRoom | null)?.self_member_id ?? null
  }
  return members.value.find(m => m.user_id === userId.value)?.id ?? null
})

const isOwner = computed(() => room.value?.owner_id === userId.value)
const canManageMembers = computed(() => {
  if (roomMode.value === 'local') return true
  if (roomMode.value === 'online') return isOwner.value
  return false
})

function canDeleteMember(m: MemberInfo): boolean {
  if (roomMode.value === 'local') return m.id !== selfMemberId.value
  if (roomMode.value === 'online') return isOwner.value && m.user_id !== room.value?.owner_id
  return false
}

// Edit name dialog
const showNameEdit = ref(false)
const editName = ref('')
let editingMember: MemberInfo | null = null

// Add member dialog
const showAddMember = ref(false)
const newMemberName = ref('')

function applyLocalRoom(local: LocalRoom) {
  roomMode.value = local.mode
  room.value = local
  members.value = local.members.map(m => ({ ...m }))
}

function applyOnlineRoom(online: RoomWithMembers) {
  roomMode.value = 'online'
  room.value = online
  members.value = online.members.map(m => ({ ...m }))
}

async function loadSettings() {
  const v2 = getRoom(roomId.value)
  if (v2) {
    if (v2.mode !== 'online') {
      applyLocalRoom(v2)
      return
    }
    try {
      const online = await getRoomById(roomId.value)
      applyOnlineRoom(online)
      saveRoom({ ...online, mode: 'online', self_member_id: null })
    } catch {
      applyLocalRoom(v2)
      showToast('网络异常，显示本地缓存')
    }
    return
  }

  const legacy = getLegacyRoomData(roomId.value)
  if (legacy) {
    roomMode.value = 'legacy'
    room.value = {
      id: legacy.room.id,
      name: legacy.room.name,
      description: legacy.room.description,
      created_at: legacy.room.created_at,
      updated_at: legacy.room.updated_at,
      settings: legacy.room.settings,
      version: legacy.version,
      owner_id: legacy.room.owner_id,
      members: legacy.room.members,
    }
    members.value = legacy.room.members.map(m => ({ ...m }))
    return
  }

  // 无本地缓存的在线房间（如刚加入的用户）：直接拉取并缓存
  if (userId.value) {
    try {
      const online = await getRoomById(roomId.value)
      applyOnlineRoom(online)
      saveRoom({ ...online, mode: 'online', self_member_id: null })
      return
    } catch {
      // fall through
    }
  }

  showToast('房间不存在或已过期')
}

onMounted(() => {
  loadSettings()
})

watch(() => route.params.id, () => {
  room.value = null
  roomMode.value = 'online'
  members.value = []
  loadSettings()
})

async function ensureConverted(action: () => Promise<void>) {
  if (roomMode.value !== 'local') {
    await action()
    return
  }
  try {
    await showConfirmDialog({
      title: '转换为在线房间',
      message: '将进行匿名登录，并把房间信息、成员和全部账单上传到服务器。服务端数据将于最后一次编辑七天后清除，且转换不可撤销。',
      confirmButtonText: '确认转换',
    })
  } catch {
    return
  }

  try {
    await convertLocalRoomToOnline(roomId.value)
    const converted = getRoom(roomId.value)
    if (converted) applyLocalRoom(converted)
    showToast('已转换为在线房间')
    await action()
  } catch (e: unknown) {
    showToast(e instanceof Error && e.message !== '转换失败' ? e.message : '转换失败，请稍后重试')
  }
}

async function copyInviteLink() {
  const link = `${window.location.origin}/invite?room_id=${roomId.value}`
  try {
    await navigator.clipboard.writeText(link)
    showToast('已复制公共邀请链接')
  } catch {
    showToast('复制失败，请手动复制')
  }
}

function onCopyInviteLink() {
  ensureConverted(copyInviteLink)
}

function onExportLocal() {
  try {
    downloadLocalRoom(roomId.value)
    showToast('已导出本地房间文件')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '导出失败')
  }
}

async function onMigrateLegacy() {
  try {
    await showConfirmDialog({
      title: '迁移为本地房间',
      message: '将旧缓存转换为可编辑的本地房间，原旧缓存将被移除。',
      confirmButtonText: '迁移',
    })
  } catch {
    return
  }
  try {
    const migrated = migrateLegacyRoom(roomId.value, userId.value)
    showToast('已迁移为本地房间')
    if (migrated.id === roomId.value) {
      loadSettings()
    } else {
      router.replace(`/room/${migrated.id}/settings`)
    }
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '迁移失败')
  }
}

async function onDeleteLocal() {
  try {
    await showConfirmDialog({
      title: '删除本地数据',
      message: '确定删除此房间的本地缓存和所有本地账单数据吗？此操作不可恢复。',
      confirmButtonColor: '#ee0a24',
    })
  } catch { return }

  removeRoomData(roomId.value, roomMode.value === 'legacy')
  router.replace('/')
}

function onEditName(m: MemberInfo) {
  editingMember = m
  editName.value = m.name
  showNameEdit.value = true
}

async function onNameEditConfirm(action: string): Promise<boolean> {
  if (action === 'cancel') return true
  const trimmed = editName.value.trim()
  if (!trimmed) {
    showToast('昵称不能为空')
    return false
  }
  if (!editingMember) return true

  if (roomMode.value === 'local') {
    const local = getRoom(roomId.value)
    if (!local) return false
    const target = local.members.find(x => x.id === editingMember!.id)
    if (!target) return false
    target.name = trimmed
    saveRoom(local)
    bumpRoomVersion(roomId.value)
    applyLocalRoom(local)
    showToast('昵称已更新')
    return true
  }

  try {
    await updateMemberName(editingMember.id, trimmed)
    const m = members.value.find(x => x.id === editingMember!.id)
    if (m) m.name = trimmed
    if (room.value) {
      const rm = room.value.members.find(x => x.id === editingMember!.id)
      if (rm) rm.name = trimmed
      saveRoom({ ...room.value, mode: 'online', self_member_id: null, updated_at: new Date().toISOString() })
    }
    showToast('昵称已更新')
    return true
  } catch {
    showToast('修改失败')
    return false
  }
}

async function onAddMemberConfirm(action: string): Promise<boolean> {
  if (action === 'cancel') return true
  const trimmed = newMemberName.value.trim()
  if (!trimmed) {
    showToast('请输入昵称')
    return false
  }

  if (roomMode.value === 'local') {
    const local = getRoom(roomId.value)
    if (!local) return false
    local.members.push({
      id: crypto.randomUUID(),
      name: trimmed,
      user_id: null,
      is_unsubmitted: false,
      created_at: new Date().toISOString(),
    })
    saveRoom(local)
    bumpRoomVersion(roomId.value)
    applyLocalRoom(local)
    newMemberName.value = ''
    showToast('成员已添加')
    return true
  }

  try {
    const member = await addMember(roomId.value, trimmed)
    members.value.push(member)
    if (room.value) {
      room.value.members.push(member)
      saveRoom({ ...room.value, mode: 'online', self_member_id: null, updated_at: new Date().toISOString() })
    }
    newMemberName.value = ''
    showToast('成员已添加')
    return true
  } catch {
    showToast('添加失败')
    return false
  }
}

async function onGenerateInviteLink(m: MemberInfo) {
  await ensureConverted(async () => {
    try {
      const token = await generateInviteToken(m.id)
      const link = `${window.location.origin}/invite/member?token=${token}`
      await navigator.clipboard.writeText(link)
      showToast(`已复制「${m.name}」的专属邀请链接`)
    } catch {
      showToast('生成失败')
    }
  })
}

async function onRemoveMember(m: MemberInfo) {
  try {
    await showConfirmDialog({
      title: '删除成员',
      message: `确定将「${m.name}」移出房间吗？`,
      confirmButtonColor: '#ee0a24',
    })
  } catch { return }

  if (roomMode.value === 'local') {
    const local = getRoom(roomId.value)
    if (!local) return
    const referenced = getBills(roomId.value).some(
      b => b.created_by === m.id || b.shared_by.includes(m.id),
    )
    if (referenced) {
      showToast('该成员已被账单引用，无法删除')
      return
    }
    local.members = local.members.filter(x => x.id !== m.id)
    saveRoom(local)
    bumpRoomVersion(roomId.value)
    applyLocalRoom(local)
    showToast('已移除')
    return
  }

  try {
    await removeMember(m.id)
    members.value = members.value.filter(x => x.id !== m.id)
    if (room.value) {
      room.value.members = members.value
      saveRoom({ ...room.value, mode: 'online', self_member_id: null, updated_at: new Date().toISOString() })
    }
    showToast('已移除')
  } catch {
    showToast('移除失败，请确认该成员没有关联的账单记录')
  }
}
</script>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.local-banner {
  padding: 12px 16px;
  background: #e6f7ff;
  color: #1989fa;
  font-size: 13px;
  text-align: center;
}
.expired-banner {
  padding: 12px 16px;
  background: #fff7e6;
  color: #fa8c16;
  font-size: 13px;
  text-align: center;
}
.member-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.member-name {
  font-weight: 500;
}
.owner-badge {
  display: inline-block;
  padding: 0 4px;
  font-size: 12px;
  color: #ff6a00;
  border: 1px solid #ff6a00;
  border-radius: 2px;
}
.self-badge {
  display: inline-block;
  padding: 0 4px;
  font-size: 12px;
  color: #1989fa;
  border: 1px solid #1989fa;
  border-radius: 2px;
}
.unsubmitted-badge {
  display: inline-block;
  padding: 0 4px;
  font-size: 10px;
  color: #ff976a;
  border: 1px solid #ff976a;
  border-radius: 2px;
}
.unbound-badge {
  display: inline-block;
  padding: 0 4px;
  font-size: 10px;
  color: #999;
  border: 1px solid #999;
  border-radius: 2px;
}
.member-actions {
  display: flex;
  gap: 16px;
}
.action-icon {
  font-size: 18px;
  color: var(--color-text-secondary);
}
.action-icon.delete-icon {
  color: #ee0a24;
}
.add-member {
  color: #1989fa;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.dialog-body {
  padding: 16px;
}
</style>
