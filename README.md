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

## 路线图

查看 [ROADMAP.md](ROADMAP.md) 了解项目的开发计划和未来方向，包括正在实现、计划内和有初步想法的功能。

## 自部署

### 前提条件

- **Node.js** >= 18，**pnpm**（`npm i -g pnpm`）
- **Supabase** 账号（免费套餐即可）或本地 Docker 环境（用于 Supabase CLI）

---

### 方案一：使用 Supabase 云服务（国内不推荐）

#### 1. 创建 Supabase 项目

在 [Supabase Dashboard](https://supabase.com/dashboard/projects) 创建一个新项目，记下**项目密码**（后续在 SQL Editor 中会用到）。

#### 2. 初始化数据库

进入项目的 **SQL Editor**，将 [`supabase/deploy.sql`](supabase/deploy.sql) 的全部内容粘贴并运行。该脚本包含完整的建表、索引、RLS 策略、AA 计算函数等所有数据库逻辑。

#### 3. 开启匿名登录

在 Dashboard 中进入 **Authentication → Providers**，确保 **Allow anonymous sign-ins** 已开启（默认开启）。

#### 4. 获取项目凭证

进入 **Project Settings → API**，找到以下两个值：

| 配置项 | 说明 |
| --- | --- |
| `Project URL` | 例如 `https://xxx.supabase.co` |
| `anon public key` | 客户端可安全使用的匿名密钥 |

#### 5. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_KEY=your-anon-key
```

#### 6. 构建前端

```bash
pnpm install
pnpm build
```

构建产物在 `dist/` 目录，可直接部署到任意静态托管服务。

#### 部署到 Vercel（示例）

1. 将代码推送到 GitHub 仓库
2. 在 [Vercel](https://vercel.com) 导入该仓库
3. Framework 选择 **Vite**
4. 在 Environment Variables 中填入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_KEY`
5. 部署后即可通过分配的域名访问

支持的其他平台：**Netlify**、**Cloudflare Pages**、**GitHub Pages**、**Surge** 等任意静态托管服务。

---

### 方案二：本地开发（Supabase CLI + Docker）

此方案适合本地调试，也可以用于部署到服务器，需要安装 Docker。

#### 1. 安装 Supabase CLI

```bash
# npm 安装
npm i -g supabase

# 或使用 scoop（Windows）
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 或使用 brew（macOS）
brew install supabase/tap/supabase
```

> 如果直接运行 `supabase` 命令失败，可尝试使用 `npx supabase` 替代（无需全局安装，自动使用项目目录下的 Supabase CLI）。

#### 2. 启动本地 Supabase 服务

```bash
supabase start
```

首次启动会拉取 Docker 镜像（PostgreSQL、GoTrue、Studio 等），耗时数分钟。

国内拉取可能会更加困难，因为Supabase CLI不是从Docker Hub拉取，而是私有源，不过大部分镜像可以直接[在Docker Hub上搜到](https://hub.docker.com/search?q=supabase)，剩下的也能搜到同名官方镜像，拉取后修改tag即可。以下是我的Supabase CLI版本v2.98.2需要的镜像情况：

```bash
public.ecr.aws/supabase/edge-runtime:v1.73.13
public.ecr.aws/supabase/gotrue:v2.188.1
public.ecr.aws/supabase/imgproxy:v3.8.0
public.ecr.aws/supabase/kong:2.8.1
public.ecr.aws/supabase/logflare:1.39.1
public.ecr.aws/supabase/mailpit:v1.22.3
public.ecr.aws/supabase/postgres-meta:v0.96.4
public.ecr.aws/supabase/postgres:17.6.1.106
public.ecr.aws/supabase/postgrest:v14.10
public.ecr.aws/supabase/realtime:v2.86.3
public.ecr.aws/supabase/storage-api:v1.54.1
public.ecr.aws/supabase/studio:2026.04.28-sha-89d08a2
public.ecr.aws/supabase/vector:0.53.0-alpine
```

启动后会产生一组本地凭证：

```
API URL: http://127.0.0.1:54321
anon key: eyJh...（本地生成的密钥）
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
```

#### 3. 应用数据库迁移

```bash
supabase db reset
```

这会依次执行 `supabase/migrations/` 目录下的所有迁移文件。

#### 4. 配置环境变量

创建 `.env` 文件，填入步骤 2 输出的本地凭证：

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_KEY=your-local-anon-key
```

#### 5. 启动开发服务器

```bash
pnpm dev
```

现在可以通过 `http://localhost:5173` 访问应用了。本地 Supabase Studio 可通过 `http://127.0.0.1:54323` 管理数据库。

> **注意**：本地开发的匿名用户数据存储在本地 Docker 容器中，重启容器后会丢失。

---

### 定时清理

生产环境中建议通过 **Supabase Dashboard → Database → Triggers** 或外部 cron 服务，定期调用 `cleanup_expired_rooms()` 函数，自动删除 7 天未更新的房间数据。推荐频率：每天一次。

## 许可

MIT
