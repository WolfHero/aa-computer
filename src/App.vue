<template>
  <router-view v-slot="{ Component }">
    <transition name="van-fade" mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
</template>
