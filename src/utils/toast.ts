import { showToast as vantShowToast, type ToastOptions, type ToastWrapper } from 'vant'

export function showToast(message: string): ToastWrapper
export function showToast(options: ToastOptions): ToastWrapper
export function showToast(message?: string | ToastOptions): ToastWrapper {
  const text = typeof message === 'string' ? message : (message?.message || '')
  if (text) {
    console.log(`[Toast] ${text}`)
  }
  return vantShowToast(message as any)
}
