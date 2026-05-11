<template>
  <van-action-sheet
    :show="show"
    :actions="actions"
    cancel-text="取消"
    close-on-click-action
    @update:show="emit('update:show', $event)"
    @select="onSelect"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useRemoteBills } from '@/composables/useRemoteBills'
import type { SortMode } from '@/lib/types'

const props = withDefaults(defineProps<{
  show?: boolean
  roomId?: string
  sortMode?: SortMode
  roomExpired?: boolean
}>(), {
  show: false,
  roomId: '',
  sortMode: 'created_at',
  roomExpired: false,
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:sortMode': [value: SortMode]
  'submit-bills': []
  'calculate-aa': []
}>()

const router = useRouter()
const { submitBills } = useRemoteBills()

const actions = computed(() => {
  const list = [
    { name: '计算AA', key: 'aa' },
    { name: props.sortMode === 'created_at' ? '切换为按付款时间排序' : '切换为按创建时间排序', key: 'sort' },
  ]
  if (!props.roomExpired) {
    list.push({ name: '提交付账记录', key: 'submit' })
  }
  list.push({ name: '房间设置', key: 'settings' })
  return list
})

async function onSelect(action: { key: string }) {
  switch (action.key) {
    case 'aa':
      emit('calculate-aa')
      break
    case 'sort':
      emit('update:sortMode', props.sortMode === 'created_at' ? 'paid_at' : 'created_at')
      break
    case 'submit':
      try {
        await submitBills(props.roomId!)
        showToast('已提交')
        emit('submit-bills')
      } catch (e: unknown) {
        showToast(e instanceof Error ? e.message : '提交失败')
      }
      break
    case 'settings':
      router.push(`/room/${props.roomId}/settings`)
      break
  }
  emit('update:show', false)
}
</script>
