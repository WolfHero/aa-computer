<template>
  <div class="settings-page">
    <AppNavBar title="房间设置" />

    <div class="page-content">
      <div v-if="localOnly" class="expired-banner">
        <van-icon name="info-o" /> 此房间数据仅保存在本地
      </div>

      <van-cell-group inset title="房间信息">
        <van-cell title="房间名称" :value="room?.name" />
        <van-cell title="房间简介" :value="room?.description || '无'" />
        <van-cell title="创建时间" :value="room?.created_at ? formatDate(room.created_at) : ''" />
        <van-cell title="版本" :value="String(room?.version ?? 0)" />
      </van-cell-group>

      <van-cell-group inset title="成员列表" style="margin-top: 16px">
        <template v-for="m in members" :key="m.id">
          <van-cell center>
            <template #title>
              <div class="member-name-row">
                <span class="member-name">{{ m.name }}</span>
                <span v-if="m.user_id === room?.owner_id" class="owner-badge">房主</span>
                <span v-if="m.user_id === userId" class="self-badge">你</span>
                <span v-if="m.is_unsubmitted" class="unsubmitted-badge">未提交</span>
                <span v-if="!m.user_id" class="unbound-badge">未绑定</span>
              </div>
            </template>
            <template v-if="!localOnly" #right-icon>
              <div class="member-actions">
                <van-icon
                  name="edit"
                  class="action-icon"
                  @click="onEditName(m)"
                />
                <van-icon
                  v-if="isOwner && !m.user_id"
                  name="link-o"
                  class="action-icon"
                  @click="onGenerateInviteLink(m)"
                />
                <van-icon
                  v-if="isOwner && m.user_id !== room?.owner_id"
                  name="delete-o"
                  class="action-icon delete-icon"
                  @click="onRemoveMember(m)"
                />
              </div>
            </template>
          </van-cell>
        </template>

        <!-- Add member button (owner only) -->
        <van-cell v-if="isOwner && !localOnly" clickable @click="showAddMember = true">
          <template #title>
            <div class="add-member">
              <van-icon name="plus" /> 添加成员
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <div style="margin: 32px 16px; display: flex; flex-direction: column; gap: 12px">
        <van-button
          v-if="!localOnly"
          round
          block
          type="primary"
          plain
          icon="link-o"
          @click="copyInviteLink"
        >
          复制公共邀请链接
        </van-button>
        <van-button
          v-if="localOnly"
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
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { showToast } from '@/utils/toast'
import { useRooms } from '@/composables/useRooms'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useLocalBills } from '@/composables/useLocalBills'
import { useAuth } from '@/composables/useAuth'
import AppNavBar from '@/components/AppNavBar.vue'
import { formatDate } from '@/utils/format'
import { STORAGE_KEYS } from '@/utils/constants'
import type { RoomWithMembers, RoomMember } from '@/lib/types'

const route = useRoute()
const router = useRouter()
const roomId = route.params.id as string
const { getRoomById, addMember, updateMemberName, removeMember, generateInviteToken } = useRooms()
const { getCachedRoom, removeRoom, isRoomExpired, saveRoom } = useLocalRooms()
const { clearRoom } = useLocalBills()
const { userId } = useAuth()

const room = ref<RoomWithMembers | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted'>[]>([])
const localOnly = ref(false)

const isOwner = computed(() => room.value?.owner_id === userId.value)

// Edit name dialog
const showNameEdit = ref(false)
const editName = ref('')
let editingMember: Pick<RoomMember, 'id' | 'name'> | null = null

// Add member dialog
const showAddMember = ref(false)
const newMemberName = ref('')

async function copyInviteLink() {
  const link = `${window.location.origin}/invite?room_id=${roomId}`
  try {
    await navigator.clipboard.writeText(link)
    showToast('已复制公共邀请链接')
  } catch {
    showToast('复制失败，请手动复制')
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

  removeRoom(roomId)
  clearRoom(roomId)
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ROOM_VERSIONS)
    if (raw) {
      const map = JSON.parse(raw)
      delete map[roomId]
      localStorage.setItem(STORAGE_KEYS.ROOM_VERSIONS, JSON.stringify(map))
    }
  } catch { /* ignore */ }
  router.replace('/')
}

function onEditName(m: Pick<RoomMember, 'id' | 'name'>) {
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

  try {
    await updateMemberName(editingMember.id, trimmed)
    const m = members.value.find(x => x.id === editingMember!.id)
    if (m) m.name = trimmed
    if (room.value) {
      const rm = room.value.members.find(x => x.id === editingMember!.id)
      if (rm) rm.name = trimmed
      saveRoom(room.value)
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

  try {
    const member = await addMember(roomId, trimmed)
    members.value.push(member)
    if (room.value) {
      room.value.members.push(member)
      saveRoom(room.value)
    }
    newMemberName.value = ''
    showToast('成员已添加')
    return true
  } catch {
    showToast('添加失败')
    return false
  }
}

async function onGenerateInviteLink(m: Pick<RoomMember, 'id' | 'name'>) {
  try {
    const token = await generateInviteToken(m.id)
    const link = `${window.location.origin}/invite/member?token=${token}`
    await navigator.clipboard.writeText(link)
    showToast(`已复制「${m.name}」的专属邀请链接`)
  } catch {
    showToast('生成失败')
  }
}

async function onRemoveMember(m: Pick<RoomMember, 'id' | 'name'>) {
  try {
    await showConfirmDialog({
      title: '删除成员',
      message: `确定将「${m.name}」移出房间吗？`,
      confirmButtonColor: '#ee0a24',
    })
  } catch { return }

  try {
    await removeMember(m.id)
    members.value = members.value.filter(x => x.id !== m.id)
    if (room.value) {
      room.value.members = room.value.members.filter(x => x.id !== m.id)
      saveRoom(room.value)
    }
    showToast('已移除')
  } catch {
    showToast('移除失败，请确认该成员没有关联的账单记录')
  }
}

onMounted(async () => {
  if (isRoomExpired(roomId)) {
    const cached = getCachedRoom(roomId)
    if (cached) {
      room.value = cached as RoomWithMembers
      members.value = cached.members.map(m => ({ id: m.id, name: m.name, user_id: m.user_id, is_unsubmitted: m.is_unsubmitted }))
      localOnly.value = true
      return
    }
  }

  try {
    room.value = await getRoomById(roomId)
    members.value = room.value?.members ?? []
    localOnly.value = false
  } catch {
    showToast('房间不存在或已过期')
  }
})
</script>

<style scoped>
.settings-page {
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
