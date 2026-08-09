# AA Computer 自部署指南

> 本文档介绍如何把 AA Computer 完整部署到**自己的电脑或服务器**：前端静态站点 + 自托管 Supabase（PostgreSQL + 匿名认证 + RLS）。
> 如果你只需要开发调试，见 README 的「方案二：本地开发（Supabase CLI + Docker）」；不想自托管数据库则用「方案一：Supabase 云服务」。

## 架构总览

本项目对 Supabase 的使用非常克制，**只需要 4 个容器**：

| 容器 | 作用 | 能否省掉 |
| --- | --- | --- |
| Postgres | 全部数据 + 业务逻辑（RPC、RLS、触发器） | 不能 |
| PostgREST | REST API（`.from()` CRUD + `.rpc()`） | 不能 |
| GoTrue (Auth) | 匿名登录、会话刷新（跨浏览器登录） | 不能 |
| Kong | API 网关，客户端单一入口 | 不能（除非另写反向代理） |

Storage、Realtime、Edge Functions、Studio 等模块本项目**均未使用**，本地 `supabase start` 会一起启动它们（所以有 10 个容器），自托管时不必部署。

整体拓扑：

```text
浏览器 (PWA 前端)
   │  https
   ├── 静态站点（Nginx / Caddy / 任意静态托管）
   └── Kong :8000 ── /auth/v1 ──> GoTrue :9999
                     └─ /rest/v1 ──> PostgREST :3000 ──> Postgres :5432
```

## 前置准备

- **Node.js >= 18 + pnpm**（构建前端、生成密钥）
- **Docker + Docker Compose**（运行 Supabase 后端）

### 各平台安装 Docker

