<template>
  <div class="invite-page">
    <AppNavBar title="加入房间" :show-back="false" />

    <div class="page-content">
      <div v-if="room" class="room-info">
        <h2 class="room-name">{{ room.name }}</h2>
        <p class="room-creator">创建人：{{ room.creator_name }}</p>
      </div>

      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field
            v-model="name"
            name="name"
            label="你的名字"
            placeholder="请输入你的名字"
            maxlength="20"
            :rules="[
              { required: true, message: '请输入你的名字' },
              { max: 20, message: '名字不能超过20个字符' },
            ]"
          />
        </van-cell-group>
        <div style="margin: 32px 16px">
          <van-button round block type="primary" native-type="submit" :loading="submitting">
            加入房间
          </van-button>
        </div>
      </van-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { supabase } from '@/lib/supabaseClient'
import { useRooms } from '@/composables/useRooms'
import AppNavBar from '@/components/AppNavBar.vue'

interface RoomInfo {
  name: string
  description: string
  creator_name: string
  member_names: string[]
}

const route = useRoute()
const router = useRouter()
const { joinRoom } = useRooms()
const name = ref('')
const submitting = ref(false)
const room = ref<RoomInfo | null>(null)

onMounted(async () => {
  const roomId = route.query.room_id as string
  if (!roomId) return
  const { data } = await supabase.rpc('get_room_info', { p_room_id: roomId })
  if (data) {
    room.value = data as unknown as RoomInfo
  }
})

async function onSubmit() {
  const roomId = route.query.room_id as string
  if (!roomId) {
    showToast('邀请链接无效')
    return
  }

  submitting.value = true
  try {
    if (room.value?.member_names.includes(name.value.trim())) {
      showToast('该房间已存在同名用户')
      submitting.value = false
      return
    }

    await joinRoom(roomId, name.value.trim())
    showToast('加入成功')
    router.replace(`/room/${roomId}`)
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as any).code === '23505') {
      showToast('已在房间中')
      router.replace(`/room/${roomId}`)
    } else {
      showToast(e instanceof Error ? e.message : '加入失败')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.invite-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.room-info {
  text-align: center;
  padding: 40px 16px 24px;
}
.room-name {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
}
.room-creator {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
</style>
