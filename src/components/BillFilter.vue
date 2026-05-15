<template>
  <div class="bill-filter">
    <van-field
      v-model="filters.content"
      placeholder="搜索付款内容"
      clearable
      class="filter-field"
      @input="onContentInput"
    />

    <van-field
      :model-value="creatorDisplay"
      is-link
      readonly
      placeholder="选择付款人"
      class="filter-field"
      @click="showCreatorPicker = true"
    />
    <van-field
      :model-value="dateRangeText"
      is-link
      readonly
      placeholder="付款时间"
      class="filter-field"
      @click="showDatePopup = true"
    />

    <van-popup v-model:show="showCreatorPicker" position="bottom" round>
      <van-picker
        :columns="creatorOptions"
        title="选择付款人"
        @confirm="onCreatorConfirm"
        @cancel="showCreatorPicker = false"
      />
    </van-popup>

    <van-popup v-model:show="showDatePopup" position="bottom" round>
      <div class="date-range-picker">
        <div class="date-range-header">选择付款时间范围</div>
        <div class="date-range-fields">
          <van-field
            :model-value="filters.paid_at_start ?? ''"
            is-link
            readonly
            placeholder="开始日期"
            @click="showStartPicker = true"
          />
          <span class="date-sep">至</span>
          <van-field
            :model-value="filters.paid_at_end ?? ''"
            is-link
            readonly
            placeholder="结束日期"
            @click="showEndPicker = true"
          />
        </div>
        <div class="date-range-actions">
          <van-button round block plain type="primary" size="small" @click="clearDateRange">清除</van-button>
          <van-button round block type="primary" size="small" @click="onDateConfirm">确定</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showStartPicker" position="bottom" round>
      <van-date-picker title="开始日期" :model-value="todayDate" @confirm="onStartConfirm" @cancel="showStartPicker = false" />
    </van-popup>
    <van-popup v-model:show="showEndPicker" position="bottom" round>
      <van-date-picker title="结束日期" :model-value="todayDate" @confirm="onEndConfirm" @cancel="showEndPicker = false" />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import type { BillFilter, RoomMember } from '@/lib/types'

const props = withDefaults(defineProps<{
  members?: Pick<RoomMember, 'id' | 'name'>[]
}>(), {
  members: () => [],
})

const emit = defineEmits<{
  'update': [filters: BillFilter]
}>()

const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

function onContentInput() {
  if (debounceTimer.value) clearTimeout(debounceTimer.value)
  debounceTimer.value = setTimeout(() => {
    emit('update', { ...filters })
  }, 1000)
}

const filters = reactive<BillFilter>({
  content: '',
  creator_id: null,
  paid_at_start: null,
  paid_at_end: null,
})

const showCreatorPicker = ref(false)
const showDatePopup = ref(false)
const showStartPicker = ref(false)
const showEndPicker = ref(false)

const now = new Date()
const todayDate = [
  String(now.getFullYear()),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
]

const creatorOptions = computed(() => [
  { text: '全部', value: '' },
  ...props.members.map(m => ({ text: m.name, value: m.id })),
])

const creatorDisplay = computed(() => {
  if (!filters.creator_id) return ''
  const m = props.members.find(m => m.id === filters.creator_id)
  return m?.name ?? ''
})

const dateRangeText = computed(() => {
  if (!filters.paid_at_start && !filters.paid_at_end) return ''
  return `${filters.paid_at_start || '不限'} ~ ${filters.paid_at_end || '不限'}`
})

function onCreatorConfirm({ selectedOptions }: { selectedOptions: Array<{ text: string; value: string | null }> }) {
  filters.creator_id = selectedOptions[0]?.value || null
  showCreatorPicker.value = false
  emit('update', { ...filters })
}

function onStartConfirm({ selectedValues }: { selectedValues: string[] }) {
  filters.paid_at_start = `${selectedValues[0]}-${selectedValues[1]}-${selectedValues[2]}`
  showStartPicker.value = false
}

function onEndConfirm({ selectedValues }: { selectedValues: string[] }) {
  filters.paid_at_end = `${selectedValues[0]}-${selectedValues[1]}-${selectedValues[2]}`
  showEndPicker.value = false
}

function onDateConfirm() {
  showDatePopup.value = false
  emit('update', { ...filters })
}

function clearDateRange() {
  filters.paid_at_start = null
  filters.paid_at_end = null
  showDatePopup.value = false
  emit('update', { ...filters })
}
</script>

<style scoped>
.bill-filter {
  padding: 8px 16px;
  background: #fff;
}
.filter-field {
  margin-bottom: 4px;
}
.date-range-picker {
  padding: 16px;
}
.date-range-header {
  font-size: 16px;
  font-weight: 500;
  margin-bottom: 16px;
  text-align: center;
}
.date-range-fields {
  display: flex;
  align-items: center;
  gap: 8px;
}
.date-sep {
  flex-shrink: 0;
  color: var(--color-text-secondary);
}
.date-range-actions {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}
</style>
