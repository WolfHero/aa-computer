<template>
  <van-dialog
    :show="show"
    title="创建房间"
    :show-confirm-button="false"
    close-on-click-overlay
    @closed="resetForm"
    @update:show="emit('update:show', $event)"
  >
    <van-form @submit="onSubmit" class="dialog-form" autocomplete="off">
      <van-field
        v-model="form.name"
        name="name"
        label="房间名称"
        placeholder="请输入房间名称"
        maxlength="20"
        autocomplete="off"
        :rules="[{ required: true, message: '请输入房间名称' }]"
      />
      <van-field
        v-model="form.description"
        name="description"
        label="房间简介"
        placeholder="请输入房间简介（选填）"
        rows="2"
        autosize
        type="textarea"
        autocomplete="off"
      />
      <van-field
        v-model="form.creatorName"
        name="creatorName"
        label="你的名字"
        placeholder="请输入你的名字"
        maxlength="20"
        autocomplete="off"
        :rules="[{ required: true, message: '请输入你的名字' }]"
      />
      <div style="margin: 16px">
        <van-button round block type="primary" native-type="submit" :loading="submitting">
          创建
        </van-button>
      </div>
    </van-form>
  </van-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { showToast } from 'vant'
import { useAuth } from '@/composables/useAuth'
import { useRooms } from '@/composables/useRooms'

const props = withDefaults(defineProps<{ show?: boolean }>(), { show: false })
const emit = defineEmits<{
  'update:show': [value: boolean]
  created: []
}>()

const { ensureAuth } = useAuth()
const { createRoom } = useRooms()
const submitting = ref(false)

const form = reactive({
  name: '',
  description: '',
  creatorName: '',
})

function resetForm() {
  form.name = ''
  form.description = ''
  form.creatorName = ''
}

async function onSubmit() {
  submitting.value = true
  try {
    await ensureAuth()
    await createRoom(form.name, form.description, form.creatorName)
    showToast('房间创建成功')
    emit('update:show', false)
    emit('created')
  } catch (e: unknown) {
    showToast(e instanceof Error ? e.message : '创建失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.dialog-form {
  padding: 8px 0;
}
</style>
