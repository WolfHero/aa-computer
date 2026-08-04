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

echo ">>> 初始化完成. 可用命令: pnpm dev / pnpm build"
