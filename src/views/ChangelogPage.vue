<template>
  <div class="changelog-page">
    <AppNavBar title="更新日志" />

    <div class="page-content">
      <div v-for="group in groupedEntries" :key="group.date" class="date-group">
        <div class="date-header">{{ group.date }}</div>
        <van-cell
          v-for="entry in group.entries"
          :key="entry.id"
          is-link
          @click="router.push(`/changelog/${entry.id}`)"
        >
          <template #title>
            <div class="entry-title-row">
              <span class="type-badge" :class="UPDATE_TYPE_META[entry.type].badgeClass">
                {{ UPDATE_TYPE_META[entry.type].label }}
              </span>
              <span class="entry-title">{{ entry.title }}</span>
            </div>
          </template>
          <template #label>
            <span class="entry-meta">{{ entry.developer }}</span>
          </template>
        </van-cell>
      </div>

      <div class="bottom-notice">
        共 {{ entries.length }} 条更新 · 由 git 提交记录生成（{{ releaseLogData.generatedAt }}）
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import AppNavBar from '@/components/AppNavBar.vue'
import { UPDATE_TYPE_META, type ReleaseLogData, type ReleaseLogEntry } from '@/utils/changelog'
import releaseLog from '@/data/release-log.json'

const SCROLL_KEY = 'changelog_list_scroll'
const router = useRouter()
const releaseLogData = releaseLog as unknown as ReleaseLogData
const entries = releaseLogData.entries

interface DateGroup {
  date: string
  entries: ReleaseLogEntry[]
}

const groupedEntries = computed<DateGroup[]>(() => {
  const map = new Map<string, ReleaseLogEntry[]>()
  for (const entry of entries) {
    const list = map.get(entry.date)
    if (list) {
      list.push(entry)
    } else {
      map.set(entry.date, [entry])
    }
  }
  return [...map.entries()].map(([date, list]) => ({ date, entries: list }))
})

// 进入详情前记录列表滚动位置，返回列表时恢复（浏览器原生恢复对 SPA 不可靠）
onBeforeRouteLeave((to) => {
  if (to.path.startsWith('/changelog/')) {
    sessionStorage.setItem(SCROLL_KEY, String(window.scrollY))
  } else {
    sessionStorage.removeItem(SCROLL_KEY)
  }
})

onMounted(() => {
  const saved = Number(sessionStorage.getItem(SCROLL_KEY) ?? '0')
  if (saved > 0) {
    nextTick(() => {
      // 等布局稳定后再恢复，避免滚动锚定把位置偏移
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo(0, saved))
      })
    })
  }
})
</script>

<style scoped>
.changelog-page {
  min-height: 100vh;
  background: var(--color-bg);
}
:deep(.van-cell__title) {
  min-width: 0;
}
.date-group {
  margin-bottom: 8px;
}
.date-header {
  padding: 12px 16px 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.entry-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.entry-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entry-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
