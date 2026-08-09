<template>
  <van-dialog
    v-model:show="visible"
    class="privacy-dialog"
    :title="view === 'usage' ? '使用说明' : '隐私政策'"
    :show-confirm-button="false"
    close-on-click-overlay
  >
    <div class="privacy-content">
      <template v-if="view === 'usage'">
        <p>本应用用于多人活动 AA 记账与结算。</p>
        <p>新建房间默认为本地房间：房间、成员和账单只保存在本机浏览器，可完全离线使用。</p>
        <p>添加账单：在房间详情点击「新增」，填写内容、金额并选择分摊人员。</p>
        <p>AA 计算：点击房间详情页的「计算AA」按钮，自动生成成员收支与转账方案。</p>
        <p>转为在线房间：在房间设置点击「复制公共邀请链接」或成员邀请链接，确认后上传并生成邀请链接；被邀请者通过链接加入。</p>
        <p>在线房间服务端数据最后一次编辑七天后会被清理；本地保留只读缓存，可从房间菜单「重建为本地房间」。</p>
        <p>本地房间支持导出/导入 JSON 文件，便于备份和跨浏览器迁移。</p>
        <p>跨浏览器登录仅用于在线匿名账号，不会迁移本地房间数据。</p>
        <p>本项目 aa-computer 已在 GitHub 开源，作者主页：<a href="https://github.com/WolfHero" target="_blank">https://github.com/WolfHero</a>。</p>
      </template>
      <template v-else>
        <p>默认情况下，房间、成员和账单数据只保存在本机浏览器中，不联网、不需要登录。</p>
        <p>只有在房间设置中点击邀请、或通过邀请链接加入在线房间时，才会进行匿名登录，并把房间信息、成员和账单上传到服务器。</p>
        <p>在线房间的服务端数据会在最后一次编辑后的七天内自动清空；清空后本机仍保留只读缓存，可重建为本地房间。</p>
        <p>本地房间支持导出为文件，导出文件包含房间、成员和账单数据，请妥善保管。</p>
        <p>清除浏览器数据会删除本机所有房间和账单，且无法恢复。</p>
        <p>跨浏览器登录仅切换匿名账号，不会迁移本地房间数据。</p>
      </template>
    </div>
    <div class="dialog-actions">
      <template v-if="view === 'usage'">
        <van-button round block plain type="primary" @click="switchToPrivacy">
          隐私政策
        </van-button>
      </template>
      <van-button round block type="primary" @click="onConfirm">
        知道了
      </van-button>
    </div>
  </van-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'

const props = withDefaults(defineProps<{
  show: boolean
  initialView?: 'usage' | 'privacy'
}>(), {
  initialView: 'usage',
})

const emit = defineEmits<{
  'update:show': [value: boolean]
}>()

const view = ref<'usage' | 'privacy'>(props.initialView)

const visible = computed({
  get: () => props.show,
  set: (v: boolean) => emit('update:show', v),
})

watch(() => props.show, (v) => {
  if (v) {
    view.value = props.initialView
  }
})

function switchToPrivacy() {
  view.value = 'privacy'
}

function onConfirm() {
  localStorage.setItem(STORAGE_KEYS.PRIVACY_ACCEPTED, '1')
  visible.value = false
}
</script>

<style scoped>
.privacy-content {
  max-height: 55vh;
  overflow-y: auto;
  padding: 4px 20px 16px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.privacy-content p {
  margin: 8px 0;
}
.privacy-content a {
  color: #1989fa;
}
.dialog-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
}
</style>

<style>
/* Vant Dialog 默认 teleport 到 body，这里用全局样式按设备分档控制宽度 */
.privacy-dialog {
  --van-dialog-width: min(90vw, 420px);
}
@media (min-width: 768px) {
  .privacy-dialog {
    --van-dialog-width: min(600px, 80vw);
  }
}
</style>
