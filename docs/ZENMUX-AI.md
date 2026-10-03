# OpenCut Classic：ZenMux AI 接入

实现位置：本目录的 `apps/web/src/ai`、`rust/crates/ai`、`scripts/mcp.ts`。当前主仓库已重写且没有可用编辑器，因此按用户选择使用官方 `opencut-classic`。

## 本地启动

```sh
cd /Users/nellertcai/OpenCut/opencut-classic
bun install
bun run build:ai
cd apps/web
bun run dev
```

访问 http://localhost:3000/projects，新建项目。进入编辑器左侧 Settings → ZenMux AI，保存自己的 API Key。没有 Key 可使用 https://zenmux.ai/invite/GBQMC5 。

本次验证创建了仅用于本地开发的 `apps/web/.env.local` 占位配置，该文件不纳入 Git；它不能用于线上登录、数据库、音效搜索或博客服务。部署时应填写原项目要求的真实环境变量。已构建的 AI WASM 文件包含在 `packages/ai`，普通前端启动不需要再次安装 Rust 构建工具；改动 Rust 后才需要 `build:ai`。

## 功能

- 设置页：AES-GCM 加密保存 API Key，密码框遮蔽，模型新增、重命名、删除，邀请链接和模型目录查询。
- AI 剪辑：基于素材名称、类型、时长，以及可选的最多 12 张本地缩略图提出片段顺序与裁剪方案。明确显示缩略图会发送到 ZenMux；完整视频与音频不会自动上传。先预览，再追加到当前场景；一次撤销。校验媒体 ID、非负入点、正时长及源范围。项目/场景切换后不可误用旧方案。
- 生图：OpenAI Images 与 Google Gemini 两套协议；解码 Base64 或下载返回文件。
- 生视频：MiniMax 原生异步任务，15 秒轮询、停止等待、刷新后续查；Google Omni 非流式 Interactions 视频输出。
- 本地 AI 素材库：保存 Blob 文件而非临时下载链接。可以跨项目复用；复用时经过现有解码和媒体入库流程。原素材比例保留，现有 renderer 按画布 contain 缩放；AI 剪辑应用保留项目的画布、FPS 设置。
- MCP：stdio 服务桥接本机打开的编辑器，不把浏览器 API Key 返回给 MCP 客户端。

“永久本地保存”指浏览器保存期间长期留存；清理站点数据、换浏览器/域名或存储驱逐仍会删除数据。请求了浏览器持久存储权限。AES 密钥不可导出但与密文存放在同一个浏览器，页面脚本仍可解密使用；不是操作系统钥匙串。ZenMux 请求通过同源代理转发，服务端不持久化或记录 API Key。

## 模型研究（2026-10-02）

公开文档和模型页面的完整限制并不一致。未公布或未验证的参数默认不发送；接口最终以供应商校验为准。本次没有真实 Key，没有进行收费生成验证。

| 模型                                   | 已确认接口                                                                          | 比例 / 尺寸 / 时长情况                                                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai/gpt-6.1-sol`                   | `/api/v1/chat/completions`                                                          | 模型目录确认 text 输出与 image 输入，可用于剪辑规划。                                                                                                                                           |
| `anthropic/claude-sonnet-5.5`          | OpenAI 兼容 Chat Completions                                                        | 模型目录确认 text 输出与 image 输入。                                                                                                                                                           |
| `openai/gpt-image-2.5-flare`           | `/api/v1/images/generations`                                                        | 模型存在且输出 image；Images 文档支持 `size`。完整 2.5 尺寸范围未公布，不把 GPT Image 2 的 4K 范围套用于 2.5。                                                                                  |
| `openai/gpt-image-2.5-sunburst`        | `/api/v1/images/generations`                                                        | 同上；默认为平台默认尺寸，支持传入自定义尺寸并由平台校验。                                                                                                                                      |
| `google/gemini-3.1-flash-image`        | `/api/vertex-ai/v1/publishers/google/models/gemini-3.1-flash-image:generateContent` | 模型页确认 Gemini 协议与 `imageConfig` 参数，输出 text/image；通过 `imageConfig.aspectRatio` 请求比例。完整允许比例与像素范围仍待实测。替换最初提供的 `flash-lite-image` 名称。                 |
| `minimax/minimax-h3-max`               | `POST /api/v1/videos`，`GET /api/v1/videos/{id}`                                    | 模型页明确 **480p、768p**，支持文生视频和图生视频；本次 UI 实现文生视频。提供 `ratio`、`duration`、`resolution`；比例集合与完整时长范围未公布。费用页面约 $0.05–0.08 / 生成秒，非最终账单保证。 |
| `google/gemini-omni-1.1-flash-preview` | `/api/v1/interactions`                                                              | 模型页确认 Interactions、text/video 输出及不支持 streaming。比例与时长缺少明确硬参数，所以只作为提示词偏好，UI 明确不保证一致；不会套用 Veo 的 `predictLongRunning`。                           |

额外模型名称可保存，但必须兼容当前适配器的调用协议：通用模型 Chat Completions；Google 生图 Gemini；其他生图 OpenAI Images；Omni 视频 Interactions；其他视频原生 Videos。自定义模型并不意味着任意厂商协议都能自动转换。模型目录查询显示是否列入目录，“未列出”不等同于不可用；Omni 的公开模型页面与 `/models` 列表存在差异。

来源：

- https://zenmux.ai/docs/guide/advanced/openai-image-generation.html
- https://zenmux.ai/docs/guide/advanced/image-generation.html
- https://zenmux.ai/docs/api/zenmux/generate-videos-native.html
- https://zenmux.ai/docs/api/vertexai/create-interaction-native.html
- https://zenmux.ai/docs/api/vertexai/generate-videos.html （用于区分 Veo 协议，未用于 H3/Omni）
- https://zenmux.ai/api/v1/models
- https://zenmux.ai/minimax/minimax-h3-max
- https://zenmux.ai/google/gemini-omni-1.1-flash-preview
- https://zenmux.ai/google/gemini-3.1-flash-image

## MCP 配置

在 MCP 客户端中配置（替换令牌）：

```json
{
	"mcpServers": {
		"opencut": {
			"command": "/Users/nellertcai/Library/Application Support/reflex/bun/bin/bun",
			"args": ["run", "scripts/mcp.ts"],
			"cwd": "/Users/nellertcai/OpenCut/opencut-classic",
			"env": {
				"OPENCUT_MCP_TOKEN": "your-local-connection-token",
				"OPENCUT_EDITOR_ORIGIN": "http://localhost:3000"
			}
		}
	}
}
```

浏览器 Settings → ZenMux AI 填写同一个令牌并开启 MCP。默认桥接地址 `ws://127.0.0.1:3008/editor`；只绑定 loopback，校验令牌和编辑器 Origin，同时只允许一个编辑器连接。适用于本机开发服务。线上 HTTPS 页面连接此本机 WS 可能受浏览器混合内容策略限制，当前不提供公网桥接。

