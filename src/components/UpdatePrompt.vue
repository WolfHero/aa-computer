<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const route = useRoute()
const router = useRouter()
const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  // 主动触发更新检查：仅靠浏览器在导航/register 时的自动检查可能被节流跳过
  onRegisteredSW: (_swUrl, registration) => {
    registration?.update()?.catch(() => {})
  },
})

const showRefreshDialog = ref(false)
// 本会话内用户已选择「稍后」，期间不再重复弹出（包括路由切换、后续版本事件）
let dismissedThisSession = false

watch(needRefresh, (value) => {
  // needRefresh 只在页面加载后的 SW 更新检查中触发（即“进入应用”时），
  // 不做任何路由监听；被用户拒绝后本会话保持静默
  if (value && !dismissedThisSession) showRefreshDialog.value = true
})

// 从更新日志页返回应用时，若更新仍待处理且未选择「稍后」，重新弹出提示
watch(() => route.fullPath, (to, from) => {
  if (
    from.startsWith('/changelog') &&
    !to.startsWith('/changelog') &&
    needRefresh.value &&
    !dismissedThisSession
  ) {
    showRefreshDialog.value = true
  }
})

watch(offlineReady, () => {
  // 离线就绪提示暂不使用
})

function onCancel() {
  showRefreshDialog.value = false
  dismissedThisSession = true
}

function onConfirmRefresh() {
  showRefreshDialog.value = false
  dismissedThisSession = true
  updateServiceWorker(true)
}

function goChangelog() {
  showRefreshDialog.value = false
  router.push('/changelog')
}
</script>

<template>
  <van-dialog
    v-model:show="showRefreshDialog"
    title="发现新版本"
    :close-on-popstate="false"
    show-cancel-button
    confirm-button-text="立即更新"
    cancel-button-text="稍后"
    @cancel="onCancel"
    @confirm="onConfirmRefresh"
  >
    <div class="update-body">
      <p>新版本已就绪，是否立即刷新并更新？</p>
      <button type="button" class="changelog-btn" @click="goChangelog">更新日志</button>
    </div>
  </van-dialog>
</template>

<style scoped>
.update-body {
  padding: 4px 20px 24px;
  text-align: center;
}
.update-body p {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
.changelog-btn {
  border: none;
  background: none;
  padding: 4px 12px;
  font-size: 14px;
  color: var(--color-primary);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.changelog-btn:active {
  opacity: 0.6;
}
</style>
