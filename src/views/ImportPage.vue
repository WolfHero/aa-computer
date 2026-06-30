<template>
  <div class="import-page">
    <AppNavBar
      title="导入账单"
      :on-back="onBack"
      :right-actions="navRightActions"
    />

    <!-- Step 0: File Selection -->
    <div v-if="step === 0" class="step-file">
      <div class="file-picker-card">
        <van-icon name="plus" size="48" color="#1989fa" />
        <p>点击选择文件（.xlsx 或 .csv）</p>
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.csv"
          style="display:none"
          @change="onFileSelected"
        />
        <van-button type="primary" @click="openFilePicker">选择文件</van-button>
      </div>
    </div>

    <!-- Step 0a: Sheet Selection (xlsx with multiple sheets) -->
    <van-action-sheet
      v-if="showSheetPicker"
      v-model:show="showSheetPicker"
      :actions="sheetActions"
      cancel-text="取消"
      close-on-click-action
      @select="onSheetSelected"
    />

    <!-- Step 1: AG-Grid Preview + Mapping Form -->
    <div v-else-if="step === 1" class="import-content">
      <div class="ag-grid-wrapper ag-theme-alpine">
        <AgGridVue
          v-if="parsedData.length > 0"
          :row-data="rowData"
          :column-defs="columnDefs"
          :default-col-def="defaultColDef"
          :grid-options="gridOptions"
          :get-row-id="getRowId"
          :row-height="28"
          :header-height="32"
          style="width:100%;height:100%"
          @grid-ready="onGridReady"
        />
        <div v-else class="grid-empty">没有数据</div>
      </div>

      <div class="import-form-area">
        <div class="form-section-inner">
          <div class="form-section-title">列映射</div>
          <p class="filter-hint">输入第一行数据所在的单元格</p>

          <van-field
            v-model="mapping.timePos"
            label="付款时间位置"
            placeholder="如 A26"
            clearable
            :error="mappingErrors.timePos !== ''"
            :error-message="mappingErrors.timePos"
            @input="onMappingInput('timePos')"
            @change="onMappingChange"
            @blur="onMappingBlur('timePos')"
          />
          <van-field
            v-model="mapping.contentPos"
            label="付款内容位置"
            placeholder="如 E26 或 E26+F26"
            clearable
            :error="mappingErrors.contentPos !== ''"
            :error-message="mappingErrors.contentPos"
            @input="onMappingInput('contentPos')"
            @change="onMappingChange"
            @blur="onMappingBlur('contentPos')"
          />
          <van-field
            v-model="mapping.amountPos"
            label="付款金额位置"
            placeholder="如 G26"
            clearable
            :error="mappingErrors.amountPos !== ''"
            :error-message="mappingErrors.amountPos"
            @input="onMappingInput('amountPos')"
            @change="onMappingChange"
            @blur="onMappingBlur('amountPos')"
          />

          <div class="filter-section">
            <div class="form-section-title">
              筛选条件
              <span class="optional-tag">可选</span>
            </div>
            <p class="filter-hint">
              语法：使用英文分号 <code>;</code> 分隔多个条件，<code>!=</code> 表示不等于，<code>==</code> 表示等于。<br />
              示例：<code>E26!=支出;E26!=转账;H26==支付成功</code><br />
              说明：条件逐行判断，仅保留全部条件满足的数据行。
            </p>
            <van-field
              v-model="mapping.filter"
              placeholder="不填则使用全部数据"
              clearable
              :error="filterError !== ''"
              :error-message="filterError"
              @change="validateFilter"
            />
          </div>
        </div>

        <div class="form-actions">
          <van-button
            type="primary"
            block
            :disabled="!canProceedToStep2"
            @click="goToStep2"
          >
            下一步（共 {{ currentDataCount }} 行数据）
          </van-button>
        </div>
      </div>
    </div>

    <!-- Step 2: Pre-import Card List -->
    <div v-else-if="step === 2" class="step-preview" ref="previewRef">
      <div v-if="importBills.length === 0" class="empty-state">
        <van-icon name="info-o" size="48" color="#c8c9cc" />
        <p>没有可导入的数据</p>
      </div>
      <ImportBillCard
        v-for="(bill, idx) in importBills"
        :key="bill.localId"
        :bill-data="bill"
        :members="members"
        :index="idx"
        @update="onBillUpdate(idx, $event)"
        @delete="onBillDelete(idx)"
      />
    </div>
    <transition name="van-fade">
      <van-button
        v-if="step === 2 && showBackToTop"
        class="back-to-top-btn"
        round
        size="small"
        @click="scrollToTop"
      >
        <van-icon name="back-top" /> 顶部
      </van-button>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { AgGridVue } from 'ag-grid-vue3'
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import AppNavBar from '@/components/AppNavBar.vue'
import ImportBillCard from '@/components/ImportBillCard.vue'
import { parseXlsx, parseCsv, type ParsedSheet } from '@/utils/importParser'
import { useRooms } from '@/composables/useRooms'
import { useLocalBills } from '@/composables/useLocalBills'
import { useRemoteBills } from '@/composables/useRemoteBills'
import { useAuth } from '@/composables/useAuth'
import type { ImportBillData, ColumnMapping, RoomMember } from '@/lib/types'

