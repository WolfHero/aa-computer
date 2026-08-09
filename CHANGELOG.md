# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.1.2](https://github.com/WolfHero/aa-computer/compare/v1.1.1...v1.1.2) (2026-08-09)

### Bug Fixes

* 增加打开页面时的网络检测与离线模式，离线后请求快速失败 ([58400e6](https://github.com/WolfHero/aa-computer/commit/58400e6b98f0d07ca2a78a3fc0f3ff8fe09c98e6))
## [1.1.1](https://github.com/WolfHero/aa-computer/compare/v1.1.0...v1.1.1) (2026-08-09)

### Bug Fixes

* 在线房间断网时回退本地缓存而非转为过期，过期房间可自动恢复 ([bd960ef](https://github.com/WolfHero/aa-computer/commit/bd960eff5e1bb149153fc46e3dde62b821d82405))
## [1.1.0](https://github.com/WolfHero/aa-computer/compare/v1.0.1...v1.1.0) (2026-08-09)

### Features

* 邀请加入与跨浏览器登录体验优化，深色模式三态与账单加载态 ([e79c535](https://github.com/WolfHero/aa-computer/commit/e79c53590543d7f5a87b3acd7f6ec509f850d59c))
## [1.0.1](https://github.com/WolfHero/aa-computer/compare/v1.0.0...v1.0.1) (2026-08-07)

### Bug Fixes

* 修复更新日志同日内排序与 git 不一致（按提交时间倒序） ([08b49bf](https://github.com/WolfHero/aa-computer/commit/08b49bfa9ed4abeafeeba1e71e05b2c2d479b843))
## 1.0.0 (2026-08-07)

### Features

* dev container 接入宿主机 Supabase 并支持 Playwright MCP 浏览器操作 ([cf80c61](https://github.com/WolfHero/aa-computer/commit/cf80c61f47e3cb9f824117b251d3276adf19eeee))
* PWA 化支持离线访问与安装 ([f9e48bc](https://github.com/WolfHero/aa-computer/commit/f9e48bc22ce709cc3e837f58bc50bee4cb83a8b2))
* XLSX 导入使用文件原生列宽 (cellStyles + wpx)，后备自动计算 ([5050510](https://github.com/WolfHero/aa-computer/commit/50505103980e84ad88ddcfcef2ce0c513c588d20))
* 实现账单导入功能 (xlsx/csv 解析 → AG-Grid 预览 → 列映射 → 卡片编辑 → 保存) ([1190196](https://github.com/WolfHero/aa-computer/commit/11901962326270f0ae64a3c620ccafed557bb0f3))
* 房间账单列表新增常驻计算AA按钮，替换菜单入口 ([d9b49e4](https://github.com/WolfHero/aa-computer/commit/d9b49e4d84767c8fce018f5b9df14a5c30931433))
* 支持深色模式（One Dark 配色） ([061ac92](https://github.com/WolfHero/aa-computer/commit/061ac92ed6b845082baa153f0db34c20268e0be8))
* 新增更新日志页面与 git 记录生成脚本 ([ccc4aad](https://github.com/WolfHero/aa-computer/commit/ccc4aad4b984f9094827154f2741048a726cb803))
* 本地优先模式、创建人/付款人分离与导入增强 ([0b56671](https://github.com/WolfHero/aa-computer/commit/0b56671e2a4762744e574a5cbbec581bd5a15921))
* 筛选条件改为可视化条件构建器，列映射简化（仅时间位置需行号） ([38fac62](https://github.com/WolfHero/aa-computer/commit/38fac622de87c690d0bc2500c2df00c9b9204711))

### Bug Fixes

* 修复 AA 计算因 bills 双重 join 笛卡尔积导致金额放大 ([a226fdf](https://github.com/WolfHero/aa-computer/commit/a226fdf00e278c7bf2c4adc52a56c4c8350ddf98))
* 修复 calculate_aa 函数中 CTE 作用域问题引起的运行时错误 ([0c415df](https://github.com/WolfHero/aa-computer/commit/0c415df5cae5f07c22b8d016a1fba6bbeb9931e2))
* 修复 deploy.sql 合并脚本缺失内容 ([46dd2e3](https://github.com/WolfHero/aa-computer/commit/46dd2e371e5594bdb7b6f9184ea0723301cf2cfe))
