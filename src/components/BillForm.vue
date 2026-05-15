<template>
  <van-dialog
    :show="show"
    :title="editingBill ? '编辑账单' : '新增账单'"
    :show-confirm-button="false"
    close-on-click-overlay
    @open="resetForm"
    @closed="onClosed"
    @update:show="emit('update:show', $event)"
  >
    <van-form ref="formRef" @submit="onSubmit" class="dialog-form">
      <van-field
        v-model="form.content"
        name="content"
        label="付款内容"
        placeholder="请输入付款内容"
        maxlength="80"
        :rules="[
          { required: true, message: '请输入付款内容' },
          { validator: validateContent, message: '付款内容过长（汉字40字/字母80字）' },
        ]"
      />
      <van-field
        v-model="form.amount"
        name="amount"
        label="付款金额"
        placeholder="请输入金额"
        type="number"
        maxlength="13"
        :rules="[
          { required: true, message: '请输入金额' },
          { pattern: /^\d{1,10}(\.\d{1,2})?$/, message: '金额格式不正确（最多10位整数+2位小数）' },
        ]"
      />
      <van-field
        name="paidDate"
        label="付款日期"
        is-link
        :model-value="form.paidDate || ''"
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
        :model-value="form.paidTime"
        placeholder="选择付款时间"
        readonly
        @click="showTimePicker = true"
        @click-input="showTimePicker = true"
        @click-right-icon="showTimePicker = true"
      />
      <van-field
        name="sharedBy"
        label="分摊人员"
        :rules="[{ required: true, message: '请选择分摊人员', validator: () => form.sharedBy.length > 0 }]"
      >
        <template #input>
          <van-checkbox-group
            v-if="members.length > 0"
            v-model="form.sharedBy"
            direction="horizontal"
          >
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
          <span v-else class="no-members">暂无其他成员</span>
        </template>
      </van-field>
      <van-field name="creatorName" label="付款人" readonly>
        <template #input>
          <span class="creator-name">{{ form.creatorName || creatorName }}</span>
        </template>
      </van-field>

      <div v-if="editingBill" style="margin: 16px; display: flex; gap: 12px;">
        <van-button round block type="danger" native-type="button" @click="onDelete" style="flex: 1;">
          删除
        </van-button>
        <van-button round block type="primary" native-type="submit" :loading="submitting" style="flex: 1;">
          保存
        </van-button>
      </div>
      <div v-else style="margin: 16px; display: flex; gap: 12px;">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          保存
        </van-button>
        <van-button round block plain type="primary" native-type="button" @click="onSaveAndContinue" :loading="submitting">
          继续新增
        </van-button>
      </div>
    </van-form>
  </van-dialog>

  <van-popup v-model:show="showDatePicker" position="bottom" round :style="{ zIndex: 3000 }">
    <van-date-picker
      title="选择付款日期"
      :model-value="datePickerValue"
      @confirm="onDateConfirm"
      @cancel="showDatePicker = false"
    />
  </van-popup>
  <van-popup v-model:show="showTimePicker" position="bottom" round :style="{ zIndex: 3000 }">
    <van-time-picker
      title="选择付款时间"
      :model-value="timePickerValue"
      @confirm="onTimeConfirm"
      @cancel="showTimePicker = false"
    />
  </van-popup>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { showToast } from 'vant'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabaseClient'
import { useLocalBills } from '@/composables/useLocalBills'
import { useRemoteBills } from '@/composables/useRemoteBills'
import type { Bill, RoomMember } from '@/lib/types'

function calcCharUnits(str: string): number {
  let units = 0
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0
    units += code <= 0x007E || (code >= 0xff61 && code <= 0xff9f) ? 0.5 : 1
  }
  return units
}

function validateContent(val: string) {
  return calcCharUnits(val) <= 40
}

