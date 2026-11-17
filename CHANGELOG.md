# Changelog

## v2026.11.18-private-gateway.1

- Removed the built-in company gateway address from current public source, tests, and distribution documentation. Recipients supply their own address through the local page or a private configuration file.
- Added persistent local gateway configuration shared by browser and Agent, a configured/unconfigured capability status, safe migration of explicit browser settings, and update/backup preservation.
- Added channel-specific setup guidance for compatible company gateways, RunningHub and Suno. Upstream network/account permissions remain under each provider's control; changing a base URL does not adapt incompatible API protocols.


## v2026.11.18-git-agent-sync.1

- Added clone-to-Agent setup with a private Windows Node runtime bootstrap, stable local configuration, and a managed Skill that follows the selected checkout.
- Added safe Git synchronization: main-only fast-forward, local-edit/divergence/active-task checks, private data backup, owned service restart, and Skill refresh.
- Added contributor Fork/branch/PR instructions, maintainer selection workflow, Windows CI, and an allowlist check before publication.
- Published the accumulated browser/headless media, shared history, audio and avatar workflow updates below. Provider availability remains separate from local/mock verification.

## v2026.10.23-headless-audio-kling.1

- Added local background Agent execution and automatic hidden service startup. Supported media tasks no longer require an open browser or manual local token setup.
- Persisted Agent upload identity, task inputs, prompts/options, upstream IDs, progress, and results for shared history inspection and deliberate reruns.
- Repaired Kling source-video editing controls and added model-specific sound inputs through the company gateway; route availability and live channel capacity are reported separately.
- Added a portable skill containing a clean Windows workbench/runtime archive and a lightweight skill for the existing local installation. Updated setup, API, data, and release guides.

## Unreleased

- Added GPT Image 2.6 Flare/Sunburst and MiniMax H3 Image to the shared browser/headless model catalog. GPT 2.6 supports PNG, SVG and GIF with format-specific validation and GIF frame controls; H3 Image supports 1K/2K/4K and up to eight reference images.
- Preserved new image format/frame settings through batch defaults, copy, refresh recovery, history grouping and recreation. SVG rejects reference images without silently deleting existing assets.

- Added voice selection preferences (preferred languages and usage requirements) with automatic pending/annotated labels; existing notes, tags, provider IDs and image bindings remain intact, including version-conflict draft recovery.

- Guarded preview fullscreen against late requests, stale exit events and invalid records; dragging from the viewer onto its backdrop no longer closes it.
- Kept the selected video time during frame capture without reloading, canceled stale frame reads on preview switches, and restored retry controls after upload errors.
- Added isolated browser coverage for fullscreen races and frame uploads, plus frame-read cancellation and timeout regressions.
- Reduced repeated history grouping work with render-scoped derivations; paged expanded result groups without removing records.
- Released offscreen/detached video previews and full-viewer resources on close; retained grouped navigation and improved preview control contrast.
- Retried transient Windows EPERM atomic commits with bounded backoff, preserving committed bytes and avoiding transaction/provider replay.
- Added isolated browser load/preview tests and deterministic Windows storage-lock regressions.
- Removed the subject library, legacy avatar, Vidu voice/reference, music and video-edit entries from task navigation; kept the dedicated avatar workflow, existing queues, history and model adapters unchanged.
- Split avatar production into three large subpage tabs: speech, digital human, and subtitles. Album, voices, workflows and settings are compact header tabs above production navigation; spacing and active states are consistent, drafts/results survive navigation, and handoff opens its target tab without submitting.
- Added operation-scoped server/Agent jobs and explicit result handoff without automatic submission; retained legacy pipeline recovery.
- Added local audio/video subtitle inputs, per-section previews/status, editable subtitle download, and desktop/mobile layout tests.

## v2026.09.20-avatar-workflow.1

- Integrated speech, audio adjustment, digital-human generation and optional subtitles into a native page on the existing 4198 service.
- Added a shared versioned voice/workflow library, local image album, SHA-256 deduplication, and manual voice-image recommendations/defaults.
- Added server-executed, persistent Agent workflow jobs and shared history provenance; existing remote task IDs resume without duplicate submission.
- Moved RunningHub configuration to shared local storage with redacted key responses and conflict detection; legacy imports preserve private backups and leave the old tool untouched.
- Added browser, store, adapter, authorization and restart regression tests, plus Agent instructions and portable source entries.

## v2026.09.18-portable-runtime.1

- Added a Windows x64 self-contained build with an explicit Node runtime, license, and integrity manifest; source-only builds remain supported.
- Portable launchers now prefer the bundled runtime, bypass global PM2 by default, and keep background process logs in the selected data directory.
- Added recipient deployment, upgrade/backup, and Agent setup guides; preserved the company gateway without distributing personal state or credentials.
- Fixed Seedance 2.5 automatic duration: both video pages now offer automatic (-1), submit numeric -1, and retain the selection through reload and history reuse. New rows still default to 10 seconds; reference-clip duration validation is unchanged.

## v2026.09.14-models-prompts.1

- Added company-gateway Seedance 2.5 to image/video and multimodal pages, plus GPT Image 2.5 Flare and Sunburst with independent render-quality and background controls.
- Added per-task prompt history, favorites, search, and row reuse with IndexedDB retry storage and safe local-service synchronization.
- Fixed asset-picker overlapping grid rows, added 50-item paging, and deferred offscreen video poster loading.
- Kept reference insertion at the selected caret in both prompt editors; avoided full-page rebuilding on prompt blur and batched typing saves.
- Reduced background Agent polling cost with targeted task reads, correctly spaced heartbeats, and batched lease snapshots.
- Included updated source, engineering notes, and regression tests in the privacy-clean portable package.

- New rows now appear at the top across manual creation, batch imports, history reuse, and Agent submissions while copied rows remain beside their source row.
- Updated Midjourney image generation with V8.2 as the default and added V8.1 while retaining V7, V6.1, and Niji 7 compatibility.

## v2026.08.03-asset-picker.1

- Added independent favorites and a favorites-only filter to the upload-asset picker.
- Kept the picker title, close action, media tabs, and favorite filter fixed while only the asset grid scrolls.
- Added exact SHA-256 upload deduplication across browser and Agent upload paths; only matching original filename, media metadata, and content reuse the canonical URL.
- Preserved original-file identity when Seedance or Agent upload preparation compresses the transported media.
- Updated the privacy-clean portable package with the new helper module and regression tests without including personal cache or favorite state.

## v2026.08.01-local-agent-api.1

- Added an authenticated loopback-only Agent API with idempotent task submission and append-only task/history journals.
- Added the browser-tab execution worker, lease recovery, upstream polling resume, optional provider cancellation, and duplicate-submission protection.
- Browser workers now re-establish their same-origin control session automatically after a PM2 or local-service restart.
- Unified browser and Agent generations in one history cache with source labels and source filtering.
- Added the portable `api-plus-agent` Skill and dependency-free CLI for Codex, Minimax Code, and compatible local Agents.
- Kept Agent callers append-only: only the manual browser UI can delete history records.
- Moved Git-checkout server metadata to the external sibling `APIplusWebtools-data` directory while keeping a package-local `data` fallback for portable ZIP installs.
- Expanded the privacy-clean engineering package with Agent runtime, tests, Skill, references, and deployment documentation while excluding tokens, journals, staged media, and personal state.

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
