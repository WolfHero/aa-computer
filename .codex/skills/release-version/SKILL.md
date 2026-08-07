---
name: release-version
description: 发布 aa-computer 新版本（SemVer）。当用户要求发版/发布新版本/打 tag/升级版本号、执行 pnpm release 或 commit-and-tag-version、生成 CHANGELOG、确认远端 tag 是否已推送、或为部署准备更新日志时使用。覆盖版本号自动 bump、tag 创建、宿主机推送与 GitHub API 验证。
---

# Release Version

为 aa-computer 发布 SemVer 版本。版本号唯一数据源是 `package.json`，页面标题由 `virtual:app-version` 虚拟模块自动注入，发布时无需改页面代码。

## 发布流程

1. 检查工作区：`git status` 干净（先提交所有改动），确认本次要发布的提交使用 conventional commit（`feat` → minor，`fix` → patch，`BREAKING CHANGE` → major）。
2. 执行发布：
   - 自动计算版本：`pnpm release`（即 commit-and-tag-version）
   - 显式指定版本：`pnpm exec commit-and-tag-version --release-as X.Y.Z`
   - 效果：bump `package.json`/`package-lock.json`、生成 `CHANGELOG.md`、提交 `chore(release): X.Y.Z`、创建 tag `vX.Y.Z`。
3. 推送：**容器内没有 ssh，必须在宿主机执行**：
   - 代码+tag：`git push --follow-tags origin master`
   - 只推 tag：`git push origin vX.Y.Z`（普通 push 不带 tag）
4. 验证远端：
   - `git rev-parse vX.Y.Z` 记录本地 sha
   - `curl -s https://api.github.com/repos/WolfHero/aa-computer/tags` 确认远端 tag 存在且 sha 一致
   - master 用 `curl -s https://api.github.com/repos/WolfHero/aa-computer/branches/master` 核对
5. 部署前如需应用内更新日志：运行 `pnpm build` 重新生成 `src/data/release-log.json` 并提交（ESA 部署走 esa-cli，见 CLAUDE.md，独立流程）。

## 项目特定注意事项

- 不要在容器内执行 push：容器没有 ssh 二进制、无 GitHub 凭据。
- 发布提交若被 amend，tag 必须同步移动（`git tag -f`），仅限未推送时。
- 版本号注入走虚拟模块（`src/version.ts` → `virtual:app-version`），不要改回 Vite `define`：define 在 dev 客户端不生效。
- 9p 挂载下 Vite 文件监听可能失效：改代码后重启 dev server 再验证。
- 基线 v1.0.0 已存在；重复发布同一版本需先删本地/远端 tag（慎用）。
