# ACL-3 Render Inspection 交付报告

日期：2026-10-29（Asia/Shanghai）。工作区：用户指定的 `agent-3`；分支 `agents/agent-3`；同步基线 `452fcd8ad3c6ad35722b3dd4f09c24e59a8581c1`。未执行 Git 同步、重置、切换分支或合并。

## 现有设施审计与实现

基线已经有真实 TSX 直接预览、frame/storyboard/render、类型检查、TVG/端口校验、Renderer 随机帧和 Stage 缓存、结构化诊断、包/插件完整性、视频编码解码、GPU helper 与 golden 测试。已有 CLI JSON/PNG sidecar 可以读取，但没有统一的紧凑检查响应、图像允许列表读取、Alpha/背景差异、跨检查报告配对和持久轮次预算。

本轮没有重写已有命令或执行语义。`modules/render-inspection` 提供共享 Node 服务，CLI 与未来 MCP 可以调用同一实现。当前没有实现或声称安装了完整 MCP Server、ACL-1/2 Module Registry 或 AnalysisTask。

| 文件 | 内容 |
| --- | --- |
| `inspect.ts` | 复用真实编译器、包校验、TVG 与 Renderer，紧凑摘要、顺序/重复帧、PNG/Storyboard、结构化反馈。资源哈希复用已有流式 helper。 |
| `images.ts` | 内容哈希、RGBA 哈希、尺寸、真实路径校验；MCP 风格图像内容块；临时 token 保护的本机图像读取。 |
| `compare.ts` | RGBA8、MAE、Alpha、黑/白合成差异、热图、容差、维度/媒体/策略差异与缺失帧处理。 |
| `session.ts` | 1–5 次持久检查预算、单项目/并发约束、修订和差异报告；不编辑源码。 |
| `types.ts`、`common.ts`、`index.ts` | 公共类型、既有 Diagnostic 的定位扩展、限制/修复建议、共享入口。 |
| `cli.ts` | 参数/JSON/退出码薄适配，可独立接线；公开 image/serve/iterate/compare。 |
| `src/cli.ts`、`src/node.ts` | 总计 6 行新增接线/帮助/API 导出，原有执行入口和分支不改。 |
| 两份例子、两份测试文件 | 故障/修复 TSX、独立规则测试及真实 CLI/浏览器/MP4 集成。 |
| README/PROTOCOL | Agent 使用、机器协议、图像访问边界、ACL-1/2 接线和未实现范围。 |

没有修改 TVG Schema、P4 ABI、Stage DAG/端口、动画、Renderer、预览服务器、CSP、WASM/GPU Host、包管理器或权限策略。新增图像 HTTP 服务只交付已声明的 PNG，不是通用文件服务器。

## 实际验证

先运行独立专项，再运行真实端到端：

| 验证 | 结果 | 证据日志（`artifacts/render-inspection/`） |
| --- | --- | --- |
| 独立图像/安全边界/预算/公共 Node API | **7/7 通过** | `unit-tests.log` |
| 真实工程/CLI/浏览器/视频 | **5/5 通过** | `e2e-tests.log` |
| 最终帧后端元数据和修复流程加强复测 | **2/2 通过** | `final-render-check.log` |
| 最终类型检查 | **通过** | `typecheck.log` |
| 相关核心/编译器/端口/Renderer/P4/R1/GPU 回归 | 初次 **111/112**；SDK 锁原因确认和显式更新后，原失败项 **1/1 通过** | `regression.log`、`regression-lock-retest.log` |

12 个专项用例全部通过；加强复测不额外计入专项数量。相关 112 个用例均已在相应最终状态验证，但没有把初次含失败的日志伪称为一次全绿执行。没有重新运行整个仓库所有测试。

实际覆盖：

- 正确工程无需启动浏览器即可完成编译/资源/图摘要；执行帧时才创建 Renderer。
- 缺失图片指向真实资源路径；非法视觉参数、TS 类型错误、缺失插件、SDK 锁不匹配返回既有稳定 code 和可用源码/Stage/帧位置。SDK 锁错误测试同时确认检查不改锁。
- 帧请求 `12,0,6,0` 保持顺序与重复，重复帧 RGBA 一致且记录 Stage 缓存命中；预览策略仍输出实际 PNG，并记录策略和未探测项。
- 独立进程可解析 JSON、实际解码 PNG；允许列表、改字节、未知 ID/版本、路径穿越、符号链接和 token 访问测试通过。
- 对比使用解码像素；透明 RGB、Alpha、黑白合成、维度不一致、容差、JPEG 显式策略、实际 MP4 拒绝、缺失图像和不同策略 review 均验证。
- 既有 frame/storyboard/render CLI、直接 TSX 交互预览的 `/state` 和真实 PNG 获取通过；视频完整解码。保留原有命令行为。
- 既有 WASM 默认拒绝保持有效；同一最小预编译 WASM 只有显式 `allowWasm:true` 才渲染成功，工具不会自动授权。

