<template>
  <div class="home-page">
    <AppNavBar
      title="AA计算器"
      :show-back="false"
      :right-actions="[
        { text: '新增房间', onClick: () => showCreateDialog = true },
        { text: '设置', onClick: () => showActionSheet = true },
      ]"
    />

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="listLoading"
        :finished="finished"
        :immediate-check="false"
        finished-text="没有更多了"
        @load="onLoad"
      >
        <div v-if="loading && rooms.length === 0" class="loading-state">
          加载中...
        </div>

        <template v-else>
          <van-cell
            v-for="room in rooms"
            :key="room.id"
            :title="room.name"
            :label="room.description || '暂无简介'"
            is-link
            @click="router.push(`/room/${room.id}`)"
          >
            <template #value>
              <span class="member-count">{{ room.members?.length ?? 0 }} 人</span>
            </template>
          </van-cell>

          <div v-if="rooms.length === 0" class="empty-state">
            <van-icon name="plus" size="48" color="#c8c9cc" />
            <p>点击右上角「新增」创建房间</p>
          </div>
        </template>
      </van-list>
    </van-pull-refresh>

    <div class="bottom-notice">服务端数据将于最后一次编辑的七天后清除</div>

    <van-back-top />

    <RoomCreateDialog v-model:show="showCreateDialog" @created="onRefresh" />
    <van-action-sheet
      v-model:show="showActionSheet"
      :actions="settingsActions"
      title="AA计算器 Ver0.1 Beta"
      cancel-text="取消"
      close-on-click-action
      @select="onSettingsSelect"
    />

    <van-dialog v-model:show="showPrivacyDialog" title="隐私政策" confirm-button-text="知道了" @confirm="onPrivacyConfirm">
      <div class="privacy-content">
        <p>本APP用于便捷的计算多人活动AA时导致的算账难问题。</p>
        <p>本APP不需要登录，也不存储任何敏感信息。临时登录到另一个设备可以使用设置菜单中的“登录当前账号到其他设备”功能。</p>
        <p>长时间不使用的用户、房间以及账单记录会自动清空，请大家及时完成转账或截图备份。</p>
        <p>项目在GitHub上开源，作者主页：<a href="https://github.com/WolfHero" target="_blank">https://github.com/WolfHero</a>，多平台同名。</p>
      </div>
    </van-dialog>

    <van-dialog
      v-model:show="showImportWarning"
      title="警告"
      message="本操作会使本地数据清空并无法找回，确定继续吗？"
      show-cancel-button
      confirm-button-text="确认登录"
      @confirm="showImportWarning = false; showImportDialog = true"
    />

    <van-dialog
      v-model:show="showImportDialog"
      title="从其他设备登录"
      show-cancel-button
      confirm-button-text="登录"
      @confirm="onImportConfirm"
    >
      <div class="import-form">
        <van-field
          v-model="importToken"
          label="登录凭证"
          placeholder="请输入从其他设备复制的登录凭证"
          type="textarea"
          rows="3"
          autosize
        />
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { STORAGE_KEYS } from '@/utils/constants'
import AppNavBar from '@/components/AppNavBar.vue'
import RoomCreateDialog from '@/components/RoomCreateDialog.vue'

const router = useRouter()
const { userId, getRefreshToken, refreshSession } = useAuth()
const { rooms, loading, finished, fetchRooms } = useRooms()
const refreshing = ref(false)
const listLoading = ref(false)
const showCreateDialog = ref(false)
const showActionSheet = ref(false)
const showPrivacyDialog = ref(false)
const showImportDialog = ref(false)
const showImportWarning = ref(false)
const importToken = ref('')

const settingsActions = [
  { name: '登录当前账号到其他设备', key: 'copyToken' },
  { name: '从其他设备登录账号', key: 'importToken' },
  { name: '隐私政策', key: 'privacy' },
]

function findSupabaseAuthKey(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith('sb-') && key.endsWith('-auth-token')) {
      return key
    }
  }
  return null
}

async function onCopyToken() {
  const token = await getRefreshToken()
  if (!token) {
    showToast('当前未登录，请先创建房间')
    return
  }
  await navigator.clipboard.writeText(token)
  showToast('登录凭证已复制到剪贴板，请妥善保管')
}

async function onImportConfirm() {
  const inputToken = importToken.value.trim()
  if (!inputToken) {
    showToast('请输入登录凭证')
    return
  }

  const currentToken = await getRefreshToken()
  if (inputToken === currentToken) {
    showToast('该凭证为当前账号，无需登录')
    showImportDialog.value = false
    importToken.value = ''
    return
  }

  const oldUserId = userId.value

  const billsBackup = localStorage.getItem(STORAGE_KEYS.LOCAL_BILLS)
  const authKey = findSupabaseAuthKey()
  const authBackup = authKey ? localStorage.getItem(authKey) : null

  if (billsBackup) {
    localStorage.setItem(STORAGE_KEYS.OLD_LOCAL_BILLS, billsBackup)
  }
  if (authBackup) {
    localStorage.setItem(STORAGE_KEYS.OLD_AUTH_TOKEN, authBackup)
  }

  try {
    await refreshSession(inputToken)
    showImportDialog.value = false
    importToken.value = ''

    if (userId.value === oldUserId) {
      localStorage.removeItem(STORAGE_KEYS.OLD_LOCAL_BILLS)
      localStorage.removeItem(STORAGE_KEYS.OLD_AUTH_TOKEN)
      showToast('登录成功')
    } else {
      const newAuthKey = findSupabaseAuthKey()
      const newAuthValue = newAuthKey ? localStorage.getItem(newAuthKey) : null
      localStorage.clear()
      if (newAuthKey && newAuthValue) {
        localStorage.setItem(newAuthKey, newAuthValue)
      }
      location.reload()
      return
    }
    await fetchRooms(true)
  } catch (e: unknown) {
    localStorage.removeItem(STORAGE_KEYS.OLD_LOCAL_BILLS)
    localStorage.removeItem(STORAGE_KEYS.OLD_AUTH_TOKEN)
    showToast(e instanceof Error ? e.message : '登录失败')
  }
}

function onSettingsSelect(action: { key: string }) {
  if (action.key === 'copyToken') {
    onCopyToken()
  } else if (action.key === 'importToken') {
    if (userId.value) {
      showImportWarning.value = true
    } else {
      showImportDialog.value = true
    }
  } else if (action.key === 'privacy') {
    showPrivacyDialog.value = true
  }
  showActionSheet.value = false
}

function onPrivacyConfirm() {
  localStorage.setItem(STORAGE_KEYS.PRIVACY_ACCEPTED, '1')
}

async function onLoad() {
  listLoading.value = true
  await fetchRooms(false)
  listLoading.value = false
}

async function onRefresh() {
  refreshing.value = true
  listLoading.value = true
  try {
    await fetchRooms(true)
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  }
  listLoading.value = false
  refreshing.value = false
}

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)) {
    showPrivacyDialog.value = true
  }
  fetchRooms(true)
})

</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.empty-state {
  text-align: center;
  padding: 80px 16px;
  color: var(--color-text-secondary);
}
.empty-state p {
  margin-top: 16px;
  font-size: 14px;
}
.member-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.loading-state {
  text-align: center;
  padding: 40px 16px;
  color: var(--color-text-secondary);
  font-size: 14px;
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
.import-form {
  padding: 12px 16px 0;
}
</style>
