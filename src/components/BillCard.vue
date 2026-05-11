<template>
  <van-cell v-if="bill" class="bill-card" @click="emit('click', bill)">
    <template #title>
      <span class="bill-content">{{ bill.content }}</span>
      <span class="bill-amount" :class="{ 'not-synced': !bill.synced, 'amount-strikethrough': isSelfPay }">
        ¥{{ bill.amount.toFixed(2) }}
      </span>
    </template>
    <template #label>
      <div class="bill-meta">
        <span>{{ bill.creator_name }}</span>
        <span class="meta-sep">|</span>
        <span>{{ formatDate(bill.paid_at) }}</span>
        <span v-if="!bill.synced" class="local-badge">本地</span>
      </div>
      <div class="bill-shared">
        <template v-for="(name, idx) in sharedNames" :key="idx">
          <span class="shared-tag">{{ name }}</span>
        </template>
        <span v-if="isSelfPay" class="shared-tag self-pay-tag">自付自用</span>
      </div>
    </template>
  </van-cell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatDate } from '@/utils/format'
import type { Bill, RoomMember } from '@/lib/types'

const props = withDefaults(defineProps<{
  bill?: Bill | null
  members?: Pick<RoomMember, 'id' | 'name'>[]
}>(), {
  bill: null,
  members: () => [],
})

const emit = defineEmits<{
  click: [bill: Bill]
}>()

const isSelfPay = computed(() =>
  props.bill ? props.bill.shared_by.length === 1 && props.bill.shared_by[0] === props.bill.created_by : false
)

const memberMap = computed(() => {
  const map = new Map<string, string>()
  for (const m of props.members) {
    map.set(m.id, m.name)
  }
  return map
})

const sharedNames = computed(() => {
  if (!props.bill) return []
  return (props.bill.shared_by ?? []).map(id => memberMap.value.get(id) || '未知')
})
</script>

<style scoped>
.bill-card {
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
}
.bill-content {
  font-size: 15px;
  font-weight: 500;
}
.bill-amount {
  float: right;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}
.bill-amount.not-synced {
  color: var(--van-orange, #ff976a);
}
.bill-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}
.meta-sep {
  margin: 0 6px;
}
.local-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  font-size: 10px;
  color: var(--van-orange, #ff976a);
  border: 1px solid var(--van-orange, #ff976a);
  border-radius: 2px;
}
.bill-shared {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.shared-tag {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  background: var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
}
.amount-strikethrough {
  text-decoration: line-through;
  color: var(--color-text-secondary) !important;
}
.self-pay-tag {
  color: var(--color-text-secondary) !important;
}
</style>
