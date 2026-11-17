# 安装、同步与选择性合入

仓库：<https://github.com/MizukiShigure/APIplusWebtools>。`main` 是维护者发布的版本。每台电脑使用自己的工作台进程、浏览器和私有数据；GitHub 同步源码与 Skill，不同步使用记录。

## 第一次交给 Agent

可以直接复制这段话给目标电脑上的编码 Agent：

> 请克隆 https://github.com/MizukiShigure/APIplusWebtools.git 到我指定的项目目录，阅读 AGENTS.md 和 docs/GIT_WORKFLOW.md，配置工作台及 api-plus-agent Skill。Windows 运行 Setup_Workbench.ps1；其他系统安装 Node.js 20+ 后运行 node scripts/workbench-manage.cjs setup。选择你实际支持的 Skill 发现目录，完成 capabilities 和网页检查，告诉我本地网址、数据目录和 Skill 安装位置。保留已有安装、记录和配置。

Windows 命令：

```powershell
git clone https://github.com/MizukiShigure/APIplusWebtools.git
cd APIplusWebtools
powershell -NoProfile -ExecutionPolicy Bypass -File Setup_Workbench.ps1
```

也可以双击 `Setup_Workbench.bat`。脚本复用 Node.js 20+；缺少时从 `nodejs.org` 下载 Node.js 24 的 Windows x64/ARM64 ZIP，并核对官方 SHA-256 清单，保存到本项目的 `runtime`，无需管理员权限，也不改变全局 PATH。不需要 npm 依赖或 PM2。下载需要能访问 Node.js 官方网站；受限网络可由 Agent 预先安装 Node.js 20+，或使用可信的完整便携包。

