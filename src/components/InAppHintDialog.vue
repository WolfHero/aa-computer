<template>
  <van-dialog
    v-model:show="visible"
    class="inapp-hint-dialog"
    title="使用提示"
    :show-confirm-button="false"
    close-on-click-overlay
  >
    <div class="dialog-body">
      <p>您好像是在QQ/微信中打开了AA计算器，这样完全可以使用。如果想在未来更好找到本工具，我们更推荐复制到浏览器使用，或者先添加到QQ/微信收藏。</p>
    </div>
    <div class="dialog-actions">
      <van-button round block type="primary" @click="onConfirm">
        知道了
      </van-button>
    </div>
  </van-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

function onConfirm() {
  visible.value = false
}
</script>

<style scoped>
.dialog-body {
  padding: 8px 20px 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.dialog-body p {
  margin: 0;
}
.dialog-actions {
  padding: 0 16px 16px;
}
</style>

<style>
/* Vant Dialog 默认 teleport 到 body，这里用全局样式控制宽度 */
.inapp-hint-dialog {
  --van-dialog-width: min(90vw, 420px);
}
@media (min-width: 768px) {
  .inapp-hint-dialog {
    --van-dialog-width: min(520px, 80vw);
  }
}
</style>
