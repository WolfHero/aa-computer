<template>
  <div class="changelog-detail-page">
    <AppNavBar title="更新详情" :on-back="onBack" />

    <div class="page-content">
      <template v-if="entry">
        <div class="detail-card">
          <div class="detail-header">
            <span class="type-badge" :class="UPDATE_TYPE_META[entry.type].badgeClass">
              {{ UPDATE_TYPE_META[entry.type].label }}
            </span>
            <h2 class="detail-title">{{ entry.title }}</h2>
          </div>

          <van-cell-group inset class="detail-meta">
            <van-cell title="开发者" :value="entry.developer" />
            <van-cell title="提交日期" :value="entry.date" />
          </van-cell-group>

          <div v-if="entry.body" class="detail-section">
            <div class="detail-section-title">正文</div>
            <div class="detail-body" v-html="renderedBody"></div>
          </div>

          <div v-if="entry.remark" class="detail-section">
            <div class="detail-section-title">备注</div>
            <p class="detail-remark">{{ entry.remark }}</p>
          </div>
        </div>
      </template>

      <div v-else class="not-found">
        <van-icon name="info-o" size="48" color="var(--color-text-secondary)" />
        <p>未找到该更新记录</p>
        <van-button round size="small" type="primary" @click="router.replace('/changelog')">
          返回更新日志
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import MarkdownIt from 'markdown-it'
import AppNavBar from '@/components/AppNavBar.vue'
import { UPDATE_TYPE_META, type ReleaseLogData } from '@/utils/changelog'
import releaseLog from '@/data/release-log.json'

const md = new MarkdownIt({
  html: false, // 转义正文里的原始 HTML，避免注入
  linkify: true,
  breaks: true,
})

// 外部链接新窗口打开
md.renderer.rules.link_open = (tokens, idx, _options, _env, self) => {
  const token = tokens[idx]
  if (token) {
    token.attrSet('target', '_blank')
    token.attrSet('rel', 'noopener noreferrer')
  }
  return self.renderToken(tokens, idx, _options)
}

const route = useRoute()
const router = useRouter()
const releaseLogData = releaseLog as unknown as ReleaseLogData

const entry = computed(() =>
  releaseLogData.entries.find(e => e.id === route.params.id),
)

const renderedBody = computed(() =>
  entry.value?.body ? md.render(entry.value.body) : '',
)

// 详情页始终从顶部开始，避免继承列表页的滚动位置
onMounted(() => window.scrollTo(0, 0))

function onBack() {
  // 从列表进入时返回原列表；直接打开详情链接时退回列表页
  if (history.state?.back) {
    router.back()
  } else {
    router.replace('/changelog')
  }
}
</script>

<style scoped>
.changelog-detail-page {
  min-height: 100vh;
  background: var(--color-bg);
}
.detail-card {
  background: var(--color-surface-raised);
  border-radius: 12px;
  padding: 20px 16px;
}
.detail-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}
.detail-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--color-text);
}
.detail-meta {
  margin: 0 0 16px;
}
.detail-section {
  margin-top: 16px;
}
.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
.detail-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text);
  word-break: break-word;
}
.detail-body :deep(p) {
  margin: 8px 0;
}
.detail-body :deep(p:first-child),
.detail-body :deep(ul:first-child),
.detail-body :deep(ol:first-child) {
  margin-top: 0;
}
.detail-body :deep(ul),
.detail-body :deep(ol) {
  margin: 8px 0;
  padding-left: 1.4em;
}
.detail-body :deep(ul) {
  list-style: disc;
}
.detail-body :deep(ol) {
  list-style: decimal;
}
.detail-body :deep(li) {
  margin: 4px 0;
}
.detail-body :deep(a) {
  color: var(--color-primary);
  word-break: break-all;
}
.detail-body :deep(code) {
  padding: 1px 5px;
  font-size: 13px;
  background: var(--color-border);
  border-radius: 4px;
}
.detail-body :deep(pre) {
  margin: 8px 0;
  padding: 12px;
  overflow-x: auto;
  background: var(--color-bg);
  border-radius: 8px;
}
.detail-body :deep(pre code) {
  padding: 0;
  background: none;
  font-size: 13px;
}
.detail-remark {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text);
}
.not-found {
  text-align: center;
  padding: 80px 16px;
  color: var(--color-text-secondary);
}
.not-found p {
  margin: 16px 0;
}
</style>