命令见测试日志；主要执行形式：

```powershell
node --import tsx --test tests/render-inspection.test.ts
node --import tsx --test tests/render-inspection-e2e.test.ts
node --import tsx --test --test-concurrency=2 tests/core.test.ts tests/compiler.test.ts tests/input-contracts.test.ts tests/runtime.test.ts tests/packages.test.ts tests/plugins.test.ts tests/gpu-effects.test.ts
node --import tsx --test --test-name-pattern='shared Energy Vortex' tests/plugins.test.ts
npm run typecheck
```

## 真实修复例子

`examples/render-inspection/before.tsx` 故意把红色圆点裁切在左边，并在第 6 帧抛出 `E_DEMO_LAYOUT`。检查产生实际第 0、12 帧 PNG 和可定位的 `E_STAGE_RENDER`（原始错误保留在消息中），Stage=`marker`、frame=6、源码位置为真实 before.tsx。

调用方修正为 `after.tsx` 后，同样三帧均真实渲染成功，错误数组为空，青色标记完整并随帧移动。前后报告生成实际差异图和黑/白背景 Alpha 预览；第 6 帧标明 recovered，没有虚构其旧截图。持久会话第三次调用因 2 次预算耗尽被拒绝；源码仅由测试调用方编辑，检查前后哈希证实服务未改写。

另使用公开 CLI 对持久例子运行 before/after/compare，并用原有 render 生成 MP4。`public-proof.json` 标识交付目录及退出码（1/0/1），JSON 均可独立解析。固定影片为 **160×90、12 FPS、13 帧、约 1.08 秒，完整解码通过**；时长是既有 probe 的两位小数显示。最新帧元数据更新后的报告与同一未改动 after.tsx 所生成的影片一起交付，不把有损 MP4 解码像素要求为 PNG 零差异。

已打开实际 before/after Storyboard、差异图和白底 Alpha 图检查：错误帧未伪装成截图、红点裁切明显、修复后圆点完整，热图与 Alpha 区域相符。这里的人工检查不代替保存的原始 JSON、PNG、哈希和视频。

## SDK 锁处理

新增 CLI/Node 接线使既有 SDK 指纹从 `f560b9de…2591` 变为 `377c9ef4…72f2`，导致 Energy Vortex 回归触发 `E_PLUGIN_LOCK`。先逐项对比 candidate 与原锁，确认所有插件版本、内容哈希和依赖完全相同；然后明确执行现有 `effects lock --project` 更新 first-project/reuse-project 两份示例。

这两份文件仅改变 `runtime.integrity`，没有手改或跳过哈希、没有变更插件身份/依赖。审计完整对象保存在 `sdk-lock-audit.json`。其他锁没有自动更新。**检查服务本身只读锁文件**；三个 ACL 工作区合入后还需按最终组合 SDK 指纹统一审查相关锁，不能把本分支指纹假设为集成后的指纹。

## 明确的限制与集成事项

- 未实现完整 MCP Server。现有共享函数已可直接调用，图像内容块/token URL 可供授权的外部视觉工具消费；仅返回引用不代表模型已看到图像。
- 没有审美评分、自动编辑、自动基线接受或自动影响帧推断。异常是技术规则候选，Agent 需打开图像并判断修复是否符合意图。
- GPU auto 不代表已确认物理 GPU；浏览器版本/GPU 设备没有通过现有 Renderer 公共 API 暴露，报告如实标为未探测。跨环境/策略只提供度量和 review，不能承诺跨机器零误差。
- 原有 Stage 桥仍把任意图形/自定义异常包装为 `E_STAGE_RENDER`，原 code 留在消息中。无法可靠提供原生 Stage 行号时只给验证存在的源码文件，不伪造行号。
- 编译执行仍是原有受信任本地项目模型，不是对恶意 TSX 的新沙箱。项目自行编写的顶层副作用不在工具“未自动编辑”的保证内。
- MP4 不直接做逐帧基线对比；需明确提取 still。JPEG 只在显式授权有损策略及容差下比较。
- 其他未运行示例的 SDK 锁未刷新；未验证全仓回归、非 Chromium 浏览器、所有自定义后端、远程多用户服务或其他 ACL 尚未提交的协议。
- 公共接线只有 `src/cli.ts` 的动态分支和 `src/node.ts` 导出，若 ACL-1/2 也修改这些入口，集成时组合独立适配器即可。无需更改核心契约或重建 Registry/AnalysisTask。

最终提交仅在当前独立分支；不自动合并 Main。完整文件和提交 Hash 见交付 `CHANGESET.json`。
