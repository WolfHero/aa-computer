import { showToast as vantShowToast, type ToastOptions } from 'vant'

type ToastWrapper = ReturnType<typeof vantShowToast>

export function showToast(message: string): ToastWrapper
export function showToast(options: ToastOptions): ToastWrapper
export function showToast(message?: string | ToastOptions): ToastWrapper {
  const text = typeof message === 'string' ? message : (message?.message || '')
  if (text) {
    console.log(`[Toast] ${text}`)
  }
  return vantShowToast(message as any)
}
