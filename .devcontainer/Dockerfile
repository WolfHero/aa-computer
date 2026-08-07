# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# ---- 可覆盖构建参数 (docker build --build-arg 或 devcontainer.json build.args) ----
# 容器时区
ARG TZ=Asia/Shanghai
# apt 下载源 (Debian)
ARG APT_MIRROR=mirrors.aliyun.com
# npm / pnpm 下载源
ARG NPM_REGISTRY=https://registry.npmmirror.com

# ---- 切换 apt 源并安装基础工具 + 时区数据 ----
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        openssh-client \
        python3 \
        python3-pip \
        python3-venv \
        procps \
        tzdata \
        sudo \
    && rm -rf /var/lib/apt/lists/* \
    && echo "node ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 440 /etc/sudoers.d/node

# ---- 时区 ----
ENV TZ=${TZ}
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo "$TZ" > /etc/timezone

# ---- 切换 npm 全局下载源 (对 npm / pnpm 均生效) ----
RUN npm config set registry ${NPM_REGISTRY} --global

# ---- pnpm 10.x (与 pnpm-lock.yaml v9 兼容; npm 全局安装走 npmmirror, 版本固定) ----
# 注意: 不用 corepack, 因为无 packageManager 字段时 corepack 会解析 latest 且固定走 npmjs.org
RUN npm install -g pnpm@10

# ---- 安装 Codex CLI ----
RUN npm install -g @openai/codex

# ---- Playwright 系统依赖 (E2E; 构建时安装一次, 浏览器二进制由 setup.sh 按项目版本补齐) ----
# 版本与 package.json 中 @playwright/test 保持一致
RUN PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright npx --yes playwright@1.60.0 install-deps chromium

USER node
WORKDIR /workspaces/aa-computer
