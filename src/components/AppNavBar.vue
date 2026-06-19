<template>
  <van-nav-bar
    :title="title"
    :left-arrow="showBack"
    fixed
    placeholder
    safe-area-inset-top
    @click-left="onClickLeft"
  >
    <template #right>
      <template v-for="action in rightActions" :key="action.text">
        <span
          class="nav-action-btn"
          :class="{ 'nav-action-btn--active': activeBtn === action.text }"
          @touchstart="activeBtn = action.text"
          @touchend="activeBtn = null"
          @touchcancel="activeBtn = null"
          @click="action.onClick"
        >{{ action.text }}</span>
      </template>
    </template>
  </van-nav-bar>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

interface NavAction {
  text: string
  onClick: () => void
}

const props = withDefaults(defineProps<{
  title: string
  showBack?: boolean
  backTo?: string
  rightActions?: NavAction[]
}>(), {
  showBack: true,
  rightActions: () => [],
})

const router = useRouter()

const activeBtn = ref<string | null>(null)

function onClickLeft() {
  if (!props.showBack) return
  if (props.backTo) {
    router.replace(props.backTo)
  } else {
    router.back()
  }
}
</script>

<style scoped>
.nav-action-btn {
  margin-left: 12px;
  font-size: 14px;
  color: var(--van-nav-bar-icon-color, #1989fa);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.nav-action-btn--active {
  opacity: 0.6;
}
.nav-action-btn:first-child {
  margin-left: 0;
}
/* Vant 在容器上应用了 van-haptics-feedback:active → opacity: 0.6，会导致所有按钮同时变淡，在此覆盖 */
:deep(.van-nav-bar__right.van-haptics-feedback:active) {
  opacity: 1;
}
</style>
