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

    <van-dialog v-model:show="showPrivacyDialog" title="隐私政策" confirm-button-text="知道了" @confirm="onPrivacyConfirm">
      <div class="privacy-content">
        <p>本APP用于便捷的计算多人活动AA时导致的算账难问题。</p>
        <p>本APP不需要登录，也不存储任何敏感信息。临时登录到另一个设备可以使用设置菜单中的"登录当前账号到其他设备"功能。</p>
        <p>长时间不使用的用户、房间以及账单记录会自动清空，请大家及时完成转账或截图备份。</p>
        <p>项目在GitHub上开源，作者主页：<a href="https://github.com/WolfHero" target="_blank">https://github.com/WolfHero</a>，多平台同名。</p>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { STORAGE_KEYS } from '@/utils/constants'
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
const { ensureAuth } = useAuth()
const name = ref('')
const submitting = ref(false)
const room = ref<RoomInfo | null>(null)
const showPrivacyDialog = ref(false)

function onPrivacyConfirm() {
  localStorage.setItem(STORAGE_KEYS.PRIVACY_ACCEPTED, '1')
}

onMounted(async () => {
  if (!localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)) {
    showPrivacyDialog.value = true
  }
  const roomId = route.query.room_id as string
  if (!roomId) return

  // 已有本地账单记录则直接跳转
  const localBills = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_BILLS) || '{}')
  if (localBills[roomId]) {
    router.replace({ path: `/room/${roomId}` })
    return
  }

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
.privacy-content {
  padding: 0 20px 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.privacy-content a {
  color: #1989fa;
}
</style>
