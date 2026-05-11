<template>
  <div class="settings-page">
    <AppNavBar title="房间设置" />

    <div class="page-content">
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
          round
          block
          type="primary"
          plain
          icon="link-o"
          @click="copyInviteLink"
        >
          复制邀请链接
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { showToast } from 'vant'
import { useRooms } from '@/composables/useRooms'
import { useAuth } from '@/composables/useAuth'
import AppNavBar from '@/components/AppNavBar.vue'
import { formatDate } from '@/utils/format'
import type { RoomWithMembers, RoomMember } from '@/lib/types'

const route = useRoute()
const roomId = route.params.id as string
const { getRoomById } = useRooms()
const { userId } = useAuth()

const room = ref<RoomWithMembers | null>(null)
const members = ref<Pick<RoomMember, 'id' | 'name' | 'user_id' | 'is_unsubmitted'>[]>([])

async function copyInviteLink() {
  const link = `${window.location.origin}/invite?room_id=${roomId}`
  try {
    await navigator.clipboard.writeText(link)
    showToast('已复制邀请链接')
  } catch {
    showToast('复制失败，请手动复制')
  }
}

onMounted(async () => {
  try {
    room.value = await getRoomById(roomId)
    members.value = room.value?.members ?? []
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