手动运行 `bun run mcp` 可查看连接信息（写到 stderr），但正式 MCP 客户端应自己启动 stdio 服务，避免两个进程争用端口。MCP 客户端可通过编辑器保存的 Key 产生收费生成、读取素材元数据和修改当前项目，因此只启用可信客户端。

工具：`list_project`、`list_library`、`generate_asset`、`propose_edit`、`apply_edit`、`reuse_asset`、`undo`。`propose_edit` 返回 planId，`apply_edit` 只允许应用绑定到原项目/场景的方案。`includePreviews: true` 可让剪辑规划包含最多 12 张素材缩略图；默认 MCP 只使用元数据。断开会取消等待，已提交的原生视频任务仍保留在本地待查询列表。

## 验证与边界

```sh
bun run test:ai
bun x eslint apps/web/src/ai apps/web/src/app/api/zenmux
bun x tsc --noEmit --incremental false --types bun --project apps/web/tsconfig.json
```

新增 Rust 测试验证真实请求构建、返回解析及非法剪辑方案；Bun 测试使用隔离的 IndexedDB 和 HTTP/编辑器模拟，验证凭据、二进制素材保存、代理边界、MCP 初始化及工具分派。浏览器已验证编辑器入口、AI 表单、模型设置，以及测试密钥刷新后持久化且仍遮蔽；测试密钥已清理。

上游全量 `bun test` 在接入前已有 WASM 加载问题、缺失导出和时间线测试失败；在独立的未修改 HEAD 副本上重现为 157 pass / 9 fail / 3 errors；包含新增 5 项 Web 测试后为 162 pass / 9 fail / 3 errors，失败项相同。完整 TypeScript 检查还有上游 keybindings、storage migrations、stickers 与时间线测试的类型错误。本次新增生产代码单独 lint 无错误。真实生成、实际素材下载 CDN、供应商严格参数限制及剪辑播放效果仍需用真实 Key 做端到端验证。

媒体下载首先尝试浏览器直接下载；遇到 CORS 时通过同源代理访问允许的公共素材 CDN，每次重定向都检查域名，不转发 ZenMux Key 到 CDN。未列入允许列表的 CDN 会报错，不能静默假定素材已保存。

模型目录端点公开可访问，目录刷新成功不能证明 API Key 权限有效；真正生成请求会由平台校验密钥和余额。

## 桌面应用与中英文

已新增 Electron 桌面壳，复用完整编辑器。开发时从仓库根目录运行：

```bash
cd /Users/nellertcai/OpenCut/opencut-classic
bun run dev:desktop
```

开发桌面窗口使用 `http://localhost:3000`；没有运行中的 Web 开发服务时会自动启动。关闭桌面窗口会停止它自行启动的服务。已有 Web 服务不会被关闭。

构建本机 Apple Silicon 的独立 macOS 应用：

```bash
bun run package:desktop
open "dist-desktop/mac-arm64/OpenCut AI.app"
```

独立应用内置 Electron / Node 和生产编辑器服务，无需另开终端或安装 Bun。首次启动将内置 Web 文件解压到应用本地数据目录，监听 `127.0.0.1:3002`。构建按版本更新运行文件，浏览器存储仍保留。当前产物供本机使用，未配置发行签名和公证。

