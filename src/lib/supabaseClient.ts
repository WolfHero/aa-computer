import { createClient } from '@supabase/supabase-js'

let offline = false

/** 进入离线模式后，所有请求直接以 AbortError 快速失败（postgrest 不会对 AbortError 重试） */
export function setNetworkOffline(value: boolean) {
  offline = value
}

const guardedFetch: typeof fetch = (input, init) => {
  if (offline) {
    return Promise.reject(new DOMException('network offline', 'AbortError'))
  }
  return fetch(input, init)
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY,
  { global: { fetch: guardedFetch } }
)
