<template>
  <div class="invite-page">
    <AppNavBar title="加入房间" />

    <div class="page-content">
      <van-form @submit="onSubmit">
        <van-cell-group inset>
          <van-field
            v-model="name"
            name="name"
            label="你的名字"
            placeholder="请输入你的名字"
            :rules="[{ required: true, message: '请输入你的名字' }]"
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
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useRooms } from '@/composables/useRooms'
import AppNavBar from '@/components/AppNavBar.vue'

const route = useRoute()
const router = useRouter()
const { joinRoom, getRoomById } = useRooms()
const name = ref('')
const submitting = ref(false)

async function onSubmit() {
  const roomId = route.query.room_id as string
  if (!roomId) {
    showToast('邀请链接无效')
    return
  }

  submitting.value = true
  try {
    const room = await getRoomById(roomId)
    if (room.members.some(m => m.name === name.value.trim())) {
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
</style>
