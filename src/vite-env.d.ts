/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// 虚拟模块：由 vite.config.ts 的 app-version 插件注入 package.json version
declare module 'virtual:app-version' {
  export const APP_VERSION: string
}

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