dayjs.extend(customParseFormat)
ModuleRegistry.registerModules([AllCommunityModule])

const route = useRoute()
const router = useRouter()
const roomId = computed(() => route.params.id as string)
const { getRoomById } = useRooms()
const { addBills } = useLocalBills()
const { submitBills } = useRemoteBills()
const { userId } = useAuth()

const members = ref<Pick<RoomMember, 'id' | 'name'>[]>([])
const myMemberId = ref('')

// --- File selection state ---
const step = ref(0) // 0=file pick, 1=grid+mapping, 2=card preview
const fileInput = ref<HTMLInputElement | null>(null)
const parsedData = ref<(string | null)[][]>([])
const parsedColWidths = ref<number[] | null>(null) // from XLSX !cols
const allParsedSheets = ref<ParsedSheet[]>([])
const showSheetPicker = ref(false)
const sheetActions = ref<{ name: string; key: string }[]>([])

// --- AG-Grid state ---
const gridApi = ref<any>(null)
const highlightedCells = ref<string[]>([]) // "colIdx_rowIdx"

// --- Mapping state ---
const mapping = reactive<ColumnMapping>({
  timePos: '',
  contentPos: '',
  amountPos: '',
  filter: '',
})
const filterError = ref('')
const activeFilter = ref('') // validated filter string
const mappingErrors = reactive<Record<string, string>>({
  timePos: '',
  contentPos: '',
  amountPos: '',
})

// --- Preview state ---
const importBills = ref<ImportBillData[]>([])
const previewRef = ref<HTMLElement | null>(null)
const showBackToTop = ref(false)
let previewScrollHandler: (() => void) | null = null

function onBack() {
  if (step.value === 2) {
    step.value = 1
  } else if (step.value === 1) {
    step.value = 0
  } else {
    router.replace(`/room/${roomId.value}`)
  }
}

