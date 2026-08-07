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
import { showToast } from '@/utils/toast'
import { useRemoteBills } from '@/composables/useRemoteBills'
import type { RoomMode, SortMode } from '@/lib/types'

const props = withDefaults(defineProps<{
  show?: boolean
  roomId?: string
  sortMode?: SortMode
  mode?: RoomMode
  legacy?: boolean
}>(), {
  show: false,
  roomId: '',
  sortMode: 'created_at',
  mode: 'online',
  legacy: false,
})

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:sortMode': [value: SortMode]
  'submit-bills': []
  'calculate-aa': []
  'delete-local': []
  'rebuild': []
  'export': []
}>()

const router = useRouter()
const { submitBills } = useRemoteBills()

const actions = computed(() => {
  const sortAction = {
    name: props.sortMode === 'created_at' ? '切换为按付款时间排序' : '切换为按创建时间排序',
    key: 'sort',
  }
  if (props.legacy || props.mode === 'expired') {
    return [
      { name: props.legacy ? '迁移为本地房间' : '重建为本地房间', key: 'rebuild' },
      { name: '计算AA', key: 'aa' },
      sortAction,
      { name: '房间设置', key: 'settings' },
      { name: '删除本地数据', key: 'delete-local', color: 'var(--color-danger)' },
    ]
  }
  if (props.mode === 'local') {
    return [
      { name: '计算AA', key: 'aa' },
      sortAction,
      { name: '导入账单', key: 'import-bills' },
      { name: '导出本地房间', key: 'export' },
      { name: '房间设置', key: 'settings' },
      { name: '删除本地数据', key: 'delete-local', color: 'var(--color-danger)' },
    ]
  }
  return [
    { name: '复制公共邀请链接', key: 'copy-invite' },
    { name: '计算AA', key: 'aa' },
    sortAction,
    { name: '导入账单', key: 'import-bills' },
    { name: '房间设置', key: 'settings' },
  ]
})

async function onSelect(action: { key: string }) {
  switch (action.key) {
    case 'copy-invite': {
      const url = `${window.location.origin}/invite?room_id=${props.roomId}`
      try {
        await navigator.clipboard.writeText(url)
        showToast('邀请链接已复制')
      } catch {
        showToast('复制失败')
      }
      break
    }
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
    case 'import-bills':
      router.push(`/room/${props.roomId}/import`)
      break
    case 'settings':
      router.push(`/room/${props.roomId}/settings`)
      break
    case 'delete-local':
      emit('delete-local')
      break
    case 'rebuild':
      emit('rebuild')
      break
    case 'export':
      emit('export')
      break
  }
  emit('update:show', false)
}
</script>
