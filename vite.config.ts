import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

// 单一版本数据源：package.json（commit-and-tag-version 负责维护）
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
) as { version: string }

// 虚拟模块注入版本号：dev 与 build 均生效（Vite define 在 dev 客户端不生效）
const versionPlugin = (version: string): Plugin => ({
  name: 'app-version',
  resolveId(id) {
    if (id === 'virtual:app-version') return '\0virtual:app-version'
    return undefined
  },
  load(id) {
    if (id === '\0virtual:app-version') {
      return `export const APP_VERSION = ${JSON.stringify(version)}\n`
    }
    return undefined
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    versionPlugin(pkg.version),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.png', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'AA计算器',
        short_name: 'AA计算器',
        description: '朋友聚会 AA 记账与结算',
        lang: 'zh-CN',
        theme_color: '#1989fa',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,ico,svg,woff2,woff,ttf}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true
  }
})