默认安装到 `~/.codex/skills/api-plus-agent`。其他 Agent 应使用它实际支持的目录，例如：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Setup_Workbench.ps1 -SkillsDir "$HOME/.agents/skills"
```

自定义端口和数据目录使用 `-Port 4300 -DataDir 'D:\WorkbenchData'`。这些值保存在被 Git 忽略的 `.workbench-local.json`，后续启动和同步自动沿用。同名非本安装的 Skill 或人工修改过的 Skill 会被保留并报告；Agent 应先备份/改名或选择合适的发现目录，不能直接覆盖。

macOS/Linux 或已安装 Node 的 Windows 可运行：

```sh
node scripts/workbench-manage.cjs setup --skills-dir "$HOME/.codex/skills"
node scripts/workbench-manage.cjs doctor
node scripts/workbench-manage.cjs cli capabilities
```

Node 核心服务和管理脚本使用跨平台 API；Windows 是本次实际验证的平台，macOS/Linux 尚未实机验收。视频元信息探测、音频处理和字幕等可选功能可能还需要 FFmpeg/ffprobe 或第三方配置，详见 `docs/AVATAR_WORKFLOW.md`。能访问 YS API 是远程生成的必要条件，账号权限、模型额度及渠道可用性仍由网关决定。

安装成功后双击 `Start_API_Tool.bat` 或打开输出的网址。Agent 调用安装后的 Skill（Windows 可运行它的 `scripts/workbench.ps1`），或直接执行 `node scripts/workbench-manage.cjs cli capabilities`。每个任务填写真实来源 `API_PLUS_AGENT_SOURCE_CLIENT / SOURCE_ID / SOURCE_LABEL`。网页的历史缓存可以按 Agent 来源筛选、查看上传素材、完整 Prompt、参数和生成结果；Agent 面板提供任务状态。这里只记录通过工作台执行的操作，不记录 Agent 在其他软件中的全部行为。

## 首次填写网关，只记在本机

公开代码不内置真实网关地址。安装后的 Agent 必须检查 `capabilities.gateway.configured`；未配置时，引导用户打开本地网页，在左侧 **API Base** 填写管理员私下提供的完整网关地址。离开输入框后自动保存到私有数据目录的 `gateway.json`，网页与 Agent 共用，重启或“同步项目”后仍然保留。已有浏览器明确保存过的地址会在没有磁盘配置时迁移一次。

不方便用网页时，可让用户把地址放入本机私有 UTF-8 文本文件，然后执行 `node scripts/workbench-manage.cjs configure --gateway-file <私有文件>`。命令输出只显示已配置状态。不要把地址写进代码、公开说明、提交或公开对话，也不要从旧 Git 历史寻找地址。可选环境变量 `API_PLUS_GATEWAY_BASE` 优先于文件配置；启用时网页不能覆盖，需修改服务环境后重启。

任何人均可下载公开源码，但模型调用还需要可访问网关的内网环境及网关要求的权限、账号和额度。隐藏地址不代替访问控制。界面、Skill 和本地功能可独立安装；未配置时公司模型调用会提示先配置。

## 对 Agent 说“同步项目”

1. 读取本文件，执行 `node scripts/workbench-manage.cjs doctor`，识别当前安装。
2. 等待正在运行的网页任务完成，并关闭任务页面；保留浏览器配置和站点数据。服务端会检查 Agent/数字人任务，但无法读取关闭前尚未提交的浏览器本地队列。
3. 执行 `node scripts/workbench-manage.cjs sync`（Windows 也可双击 `Update_From_Git.bat`）。
4. 脚本检查 `main`、未提交文件、更新来源和提交分叉；从官方 `upstream`（优先）或 `origin` 获取更新，只执行 fast-forward。
5. 有更新时，拒绝运行中或状态不确定的任务；仅停止根目录和数据目录均匹配的本机服务。外部 PM2/系统服务自动重启时停止更新，让 Agent 检查并停止其所属服务。
6. 将磁盘数据备份到 `.workbench-backups/<时间-旧提交>/data`，再更新源码、启动新版服务、刷新已注册 Skill，返回前后提交号和备份路径。
7. Agent 重新读取最新 Skill，检查 capabilities，并让网页刷新加载新版。其他 Agent 的现有会话可能需要重新加载 Skill 或开启新会话。

更新不会执行 `reset --hard`、`git clean`、自动 stash、强推或自动提交。出现本地修改时，Agent 应先查看差异并保存到贡献分支，再处理同步；出现分叉时保留两个分支并进行有针对性的合并。不要为了更新丢弃本地工作。备份仅含磁盘数据，浏览器 localStorage/IndexedDB 依靠原浏览器、原 hostname 和原端口保留；更换浏览器前按部署文档单独导出。

已是最新版本时仍会核对服务及 Skill。新版本启动失败时保留当前代码、旧提交号及数据备份，Agent 应诊断或按原提交回退，不能删除私有数据。`doctor` 给出本地状态；没有自动后台拉取或定时推送。

## 别人的修改，由维护者选择同步到仓库

普通使用者可以匿名克隆公开仓库；向仓库写入需要 GitHub 权限。默认贡献流程是 Fork + 分支 + Pull Request：

```sh
git remote add upstream https://github.com/MizukiShigure/APIplusWebtools.git
git switch -c feat/my-change
# Agent 完成明确授权的修改、测试和差异检查
git add <明确审核过的源码文件>
git commit -m "Describe the change"
git push origin feat/my-change
```

Fork 用户的 `origin` 指向自己的 Fork，`upstream` 指向本仓库；没有 Fork 的使用者不需要改 origin。向 `MizukiShigure/APIplusWebtools:main` 发起 PR，描述修改、验证和限制。维护者可以让 Agent 查看指定 PR，选择合并、请求修改或关闭。只想取其中部分提交时，建立审核分支后 cherry-pick 指定提交并验证。没有维护者明确的合入指令，不把别人的修改直接推到主线。

维护者授权“上传当前更新”后，Agent 审核明确文件、运行测试及分发检查，再 commit/push `main`；其他电脑下次说“同步项目”即可取到。不要 `git add .` 上传运行目录；不得上传密钥、历史、Prompt、素材、日志、本机路径 Skill 或下载文件。上传前运行 `node scripts/check-public-source.cjs --staged`。

只下载 ZIP 是固定版本，不能 `git pull`；需要后续同步时使用 `git clone`。GitHub 同步不等于跨电脑共享历史，如需迁移私有记录，按部署指南单独备份并传输。