设置 → 外观与语言 / Settings → Appearance & language，可以选择中文、English 和跟随系统 / 亮色 / 暗色。选择保存在当前应用本地，立即应用，重新打开仍保留。项目内容、素材名称、模型 ID 和原始提示词不随界面语言改写。剪辑、图片和视频请求会加入所选语言要求，AI 摘要及需要生成的文字、字幕或对白采用该语言；用户明确指定的其他语言优先。编辑器不再展示首次 Welcome / Beta 引导弹窗。

Web 浏览器和桌面应用使用独立的存储配置，项目、API Key 和生成素材不会自动从浏览器迁移到桌面。MCP 默认接受本机 Web（3000）和独立桌面（3002）两种来源，仍要求连接令牌。若要限制只允许独立桌面，可在 MCP 客户端配置中增加：

```json
"env": { "OPENCUT_EDITOR_ORIGIN": "http://localhost:3002" }
```

或在终端手动调试：

```bash
OPENCUT_EDITOR_ORIGIN=http://localhost:3002 bun run mcp
```

桌面业务逻辑仍通过原有 Rust / WASM 实现。语言偏好属于客户端设置；模型请求中的语言指令在 Rust AI 模块构建，MCP 和 GUI 使用同一条生成路径。

桌面打包使用本地 Inter 字体，不依赖 Google Fonts 下载。字体授权文件位于 `apps/web/src/app/fonts/INTER-LICENSE.txt`。

## 分镜导演、人物卡片与音频（2026-10-02）

- 接入 Editorial Vision Studio 的 MIT 风格规划与视觉记忆工作流，原文和许可保存在 `rust/crates/ai/vendor/editorial-vision/`，分发许可在 `public/licenses/`。
- 支持 AI 规划、手工分镜、单镜头生成、按顺序生成。失败保存到对应镜头，后续镜头继续，重试保留完成素材和场景首帧；未完成的视频任务优先继续轮询。
- 人物最多 3 个：规划模型从剧本提取人物外貌与服装设定，或用户手工添加。每个人物生成独立的正面、侧面、背面三视图。每个镜头可绑定多个角色。
- 绑定人物时，Gemini 生图请求实际携带 `inlineData` 图片参考；视频先生成单幅场景首帧，再通过 ZenMux 原生 `content.image_url` 和 `role:first_frame` 图生视频。卡片和首帧均保留在本地 AI 素材库。重新生成角色卡片会清除尚未完成镜头的旧首帧关联。
- MiniMax H3 Max 模型页明确支持图生视频，Reference Generation 尚未开放。三视图参考经过首帧生成能加强一致性，不能保证绝对不漂移。Gemini Omni 的当前接入未验证图片参考参数，因此人物绑定视频任务会明确拒绝该接口。
- ZenMux 模型页面未提供 H3 Max/Omni 完整时长限制，因此不会假定官方最大时长。在 AI 设置中为每个视频模型填写平台支持的“模型单镜头最长秒数”（1–30 秒）；规划提示词携带此限制，既有未生成分镜可按限制拆分。实际视频请求发送该镜头时长，最终时间线按真实素材时长裁切。
- 新 MCP 工具 `split_storyboard`、`generate_character_card`；`generate_storyboard_assets` 支持 `shotId` 单镜头和 `referenceModel` 场景生图模型。
- 原编辑器已支持多音轨、多文件音频导入、剪切、裁切、移动、音量及静音。新增音频属性中的“音频淡入（秒）/音频淡出（秒）”，以片段局部时间计算线性振幅包络，播放、波形和导出共用 Rust 计算；音频和视频原声均支持。片段变短时淡入淡出自动限制在片段范围内。
- 特效着色器改为明确的 switch 分支和振幅混合，修复色彩特效缩略图全黑；开发版已实际看到黑白、棕色等效果差异。

验证：Rust 的模型请求字段、三人物限制、分镜拆分、淡入淡出、着色器检查通过；TypeScript 与 MCP/存储/语言测试通过。未使用真实 ZenMux API Key 进行收费生成，人物视觉一致性与各模型实际输出需要通过真实生成评估。

参考：https://zenmux.ai/docs/api/zenmux/generate-videos-native.html；https://zenmux.ai/minimax/minimax-h3-max

### 默认生图 / 生视频模型

在“AI 设置 → AI 模型与密钥 → 默认生成模型”分别选择默认生图和默认生视频模型，自动保存到本机 `opencut-ai-settings.defaultModels`。AI 素材生成和分镜导演默认采用该选择；任务中手动选模型仍优先。人物参考首帧限 Gemini 生图接口，默认生图模型不兼容时仍采用已配置 Gemini 模型。删除默认模型后回退到同类可用模型；重命名默认模型会同步更新默认关联。旧设置没有默认字段时沿用原先第一项模型。

已验证默认选择重新加载后保留，以及分镜生图/视频两种任务采用各自默认值；默认关联回退和旧设置兼容测试通过。