function scrollToTop() {
  previewRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

// --- Computed ---

const defaultColDef = {
  sortable: false,
  filter: false,
  resizable: true,
  width: 100,
}

const gridOptions = {
  suppressExcelExport: true,
  enableCellTextSelection: true,
  ensureDomOrder: true,
  rowSelection: undefined,
  animateRows: false,
  theme: 'legacy' as const,
}

function getRowId(params: any) {
  return String(params.data.__rowIndex)
}

function toAlphaCol(index: number): string {
  let col = ''
  let n = index + 1
  while (n > 0) {
    n--
    col = String.fromCharCode(65 + (n % 26)) + col
    n = Math.floor(n / 26)
  }
  return col
}

const columnDefs = computed(() => {
  if (parsedData.value.length === 0) return []
  const maxCols = Math.max(...parsedData.value.map(r => r.length), 0)
  const cols: any[] = []
  // Row number column
  cols.push({
    headerName: '#',
    width: 50,
    pinned: 'left',
    sortable: false,
    filter: false,
    valueGetter: (params: any) => params.node.rowIndex + 1,
    cellClass: 'row-number-cell',
  })
  for (let i = 0; i < maxCols; i++) {
    const colIdx = i
    let width: number | undefined
    if (parsedColWidths.value) {
      width = parsedColWidths.value[i]
      if (width === 0 || width === undefined) width = undefined
    } else {
      width = i === 0 ? 150 : 100
    }
    cols.push({
      headerName: toAlphaCol(i),
      field: `col_${i}`,
      colId: `col_${i}`,
      width,
      cellClassRules: {
        'cell-highlighted': (params: any) => {
          const key = `${colIdx}_${params.rowIndex}`
          return highlightedCells.value.includes(key)
        },
      },
    })
  }
  return cols
})

const rowData = computed(() => {
  return parsedData.value.map((row, ri) => {
    const obj: Record<string, any> = { __rowIndex: ri }
    row.forEach((cell, ci) => {
      obj[`col_${ci}`] = cell
    })
    return obj
  })
})

const canProceedToStep2 = computed(() => {
  if (!mapping.timePos || !mapping.contentPos || !mapping.amountPos) return false
  if (mapping.filter && filterError.value) return false
  if (mappingErrors.timePos || mappingErrors.contentPos || mappingErrors.amountPos) return false
  return true
})

const currentDataCount = computed(() => {
  if (parsedData.value.length === 0) return 0
  const startRow = getDataStartRow()
  const data = startRow > 0 ? parsedData.value.slice(startRow) : parsedData.value
  if (!activeFilter.value) return data.length

  const conditions = parseFilterConditions(activeFilter.value)
  if (conditions.length === 0) return data.length
  return data.filter(row => {
    for (const c of conditions) {
      const cellVal = (row[c.colIndex] ?? '').trim()
      if (c.operator === '==' && cellVal !== c.value) return false
      if (c.operator === '!=' && cellVal === c.value) return false
    }
    return true
  }).length
})

const navRightActions = computed(() => {
  if (step.value === 2) {
    return [
      { text: '全选分摊', onClick: onSelectAllSharers },
      { text: '保存', onClick: onSave },
    ]
  }
  return []
})

// --- File handling ---

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
  const isCsv = file.name.endsWith('.csv')

  if (!isXlsx && !isCsv) {
    showToast('请选择 .xlsx 或 .csv 文件')
    return
  }

  try {
    if (isXlsx) {
      const buf = await file.arrayBuffer()
      const sheets = parseXlsx(buf)
      if (sheets.length === 0) {
        showToast('文件内容为空')
        return
      }
      allParsedSheets.value = sheets
      if (sheets.length === 1) {
        parsedData.value = sheets[0]!.data
        parsedColWidths.value = sheets[0]!.colWidths ?? null
        step.value = 1
      } else {
        sheetActions.value = sheets.map(s => ({ name: s.name, key: s.name }))
        showSheetPicker.value = true
      }
    } else {
      const text = await file.text()
      parsedData.value = parseCsv(text)
      parsedColWidths.value = null // CSV uses fixed widths
      if (parsedData.value.length === 0) {
        showToast('文件内容为空')
        return
      }
      step.value = 1
    }
  } catch (err) {
    showToast('解析失败：' + (err instanceof Error ? err.message : '未知错误'))
  }

  // Reset so re-selecting same file triggers change
  input.value = ''
}

function onSheetSelected(action: { key: string }) {
  const sheet = allParsedSheets.value.find(s => s.name === action.key)
  if (sheet) {
    parsedData.value = sheet.data
    parsedColWidths.value = sheet.colWidths ?? null
    step.value = 1
  }
  showSheetPicker.value = false
}

// --- Column position parsing ---

function parsePositions(pos: string): { colIndex: number; rowIndex: number }[] {
  if (!pos.trim()) return []
  return pos.split('+').map(part => {
    const m = part.trim().match(/^([A-Z]+)(\d+)$/)
    if (!m) return null
    let col = 0
    for (const ch of m[1]!) {
      col = col * 26 + (ch.charCodeAt(0) - 64)
    }
    return { colIndex: col - 1, rowIndex: parseInt(m[2]!, 10) - 1 }
  }).filter((x): x is { colIndex: number; rowIndex: number } => x !== null)
}

function getHighlightedCells(pos: string): string[] {
  const cells = parsePositions(pos)
  return cells.map(c => `${c.colIndex}_${c.rowIndex}`)
}

