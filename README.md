# Internal API Batch Local

本工具是一个本地浏览器批量调用页面。它只在本机启动一个 Node.js 静态服务，页面从浏览器访问，实际模型调用仍走页面里配置的公司 API Base。

当前版本：`v2026.07.16-omni-ui.1`

## 快速启动

1. 解压整个文件夹。
2. 双击 `Start_API_Tool.bat`。
3. 浏览器打开：
   `http://127.0.0.1:4198/?v=portable-20260716`
4. 左侧 `API Base` 填你的公司中转地址。
5. 用完后双击 `Stop_API_Tool.bat` 停止本地服务。

启动器会优先使用已安装的 PM2，以 `api-plus-webtools` 常驻运行并支持重复点击启动；没有 PM2 时会自动回退到最小化的 Node.js 进程，因此同事不需要安装 PM2。默认只监听 `127.0.0.1:4198`。停止时请使用 `Stop_API_Tool.bat`，它会先删除 PM2 应用，再安全检查 Node.js 回退进程。

## 环境要求

- Windows 10/11。
- Node.js 20 或更高版本。
- 如果电脑没有全局 Node.js，可以把 `node.exe` 放到本目录的 `runtime` 文件夹内，启动脚本会自动优先查找。
- PM2 是可选项；安装后启动器会优先使用它，无需为使用本工具单独安装。
- 如果要通过 Git 拉取更新，需要安装 Git for Windows。

## Git 安装与更新

推荐给长期使用者的安装方式：

```bat
git clone git@github.com:MizukiShigure/APIplusWebtools.git
cd APIplusWebtools
Start_API_Tool.bat
```

以后更新：

```bat
Update_From_Git.bat
```

或者手动执行：

```bat
git pull --ff-only
```

更新后如果本地服务正在运行，先执行 `Stop_API_Tool.bat`，再执行 `Start_API_Tool.bat`。

## 版本回退

每个稳定版会打 Git tag，例如：

```text
v2026.07.16-omni-ui.1
```

查看所有版本：

```bat
git tag --sort=-creatordate
```

回退到某个版本：

```bat
Restore_Version.bat
```

或者手动执行：

```bat
git checkout v2026.07.16-omni-ui.1
```

回到最新版主线：

```bat
git switch main
git pull --ff-only
```

## 改端口

默认端口是 `4198`。如果端口被占用，可以在命令行这样启动：

```bat
set PORT=4300
Start_API_Tool.bat
```

然后访问：

```text
http://127.0.0.1:4300/
```

## 数据保存位置

历史缓存会保存两份：

- 浏览器 IndexedDB：页面读取速度快，但会受浏览器/端口/站点数据影响。
- 本地磁盘备份：优先写 `data/history.json`，用于浏览器缓存丢失后的恢复。
- 如果工具所在目录不可写，会自动改写到当前用户的 AppData：
  `%APPDATA%\Internal_API_Batch\history.json`

注意：`data/history.json` 保存的是上传/生成记录、URL、prompt、模型参数等结构化信息，不保存视频/图片文件本体。

## 打包分发

双击 `Make_Portable_Package.bat` 会生成一个 zip 包。也可以从命令行指定目标文件：

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-portable.ps1 -OutputPath C:\Temp\Internal_API_Batch_Portable.zip
```

默认输出位置：

```text
dist\Internal_API_Batch_Portable_v2026.07.16-omni-ui.1.zip
```

把这个 zip 发给同事即可。对方解压后运行 `Start_API_Tool.bat`。

便携包只包含程序文件，`data` 与 `runtime` 目录只保留空占位文件；不会带出浏览器缓存、历史、队列、Prompt、主体记录、API Key、日志、测试文件或规划笔记。包内 API Base 默认为空，由使用者在浏览器中自行填写。

注意：zip 包适合一次性分发；如果希望后续直接拉取更新，请让用户用 `git clone` 安装。

## 常见问题

- 打开的是空缓存：确认是否换了端口、浏览器、`localhost/127.0.0.1`。如果 `data/history.json` 存在，页面启动时会自动合并恢复。
- 页面打不开：确认本地服务窗口还在，或端口没有被其他程序占用。
- API 请求失败：确认当前电脑网络能访问公司 API Base。
