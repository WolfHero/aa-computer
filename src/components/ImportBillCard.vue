<template>
  <div class="import-bill-card-wrap">
    <div class="import-bill-card">
      <div class="card-header">
        <span class="card-index">#{{ index + 1 }}</span>
        <van-button size="small" plain type="primary" @click="showDetail">数据详情</van-button>
        <van-button size="small" plain type="danger" @click="onDelete">删除</van-button>
      </div>
      <div class="card-body">
        <van-field
          v-model="localData.content"
          label="付款内容"
          placeholder="付款内容"
          maxlength="80"
          @update:model-value="emitUpdate"
        />
        <van-field
          v-model="amountText"
          label="付款金额"
          placeholder="金额"
          type="number"
          maxlength="13"
          @update:model-value="emitUpdate"
        />
        <van-field
          name="paidDate"
          label="付款日期"
          is-link
          :model-value="paidDate"
          placeholder="选择付款日期"
          readonly
          @click="showDatePicker = true"
          @click-input="showDatePicker = true"
          @click-right-icon="showDatePicker = true"
        />
        <van-field
          name="paidTime"
          label="付款时间"
          is-link
          :model-value="paidTime"
          placeholder="选择付款时间"
          readonly
          @click="showTimePicker = true"
          @click-input="showTimePicker = true"
          @click-right-icon="showTimePicker = true"
        />
        <div class="sharer-section">
          <div class="sharer-label">分摊人员</div>
          <van-checkbox-group v-model="localData.sharedBy" direction="horizontal" @change="emitUpdate">
            <van-checkbox
              v-for="m in members"
              :key="m.id"
              :name="m.id"
              shape="square"
              style="margin-bottom: 8px"
            >
              {{ m.name }}
            </van-checkbox>
          </van-checkbox-group>
        </div>
      </div>
    </div>

    <van-popup v-model:show="showDatePicker" position="bottom" round :style="{ zIndex: 3000 }">
      <van-date-picker
        title="选择付款日期"
        :model-value="(paidDate || dayjs().format('YYYY-MM-DD')).split('-')"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>
    <van-popup v-model:show="showTimePicker" position="bottom" round :style="{ zIndex: 3000 }">
      <van-time-picker
        title="选择付款时间"
        :model-value="(paidTime || '08:00').split(':')"
        @confirm="onTimeConfirm"
        @cancel="showTimePicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { showConfirmDialog, showDialog } from 'vant'
import type { ImportBillData, RoomMember } from '@/lib/types'

const props = withDefaults(defineProps<{
  billData: ImportBillData
  members?: Pick<RoomMember, 'id' | 'name'>[]
  index?: number
}>(), {
  members: () => [],
  index: 0,
})

const emit = defineEmits<{
  'update': [data: ImportBillData]
  'delete': []
}>()

const localData = reactive({ ...props.billData })
const amountText = ref(String(props.billData.amount))

const showDatePicker = ref(false)
const showTimePicker = ref(false)
const paidDate = ref('')
const paidTime = ref('')

function parsePaidAt(paidAt: string): { date: string; time: string } {
  const d = dayjs(paidAt)
  if (d.isValid()) {
    return { date: d.format('YYYY-MM-DD'), time: d.format('HH:mm') }
  }
  return { date: '', time: '' }
}

const init = parsePaidAt(props.billData.paidAt)
paidDate.value = init.date
paidTime.value = init.time

watch(() => props.billData, (v) => {
  Object.assign(localData, v)
  amountText.value = String(v.amount)
  const parsed = parsePaidAt(v.paidAt)
  paidDate.value = parsed.date
  paidTime.value = parsed.time
}, { deep: true })

function emitUpdate() {
  const amount = parseFloat(amountText.value)
  if (!isNaN(amount)) {
    localData.amount = amount
  }
  const combined = dayjs(`${paidDate.value} ${paidTime.value}`)
  localData.paidAt = combined.isValid() ? combined.format('YYYY-MM-DDTHH:mm:ssZZ') : paidDate.value
  emit('update', { ...localData, amount: localData.amount })
}

function onDateConfirm({ selectedValues }: { selectedValues: string[] }) {
  const [year, month, day] = selectedValues
  paidDate.value = `${year}-${month}-${day}`
  showDatePicker.value = false
  emitUpdate()
}

function onTimeConfirm({ selectedValues }: { selectedValues: string[] }) {
  paidTime.value = selectedValues.join(':')
  showTimePicker.value = false
  emitUpdate()
}

function showDetail() {
  showDialog({
    title: '原始数据',
    message: props.billData.rawRow,
    confirmButtonText: '关闭',
  })
}

async function onDelete() {
  try {
    await showConfirmDialog({
      title: '删除',
      message: '确定删除此账单吗？',
      confirmButtonColor: '#ee0a24',
    })
    emit('delete')
  } catch {
    // cancelled
  }
}

// Used in template @confirm handlers - reference to satisfy noUnusedLocals
void onDateConfirm
void onTimeConfirm
</script>

<style scoped>
.import-bill-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  margin: 0 16px 12px;
  overflow: hidden;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--color-bg, #f7f8fa);
  border-bottom: 1px solid var(--color-border);
}
.card-index {
  font-weight: 600;
  font-size: 14px;
  margin-right: auto;
}
.card-body {
  padding: 4px 0;
}
.sharer-section {
  padding: 10px 16px 6px;
}
.sharer-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
</style>
