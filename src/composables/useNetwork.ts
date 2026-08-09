import { ref } from 'vue'
import { setNetworkOffline } from '@/lib/supabaseClient'

const offline = ref(false)
let initialCheck: Promise<boolean> | null = null

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

/** 探测 Supabase 是否可达：任意 HTTP 响应都算网络正常，只有请求失败才算断网 */
async function probe(): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function useNetwork() {
  /**
   * 打开页面时的网络检测：快速重试，最多 3 次全部失败才进入离线模式。
   * 成功后自动退出离线模式（供下拉刷新/恢复网络时重新探测）。
   */
  async function checkNetworkFast(): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await probe()) {
        offline.value = false
        setNetworkOffline(false)
        return true
      }
      if (attempt < 2) await sleep(600)
    }
    offline.value = true
    setNetworkOffline(true)
    return false
  }

  /** 首次数据请求前等待初始探测完成（已开始则复用同一探测，避免重复请求） */
  function ensureNetworkChecked(): Promise<boolean> {
    if (!initialCheck) initialCheck = checkNetworkFast()
    return initialCheck
  }

  return { isOffline: offline, checkNetworkFast, ensureNetworkChecked }
}
