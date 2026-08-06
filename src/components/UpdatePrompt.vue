<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW()

const showRefreshDialog = ref(false)
// 本会话内用户已选择「稍后」，期间不再重复弹出（包括路由切换、后续版本事件）
let dismissedThisSession = false

watch(needRefresh, (value) => {
  // needRefresh 只在页面加载后的 SW 更新检查中触发（即“进入应用”时），
  // 不做任何路由监听；被用户拒绝后本会话保持静默
  if (value && !dismissedThisSession) showRefreshDialog.value = true
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
</script>

<template>
  <van-dialog
    v-model:show="showRefreshDialog"
    title="发现新版本"
    message="新版本已就绪，是否立即刷新并更新？"
    show-cancel-button
    confirm-button-text="立即更新"
    cancel-button-text="稍后"
    @cancel="onCancel"
    @confirm="onConfirmRefresh"
  />
</template>