const props = withDefaults(defineProps<{
  show?: boolean
  roomId?: string
  members?: Pick<RoomMember, 'id' | 'name'>[]
  editingBill?: Bill | null
  creatorName?: string
  creatorId?: string
}>(), {
  show: false,
  roomId: '',
  members: () => [],
  editingBill: null,
  creatorName: '',
  creatorId: '',
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
  delete: []
  closed: []
}>()

const { addBill, updateBill } = useLocalBills()
const { submitBills } = useRemoteBills()
const submitting = ref(false)
const showDatePicker = ref(false)
const showTimePicker = ref(false)
const formRef = ref()

const todayStr = new Date().toISOString().slice(0, 10)
const defaultTime = '08:00'
const datePickerValue = computed(() => {
  const d = form.paidDate || todayStr
  return d.split('-')
})
const timePickerValue = computed(() => {
  return (form.paidTime || defaultTime).split(':')
})
const lastPaidDate = ref('')

const form = reactive({
  content: '',
  amount: '',
  paidDate: '',
  paidTime: defaultTime,
  sharedBy: [] as string[],
  creatorName: '',
})

function getCombinedPaidAt(): string {
  return dayjs(`${form.paidDate || todayStr} ${form.paidTime || defaultTime}`).format('YYYY-MM-DDTHH:mm:ssZZ')
}

function resetForm() {
  if (props.editingBill) {
    form.content = props.editingBill.content
    form.amount = String(props.editingBill.amount)
    const d = dayjs(props.editingBill.paid_at)
    form.paidDate = d.isValid() ? d.format('YYYY-MM-DD') : todayStr
    form.paidTime = d.isValid() ? d.format('HH:mm') : defaultTime
    form.sharedBy = [...props.editingBill.shared_by]
    form.creatorName = props.editingBill.creator_name
  } else {
    form.content = ''
    form.amount = ''
    form.paidDate = lastPaidDate.value || todayStr
    form.paidTime = defaultTime
    form.sharedBy = []
    form.creatorName = props.creatorName
  }
}

function onDateConfirm({ selectedValues }: { selectedValues: string[] }) {
  const [year, month, day] = selectedValues
  form.paidDate = `${year}-${month}-${day}`
  lastPaidDate.value = form.paidDate
  showDatePicker.value = false
}

function onTimeConfirm({ selectedValues }: { selectedValues: string[] }) {
  form.paidTime = selectedValues.join(':')
  showTimePicker.value = false
}

function onClosed() {
  resetForm()
  emit('closed')
}

function onDelete() {
  emit('delete')
}

async function onSubmit() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    await saveBill()
    emit('update:show', false)
    emit('saved')
  } finally {
    submitting.value = false
  }
}

async function onSaveAndContinue() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    await saveBill()
    showToast('已保存')
    form.content = ''
    form.amount = ''
    emit('saved')
  } finally {
    submitting.value = false
  }
}

async function saveBill() {
  if (form.sharedBy.length === 0) {
    showToast('请选择分摊人员')
    submitting.value = false
    return
  }

  const amount = parseFloat(form.amount)
  if (isNaN(amount) || amount <= 0) {
    showToast('请输入有效金额')
    submitting.value = false
    return
  }

  const paidAt = getCombinedPaidAt()
  if (props.editingBill) {
    if (props.editingBill.id) {
      // Synced bill: update in DB + version increment (transactional)
      const { error } = await supabase.rpc('update_bill', {
        p_bill_id: props.editingBill.id,
        p_room_id: props.roomId,
        p_content: form.content,
        p_amount: amount,
        p_paid_at: paidAt,
        p_shared_by: form.sharedBy,
        p_creator_name: form.creatorName,
      })
      if (error) throw error
    }
    updateBill(props.roomId, props.editingBill.local_id, {
      content: form.content,
      amount,
      paid_at: paidAt,
      shared_by: form.sharedBy,
      creator_name: form.creatorName,
    })
  } else {
    addBill(props.roomId, {
      room_id: props.roomId,
      content: form.content,
      amount,
      paid_at: paidAt,
      shared_by: form.sharedBy,
      created_by: props.creatorId,
      creator_name: form.creatorName,
    })
  }

  // 同步未提交的账单到后端（新账单或编辑未同步账单）
  if (!props.editingBill?.id) {
    try {
      await submitBills(props.roomId)
    } catch {
      showToast('已保存到本地，同步失败')
    }
  }
}
</script>

<style scoped>
.dialog-form {
  padding: 8px 0;
}
.no-members {
  color: var(--color-text-secondary);
  font-size: 13px;
}
.creator-name {
  color: var(--color-text, #333);
  font-size: 14px;
}
</style>
