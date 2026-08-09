import { ref, computed } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'

export type ThemeMode = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

const THEME_META_COLORS: Record<Theme, string> = {
  light: '#1989fa',
  dark: '#282c34',
}

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveInitialMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage 不可用时回退到跟随系统
  }
  return 'system'
}

const mode = ref<ThemeMode>(resolveInitialMode())
const theme = ref<Theme>(mode.value === 'system' ? systemTheme() : mode.value)

function applyTheme(next: Theme) {
  theme.value = next
  document.documentElement.dataset.theme = next
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    meta.content = THEME_META_COLORS[next]
  }
}

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark')

  function setMode(next: ThemeMode) {
    mode.value = next
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, next)
    } catch {
      // 无法持久化时仅本次会话生效
    }
    applyTheme(next === 'system' ? systemTheme() : next)
  }

  /** 点击深色模式按钮轮换：跟随系统 → 开启 → 关闭 → 跟随系统 */
  function cycleThemeMode() {
    setMode(mode.value === 'system' ? 'dark' : mode.value === 'dark' ? 'light' : 'system')
  }

  return { mode, theme, isDark, setMode, cycleThemeMode }
}

// 模块加载时立即应用，避免首帧闪烁；后续由 App.vue 的 ConfigProvider 驱动 Vant 深色类
applyTheme(theme.value)

// 跟随系统模式下响应系统深色变化
const darkMedia = window.matchMedia?.('(prefers-color-scheme: dark)')
darkMedia?.addEventListener('change', (e) => {
  if (mode.value === 'system') {
    applyTheme(e.matches ? 'dark' : 'light')
  }
})
