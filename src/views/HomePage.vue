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
            <p class="invite-hint">收到邀请链接？右上角「设置」→「接受邀请加入房间」粘贴链接即可加入</p>
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
      :title="`AA计算器 v${APP_VERSION}`"
      close-on-click-action
      @select="onSettingsSelect"
    />

    <PrivacyDialog v-model:show="showPrivacyDialog" :initial-view="privacyInitialView" />

    <van-dialog
      v-model:show="showImportWarning"
      title="警告"
      message="切换匿名账号会使当前浏览器的本地房间、账单数据清空且无法找回（本地房间不会随匿名账号迁移），确定继续吗？"
      show-cancel-button
      confirm-button-text="确认登录"
      @confirm="showImportWarning = false; showImportDialog = true"
    />

    <van-dialog
      v-model:show="showImportDialog"
      title="从其他浏览器登录匿名账号"
      show-cancel-button
      confirm-button-text="登录"
      @confirm="onImportConfirm"
    >
      <div class="import-form">
        <van-field
          v-model="importToken"
          label="匿名账号凭证"
          placeholder="请输入从其他浏览器复制的匿名账号登录凭证"
          type="textarea"
          rows="3"
          autosize
        />
      </div>
    </van-dialog>

    <van-dialog
      v-model:show="showJoinByLinkDialog"
      title="加入房间"
      show-cancel-button
      confirm-button-text="加入"
      @confirm="onJoinByLinkConfirm"
    >
      <div class="import-form">
        <van-field
          v-model="joinLink"
          label="邀请链接"
          placeholder="请粘贴收到的邀请链接"
          type="textarea"
          rows="3"
          autosize
        />
      </div>
    </van-dialog>

    <CopyLinkDialog
      v-model:show="showManualCopyToken"
      :link="manualCopyToken"
      :message="manualCopyTokenMessage"
      hint="长按即可选中复制"
    />

    <van-dialog
      v-model:show="showIPhoneHint"
      title="iPhone 使用提示"
      :show-confirm-button="false"
      close-on-click-overlay
    >
      <div class="iphone-hint-body">
        <p>iPhone 自带浏览器如有需要推荐添加到书签；如果添加到主屏幕，主屏幕入口的 AA计算器与浏览器的数据不共通。</p>
        <p>请手动将邀请链接粘贴到设置菜单的「接受邀请加入房间」按钮处。</p>
      </div>
      <div class="iphone-hint-actions">
        <van-button round block type="primary" @click="showIPhoneHint = false">
          知道了
        </van-button>
      </div>
    </van-dialog>

    <InAppHintDialog v-model:show="showInAppHint" />

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
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { showToast } from '@/utils/toast'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'
import { useLocalRooms } from '@/composables/useLocalRooms'
import { useLocalBackup } from '@/composables/useLocalBackup'
import { useTheme } from '@/composables/useTheme'
import { STORAGE_KEYS } from '@/utils/constants'
import { APP_VERSION } from '@/version'
import AppNavBar from '@/components/AppNavBar.vue'
import RoomCreateDialog from '@/components/RoomCreateDialog.vue'
import PrivacyDialog from '@/components/PrivacyDialog.vue'
import CopyLinkDialog from '@/components/CopyLinkDialog.vue'
import InAppHintDialog from '@/components/InAppHintDialog.vue'
import { detectAppHintType } from '@/utils/device'

const router = useRouter()
const { mode, cycleThemeMode } = useTheme()
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
    // 远端已存在的房间以远端为准，本地缓存（含过期/旧状态）不再重复展示
    if (remoteIds.has(r.id)) continue
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
const showJoinByLinkDialog = ref(false)
const joinLink = ref('')
const showManualCopyToken = ref(false)
const manualCopyToken = ref('')
const manualCopyTokenMessage = ref('复制失败，请手动选中并复制以下登录凭证')
const showIPhoneHint = ref(false)
const showInAppHint = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)
let pendingIPhoneHint = false
let pendingInAppHint = false

