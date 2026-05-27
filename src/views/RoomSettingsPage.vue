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
        <van-cell v-for="m in members" :key="m.id">
          <template #title>
            <span>{{ m.name }}</span>
            <span v-if="m.user_id === userId" class="self-badge">你</span>
            <span v-if="m.is_unsubmitted" class="unsubmitted-badge">未提交</span>
          </template>
        </van-cell>
      </van-cell-group>

      <div style="margin: 32px 16px">
        <van-button
          v-if="!localOnly"
          round
          block
          type="primary"
          plain
          icon="link-o"
          @click="copyInviteLink"
        >
          复制邀请链接
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
const { getRoomById } = useRooms()
const { getCachedRoom, removeRoom, isRoomExpired } = useLocalRooms()
const { clearRoom } = useLocalBills()
const { userId } = useAuth()

const room = ref<RoomWithMembers | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted'>[]>([])
const localOnly = ref(false)

async function copyInviteLink() {
  const link = `${window.location.origin}/invite?room_id=${roomId}`
  try {
    await navigator.clipboard.writeText(link)
    showToast('已复制邀请链接')
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
  // 清除版本缓存
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
.self-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  font-size: 12px;
  color: #1989fa;
  border: 1px solid #1989fa;
  border-radius: 2px;
}
.unsubmitted-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  font-size: 10px;
  color: #ff976a;
  border: 1px solid #ff976a;
  border-radius: 2px;
}
</style>
