# APIplusWebtools

本项目提供本地浏览器批量生成界面和后台 Agent CLI。普通用户可以双击启动页面，Agent 可不开浏览器直接上传、生成、查历史和重新抽卡；两种方式使用同一套模型和历史记录。

当前版本：`v2026.11.18-git-agent-sync.1`

## 拉取后交给 Agent 自动配置

```powershell
git clone https://github.com/MizukiShigure/APIplusWebtools.git
cd APIplusWebtools
powershell -NoProfile -ExecutionPolicy Bypass -File Setup_Workbench.ps1
```

也可以让 Agent 阅读本项目后说“配置工作台和 Skill”。安装器会检查 Node、启动本地工作台、注册随源码更新的 `api-plus-agent` Skill，并输出网页地址。之后对 Agent 说“同步项目”，即可更新代码与 Skill，保留本机配置、历史和素材；也可双击 `Update_From_Git.bat`。别人修改后通过 PR 提交，由维护者选择合入。完整流程和其他系统入口见 [安装、同步与贡献](docs/GIT_WORKFLOW.md)。

网页可人工操作，也能查看经工作台提交的 Agent 任务、来源、素材、Prompt、参数及结果。各电脑的历史保存在本机，GitHub 只分发代码和 Skill。

## 直接使用

环境要求：

- Windows 10/11 x64。
- 完整便携包内含 Node.js，无需安装；源码包需要 Node.js 20 或更高版本。
- 能访问你所使用的公司 API 中转或第三方服务。

启动步骤：

1. 解压整个文件夹。
2. 双击 `Start_API_Tool.bat`。
3. 浏览器会打开 `http://127.0.0.1:4198/`。
4. 默认使用公司 API Base；按需填写自己的 RunningHub 密钥和工作流配置。
5. 用完后双击 `Stop_API_Tool.bat`。

带 `runtime/node.exe` 的便携版优先使用自带 Node.js，以隐藏后台进程运行，日志位于数据目录的 `logs`。不依赖全局 PM2；源码安装保留原来的 PM2 检测方式。需要主动使用 PM2 时设置 `API_BATCH_USE_PM2=1`，停止时也沿用该设置。

如果电脑没有全局 Node.js，也可以把 `node.exe` 放进本目录的 `runtime` 文件夹。

部署、升级和备份详见 [本地部署指南](docs/LOCAL_DEPLOYMENT.md)；让对方 Agent 阅读 [Agent 部署说明](docs/AGENT_DEPLOYMENT.md) 即可辅助配置。页面在本地运行，但实际生成仍需对方电脑能够访问公司网关。

## 开发与 Agent 接手

将整个项目文件夹交给开发者或编码 Agent 即可。Agent 应先读 [AGENTS.md](AGENTS.md)，开发者从以下命令开始：

```powershell
npm test
npm start
```

当前没有 npm 运行依赖，不需要先执行 `npm install`。页面默认运行在：

```text
http://127.0.0.1:4198/
```

工程文档：

- [架构说明](docs/ARCHITECTURE.md)
- [开发指南](docs/DEVELOPMENT.md)
- [API 接入指南](docs/API_INTEGRATION.md)
- [数据与隐私](docs/DATA_AND_PRIVACY.md)
- [发布检查清单](docs/RELEASE_CHECKLIST.md)
- [贡献指南](CONTRIBUTING.md)

## 项目结构

```text
app.js                         浏览器应用、任务页、队列、模型适配和历史缓存
model-contracts.js             可独立测试的模型规则与请求映射
server.cjs / agent-service.cjs 本地静态服务、Agent API、事件日志和代理
agent-headless.cjs              后台 Agent 执行器、上传、提交、恢复轮询与历史
agent-runtime.js                浏览器兼容执行器
skills/api-plus-agent/          可迁移 Skill、后台客户端与便携包引导脚本
skills/local-api-workbench/     仅调用本机已有安装的轻量 Skill
index.html / styles.css        页面结构与样式
*.test.cjs                     Node 合同测试
scripts/build-portable.ps1     隐私清理后的工程分发包构建器
data/                          本地历史备份目录，不进入 Git/分发包
runtime/                       可选便携 node.exe 目录
```

## 数据保存

历史缓存保存两份：

- 浏览器 IndexedDB：页面读取快，但受浏览器、端口和 hostname 影响。
- Git 克隆版的服务端元数据默认写到项目同级的 `APIplusWebtools-data`，更新和回退源码不会覆盖它。
- ZIP 便携版默认写到包内 `data`；也可用 `API_BATCH_DATA_DIR` 指向其他目录。

任务行、页面设置和小型配置保存在 localStorage。历史记录按图片、视频、音频、其他分别最多保留 1000 条；历史页每页显示 50 组。

历史只保存 URL、Prompt、任务 ID、模型参数等结构化记录，不复制远程图片、视频或音频文件本体。重要结果请及时下载。

详见 [数据与隐私](docs/DATA_AND_PRIVACY.md)。

## 刷新与异步任务

异步任务取得远程任务 ID 后会先写入对应任务行。页面刷新时：

- 有任务 ID 和查询接口：继续轮询，不重复提交创建请求。
- 没有可恢复任务 ID：释放为可重新提交状态。
- 单个任务最多轮询 30 分钟，超过后判定失败。

