<template>
  <van-dialog
    v-model:show="visible"
    title="使用说明及隐私政策"
    confirm-button-text="知道了"
    @confirm="onConfirm"
  >
    <div class="privacy-content">
      <p>本APP用于便捷地计算多人活动AA时导致的算账难问题。</p>
      <p>为了方便再次返回本APP查看，建议使用浏览器打开。</p>
      <p>本APP不需要登录，也不存储任何敏感信息。临时登录到另一个设备或浏览器可以使用设置菜单中的"登录当前账号到其他设备"功能。</p>
      <p>长时间不使用的用户、房间以及账单记录会自动清空，届时仅可本地查看，请大家及时完成转账或截图备份。</p>
      <p>本项目aa-computer已在GitHub上开源，作者主页：<a href="https://github.com/WolfHero" target="_blank">https://github.com/WolfHero</a>，多平台同名。</p>
    </div>
  </van-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

function onConfirm() {
  localStorage.setItem(STORAGE_KEYS.PRIVACY_ACCEPTED, '1')
}
</script>

<style scoped>
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
