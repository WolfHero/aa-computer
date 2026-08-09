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
            label="昵称"
            placeholder="请输入昵称"
            maxlength="20"
            :rules="[{ required: true, message: '请输入昵称，别人会看到这个代号' }]"
          />
        </van-cell-group>
        <div style="margin: 32px 16px">
          <van-button round block type="primary" native-type="submit" :loading="submitting">
            加入房间
          </van-button>
        </div>
      </van-form>
    </div>

    <PrivacyDialog v-model:show="showPrivacyDialog" />
    <InAppHintDialog v-model:show="showInAppHint" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from '@/utils/toast'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { useLocalBills } from '@/composables/useLocalBills'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { STORAGE_KEYS } from '@/utils/constants'
import AppNavBar from '@/components/AppNavBar.vue'
import PrivacyDialog from '@/components/PrivacyDialog.vue'
import InAppHintDialog from '@/components/InAppHintDialog.vue'
import { detectAppHintType } from '@/utils/device'

interface RoomInfo {
  name: string
  description: string
  creator_name: string
  member_names: string[]
}

const route = useRoute()
const router = useRouter()
const { joinRoom } = useRooms()
const { ensureAuth } = useAuth()
const { getBills } = useLocalBills()
const { getLegacyRoomData } = useLocalRooms()
const name = ref('')
const submitting = ref(false)
const room = ref<RoomInfo | null>(null)
const showPrivacyDialog = ref(false)
const showInAppHint = ref(false)
let pendingInAppHint = false

onMounted(async () => {
  if (!localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)) {
    showPrivacyDialog.value = true
  }
  if (detectAppHintType() === 'inapp' && !localStorage.getItem(STORAGE_KEYS.IN_APP_HINT_SHOWN)) {
    localStorage.setItem(STORAGE_KEYS.IN_APP_HINT_SHOWN, '1')
    pendingInAppHint = true
    if (localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)) {
      showInAppHint.value = true
    }
  }
  const roomId = route.query.room_id as string
  if (!roomId) return

  // 已有本地账单记录（v2 或旧缓存）则直接跳转
  if (getBills(roomId).length > 0 || getLegacyRoomData(roomId)) {
    router.replace({ path: `/room/${roomId}` })
    return
  }

  const { data } = await supabase.rpc('get_room_info', { p_room_id: roomId })
  if (data) {
    room.value = data as unknown as RoomInfo
  }
})

watch(showPrivacyDialog, (v) => {
  if (!v && pendingInAppHint) {
    pendingInAppHint = false
    showInAppHint.value = true
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
    await ensureAuth()
    if (room.value?.member_names.includes(name.value.trim())) {
      showToast('该房间已存在同名用户')
      submitting.value = false
      return
    }

    await joinRoom(roomId, name.value.trim())
    showToast('加入成功')
    router.replace({ path: `/room/${roomId}`, state: { roomName: room.value?.name ?? '' } })
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'code' in e && (e as any).code === '23505') {
      showToast('已在房间中')
      router.replace({ path: `/room/${roomId}`, state: { roomName: room.value?.name ?? '' } })
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
