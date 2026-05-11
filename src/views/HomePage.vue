<template>
  <div class="home-page">
    <AppNavBar
      title="AA计算器"
      :show-back="false"
      :right-actions="[
        { text: '新增房间', onClick: () => showCreateDialog = true },
        { text: '关于', onClick: () => showActionSheet = true },
      ]"
    />

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="listLoading"
        :finished="finished"
        :immediate-check="false"
        finished-text="没有更多了"
        @load="onLoad"
      >
        <div v-if="loading && rooms.length === 0" class="loading-state">
          加载中...
        </div>

        <template v-else>
          <van-cell
            v-for="room in rooms"
            :key="room.id"
            :title="room.name"
            :label="room.description || '暂无简介'"
            is-link
            @click="router.push(`/room/${room.id}`)"
          >
            <template #value>
              <span class="member-count">{{ room.members?.length ?? 0 }} 人</span>
            </template>
          </van-cell>

          <div v-if="rooms.length === 0" class="empty-state">
            <van-icon name="plus" size="48" color="#c8c9cc" />
            <p>点击右上角「新增」创建房间</p>
          </div>
        </template>
      </van-list>
    </van-pull-refresh>

    <div class="bottom-notice">服务端数据将于最后一次编辑的七天后清除</div>

    <van-back-top />

    <RoomCreateDialog v-model:show="showCreateDialog" @created="onRefresh" />
    <van-action-sheet
      v-model:show="showActionSheet"
      :actions="settingsActions"
      title="AA计算器 Ver0.1 Beta"
      cancel-text="取消"
      close-on-click-action
      @select="onSettingsSelect"
    />

    <van-dialog v-model:show="showPrivacyDialog" title="隐私政策" show-cancel-button confirm-button-text="知道了">
      <div class="privacy-content">
        <p>本APP用于便捷的计算多人活动AA时导致的算账难问题。</p>
        <p>本APP不需要登录，也不存储任何敏感信息。</p>
        <p>长时间不更新的用户、房间以及账单记录会自动清空，请大家及时完成转账或截图备份。</p>
        <p>项目在GitHub上开源，作者主页：<a href="https://github.com/WolfHero" target="_blank">https://github.com/WolfHero</a>，多平台同名。</p>
      </div>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useRooms } from '@/composables/useRooms'
import AppNavBar from '@/components/AppNavBar.vue'
import RoomCreateDialog from '@/components/RoomCreateDialog.vue'

const router = useRouter()
const { rooms, loading, finished, fetchRooms } = useRooms()
const refreshing = ref(false)
const listLoading = ref(false)
const showCreateDialog = ref(false)
const showActionSheet = ref(false)
const showPrivacyDialog = ref(false)

const settingsActions = [
  { name: '隐私政策', key: 'privacy' },
]

function onSettingsSelect(action: { key: string }) {
  if (action.key === 'privacy') {
    showPrivacyDialog.value = true
  }
  showActionSheet.value = false
}

async function onLoad() {
  listLoading.value = true
  await fetchRooms(false)
  listLoading.value = false
}

async function onRefresh() {
  refreshing.value = true
  try {
    await fetchRooms(true)
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  }
  refreshing.value = false
}

onMounted(() => {
  fetchRooms(true)
})

</script>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.empty-state {
  text-align: center;
  padding: 80px 16px;
  color: var(--color-text-secondary);
}
.empty-state p {
  margin-top: 16px;
  font-size: 14px;
}
.member-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}
.loading-state {
  text-align: center;
  padding: 40px 16px;
  color: var(--color-text-secondary);
  font-size: 14px;
}
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