## 自定义端口

默认端口为 `4198`：

```bat
set PORT=4300
Start_API_Tool.bat
```

然后访问 `http://127.0.0.1:4300/`。注意，不同端口对应不同的浏览器存储空间，但同一项目目录仍可通过磁盘备份恢复历史。

## 构建干净分发包

双击 `Make_Portable_Package.bat`，或运行：

```powershell
npm run package
```

默认输出：

```text
dist\Internal_API_Batch_Portable_v2026.11.18-git-agent-sync.1.zip
```

这个 ZIP 同时包含：

- 普通用户直接启动所需的页面、服务和批处理；
- 开发者/Agent 所需的源码、测试、`AGENTS.md`、工程文档与 `api-plus-agent` Skill。

构建器采用明确白名单，并保留已批准的公司 API Base 与内置 RunningHub 节点模板。默认生成源码包，`data` 与 `runtime` 只有 `.keep`；生成包含运行环境的完整包需显式传入 Node 和许可证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-portable.ps1 -NodeRuntimePath runtime/node.exe -NodeLicensePath runtime/LICENSE -OutputPath dist/Workbench-Windows-x64.zip
```

完整包的 `runtime` 只增加这两个文件，另附 `PORTABLE_BUILD.json`。两种包均不带浏览器缓存、历史、队列、Prompt、主体记录、API Key、用户导入的 RunningHub 配置、日志、本机路径或 Git 元数据。不要直接压缩自己使用过的工作目录发给别人。

## Git 安装、更新与回退

需要持续更新的用户建议用 Git：

```bat
git clone https://github.com/MizukiShigure/APIplusWebtools.git
cd APIplusWebtools
Start_API_Tool.bat
```

以后可以双击 `Update_From_Git.bat`，或让 Agent 执行以下命令，同时更新已安装 Skill 并重启空闲服务：

```powershell
node scripts/workbench-manage.cjs sync
```

查看版本：

```powershell
git tag --sort=-creatordate
```

回退可以双击 `Restore_Version.bat`，或执行：

```powershell
git checkout v2026.08.03-asset-picker.1
```

回到主线：

```powershell
git switch main
git pull --ff-only
```

ZIP 快照不包含 `.git` 历史，因此不能直接拉取或回退；需要更新能力时请用 `git clone`。

## 常见问题

### 页面打不开

确认本地服务已启动，4198 端口未被其他程序占用。也可以在终端运行 `node server.cjs` 查看启动错误。

### 页面能开但请求失败

确认当前电脑网络可以访问配置的 API Base，并在浏览器 Network 面板区分网络错误、后端路由 404、参数 400、权限 403、额度 429 和服务端 500。

### 历史缓存看起来为空

确认没有切换浏览器、端口、`localhost`/`127.0.0.1`。再检查 Git 克隆旁的 `APIplusWebtools-data/history.json`（ZIP 版为 `data/history.json`）或 AppData 回退文件。不要用空文件覆盖已有备份。

### 发给别人会带上我的数据吗

不要直接复制正在使用的工作目录。请发送 `npm run package` 生成的 ZIP，或让对方从 GitHub 干净克隆。分发包测试会自动检查敏感数据边界。

## 本机 Agent API

本版本提供仅限本机访问的 Agent 接口：

```text
http://127.0.0.1:4198/api/agent/v1
```

使用步骤：

1. 通过 [api-plus-agent Skill](skills/api-plus-agent/SKILL.md) 的 `scripts/run-workbench.ps1` 调用命令；服务未运行时自动隐藏启动，不需要打开浏览器。
2. 本机 CLI 不需要配置 Agent 令牌或本机 API。默认使用已配置的公司网关；可选的个人第三方集成仍沿用本机保存的配置。
3. Codex/Minimax Code 使用 [api-plus-agent Skill](skills/api-plus-agent/SKILL.md)，先调用 `capabilities`，再上传素材、提交并等待任务。
4. 为不同调用方设置 `API_PLUS_AGENT_SOURCE_CLIENT`、`API_PLUS_AGENT_SOURCE_ID`、`API_PLUS_AGENT_SOURCE_LABEL`，历史页可按来源筛选。

Agent 只能追加任务和记录，不能删除或覆盖历史；删除仍由人工在浏览器中执行。后台服务保存上传文件身份、Prompt、参数、原始输入、上游任务 ID、进度和结果。用 `history --task-id <id>` 查记录，用 `recreate <id>` 按原始输入重新抽卡；原提交的重试仍保持幂等。服务重启后已有上游任务 ID 会继续轮询；`submission-unknown` 不会自动重提。当前强制绑定 `127.0.0.1`。

旧的令牌客户端继续兼容；本机 CLI 无需令牌设置。详细命令和输入格式见 [Agent API reference](skills/api-plus-agent/references/agent-api.md)。

提供两种技能发布：`api-plus-agent` 完整包包含 `assets/workbench.zip`、Node 与许可证，适合其他电脑；`local-api-workbench` 是本机固定路径的轻量入口，不含工作台。构建方式见 [发布检查清单](docs/RELEASE_CHECKLIST.md)。完整可迁移包不会包含本机路径技能。
