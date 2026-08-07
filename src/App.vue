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
import UpdatePrompt from '@/components/UpdatePrompt.vue'
import { useTheme } from '@/composables/useTheme'

const { isDark } = useTheme()
</script>