function getCellValues(pos: string): (string | number | null)[] {
  const cells = parsePositions(pos)
  return cells.map(c => {
    const row = parsedData.value[c.rowIndex]
    return row ? (row[c.colIndex] ?? null) : null
  })
}

// --- Mapping handlers ---

function onMappingInput(field: keyof ColumnMapping) {
  const raw = mapping[field] as string
  const cleaned = raw.replace(field === 'contentPos' ? /[^a-zA-Z0-9+]/g : /[^a-zA-Z0-9]/g, '').toUpperCase()
  ;(mapping as any)[field] = cleaned
  mappingErrors[field] = ''
}

function onMappingChange() {
  const allPos = [mapping.timePos, mapping.contentPos, mapping.amountPos]
  const cells = allPos.flatMap(p => getHighlightedCells(p))
  highlightedCells.value = cells
  if (gridApi.value) {
    gridApi.value.refreshCells()
  }
}

function onMappingBlur(field: keyof ColumnMapping) {
  const pos = mapping[field] as string
  if (!pos.trim()) return

  const parts = pos.split('+')
  for (const part of parts) {
    if (!/^[A-Z]+\d+$/.test(part.trim())) {
      mappingErrors[field] = `"${part}" 格式无效，应为 列号+行号 如 A26`
      return
    }
  }

  const values = getCellValues(pos)
  const hasEmpty = values.some(v => v === null || v === undefined || String(v).trim() === '')
  if (hasEmpty) {
    mappingErrors[field] = '对应单元格内容为空'
  } else {
    mappingErrors[field] = ''
  }
}

// --- Filter validation ---

function validateFilter() {
  const val = mapping.filter.trim()
  if (!val) {
    filterError.value = ''
    activeFilter.value = ''
    return
  }

  const segments = val.split(';')
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!.trim()
    if (!seg) {
      filterError.value = `第 ${i + 1} 个条件为空`
      return
    }
    if (!/^[A-Z]+\d+(==|!=).+$/.test(seg)) {
      filterError.value = `第 ${i + 1} 个条件格式错误："${seg}"`
      return
    }
  }
  filterError.value = ''
  activeFilter.value = val
}

// --- Filter conditions parsing ---

function parseFilterConditions(filterStr: string): { colIndex: number; operator: '==' | '!='; value: string }[] {
  return filterStr.split(';').map(s => {
    const m = s.trim().match(/^([A-Z]+)(\d+)(==|!=)(.+)$/)
    if (!m) return null
    let col = 0
    for (const ch of m[1]!) {
      col = col * 26 + (ch.charCodeAt(0) - 64)
    }
    return { colIndex: col - 1, operator: m[3]! as '==' | '!=', value: m[4]! }
  }).filter((x): x is { colIndex: number; operator: '==' | '!='; value: string } => x !== null)
}

function getFilteredData(): (string | null)[][] {
  const startRow = getDataStartRow()
  const data = startRow > 0 ? parsedData.value.slice(startRow) : parsedData.value
  if (!activeFilter.value) return data
  const conditions = parseFilterConditions(activeFilter.value)
  if (conditions.length === 0) return data
  return data.filter(row => {
    for (const c of conditions) {
      const cellVal = (row[c.colIndex] ?? '').trim()
      if (c.operator === '==' && cellVal !== c.value) return false
      if (c.operator === '!=' && cellVal === c.value) return false
    }
    return true
  })
}

function extractColumnIndexes(pos: string): number[] {
  if (!pos.trim()) return []
  return pos.split('+').map(part => {
    const m = part.trim().match(/^([A-Z]+)\d+$/)
    if (!m) return -1
    let col = 0
    for (const ch of m[1]!) {
      col = col * 26 + (ch.charCodeAt(0) - 64)
    }
    return col - 1
  }).filter((x): x is number => x >= 0)
}

function getDataStartRow(): number {
  const positions = [mapping.timePos, mapping.contentPos, mapping.amountPos]
    .filter(p => p.trim())
    .flatMap(p => parsePositions(p))
  if (positions.length === 0) return 0
  return Math.min(...positions.map(p => p.rowIndex))
}

