<template>
  <van-dialog
    :show="show"
    :title="editingBill ? '编辑账单' : '新增账单'"
    :show-confirm-button="false"
    close-on-click-overlay
    @open="resetForm"
    @closed="resetForm"
    @update:show="emit('update:show', $event)"
  >
    <van-form @submit="onSubmit" class="dialog-form">
      <van-field
        v-model="form.content"
        name="content"
        label="付款内容"
        placeholder="请输入付款内容"
        :rules="[{ required: true, message: '请输入付款内容' }]"
      />
      <van-field
        v-model="form.amount"
        name="amount"
        label="付款金额"
        placeholder="请输入金额"
        type="digit"
        :rules="[{ required: true, message: '请输入金额' }]"
      />
      <van-field
        name="paidAt"
        label="付款时间"
        is-link
        :model-value="form.paidAt || ''"
        placeholder="选择付款时间"
        readonly
        @click="showDatePicker = true"
        @click-input="showDatePicker = true"
        @click-right-icon="showDatePicker = true"
      />
      <van-field name="sharedBy" label="分摊人员">
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

      <div style="margin: 16px">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          保存
        </van-button>
      </div>
    </van-form>
  </van-dialog>

  <van-popup v-model:show="showDatePicker" position="bottom" round :style="{ zIndex: 3000 }">
    <van-date-picker
      title="选择付款时间"
      :model-value="datePickerValue"
      @confirm="onDateConfirm"
      @cancel="showDatePicker = false"
    />
  </van-popup>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { showToast } from 'vant'
import { useLocalBills } from '@/composables/useLocalBills'
import { useRemoteBills } from '@/composables/useRemoteBills'
import type { Bill, RoomMember } from '@/lib/types'

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
}>()

const { addBill, updateBill } = useLocalBills()
const { submitBills } = useRemoteBills()
const submitting = ref(false)
const showDatePicker = ref(false)

const defaultSharedBy = ref<string[]>([])

const todayStr = new Date().toISOString().slice(0, 10)
const datePickerValue = computed(() => {
  const d = form.paidAt || todayStr
  return d.split('-')
})
const lastPaidAt = ref('')

const form = reactive({
  content: '',
  amount: '',
  paidAt: '',
  sharedBy: [] as string[],
  creatorName: '',
})

function resetForm() {
  if (props.editingBill) {
    form.content = props.editingBill.content
    form.amount = String(props.editingBill.amount)
    form.paidAt = props.editingBill.paid_at
    form.sharedBy = [...props.editingBill.shared_by]
    form.creatorName = props.editingBill.creator_name
  } else {
    form.content = ''
    form.amount = ''
    form.paidAt = lastPaidAt.value || todayStr
    form.sharedBy = []
    form.creatorName = props.creatorName
  }
}

function onDateConfirm({ selectedValues }: { selectedValues: string[] }) {
  const [year, month, day] = selectedValues
  form.paidAt = `${year}-${month}-${day}`
  lastPaidAt.value = form.paidAt
  showDatePicker.value = false
}

async function onSubmit() {
  if (form.sharedBy.length === 0) {
    showToast('请选择分摊人员')
    return
  }

  submitting.value = true
  try {
    const amount = parseFloat(form.amount)
    if (isNaN(amount) || amount <= 0) {
      showToast('请输入有效金额')
      return
    }

    if (props.editingBill) {
      updateBill(props.roomId, props.editingBill.local_id, {
        content: form.content,
        amount,
        paid_at: form.paidAt || new Date().toISOString(),
        shared_by: form.sharedBy,
        creator_name: form.creatorName,
      })
    } else {
      addBill(props.roomId, {
        room_id: props.roomId,
        content: form.content,
        amount,
        paid_at: form.paidAt || new Date().toISOString(),
        shared_by: form.sharedBy,
        created_by: props.creatorId,
        creator_name: form.creatorName,
      })
    }

    showToast('已保存')

    // 同步到后端
    try {
      await submitBills(props.roomId)
    } catch {
      showToast('已保存到本地，同步失败')
    }

    emit('update:show', false)
    emit('saved')
  } finally {
    submitting.value = false
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
