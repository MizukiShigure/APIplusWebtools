# 按渠道配置模型来源

工作台可公开下载。每位使用者配置自己的来源，是否能调用由对应服务的网络、账号、权限和额度决定。本项目不发放公司网关权限，不提供网关账号；隐藏地址也不能代替网关访问控制。

## 公司或兼容网关

1. 向管理员私下获取完整 API Base，确认当前电脑有对应内网/VPN/账号权限。公开项目不附带真实地址。
2. 安装并打开本地工作台，在左侧 **API Base** 填写地址，离开输入框后查看“已保存在本机”。不要自行添加或删除管理员要求的路径后缀。
3. Agent 运行 `capabilities`，确认 `gateway.configured: true`。地址保存在私有数据目录的 `gateway.json`，网页和 Agent 共用，重启和“同步项目”后保留。
4. 先检查连接和模型参数；需要实际生成时再按用户要求提交。能连接、已配置、成功生成是不同的验证结果。401/403 由上游管理员处理，填写地址不会授予权限。

API Base 对应本项目内置的接口协议，详见 [API 接入指南](API_INTEGRATION.md) 和 `capabilities`。其他来源只有在接口路径、请求参数、鉴权和返回结构兼容时才能直接替换地址。OpenAI 兼容地址、某厂商官方地址或任意中转地址不能仅凭 URL 就当成可用。需要新增适配时，先让 Agent 阅读该服务官方文档和现有适配器，明确模型映射，再实现并验证；公开测试使用虚构域名和模拟响应。

不方便使用网页时，把地址放入本机私有 UTF-8 文本文件，让 Agent 执行：

```sh
node scripts/workbench-manage.cjs configure --gateway-file <private-file>
node scripts/workbench-manage.cjs cli capabilities
```

该文件和地址不应提交到仓库。环境变量 `API_PLUS_GATEWAY_BASE`（兼容旧名 `API_GATEWAY_BASE`）可覆盖文件设置；启用时网页显示为只读，需要修改服务环境后重启。

## RunningHub

在左侧 **RunningHub 配置** 中填写自己的 API Key，选择或新建工作流配置，填写工作流/WebApp 标识并导入该工作流的 payload。核对动态节点与图片、视频、音频、Prompt、时长等输入的映射，然后选择相应 RunningHub 模型执行。预置节点模板不包含维护者的个人工作流 ID；每个工作流实际支持的功能由它的节点决定。

RunningHub 的凭据和工作流单独保存，不要把其 API Key 填进公司 API Base。只使用 RunningHub 自身接口的请求不需要公司网关；混合流程若先经公司接口上传素材、合成语音或生成图片，这些步骤仍需要公司网关。Agent 必须检查完整任务流程，不能仅看到 RunningHub 名称就保证所有步骤都独立。共享工作流详情见 [数字人工作流](AVATAR_WORKFLOW.md)。

## Suno

保留的旧版音乐页面提供两种模式：公司中转模式使用左侧 API Base；直连模式使用该页面的 **Suno API Base / Suno API Key**。该旧页面目前在主导航中隐藏，已有旧入口的用户可沿用；新安装不要把它当作已开放的新入口，应由 Agent 先核对页面入口和所需协议。直连只适用于本项目已实现的对应第三方协议，不表示 Suno 官方提供通用公开 API。按服务文档和当前页面支持的操作核对，不要把其他供应商的 Key 混填到这里。

音频任务页的 Suno 模型使用公司网关的封装接口，与音乐页直连模式不是同一个入口。Agent 选择任务前先检查所用页面/模型的具体协议和能力。

## 交给 Agent 的通用配置指令

> 请阅读 AGENTS.md、docs/GIT_WORKFLOW.md 和 docs/CHANNEL_CONFIGURATION.md，安装此工作台和你支持的 Skill。先询问我要使用公司兼容网关、RunningHub 还是 Suno 等来源，再按对应协议指导我把地址/凭据填在本机。不要猜测网关、从旧 Git 历史寻找地址或把真实地址、凭据写入源码和提交。检查 capabilities，分别报告本地配置、网络可达和实际生成的验证情况。以后我说“同步项目”，更新代码和 Skill 并保留所有本机配置、素材和记录。
