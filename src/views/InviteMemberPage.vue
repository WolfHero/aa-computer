<template>
  <div class="invite-member-page">
    <AppNavBar title="接受邀请" :show-back="false" />

    <div class="page-content">
      <div v-if="loading" class="loading-state">
        <van-loading type="spinner" size="24px" /> 加载中...
      </div>

      <template v-else-if="error">
        <div class="error-state">
          <van-icon name="fail" size="48" color="#ee0a24" />
          <p>{{ error }}</p>
        </div>
      </template>

      <template v-else-if="memberInfo">
        <div class="room-info">
          <h2 class="room-name">{{ memberInfo.room_name }}</h2>
          <p class="room-creator">创建人：{{ memberInfo.creator_name }}</p>
          <p class="invite-hint">邀请你以下昵称加入房间</p>
        </div>

        <van-form @submit="onSubmit">
          <van-cell-group inset>
            <van-field
              v-model="name"
              name="name"
              label="昵称"
              placeholder="请输入昵称"
              maxlength="20"
              :rules="[{ required: true, message: '请输入昵称' }]"
            />
          </van-cell-group>
          <div style="margin: 32px 16px">
            <van-button round block type="primary" native-type="submit" :loading="submitting">
              接受邀请
            </van-button>
          </div>
        </van-form>
      </template>
    </div>

    <PrivacyDialog v-model:show="showPrivacyDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from '@/utils/toast'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { STORAGE_KEYS } from '@/utils/constants'
import AppNavBar from '@/components/AppNavBar.vue'
import PrivacyDialog from '@/components/PrivacyDialog.vue'

interface MemberInfo {
  id: string
  name: string
  room_id: string
  room_name: string
  room_owner_id: string
  is_bound: boolean
  creator_name: string
}

const route = useRoute()
const router = useRouter()
const { ensureAuth } = useAuth()
const { getMemberByInviteToken, acceptInvite, updateMemberName } = useRooms()

const name = ref('')
const submitting = ref(false)
const loading = ref(true)
const error = ref('')
const memberInfo = ref<MemberInfo | null>(null)
const showPrivacyDialog = ref(false)

onMounted(async () => {
  if (!localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)) {
    showPrivacyDialog.value = true
  }

  const token = route.query.token as string
  if (!token) {
    error.value = '邀请链接无效'
    loading.value = false
    return
  }

  try {
    const info = await getMemberByInviteToken(token)
    if (!info) {
      error.value = '邀请链接无效'
      return
    }
    if (info.is_bound) {
      error.value = '该邀请已被使用'
      return
    }
    memberInfo.value = info
    name.value = info.name
  } catch {
    error.value = '邀请链接无效'
  } finally {
    loading.value = false
  }
})

async function onSubmit() {
  const token = route.query.token as string
  if (!token) return

  submitting.value = true
  try {
    await ensureAuth()
    const result = await acceptInvite(token)

    if (!result.success) {
      if (result.error === 'already_member') {
        showToast('已在房间中')
        router.replace({ path: `/room/${memberInfo.value!.room_id}` })
        return
      }
      showToast(result.error === 'already_bound' ? '该邀请已被使用' : '接受邀请失败')
      return
    }

    // Update nickname if changed
    const trimmedName = name.value.trim()
    if (trimmedName && result.member_id && trimmedName !== result.name) {
      try {
        await updateMemberName(result.member_id, trimmedName)
      } catch { /* ignore name update failure */ }
    }

    showToast('加入成功')
    router.replace({ path: `/room/${result.room_id}`, state: { roomName: memberInfo.value?.room_name ?? '' } })
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '加入失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.invite-member-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 16px;
  gap: 12px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.room-info {
  text-align: center;
  padding: 40px 16px 24px;
}
.room-name {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text);
}
.room-creator {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.invite-hint {
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
