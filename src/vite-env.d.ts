/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 由 vite.config.ts 的 define 注入（来源：package.json version）
declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'echarts/theme/dark' {
  // 该主题文件通过副作用注册 'dark' 主题，无类型导出
  const theme: unknown
  export default theme
}
