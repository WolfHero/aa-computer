export type AppHintType = 'safari' | 'inapp' | 'none'

/**
 * 判断首次打开时适合弹出哪种使用提示：
 * - safari：iPhone 上的 Safari（含主屏幕 PWA 入口，UA 与 Safari 相同）
 * - inapp：iPhone 上的微信 / QQ 内置浏览器
 * - none：其他情况（非 iPhone，或 iPhone 上的其他浏览器）
 */
export function detectAppHintType(): AppHintType {
  const ua = navigator.userAgent
  if (!ua.includes('iPhone')) return 'none'
  if (/MicroMessenger|MQQBrowser|QQ\//i.test(ua)) return 'inapp'
  if (/Version\/[\d.]+.*Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DdgIos/i.test(ua)) {
    return 'safari'
  }
  return 'none'
}
