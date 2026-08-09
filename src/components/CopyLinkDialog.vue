<template>
  <van-dialog
    v-model:show="visible"
    class="copy-link-dialog"
    :title="title"
    :show-confirm-button="false"
    close-on-click-overlay
  >
    <div class="dialog-body">
      <p class="dialog-message">{{ message }}</p>
      <div class="link-box">{{ link }}</div>
      <p class="dialog-hint">{{ hint }}</p>
    </div>
    <div class="dialog-footer">
      <van-button round block type="primary" @click="onConfirm">
        知道了
      </van-button>
    </div>
  </van-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  show: boolean
  link: string
  title?: string
  message?: string
  hint?: string
}>(), {
  title: '复制失败',
  message: '复制失败，请手动选中并复制以下链接',
  hint: '长按链接即可选中复制',
})

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
  padding: 4px 20px 8px;
}
.dialog-message {
  margin: 8px 0 12px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  text-align: center;
}
.link-box {
  user-select: text;
  -webkit-user-select: text;
  cursor: text;
  word-break: break-all;
  padding: 12px;
  border-radius: 8px;
  background: var(--color-tint-neutral-bg);
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text);
}
.dialog-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  text-align: center;
}
.dialog-footer {
  padding: 0 16px 16px;
}
</style>

<style>
/* Vant Dialog 默认 teleport 到 body，这里用全局样式按设备分档控制宽度 */
.copy-link-dialog {
  --van-dialog-width: min(90vw, 420px);
}
@media (min-width: 768px) {
  .copy-link-dialog {
    --van-dialog-width: min(520px, 80vw);
  }
}
</style>
