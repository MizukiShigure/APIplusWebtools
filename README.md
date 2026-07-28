# APIplusWebtools

本项目是一个本地浏览器批量生成工具。普通用户可以双击启动，开发者或编码 Agent 可以直接在同一个目录中阅读源码、运行测试并继续扩展。

当前版本：`v2026.07.28-engineering-package.1`

## 直接使用

环境要求：

- Windows 10/11。
- Node.js 20 或更高版本。
- 能访问你所使用的公司 API 中转或第三方服务。

启动步骤：

1. 解压整个文件夹。
2. 双击 `Start_API_Tool.bat`。
3. 浏览器会打开 `http://127.0.0.1:4198/?v=release-20260728`。
4. 在左侧填写自己的 API Base 和需要的运行配置。
5. 用完后双击 `Stop_API_Tool.bat`。

启动器优先使用已安装的 PM2，以 `api-plus-webtools` 常驻运行；没有 PM2 时自动使用最小化 Node.js 进程。同事不需要专门安装 PM2。

如果电脑没有全局 Node.js，也可以把 `node.exe` 放进本目录的 `runtime` 文件夹。

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
server.cjs                     本地静态服务、历史磁盘备份、RunningHub 代理
index.html / styles.css        页面结构与样式
*.test.cjs                     Node 合同测试
scripts/build-portable.ps1     隐私清理后的工程分发包构建器
data/                          本地历史备份目录，不进入 Git/分发包
runtime/                       可选便携 node.exe 目录
```

## 数据保存

历史缓存保存两份：

- 浏览器 IndexedDB：页面读取快，但受浏览器、端口和 hostname 影响。
- 本地磁盘备份：优先写 `data/history.json`。
- 如果项目目录不可写，回退到 `%APPDATA%\Internal_API_Batch\history.json`。

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
dist\Internal_API_Batch_Portable_v2026.07.28-engineering-package.1.zip
```

这个 ZIP 同时包含：

- 普通用户直接启动所需的页面、服务和批处理；
- 开发者/Agent 所需的源码、测试、`AGENTS.md` 与工程文档。

构建器采用明确白名单，并保留已批准的公司 API Base 与内置 RunningHub 节点模板。包内 `data` 与 `runtime` 只保留空的 `.keep`；不会带出浏览器缓存、历史、队列、Prompt、主体记录、API Key、用户导入的 RunningHub 配置、日志、本机路径或 Git 元数据。

## Git 安装、更新与回退

需要持续更新的用户建议用 Git：

```bat
git clone git@github.com:MizukiShigure/APIplusWebtools.git
cd APIplusWebtools
Start_API_Tool.bat
```

以后可以双击 `Update_From_Git.bat`，或执行：

```powershell
git pull --ff-only
```

查看版本：

```powershell
git tag --sort=-creatordate
```

回退可以双击 `Restore_Version.bat`，或执行：

```powershell
git checkout v2026.07.28-engineering-package.1
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

确认没有切换浏览器、端口、`localhost`/`127.0.0.1`。再检查 `data/history.json` 或 AppData 回退文件。不要用空文件覆盖已有备份。

### 发给别人会带上我的数据吗

不要直接复制正在使用的工作目录。请发送 `npm run package` 生成的 ZIP，或让对方从 GitHub 干净克隆。分发包测试会自动检查敏感数据边界。
