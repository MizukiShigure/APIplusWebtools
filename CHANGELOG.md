# Changelog

## v2026.07.28-engineering-package.1

- Added a complete engineering handoff: Agent guide, architecture, development, API integration, data/privacy, contribution, and release documentation.
- Expanded the privacy-clean portable ZIP so the same package can be launched by end users or developed and tested by engineers and coding agents.
- Added package contracts that require all public docs and tests while continuing to exclude local history, credentials, logs, personal workflow settings, and machine paths.
- Added `npm run package` as the supported command-line package build.
- Preserved remote asynchronous task IDs across refresh and resumed polling without submitting duplicate create requests.
- Kept the approved company API Base and built-in RunningHub node template as tool defaults while excluding user-imported workflows, credentials, prompts, queues, and history from the portable package.
- Kept the existing localStorage, IndexedDB, and disk history compatibility contract.

## v2026.07.16-omni-ui.1

- Added the Kling 3.0 Omni multimodal-video request contract and provider-aware reference handling.
- Added Seedance 2.0 version-aware quality rules, including normal-model 4K and Fast-model fallback to 720p.
- Kept task tables usable on narrow screens and allowed running rows to be copied while submit/delete remain locked.
- Preserved structured provider error details for diagnosis and copying.
- Added a persistent PM2 launcher with exact project and port ownership checks that fail closed.
- Added a privacy-safe portable builder with an explicit public-file whitelist.
- Portable ZIPs contain empty `data/.keep` and `runtime/.keep` placeholders only.
- Removed the embedded API Base default from the portable artifact.

## v2026.07.16-portable.1

- 整理为独立本地部署工具包。
- 增加 `Start_API_Tool.bat` / `Stop_API_Tool.bat` / `Make_Portable_Package.bat`。
- 增加 `package.json`，支持 `npm.cmd start` 和 `npm.cmd test`。
- 本地服务端口支持 `PORT` 环境变量，默认 `4198`。
- 历史缓存改为浏览器 IndexedDB + 本地磁盘备份双写。
- 本地磁盘历史优先写 `data/history.json`，目录不可写时写 `%APPDATA%\Internal_API_Batch\history.json`。
- 增加 Git 版本管理脚本，支持拉取更新和切换到历史 tag。
