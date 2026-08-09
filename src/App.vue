<template>
  <van-config-provider :theme="isDark ? 'dark' : 'light'">
    <router-view v-slot="{ Component }">
      <transition name="van-fade" mode="out-in">
        <component :is="Component" />
      </transition>
    </router-view>
    <UpdatePrompt />
  </van-config-provider>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import { useTheme } from '@/composables/useTheme'
import { useNetwork } from '@/composables/useNetwork'

const { isDark } = useTheme()
const { ensureNetworkChecked } = useNetwork()

onMounted(() => {
  // 打开页面时先做一次网络探测，尽早进入离线模式
  ensureNetworkChecked()
})
</script>
