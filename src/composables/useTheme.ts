import { ref, computed } from 'vue'
import { STORAGE_KEYS } from '@/utils/constants'

export type Theme = 'light' | 'dark'

const THEME_META_COLORS: Record<Theme, string> = {
  light: '#1989fa',
  dark: '#282c34',
}

function resolveInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.THEME)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage 不可用时回退到系统偏好
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<Theme>(resolveInitialTheme())

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

  function setTheme(next: Theme) {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, next)
    } catch {
      // 无法持久化时仅本次会话生效
    }
    applyTheme(next)
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { theme, isDark, setTheme, toggleTheme }
}

// 模块加载时立即应用，避免首帧闪烁；后续由 App.vue 的 ConfigProvider 驱动 Vant 深色类
applyTheme(theme.value)

// 用户未显式选择时跟随系统深色模式变化
const darkMedia = window.matchMedia?.('(prefers-color-scheme: dark)')
darkMedia?.addEventListener('change', (e) => {
  let hasExplicitChoice = false
  try {
    hasExplicitChoice = !!localStorage.getItem(STORAGE_KEYS.THEME)
  } catch {
    // ignore
  }
  if (!hasExplicitChoice) {
    applyTheme(e.matches ? 'dark' : 'light')
  }
})
