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
            v-for="room in mergedRooms"
            :key="room.id"
            :label="room.description || '暂无简介'"
            is-link
            @click="router.push({ path: `/room/${room.id}`, state: { roomName: room.name } })"
          >
            <template #title>
              {{ room.name }}
              <span v-if="room.mode === 'local'" class="badge local-badge">本地</span>
              <span v-else-if="room.mode === 'expired'" class="badge expired-badge">过期只读</span>
              <span v-else-if="room.mode === 'legacy'" class="badge legacy-badge">旧数据</span>
              <span v-else class="badge online-badge">在线</span>
            </template>
            <template #value>
              <span class="member-count">{{ room.members?.length ?? 0 }} 人</span>
            </template>
          </van-cell>

          <div v-if="mergedRooms.length === 0" class="empty-state">
            <van-icon name="plus" size="48" color="#c8c9cc" />
            <p>点击右上角「新增」创建房间</p>
          </div>
        </template>
      </van-list>
    </van-pull-refresh>

    <div class="bottom-notice">在线房间服务端数据将于最后一次编辑的七天后清除</div>

    <van-back-top />

    <RoomCreateDialog v-model:show="showCreateDialog" @created="onRoomCreated" />
    <van-action-sheet
      v-model:show="showActionSheet"
      :actions="settingsActions"
      title="AA计算器 Ver0.1 Beta"
      cancel-text="取消"
      close-on-click-action
      @select="onSettingsSelect"
    />

    <PrivacyDialog v-model:show="showPrivacyDialog" :initial-view="privacyInitialView" />

    <van-dialog
      v-model:show="showImportWarning"
      title="警告"
      message="切换账号会使本设备的本地房间、账单数据清空且无法找回（本地房间不会随账号迁移），确定继续吗？"
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

    <input
      ref="importFileInput"
      type="file"
      accept="application/json,.json"
      style="display: none"
      @change="onImportFile"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { showToast } from '@/utils/toast'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useLocalBackup } from '@/composables/useLocalBackup'
import { useTheme } from '@/composables/useTheme'
import { STORAGE_KEYS } from '@/utils/constants'
import AppNavBar from '@/components/AppNavBar.vue'
import RoomCreateDialog from '@/components/RoomCreateDialog.vue'
import PrivacyDialog from '@/components/PrivacyDialog.vue'

const router = useRouter()
const { theme, toggleTheme } = useTheme()
const { userId, getRefreshToken, refreshSession } = useAuth()
const { rooms, loading, finished, fetchRooms } = useRooms()
const { getAllRooms, getLegacyRoomIds, getLegacyRoomData } = useLocalRooms()
const { parseLocalRoomFile, importLocalRoomFile } = useLocalBackup()

const mergedRooms = computed(() => {
  const remoteIds = new Set(rooms.value.map(r => r.id))
  const list: Array<{
    id: string
    name: string
    description: string
    updated_at: string
    members?: unknown[]
    mode: 'online' | 'local' | 'expired' | 'legacy'
  }> = []

  for (const r of rooms.value) {
    list.push({
      id: r.id,
      name: r.name,
      description: r.description,
      updated_at: r.updated_at,
      members: r.members,
      mode: 'online',
    })
  }
  for (const r of getAllRooms()) {
    if (remoteIds.has(r.id) && r.mode === 'online') continue
    list.push({
      id: r.id,
      name: r.name,
      description: r.description,
      updated_at: r.updated_at,
      members: r.members,
      mode: r.mode,
    })
  }
  for (const id of getLegacyRoomIds()) {
    const legacy = getLegacyRoomData(id)
    if (legacy) {
      list.push({
        id,
        name: legacy.room.name,
        description: legacy.room.description,
        updated_at: legacy.room.updated_at,
        members: legacy.room.members,
        mode: 'legacy',
      })
    }
  }
  return list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
})
const refreshing = ref(false)
const listLoading = ref(false)
const showCreateDialog = ref(false)
const showActionSheet = ref(false)
const showPrivacyDialog = ref(false)
const privacyInitialView = ref<'usage' | 'privacy'>('usage')
const showImportDialog = ref(false)
const showImportWarning = ref(false)
const importToken = ref('')
const importFileInput = ref<HTMLInputElement | null>(null)

const settingsActions = computed(() => [
  {
    name: '深色模式',
    subname: theme.value === 'dark' ? '已开启' : '已关闭',
    key: 'theme',
  },
  { name: '登录当前账号到其他设备', key: 'copyToken' },
  { name: '从其他设备登录账号', key: 'importToken' },
  { name: '导入本地房间', key: 'importRoom' },
  { name: '使用说明', key: 'usage' },
  { name: '隐私政策', key: 'privacy' },
  { name: '更新日志', key: 'changelog' },
])

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
  if (action.key === 'theme') {
    toggleTheme()
  } else if (action.key === 'copyToken') {
    onCopyToken()
  } else if (action.key === 'importToken') {
    if (userId.value) {
      showImportWarning.value = true
    } else {
      showImportDialog.value = true
    }
  } else if (action.key === 'usage') {
    privacyInitialView.value = 'usage'
    showPrivacyDialog.value = true
  } else if (action.key === 'privacy') {
    privacyInitialView.value = 'privacy'
    showPrivacyDialog.value = true
  } else if (action.key === 'importRoom') {
    importFileInput.value?.click()
  } else if (action.key === 'changelog') {
    router.push('/changelog')
  }
  showActionSheet.value = false
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const text = await file.text()
    const parsed = parseLocalRoomFile(text)
    const result = importLocalRoomFile(parsed, false)
    if (result.conflict) {
      try {
        await showConfirmDialog({
          title: '覆盖本地房间',
          message: `本机已存在同名本地房间「${parsed.room.name}」，是否覆盖？`,
          confirmButtonText: '覆盖',
          confirmButtonColor: 'var(--color-danger)',
        })
      } catch {
        showToast('已取消导入')
        return
      }
      importLocalRoomFile(parsed, true)
    }
    showToast('导入成功')
    router.push({ path: `/room/${result.roomId}`, state: { roomName: parsed.room.name } })
  } catch (err: unknown) {
    showToast(err instanceof Error ? err.message : '导入失败')
  }
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

function onRoomCreated(roomId: string) {
  router.push({ path: `/room/${roomId}/settings` })
}

onMounted(() => {
  if (!localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)) {
    showPrivacyDialog.value = true
  }
  fetchRooms(true).catch(() => {
    // 本地模式不依赖网络，拉取在线房间失败时静默降级
  })
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
.badge {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  font-size: 10px;
  line-height: 18px;
  border-radius: 4px;
}
.local-badge {
  background: var(--color-tint-warning-bg);
  color: var(--color-tint-warning-text);
}
.online-badge {
  background: var(--color-tint-info-bg);
  color: var(--color-tint-info-text);
}
.expired-badge {
  background: var(--color-tint-neutral-bg);
  color: var(--color-tint-neutral-text);
}
.legacy-badge {
  background: var(--color-tint-danger-bg);
  color: var(--color-tint-danger-text);
}
.loading-state {
  text-align: center;
  padding: 40px 16px;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.import-form {
  padding: 12px 16px 0;
}
</style>
