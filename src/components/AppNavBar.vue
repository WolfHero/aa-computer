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
        <span class="nav-action-btn" @click="action.onClick">{{ action.text }}</span>
      </template>
    </template>
  </van-nav-bar>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

interface NavAction {
  text: string
  onClick: () => void
}

const props = withDefaults(defineProps<{
  title: string
  showBack?: boolean
  rightActions?: NavAction[]
}>(), {
  showBack: true,
  rightActions: () => [],
})

const router = useRouter()

function onClickLeft() {
  if (props.showBack) {
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
}
.nav-action-btn:first-child {
  margin-left: 0;
}
</style>
