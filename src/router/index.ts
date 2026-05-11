import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomePage.vue'),
    },
    {
      path: '/invite',
      name: 'invite',
      component: () => import('@/views/InvitePage.vue'),
    },
    {
      path: '/room/:id',
      name: 'room-detail',
      component: () => import('@/views/RoomDetailPage.vue'),
    },
    {
      path: '/room/:id/aa',
      name: 'room-aa',
      component: () => import('@/views/AACalculationPage.vue'),
    },
    {
      path: '/room/:id/settings',
      name: 'room-settings',
      component: () => import('@/views/RoomSettingsPage.vue'),
    },
  ],
})

export default router
