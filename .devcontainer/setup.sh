#!/usr/bin/env bash
set -euo pipefail

# 项目目录由 VSCode 挂载, 宿主机 .env/.env.local 通常已可见 (gitignore, 不随仓库 clone)
# 兜底: 容器内首次初始化时生成占位 .env
if [ ! -f .env ]; then
  cp .env.template .env
  echo ">>> 已从 .env.template 生成 .env (占位值, 请按需修改)"
fi

echo ">>> pnpm install"
pnpm install

# ---- Playwright Chromium (E2E; 版本与项目 @playwright/test 匹配) ----
# 系统依赖已由 Dockerfile 构建时安装; 重建容器后浏览器缓存会丢失, 这里自动补齐
echo ">>> 确保 Playwright Chromium 可用"
pnpm exec playwright install chromium

# ---- 常用别名: cdx = codex YOLO 模式 (跳过审批与沙箱) ----
for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$RC" ] || continue
  if ! grep -q 'alias cdx=' "$RC" 2>/dev/null; then
    {
      echo ""
      echo "# cdx: codex YOLO 模式 (跳过审批与沙箱)"
      echo "alias cdx='codex exec --dangerously-bypass-approvals-and-sandbox'"
    } >> "$RC"
    echo ">>> 已添加别名 cdx 到 $RC"
  fi
done

# ---- 接入宿主机 Supabase 的 Docker 网络 (需 devcontainer features: docker-outside-of-docker) ----
# 跨平台 (Docker Desktop / WSL2 / Linux): 通过挂载的 docker.sock 操作宿主机 daemon,
# 把当前容器 join 进 supabase_network_*, 之后容器内可按容器名直接访问各服务
if command -v docker >/dev/null 2>&1; then
  # 先确认 daemon 可达 (socket 权限/代理问题在这里直接报出来, 而不是误报"未发现网络")
  if docker info >/dev/null 2>&1; then
    # 自动发现 project_id: 优先解析 supabase/config.toml, 兜底用目录名
    PROJECT_ID=""
    if [ -f supabase/config.toml ]; then
      PROJECT_ID=$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' supabase/config.toml | head -1)
    fi
    if [ -z "$PROJECT_ID" ]; then
      PROJECT_ID=$(basename "$PWD")
    fi

    # 可用环境变量 SUPABASE_NETWORK 显式指定网络名, 否则自动发现
    NET="${SUPABASE_NETWORK:-}"
    if [ -z "$NET" ]; then
      # 优先精确匹配本项目的网络; 宿主机只有一个 supabase 网络时兜底使用
      NET=$(docker network ls --format '{{.Name}}' | grep "^supabase_network_${PROJECT_ID}$" | head -1 || true)
      if [ -z "$NET" ]; then
        NET=$(docker network ls --format '{{.Name}}' | grep '^supabase_network_' | head -1 || true)
        if [ -n "$NET" ]; then
          echo ">>> 未找到 project_id=$PROJECT_ID 的专属网络, 使用宿主机唯一 supabase 网络: $NET"
        fi
      fi
    fi

    if [ -n "$NET" ]; then
      if CONNECT_OUT=$(docker network connect "$NET" "$(hostname)" 2>&1); then
        echo ">>> 已接入 Supabase Docker 网络: $NET (project_id=$PROJECT_ID)"
        KONG=$(docker ps --filter "network=$NET" --filter "name=kong" --format '{{.Names}}' | head -1 || true)
        if [ -n "$KONG" ]; then
          echo ">>> 容器内 API 地址: http://${KONG}:8000"
          # 首次生成容器内专用环境文件 (不覆盖已有配置), key 从 .env.local 复用
          if [ ! -f .env.container ]; then
            CONTAINER_KEY=$(sed -n 's/^VITE_SUPABASE_KEY=//p' .env.local 2>/dev/null | head -1)
            {
              echo "# 容器内专用环境 (setup.sh 自动生成, 已 gitignore)"
              echo "# 用法: pnpm dev:container / pnpm test:container"
              echo "VITE_SUPABASE_URL=http://${KONG}:8000"
              echo "VITE_SUPABASE_KEY=${CONTAINER_KEY:-your-supabase-key}"
            } > .env.container
            echo ">>> 已生成 .env.container (容器内 API: http://${KONG}:8000)"
          fi
        fi
      else
        case "$CONNECT_OUT" in
          *"already exists"*)
            echo ">>> 容器已在网络 $NET 中 (重复执行 setup.sh 可忽略)"
            ;;
          *)
            echo ">>> 接入 $NET 失败:"
            echo "$CONNECT_OUT"
            ;;
        esac
      fi
    else
      echo ">>> 未发现 supabase Docker 网络, 跳过 (请先启动 Supabase, 再重跑: bash .devcontainer/setup.sh)"
      echo "    当前宿主机 Docker 网络列表:"
      docker network ls --format '      - {{.Name}}'
      echo "    若网络名不是 supabase_network_*, 可用 SUPABASE_NETWORK=<网络名> bash .devcontainer/setup.sh 显式指定"
    fi
  else
    echo ">>> 无法连接宿主机 Docker daemon, 跳过 Supabase 网络接入"
    docker info 2>&1 | tail -n 3 || true
    echo "    原因通常是 docker-outside-of-docker feature 的 socket 代理未生效"
    echo "    请确认 Dockerfile 已安装 sudo 后重建容器: Dev Containers: Rebuild Container"
  fi
else
  echo ">>> docker CLI 不可用, 跳过 Supabase 网络接入 (重建容器以启用 docker-outside-of-docker feature)"
fi

echo ">>> 初始化完成. 可用命令: pnpm dev / pnpm build"