const settingsActions = computed(() => [
  {
    name: '深色模式',
    subname: mode.value === 'system' ? '跟随系统' : mode.value === 'dark' ? '已开启' : '已关闭',
    key: 'theme',
  },
  { name: '登录当前匿名账号到其他浏览器', key: 'copyToken' },
  { name: '从其他浏览器登录匿名账号', key: 'importToken' },
  { name: '接受邀请加入房间', key: 'joinByLink' },
  { name: '导入本地房间', key: 'importRoom' },
  { name: '使用说明', key: 'usage' },
  { name: '隐私政策', key: 'privacy' },
  { name: '更新日志', key: 'changelog' },
])

function parseInviteLink(input: string): { path: string; query: Record<string, string> } | null {
  const text = input.trim()
  if (!text) return null

  let url: URL
  try {
    url = new URL(text)
  } catch {
    const candidate = text.startsWith('/') ? text : text.startsWith('?') ? `/invite${text}` : `/${text}`
    try {
      url = new URL(candidate, window.location.origin)
    } catch {
      return null
    }
  }

  const path = url.pathname.replace(/\/+$/, '')
  const token = url.searchParams.get('token')
  const roomId = url.searchParams.get('room_id')
  if (path === '/invite/member' && token) {
    return { path: '/invite/member', query: { token } }
  }
  if (path === '/invite' && roomId) {
    return { path: '/invite', query: { room_id: roomId } }
  }
  return null
}

function onJoinByLinkConfirm() {
  const parsed = parseInviteLink(joinLink.value)
  if (!parsed) {
    showToast('无效的邀请链接')
    return
  }
  showJoinByLinkDialog.value = false
  joinLink.value = ''
  router.push({ path: parsed.path, query: parsed.query })
}

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
  try {
    await navigator.clipboard.writeText(token)
    showToast('匿名账号登录凭证已复制到剪贴板，请妥善保管')
  } catch {
    manualCopyToken.value = token
    manualCopyTokenMessage.value = '复制失败，请手动选中并复制以下匿名账号登录凭证'
    showManualCopyToken.value = true
  }
}

async function onImportConfirm() {
  const inputToken = importToken.value.trim()
  if (!inputToken) {
    showToast('请输入匿名账号登录凭证')
    return
  }

  const currentToken = await getRefreshToken()
  if (inputToken === currentToken) {
    showToast('该凭证为当前匿名账号，无需登录')
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
    cycleThemeMode()
  } else if (action.key === 'copyToken') {
    onCopyToken()
  } else if (action.key === 'importToken') {
    if (userId.value) {
      showImportWarning.value = true
    } else {
      showImportDialog.value = true
    }
  } else if (action.key === 'joinByLink') {
    showJoinByLinkDialog.value = true
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
  const firstVisit = !localStorage.getItem(STORAGE_KEYS.PRIVACY_ACCEPTED)
  if (firstVisit) {
    showPrivacyDialog.value = true
  }
  const hintType = detectAppHintType()
  if (hintType === 'safari' && !localStorage.getItem(STORAGE_KEYS.IPHONE_HINT_SHOWN)) {
    localStorage.setItem(STORAGE_KEYS.IPHONE_HINT_SHOWN, '1')
    pendingIPhoneHint = true
    if (!firstVisit) {
      showIPhoneHint.value = true
    }
  } else if (hintType === 'inapp' && !localStorage.getItem(STORAGE_KEYS.IN_APP_HINT_SHOWN)) {
    localStorage.setItem(STORAGE_KEYS.IN_APP_HINT_SHOWN, '1')
    pendingInAppHint = true
    if (!firstVisit) {
      showInAppHint.value = true
    }
  }
  fetchRooms(true).catch(() => {
    // 本地模式不依赖网络，拉取在线房间失败时静默降级
  })
})

watch(showPrivacyDialog, (v) => {
  if (v) return
  if (pendingIPhoneHint) {
    pendingIPhoneHint = false
    showIPhoneHint.value = true
  } else if (pendingInAppHint) {
    pendingInAppHint = false
    showInAppHint.value = true
  }
})

</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}
/* 列表容器至少占满导航栏下方的剩余视口高度，避免房间少时下拉刷新区域过小 */
.home-page :deep(.van-pull-refresh) {
  flex: 1;
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
.empty-state .invite-hint {
  margin-top: 8px;
  font-size: 12px;
}
.iphone-hint-body {
  padding: 8px 20px 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.iphone-hint-body p {
  margin: 0 0 8px;
}
.iphone-hint-actions {
  padding: 0 16px 16px;
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
