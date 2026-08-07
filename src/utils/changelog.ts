export type UpdateType = 'feature' | 'perf' | 'fix' | 'dev'

export interface ReleaseLogEntry {
  id: string
  type: UpdateType
  title: string
  developer: string
  date: string
  body: string
  remark: string
}

export interface ReleaseLogData {
  mainBranch: string
  generatedAt: string
  entries: ReleaseLogEntry[]
}

export const UPDATE_TYPE_META: Record<UpdateType, { label: string; badgeClass: string }> = {
  feature: { label: '新功能', badgeClass: 'type-badge--feature' },
  perf: { label: '性能优化', badgeClass: 'type-badge--perf' },
  fix: { label: '缺陷修复', badgeClass: 'type-badge--fix' },
  dev: { label: '开发侧调整', badgeClass: 'type-badge--dev' },
}
