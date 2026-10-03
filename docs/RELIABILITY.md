# Reliability and ZenMux account controls / 可靠性与余额控制

Implemented in source after 0.1.8. Existing 0.1.8 installers do not contain these changes.
本次改动在源码中；已有 0.1.8 安装包尚未包含。

## Settings / 设置

Open AI Settings → Balance and generation budget. Create a separate Management API Key at https://zenmux.ai/platform/management and save it in the application. Do not paste keys into issue reports or project files.
打开「AI 设置 → 余额与生成预算」，在管理页面创建独立 Management API Key，并在应用内保存。普通生成密钥不能查询余额。

- Balance: `GET /api/v1/management/payg/balance`, reads `data.total_credits` in USD.
- Monthly PAYG cost: `GET /api/v1/management/cost`, UTC month, `BIZ_MTH`, `type=cost`, `bill_types=metered,fallbackMetered`. Personal directly-created management keys are required by the cost endpoint.
- Optional API Key resource ID filters cost. This is an ID, not the secret token. Without a filter, cost includes the entire account, not just OpenCut AI.
- Enable background refresh (default 300 seconds, minimum 60), low-balance alert, stop threshold, monthly cap and per-request estimate cap. Configure model prices per second or request. Unknown amounts are displayed as unknown.
- Limits stop new local submissions; they cannot cancel provider billing, control other clients, guarantee final charges, or defeat billing-report lag. Exact per-task actual charges are not inferred from account totals. Previously accepted jobs may still be billed after cancellation.

可设置自动刷新间隔、低余额提醒、停止提交阈值、月度上限和单次预计费用上限。模型单价按秒或按次配置，生成面板显示估算。没有价格时明确显示未知，可选择拦截。账户总费用不能冒充本应用或单个任务的实际花费。客户端预算不能保证服务商账单硬上限。

## Recording / 录屏

Desktop recording appends and fsyncs one-second chunks under the app's `recording-recovery` directory. Web recording commits separate chunks in OPFS. There is no silent fallback to an unlimited in-memory buffer. A slow-write backlog stops recording and retains committed data.
录屏按秒持久化，写入或编码失败会停止并保留已提交数据。在录屏面板查看恢复列表，可导入当前项目、下载备份或明确删除；成功导入并保存项目后才清除恢复文件。

The main panel and compact recording controls show near-black, muted-source and per-audio-track silence warnings. Black or silent content can be intentional, so these warnings do not independently discard a recording. Missing requested system audio fails explicitly. Source audio ending reports a fatal warning and saves remaining tracks.
主面板和右下角控制条显示黑场、来源无数据和各音轨持续静音提示。正常黑画面或静音不会自动删除作品。系统音轨缺失、编码和磁盘写入失败会明确提示。

Limits: final import still constructs a File/ArrayBuffer and may require memory proportional to recording size. Recording is browser MediaRecorder WebM, not an asserted CFR transcoding pipeline. Crash fragments are retained but every interrupted WebM is not guaranteed decodable. Recovery imports separate tracks at the current playhead; align related tracks at the same position. Long real-device recordings and cross-platform permissions need further integration testing.
限制：最终导入仍会构造整个文件，长录制可能占较多内存；没有宣称全部录屏已转换为 CFR。异常片段保留但不保证每个残缺 WebM 都可解码。恢复相关分轨时应放在同一播放头位置。

## Tasks, files and credentials / 任务、素材与凭据

The IndexedDB task journal records submissions before network dispatch and provider IDs/responses before decode or polling. A known job resumes queries/downloads; an unknown submission blocks automatic paid resubmission, including new-version requests. Associate a provider task ID or explicitly acknowledge after checking provider records. This is local duplicate protection, not provider-side idempotency or exactly-once billing. Query failures use bounded retry/backoff; cancellation stops waiting.
任务中心保留恢复状态，提交结果未知时阻止重复付费请求。已完成素材落库后立即记录素材 ID，导入失败可复用已保存原文件。显式生成新版本保留旧素材，AI 库可预览和复用。

Space management displays AI library, recording recovery and browser quota usage, lists library files in pages of 20, supports downloads before cleanup and rejects deletion of storyboard, character/continuity-reference or unfinished-task assets. Imported project media remain separate copies. Internal storyboard asset enumeration still uses getAll; content deduplication is not implemented. No age-based automatic deletion is performed.
空间面板显示占用、分页管理、下载备份及引用保护；项目素材另存副本。内部部分分镜枚举仍读取全库，目前没有内容去重和按时间自动删除作品。

Desktop credentials use Electron safeStorage: macOS Keychain protection, Windows DPAPI or a supported Linux keyring. Linux `basic_text` and unavailable encryption are refused. Credentials are never returned by the IPC interface. Main-process requests validate allowed routes and media CDN redirects. Legacy generation credentials migrate out of IndexedDB. Web credentials retain the documented browser AES-GCM boundary; page scripts can use them.
桌面密钥由系统保护，主进程代发允许的请求；渲染进程拿不到已保存密钥。浏览器版本仍有页面脚本可用凭据的边界。

## Continuity / 续接

Enable the outgoing shot switch, preview its video and choose a clear frame for the next shot; default is its final visible decoded frame. Selected frames are saved losslessly as PNG in the local library. Reference text explains that generation uploads these pixels to the provider. Unsupported image-reference routes reject continuity. Frame selection avoids visibly poor endings but is not automatic blur detection or a guarantee against accumulated drift. Aspect-ratio/crop controls are not yet a dedicated continuity workflow.
开启本段续接后可播放选帧、预览并保存为下一段参考；也可恢复默认末帧。PNG 不会额外引入 JPEG 损失，但不能消除原视频已有压缩和连续生成漂移。当前没有自动模糊检测和独立续接裁切面板。

## Validation / 验证

Rust AI policies: 22 tests. Isolated AI/management/journal/MCP suites, recording lifecycle tests, native persistence/credential/media-route tests, TypeScript and optimized Web build pass. Local editor UI verifies the settings/task/storage sections. Provider balance/cost responses are mocked in tests; no real management key or paid generation was used for validation. These checks do not imply long recordings or Windows/Linux hardware capture passed.
