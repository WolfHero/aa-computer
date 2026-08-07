# 深色模式可行性评估

> 状态：**已实施**。本文档记录对本项目引入深色模式的可行性评估、改造方案与风险点；实现已按本方案落地（2026-08）。

## 结论

**可行，且属于低成本改造**。技术栈中三块最"难搞"的 UI 库（Vant、AG-Grid、ECharts）均自带官方深色主题支持，项目本身已有 CSS 变量基础。预计 1~2 个工作日、200~300 行改动即可完成，无需引入新依赖。

## 现状盘点

### 已有基础

- `src/style.css` 已定义 5 个核心语义变量：`--color-primary`、`--color-bg`、`--color-text`、`--color-text-secondary`、`--color-border`；所有页面背景均使用 `var(--color-bg)`，是深色模式的天然切入点。
- localStorage 持久化模式成熟（`STORAGE_KEYS` 常量 + 多个 composable），新增一个主题偏好存储零成本。
- e2e 测试无视觉断言（无 `toHaveCSS`/截图对比），配色变化不会导致测试失败。

### 需要处理的问题

- 全仓库 16 个文件共 138 处硬编码颜色。其中大部分为**语义色**（`#1989fa` 主色、`#ee0a24` 红、`#07c160` 绿、`#ff976a` 橙等），深色背景下本就应保留，无需改动。
- 真正需要改动的是约 30 处**中性色/浅色面**：`#fff` 卡片背景、`#ddd` 边框、`#f0f0f0`/`#f7f8fa` 灰底、`#333`/`#999` 文字，以及少量模板 `color` 属性。
- 隐蔽问题：房间状态徽章的浅色 tint 背景（`#fff7e6`/`#e6f7ff`/`#fde8e8`/`#e8f0fe`/`#fff3cd`）在深色模式下会显得刺眼，需为每个状态单独定义深色变体，是视觉上最花心思的部分。

## 三块依赖的官方方案

| 模块 | 现状 | 深色方案 |
|------|------|----------|
| Vant 4（占比最大） | 全局注册、`--van-*` 变量覆盖 | 官方 `<van-config-provider theme="dark">` 包一层，覆盖 NavBar/Cell/Dialog/Popup 等所有组件 |
| AG-Grid（导入页） | `ag-theme-alpine` + 全局 CSS 覆盖 | 换官方内置 `ag-theme-quartz-dark`；现有覆盖已用 `var(--ag-border-color)`，适配成本低 |
| ECharts（AA 图表） | `echarts.init(el)` 默认主题 | 官方内置 `dark` 主题；图表红绿蓝语义色不用改，只改背景/文字/坐标轴色 |

### 两个细节

1. **Vant 函数式弹窗**：项目大量使用 `Dialog.confirm({ confirmButtonColor: ... })`，此类弹窗挂载在 `body`，不继承 ConfigProvider 的 theme。Vant 的 Dialog 自带 `theme` 选项（源码 `function-call.mjs` 默认值 `theme: null`），可通过 `Dialog.setDefaultOptions({ theme: 'dark' })` 一次性解决，无需逐个修改。
2. **ECharts 重渲染**：主题切换时需 `dispose` 后按新主题重新 `init`；`AACalculationChart.vue` 现有 `renderChart()` 结构已支持重渲染，改动不大。

## 入口与配套

- `index.html` 的 `<meta name="theme-color">` 与 PWA manifest 的 `theme_color`（`vite.config.ts`）需随主题动态切换，否则手机浏览器状态栏/安装后启动页颜色不匹配。
- 开关位置建议放 Home 页设置区（与跨设备登录、隐私声明同级）；首次访问用 `prefers-color-scheme` 跟随系统，之后以用户显式选择为准。

## 工作量估计

按熟悉该仓库的开发者估算，约 **1~2 个工作日、200~300 行改动**：

1. 扩展现有 CSS 变量体系（新增 `--color-surface`、`--color-surface-raised` 等）并编写 `[data-theme='dark']` 覆盖：半天
2. Vant ConfigProvider 包裹 + Dialog/Toast 默认主题 + 主题开关与持久化：半天
3. AG-Grid 换主题、ECharts 深色重渲染、徽章深色变体、`theme-color` 动态化：半天到一天

## 主要风险点

- 状态徽章浅色 tint 的深色视觉设计需要取舍（可临时保留浅色，但深色模式下观感不佳）。
- ImportPage 中 AG-Grid 的全局覆盖样式在换主题后需人工回归验证。

以上均不构成技术阻碍，属于视觉走查范畴。
