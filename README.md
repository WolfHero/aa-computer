# AA Computer

[English](README_en.md) | **中文**

AA Computer 是一个移动端优先的群组 AA 记账与结算 Web 应用。支持创建房间、邀请成员、记录账单，并自动计算成员间的最优转账方案，帮你轻松解决聚餐、旅行、合租等场景下的费用分摊问题。

## 功能

- **房间管理** — 创建 AA 房间，通过链接邀请成员加入
- **账单管理** — 添加/编辑账单，支持按成员分摊、按日期/创建者筛选
- **离线优先** — 账单先保存在本地，确认后一键同步到云端
- **AA 结算** — 自动计算成员间净收支，生成最优转账方案（贪心配对算法）
- **结果图表** — 基于 ECharts 的嵌套饼图可视化展示个人收支与转账关系

## 技术栈

| 层 | 技术 |
| --- | --- |
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 路由 | Vue Router 4（history 模式） |
| UI | Vant 4（移动端组件库） |
| 图表 | ECharts 6 |
| 后端 | Supabase（PostgreSQL + 匿名认证 + RLS） |
| 构建 | Vite + TypeScript + vue-tsc |

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 生产构建
pnpm build

# 预览构建结果
pnpm preview
```

### 环境变量

在项目根目录创建 `.env` 文件，填入你的 Supabase 项目信息：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

## 项目结构

```
src/
├── components/        # 可复用组件（NavBar, BillCard, BillForm 等）
├── composables/       # 组合式函数（useAuth, useRooms, useLocalBills 等）
├── lib/               # 工具库（Supabase 客户端）
├── router/            # 路由配置
├── views/             # 页面视图
│   ├── HomePage.vue           # 首页：房间列表与创建
│   ├── InvitePage.vue         # 邀请加入房间
│   ├── RoomDetailPage.vue     # 房间详情：账单列表与提交
│   ├── AACalculationPage.vue  # AA 计算结果
│   └── RoomSettingsPage.vue   # 房间设置
├── App.vue
├── main.ts
└── style.css           # 全局样式
```

## 数据流

1. **创建账单** → 保存到 localStorage → 点击"提交付账记录"推送到 Supabase → 标记已同步 → 递增房间版本号
2. **AA 计算** → 检查 `aa_results` 表缓存（版本匹配）→ 过期则调用 `calculate_aa` 数据库函数 → 返回成员净收支 + 转账方案
3. **版本缓存** → 房间版本号持久化到 localStorage → 再次访问时版本未变则直接使用本地缓存

## 数据库

使用 Supabase PostgreSQL，包含 4 张核心表：`rooms`、`room_members`、`bills`、`aa_results`。通过 RLS（行级安全）和 `is_member_of_room()` 函数控制数据访问权限。AA 计算逻辑由 PL/pgSQL 函数 `calculate_aa(p_room_id)` 实现。

## 许可

MIT