| 平台 | 安装方式 | 备注 |
| --- | --- | --- |
| Windows | [Docker Desktop](https://www.docker.com/products/docker-desktop/) | 基于 WSL2；安装后在 PowerShell 里运行 `docker version` 验证 |
| macOS | Docker Desktop 或 [OrbStack](https://orbstack.dev) | Apple Silicon 也能用；启动后确认 Docker Desktop 正在运行 |
| Linux | Docker Engine + compose 插件，如 Debian/Ubuntu：`sudo apt install docker-ce docker-ce-cli docker-compose-plugin` | 安装后 `sudo systemctl enable --now docker`；想免 sudo 就把用户加入 docker 组 |

## 第一步：生成密钥并准备配置文件

密钥生成脚本是纯 Node 实现（无依赖），Windows / macOS / Linux 通用：

```bash
node scripts/generate-supabase-keys.mjs > docs/self-hosting/.env
```

它会生成 `POSTGRES_PASSWORD`、`JWT_SECRET`、`ANON_KEY`、`SERVICE_ROLE_KEY` 并输出到 `.env`（仓库的 `.gitignore` 已忽略 `.env`，不会误提交）。

## 第二步：修改 .env 中的站点地址

编辑 `docs/self-hosting/.env`，把这两个值改成你的实际地址：

```env
# 前端页面的访问地址（本地开发 http://localhost:5173，生产 https://app.example.com）
SITE_URL=http://localhost:5173

# Kong 的公网地址 + /auth/v1（生产 https://api.example.com/auth/v1）
API_EXTERNAL_URL=http://127.0.0.1:8000/auth/v1
```

`KONG_HTTP_PORT` 默认 `8000`。如果端口被占用，或想和本地 `supabase start`（占用 54321/54322/54323）共存，改成其他值，例如 `54321`。

> **Windows 注意**：如果 8000 端口被其他程序占用，用 `netstat -ano | findstr :8000` 查看占用进程；macOS / Linux 用 `lsof -i :8000`。

## 第三步：启动 Supabase

```bash
cd docs/self-hosting
docker compose up -d --build
docker compose ps
```

首次启动会构建两个本地镜像（基于 Supabase 官方镜像叠加本项目初始化脚本）、拉取基础镜像并初始化数据库，耗时几分钟。之后的启动不需要 `--build`。全部显示 `healthy`（kong 为 `Up`）即成功：

```text
aa-supabase-auth    Up (healthy)
aa-supabase-db      Up (healthy)
aa-supabase-kong    Up
aa-supabase-rest    Up (healthy)
```

> 镜像托管在 `public.ecr.aws`，国内拉取可能较慢；可参考 README 中的镜像替换提示（Docker Hub 搜同名 supabase 镜像后改 tag）。

## 第四步：应用数据库迁移

数据库只完成了 Supabase 平台自身的初始化，还需要应用**本项目**的迁移（建表、RLS、RPC 函数）。

推荐直接执行合并脚本（已与全部迁移对齐，一次搞定）：

```bash
cd docs/self-hosting
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < ../../supabase/deploy.sql
```

也可以按顺序逐条执行 `supabase/migrations/*.sql`（结果等价）：

<details>
<summary>bash / zsh（macOS / Linux / Git Bash / WSL）</summary>

```bash
cd docs/self-hosting
for f in ../../supabase/migrations/*.sql; do
  echo "== $(basename "$f")"
  docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f - < "$f" || break
done
```

</details>

<details>
<summary>PowerShell（Windows）</summary>

```powershell
cd docs\self-hosting
Get-ChildItem ..\..\supabase\migrations\*.sql | Sort-Object Name | ForEach-Object {
  Write-Host "== $($_.Name)"
  Get-Content $_.FullName -Raw | docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f -
}
```

</details>

也可以使用 Supabase CLI（需要先暴露数据库端口，见 docker-compose.yml 中注释的 `ports` 配置）：

```bash
npx supabase db push --db-url "postgresql://postgres:你的POSTGRES_PASSWORD@127.0.0.1:54322/postgres"
```

## 第五步：验证后端

```bash
# 从 .env 读取 ANON_KEY 后请求 GoTrue 健康检查，200 即链路通畅
source docs/self-hosting/.env
curl -H "apikey: $ANON_KEY" http://127.0.0.1:8000/auth/v1/health
```

完整链路（匿名登录 → RLS → RPC）在开发时可直接用前端验证；也可以在浏览器打开前端后看能否创建本地房间并转在线。

## 第六步：构建并部署前端

在项目根目录创建 `.env`：

```env
VITE_SUPABASE_URL=http://127.0.0.1:8000        # 生产环境换成 https://api.example.com
VITE_SUPABASE_KEY=你的ANON_KEY                  # 即 .env 中的 ANON_KEY
```

然后构建：

```bash
pnpm install
pnpm build
```

产物在 `dist/`，可以部署到**任意静态托管**（Nginx、Caddy、Vercel、Cloudflare Pages、GitHub Pages 等）。注意：本项目使用 history 路由，必须配置 SPA fallback（未知路径回退到 `index.html`）。

### 个人电脑自用：直接用 pnpm preview（最省事）

如果你只是**自己电脑上用**（或临时分享给同一局域网的朋友），不需要装 Nginx/Caddy，构建完直接用 Vite 自带的预览服务器即可：

```bash
pnpm build
pnpm preview --port 4173 --strictPort
```

然后浏览器打开 `http://localhost:4173`。几个要点：

- 它服务的就是 `pnpm build` 的产物（`dist/`），和正式部署跑的是同一份代码，不是开发服务器。
- history 路由的深链接/刷新可用（preview 自带 SPA fallback，本项目已实测 `/changelog`、`/room/xxx` 等路径均正常返回应用页面）。
- `localhost` 属于浏览器的安全上下文，**PWA 安装和离线缓存正常工作**。
- 想用手机访问，加 `--host`：`pnpm preview --host --port 4173`，手机访问 `http://<电脑IP>:4173`。但局域网 IP 不是安全上下文，PWA 安装/离线在该地址下不生效（应用本身可用）。Windows 首次运行 `--host` 会弹防火墙放行提示，允许即可。
- 局限：单进程、无 HTTPS、不会开机自启，适合个人自用；**公开服务器请用下面的 Nginx/Caddy**。
- 改了代码要重新 `pnpm build` 再 preview（日常开发用 `pnpm dev`）。

### Nginx 示例

```nginx
server {
    listen 80;
    server_name app.example.com;
    root /var/www/aa-computer/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源带 hash，可长缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

HTTPS 用 certbot 签发即可。更省事的方案是 Caddy（自动 HTTPS）：

```caddy
app.example.com {
    root * /var/www/aa-computer/dist
    try_files {path} /index.html
    file_server
}
```

### API 域名反向代理（Caddy 示例）

```caddy
api.example.com {
    reverse_proxy 127.0.0.1:8000
}
```

生产环境**只暴露 443 和 80**，Kong 的 8000 端口不要直接暴露到公网；数据库端口默认不暴露（见 compose 注释），务必保持。

## Windows / macOS / Linux 差异速查

| 事项 | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Docker | Docker Desktop（WSL2 后端） | Docker Desktop / OrbStack | Docker Engine + compose 插件 |
| 命令入口 | PowerShell / cmd（本指南命令以 bash 为主，PowerShell 变体见第四步） | Terminal（bash / zsh） | Terminal（bash） |
| 换行符 | git 检出默认 CRLF；仓库已用 `.gitattributes` 保证 `kong-entrypoint.sh` 保持 LF | LF | LF |
| 端口检查 | `netstat -ano \| findstr :8000` | `lsof -i :8000` | `lsof -i :8000` 或 `ss -ltnp` |
| 定时任务 | 任务计划程序（schtasks） | `crontab -e` 或 launchd | `crontab -e` / systemd timer |
| 防火墙 | Windows 弹窗放行 Docker 即可 | 一般无需额外配置 | `sudo ufw allow 80,443/tcp`（有 SELinux 的发行版注意容器目录标签） |
| 端口占用冲突 | 关闭占用程序或改 `KONG_HTTP_PORT` | 同左 | 同左 |

### WSL2（Windows）额外注意

- 把项目放在 Linux 文件系统（如 `~/projects/aa-computer`）而不是 `/mnt/c/...`，否则文件读写和 `pnpm install` 会明显变慢。
- 浏览器访问 `http://localhost:8000` 通常可直接连通（Docker Desktop 自动端口转发）；访问不通时检查 Windows 防火墙是否放行 Docker。
- Docker Desktop 的 WSL2 发行版内存默认 2GB，`pnpm build` 或数据库初始化偶发 OOM 时，在 Docker Desktop → Settings → Resources 里调大。

## PWA 与离线

Service Worker 只在**安全上下文**（HTTPS 或 localhost）下工作，所以生产环境必须配 HTTPS，否则无法安装 PWA、离线缓存不生效。前端域名和 API 域名是分开的没问题，但都要是 HTTPS。

## 定时清理过期房间

在线房间 7 天未更新会被清理，需要每天调度一次 `cleanup_expired_rooms()`。自托管最简单的方式是直接启用数据库自带的 **pg_cron**（镜像已预装）：

```bash
cd docs/self-hosting
docker compose exec -T db psql -U postgres -d postgres
```

```sql
create extension if not exists pg_cron;
select cron.schedule('aa-cleanup-expired-rooms', '0 3 * * *', $$select cleanup_expired_rooms()$$);
```

也可以不用 pg_cron，在宿主机配外部定时任务，每天调用一次 RPC（服务端用 `SERVICE_ROLE_KEY`）：

```bash
curl -X POST https://api.example.com/rest/v1/rpc/cleanup_expired_rooms \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

## 备份与恢复

数据库卷包含全部数据（含匿名用户和房间数据），定期 `pg_dump` 即可：

```bash
cd docs/self-hosting
docker compose exec -T db pg_dump -U postgres -d postgres > backup-$(date +%F).sql
```

恢复到新环境：起好栈后

```bash
docker compose exec -T db psql -U postgres -d postgres -f - < backup-2026-08-07.sql
```

> 恢复目标库必须与备份同结构（先应用同样的迁移），且不建议覆盖已有数据的库。

## 升级

1. 拉取新镜像并重建：`cd docs/self-hosting && docker compose pull && docker compose up -d`
2. 应用新增迁移（重复第四步的迁移命令即可，迁移脚本都是幂等/增量设计）
3. 镜像版本与 Supabase CLI 版本相关，升级大版本前先看官方 [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting/docker) 文档

## 安全建议

- `JWT_SECRET`、`POSTGRES_PASSWORD`、`SERVICE_ROLE_KEY` 是敏感信息，`.env` 不要提交进仓库，也不要写进前端代码。
- `ANON_KEY` 会随前端分发，这是设计如此（匿名访问受 RLS 约束）；真正危险的是 `SERVICE_ROLE_KEY`，只允许出现在服务端。
- 不要把 Kong 之外的其他端口暴露到公网（尤其数据库 5432）。
- GoTrue 已按本项目需要开启匿名登录（`GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true`），不要关闭，否则应用无法匿名使用。

## 常见问题

**1. 所有请求返回 401**

kong 的 `kong.yml` 没有正确渲染。检查容器内文件是否还有 `$` 占位符：

```bash
docker exec aa-supabase-kong sh -c 'grep -n "\$ANON_KEY\|\$LUA_AUTH_EXPR" /home/kong/kong.yml || echo OK'
```

如果还有占位符，说明启动时 `.env` 中 `ANON_KEY` / `SERVICE_ROLE_KEY` 为空；修改 `.env` 后 `docker compose up -d kong` 重启。

**2. auth 容器反复启动失败，日志显示 `password authentication failed for user "supabase_auth_admin"`**

`db-init/zz-passwords.sql` 只在**首次初始化（空数据卷）**时执行。如果数据卷已经存在（比如改过 `.env` 再启动），密码不会更新。解决办法：确认 `.env` 后执行 `docker compose down -v && docker compose up -d` 重建（会清空数据）。

**3. 想用 Studio 图形化管理数据库**

精简方案没有 Studio。需要时用任意 PostgreSQL 客户端连数据库（先按 compose 注释放开 `127.0.0.1:54322`），或参考官方 compose 补上 Studio / postgres-meta 两个服务。

**4. 和本地 `supabase start` 同时运行**

两边容器名不同（`aa-supabase-*` vs `supabase_*`），只要 `KONG_HTTP_PORT` 不冲突即可。

**5. 迁移报错**

迁移按文件名顺序执行；某一步失败时先定位失败文件（命令会打印文件名），修正后从失败文件继续即可。迁移脚本都是 `create or replace` / `if not exists` 幂等设计，重复执行安全。