// --- Step navigation ---

function goToStep2() {
  validateFilter()
  if (!canProceedToStep2.value) return

  const data = getFilteredData()
  if (data.length === 0) {
    showToast('没有可导入的数据')
    return
  }

  const contentCols = extractColumnIndexes(mapping.contentPos)
  const amountCols = extractColumnIndexes(mapping.amountPos)
  const timeCols = extractColumnIndexes(mapping.timePos)

  const bills: ImportBillData[] = data.map(row => {
    const content = contentCols.map(ci => row[ci] ?? '').join(' ')
    const amountRaw = amountCols.map(ci => row[ci] ?? '').join('')
    const amount = parseAmount(amountRaw)
    const paidAt = parseDate(timeCols.map(ci => row[ci] ?? '').join(''))
    const rawRow = row.filter(c => c !== null).join(' ')

    return {
      localId: crypto.randomUUID(),
      content,
      amount,
      paidAt,
      sharedBy: [],
      createdBy: myMemberId.value,
      rawRow,
    }
  })

  importBills.value = bills
  step.value = 2
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function parseDate(raw: string): string {
  const trimmed = raw.trim().replace(/[年月]/g, '-').replace(/[日号]/g, '')

  // Excel serial date number (e.g. "46148.6501851852")
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const serial = parseFloat(trimmed)
    if (serial > 60) {
      // Excel serial 25569 = Jan 1, 1970 (Unix epoch)
      const jsDate = new Date((serial - 25569) * 86400000)
      if (!isNaN(jsDate.getTime())) {
        return dayjs(jsDate).format('YYYY-MM-DDTHH:mm:ssZZ')
      }
    }
  }

  const d = dayjs(trimmed, [
    'YYYY-M-D HH:mm',
    'YYYY-M-D HH:mm:ss',
    'YYYY/MM/DD HH:mm',
    'YYYY-MM-DDTHH:mm:ss',
    'YYYY-MM-DD',
  ])
  if (d.isValid()) return d.format('YYYY-MM-DDTHH:mm:ssZZ')
  return trimmed
}

// --- Card list handlers ---

function onBillUpdate(idx: number, data: ImportBillData) {
  if (idx >= 0 && idx < importBills.value.length) {
    importBills.value[idx] = data
  }
}

function onBillDelete(idx: number) {
  importBills.value.splice(idx, 1)
}

async function onSelectAllSharers() {
  try {
    await showConfirmDialog({
      title: '全选分摊',
      message: '将为所有账单选择全部成员作为分摊人员，确定吗？',
      confirmButtonColor: '#1989fa',
    })
  } catch {
    return
  }
  const allMemberIds = members.value.map(m => m.id)
  for (const bill of importBills.value) {
    bill.sharedBy = [...allMemberIds]
  }
  importBills.value = [...importBills.value]
  showToast('已全选')
}

async function onSave() {
  for (let i = 0; i < importBills.value.length; i++) {
    const bill = importBills.value[i]!
    if (!bill.content.trim()) {
      showToast(`第 ${i + 1} 条账单缺少付款内容`)
      return
    }
    if (bill.amount <= 0) {
      showToast(`第 ${i + 1} 条账单金额无效`)
      return
    }
    if (!bill.paidAt.trim()) {
      showToast(`第 ${i + 1} 条账单缺少付款时间`)
      return
    }
    if (bill.sharedBy.length === 0) {
      showToast(`第 ${i + 1} 条账单未选择分摊人员`)
      return
    }
  }

  try {
    const billsToCreate = importBills.value.map(b => ({
      room_id: roomId.value,
      content: b.content,
      amount: b.amount,
      paid_at: b.paidAt,
      shared_by: b.sharedBy,
      created_by: b.createdBy,
      creator_name: members.value.find(m => m.id === b.createdBy)?.name ?? '',
    }))

    addBills(roomId.value, billsToCreate)

    try {
      await submitBills(roomId.value)
      showToast('导入成功')
    } catch {
      showToast('已保存到本地，同步失败')
    }

    router.push(`/room/${roomId.value}`)
  } catch (err) {
    showToast('保存失败：' + (err instanceof Error ? err.message : '未知错误'))
  }
}

