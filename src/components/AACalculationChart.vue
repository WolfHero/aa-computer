<template>
  <div class="aa-chart-container">
    <div ref="chartRef" class="chart"></div>

    <div v-if="!loading && result" class="aa-summary">
      <div class="summary-row">
        <span class="summary-label">账单总金额</span>
        <span class="summary-value">{{ formatCurrency(totalAmount) }}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">你支付的金额</span>
        <span class="summary-value">{{ formatCurrency(myResult?.total_paid ?? 0) }}</span>
      </div>
      <div class="summary-row" :class="netClass">
        <span class="summary-label">{{ netLabel }}</span>
        <span class="summary-value">{{ formatCurrency(Math.abs(myResult?.net ?? 0)) }}</span>
      </div>
    </div>

    <div v-if="transfers.length > 0" class="transfer-section">
      <div class="section-title">转账明细</div>
      <div
        v-for="t in transfers"
        :key="`${t.from_member_id}-${t.to_member_id}`"
        class="transfer-item"
      >
        <span class="transfer-from">{{ t.from_name }}</span>
        <span class="transfer-arrow">→</span>
        <span class="transfer-to">{{ t.to_name }}</span>
        <span class="transfer-amount">{{ formatCurrency(t.amount) }}</span>
      </div>
    </div>

    <div v-if="loading" class="loading-placeholder">计算中...</div>
    <div v-else-if="!result" class="loading-placeholder">暂无AA计算结果</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { formatCurrency } from '@/utils/format'
import type { AAResult, AAMemberResult, AATransfer } from '@/lib/types'

const props = withDefaults(defineProps<{
  loading?: boolean
  result?: AAResult | null
  currentMemberId?: string | null
}>(), {
  loading: false,
  result: null,
  currentMemberId: null,
})

const chartRef = ref<HTMLDivElement>()
let chartInstance: echarts.ECharts | null = null

const totalAmount = computed(() => {
  if (!props.result?.results?.members) return 0
  return props.result.results.members.reduce((sum, m) => sum + m.total_paid, 0)
})

const myResult = computed<AAMemberResult | undefined>(() => {
  if (!props.result?.results?.members || !props.currentMemberId) return undefined
  return props.result.results.members.find(m => m.member_id === props.currentMemberId)
})

const netLabel = computed(() => {
  if (!myResult.value) return ''
  return myResult.value.net >= 0 ? '他人需转给你' : '你需要转出'
})

const netClass = computed(() => ({
  'net-positive': (myResult.value?.net ?? 0) >= 0,
  'net-negative': (myResult.value?.net ?? 0) < 0,
}))

const transfers = computed<AATransfer[]>(() => {
  if (!props.result?.results?.transfers) return []
  if (!props.currentMemberId) return props.result.results.transfers
  return props.result.results.transfers.filter(
    t => t.from_member_id === props.currentMemberId || t.to_member_id === props.currentMemberId
  )
})

function renderChart() {
  if (!chartRef.value || !props.result?.results?.members) return

  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }

  const my = myResult.value
  const total = totalAmount.value
  const myPaid = my?.total_paid ?? 0
  const net = Math.abs(my?.net ?? 0)

  chartInstance.setOption({
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['55%', '72%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: {
          show: true,
          position: 'outside',
          fontSize: 13,
          fontWeight: 500,
          formatter: '{b}',
        },
        labelLine: {
          length: 10,
          length2: 14,
          smooth: true,
        },
        emphasis: {
          label: { show: true, fontSize: 16, fontWeight: 'bold' },
        },
        data: [
          { value: myPaid, name: `我付了 ${formatCurrency(myPaid)}`, itemStyle: { color: '#1989fa' } },
          { value: Math.max(0, total - myPaid), name: '其他人支付', itemStyle: { color: '#c8c9cc' } },
        ],
      },
      {
        type: 'pie',
        radius: ['28%', '42%'],
        label: {
          show: true,
          fontSize: 12,
          position: 'outside',
          align: 'center',
        },
        labelLine: {
          length: 6,
          length2: 8,
          smooth: true,
        },
        data: (my?.net ?? 0) >= 0
          ? [
              { value: net, name: '应收', itemStyle: { color: '#ee0a24' } },
              { value: Math.max(0, total - net), itemStyle: { color: 'transparent' }, label: { show: false }, tooltip: { show: false } },
            ]
          : [
              { value: Math.max(0, total - net), itemStyle: { color: 'transparent' }, label: { show: false }, tooltip: { show: false } },
              { value: net, name: '应付', itemStyle: { color: '#07c160' } },
            ],
      },
    ],
  })
}

onMounted(() => {
  renderChart()
})

onUnmounted(() => {
  chartInstance?.dispose()
  chartInstance = null
})

watch(() => [props.result, props.currentMemberId], () => {
  renderChart()
}, { deep: true })
</script>

<style scoped>
.aa-chart-container {
  background: #fff;
  padding: 16px;
}
.chart {
  width: 100%;
  height: 280px;
}
.aa-summary {
  padding: 16px;
  background: #fff;
  border-radius: 8px;
  margin: 0 0 16px;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border);
}
.summary-row:last-child {
  border-bottom: none;
}
.summary-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}
.summary-value {
  font-size: 16px;
  font-weight: 600;
}
.net-positive .summary-value {
  color: #ee0a24;
}
.net-negative .summary-value {
  color: #07c160;
}
.transfer-section {
  margin: 16px 0;
  padding: 0 16px;
}
.section-title {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 12px;
}
.transfer-item {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border);
  font-size: 14px;
}
.transfer-from,
.transfer-to {
  font-weight: 500;
}
.transfer-arrow {
  margin: 0 8px;
  color: var(--color-text-secondary);
}
.transfer-amount {
  margin-left: auto;
  font-weight: 600;
  color: var(--color-primary);
}
.loading-placeholder {
  text-align: center;
  padding: 40px;
  color: var(--color-text-secondary);
}
</style>