// --- Scroll to top management ---

watch(step, (newStep, oldStep) => {
  if (oldStep === 2 && previewScrollHandler) {
    const el = previewRef.value
    if (el) {
      el.removeEventListener('scroll', previewScrollHandler)
    }
    previewScrollHandler = null
    showBackToTop.value = false
  }
  if (newStep === 2) {
    nextTick(() => {
      const el = previewRef.value
      if (!el) return
      const handler = () => {
        showBackToTop.value = el.scrollTop > 300
      }
      el.addEventListener('scroll', handler, { passive: true })
      previewScrollHandler = handler
    })
  }
})

onUnmounted(() => {
  if (previewScrollHandler && previewRef.value) {
    previewRef.value.removeEventListener('scroll', previewScrollHandler)
  }
})

function onGridReady(params: any) {
  gridApi.value = params.api
}

// --- Init ---

async function initPage() {
  if (!userId.value) {
    showToast('无权限访问')
    router.replace('/')
    return
  }

  try {
    const room = await getRoomById(roomId.value)
    members.value = room.members.map(m => ({ id: m.id, name: m.name }))
    const myMember = room.members.find(m => m.user_id === userId.value)
    if (myMember) {
      myMemberId.value = myMember.id
    }
  } catch {
    showToast('加载房间信息失败')
    router.replace('/')
  }
}

initPage()
</script>

<style scoped>
.import-page {
  height: 100vh;
  background: var(--color-bg);
  display: flex;
  flex-direction: column;
}

/* Step 0: File picker */
.step-file {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}
.file-picker-card {
  text-align: center;
  padding: 48px 32px;
  border: 2px dashed var(--color-border);
  border-radius: 12px;
  background: #fff;
}
.file-picker-card p {
  margin: 16px 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

/* Step 1: Grid + Form */
.import-content {
  height: calc(100vh - 46px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ag-grid-wrapper {
  flex: 1;
  min-height: 200px;
  overflow: hidden;
}
.grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-secondary);
  font-size: 14px;
}
.import-form-area {
  max-height: 50%;
  overflow-y: auto;
  background: #fff;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}
.form-section-inner {
  padding: 12px 16px 0;
}
.form-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 8px;
}
.optional-tag {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 6px;
}
.filter-section {
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
}
.filter-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 8px;
}
.filter-hint code {
  background: var(--color-bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}
.form-actions {
  padding: 16px;
}

/* Step 2: Card preview */
.step-preview {
  flex: 1;
  overflow-y: auto;
  padding-top: 12px;
  padding-bottom: 24px;
}
.empty-state {
  text-align: center;
  padding: 60px 16px;
  color: var(--color-text-secondary);
}
.empty-state p {
  margin-top: 16px;
  font-size: 14px;
}
.back-to-top-btn {
  position: fixed;
  right: 16px;
  bottom: 24px;
  z-index: 100;
  background: var(--color-primary, #1989fa);
  color: #fff;
  border: none;
  padding: 0 14px;
  line-height: 36px;
  font-size: 13px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
</style>

<style>
/* AG-Grid overrides - global to avoid scoping issues */
.ag-theme-alpine .ag-cell {
  line-height: 28px !important;
  padding: 0 6px !important;
  font-size: 12px !important;
  border-right: 1px solid var(--ag-border-color, #ddd) !important;
  border-bottom: 1px solid var(--ag-border-color, #ddd) !important;
}
.ag-theme-alpine .ag-row {
  border: none !important;
}
.ag-theme-alpine .ag-header-cell {
  font-size: 12px !important;
  font-weight: 600 !important;
  padding: 0 6px !important;
  border-right: 1px solid var(--ag-border-color, #ddd) !important;
}
.ag-theme-alpine .ag-header {
  border-bottom: 2px solid var(--ag-border-color, #333) !important;
}
.ag-theme-alpine .ag-root-wrapper {
  border: 1px solid var(--ag-border-color, #ddd) !important;
}
.cell-highlighted {
  background-color: #fff3cd !important;
  font-weight: 600 !important;
}
.row-number-cell {
  color: var(--color-text-secondary) !important;
  font-size: 11px !important;
  text-align: center !important;
}
</style>
