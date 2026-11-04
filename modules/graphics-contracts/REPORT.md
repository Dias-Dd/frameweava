> 历史分支报告：当前 Main 的整合、复测和同步结果见 [Agent 2 / 3 整合验收](../../AGENTS_2_3_INTEGRATION_REPORT.md)。

# Shared Graphics Data Contracts 初始 v1 交付报告

历史记录：以下是最初 `6561ba1` 的交付状态。当前正式模块、统一 Reader、R1/npm 分发和 C3 验证见 [STABILIZATION_REPORT.md](STABILIZATION_REPORT.md) 与 [PUBLIC_API_V1.md](PUBLIC_API_V1.md)。

日期：2026-10-29（Asia/Shanghai）。分支：`agents/agent-3`。开发基线：`9dbf886fe0bb0ffc86961d247417136c580e2197`。全部实现位于 `modules/graphics-contracts/`；没有同步 Git、重置分支、合并 Main 或操作其他工作区。

## 实现与边界

交付 [GRAPHICS_SCHEMA_V1.md](GRAPHICS_SCHEMA_V1.md)、明确 TypeScript 类型、严格 Validator、内容完整性验证、转换器、跨模块例子与独立自动化测试。

| 文件 | 修改内容 |
| --- | --- |
| `types.ts` | Path、Mask、Mesh、Skeleton、TextLayout v1；复用 MVP Track 类型。 |
| `check.ts`、`validate.ts` | 有界 JSON 预检、Schema/版本/未知字段、坐标、有限数、ID、矩阵/权重、文字 Cluster 等校验。 |
| `resources.ts` | 原始字节 SHA-256/长度、缺失和冲突资源、去重、解析前校验与字节快照。 |
| `track.ts` | 冻结 MVP 数据的完整边界校验、原版查询复用、显式素材时间到 Stage 数据投影。 |
| `path-mask.ts` | M/L/Q/C/Z 转换、px/normalized 转换、Canvas Mask 栅格化、RGBA8 Alpha/Luma 解码、明确边界采样。 |
| `experiments/` | 独立 Vector、Mask、Track Reader、Marker 模块；例子生成器与证据拼图工具。 |
| `examples/` | Path JSON、真实 Track 文件及精确身份、可编译 TSX 工程、专业模块接收边界。 |
| `tests/`、`tsconfig.json` | 15 项数据/兼容/错误测试、3 项真实渲染集成测试、包含类型反例的独立类型检查。 |

现有 Json/Resource/PortRef/Stage、递归动画求值、参数 Schema v2、模块/SDK 完整性、隔离浏览器、编码器均复用。没有修改 `src`、现有插件、TVG 核心 Schema、P4 ABI、Stage 端口、包管理器、CSP/WASM/GPU、AnalysisTask 或既有锁。原型 Track 源码与数据只读使用。

本次不需要任何 TVG/P4 修改。未来可另行评审包导出名和接受 Schema/version 的能力声明；这些不是当前实验的前置条件。

## 实际运行

专项 `18/18` 通过：15 项数据测试和 3 项真实浏览器/渲染集成测试。最终补充的真实插值点渲染 `1/1` 通过；它是原 Track 集成测试的加强复测，不额外计成第 19 项。

- Path：独立生产者输出版本化 PathData，消费者只依赖公共契约。真实 json 端口和经哈希验证的 file Resource 均完成传递。128×96 输出中，evenodd 中心透明、nonzero 中心不透明，内部白色 Alpha=255、外部 Alpha=0，曲线边缘存在分数 Alpha。归一化坐标、px 坐标和开放子路径隐式填充闭合的 RGBA 全部零容差一致。
- Track：读取原 MVP 真实 MediaPipe 交付文件，35978 字节，SHA-256 `7a8b35155ed646379b9e9de7d3e6a6fe9557d5cbb7bc6dcc5522a571edb728b2`。64 个样本、7 个缺失；不重新运行模型、不复制视频或模型文件。
- Track Reader 在精确/半间隔/任意顺序、linear/nearest 和显式 gap 参数下与原 `queryTrack` 比较。默认策略保留缺失与身份/间隔限制，不跨遮挡插值、不外推。
- 真实 Stage：首帧、4 秒中间帧、尾帧、缺失帧、`0.3125s` 有效插值点、重复/乱序帧都检查输出和标记像素。`0.125s` 缺失观测及 `7.9375s` 无包围点时，Marker Surface 的 Alpha 全为零。每个有效视频帧的 x/y 都与原 Reader 对齐。
- 编码并完整解码 `Graphics-Contracts.mp4`：128×96、16 FPS、128 帧、8 秒。独立新 Renderer 的乱序帧 RGBA 零容差一致。影片本身为有损编码，不声称其解码像素与原 PNG 相同。
- 已人工查看首帧、缺失帧、中间帧和拼图，确认标记、孔洞和边缘；未将仅类型检查通过算作端到端完成。

运行命令：

```powershell
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit -p modules/graphics-contracts/tsconfig.json
node --import tsx --test modules/graphics-contracts/tests/contracts.test.ts modules/graphics-contracts/tests/render.test.ts
node --import tsx --test --test-name-pattern='B: frozen real' modules/graphics-contracts/tests/render.test.ts
```

原项目全量回归使用独立库与两个测试文件并发：

```powershell
$env:FRAMEWEAVE_HOME = '\\?\' + (Join-Path (Get-Location) '.frameweave/user-home')
$regressionFiles = (Get-ChildItem -LiteralPath tests -Filter '*.test.ts').FullName
node --import tsx --test --test-concurrency=2 $regressionFiles
```

原项目全量回归 **227/227 通过，0 失败、0 跳过**。完整结果与既有文件/锁完整性记录见 `artifacts/graphics-contracts/verification.json` 及 `regression.log`。核心类型检查和本模块类型检查通过；两者均运行，根 tsconfig 本身不包含新独立模块。

## 证据

本工作区 `artifacts/graphics-contracts/` 中包含：`module-tests.log`、`interpolation-render-test.log`、`regression.log`、`path-mask-proof.json`、`track-animation-proof.json`、各 PNG、`storyboard.png`、实际 MP4。拼图为已验证 PNG 的最近邻放大，加标签显示；像素断言始终使用原始 128×96 渲染图。

## 已知限制与后续接口

- Mesh/Skeleton/TextLayout 是**静态契约**；仅校验/序列化与专业接收边界经过测试，没有实现或验证蒙皮渲染、IK、文字塑形、字体表解析、Glyph 是否确实存在、Three/Pixi/GPU 导入器。测试用的最小字体字节只验证完整性管线，不能当作真实字体渲染证据。
- Mask v1 无非零羽化、时序 Mask、SDF；只支持既定 RGBA8/sRGB/straight-alpha 和 Canvas 矢量栅格化。跨浏览器/GPU 的边缘像素一致性未验证。
- Mesh v1 只交换 Rest Mesh；当前变形姿态、拓扑重建、控制点算法和高级材质属于专业模块私有 Schema。TextLayout 只覆盖水平 ltr/rtl，不隐式塑形、排序或替换字体。
- Track Reader 依赖当前仓库冻结的纯 `prototypes/analysis-job-mvp/track.ts`。没有接入尚在开发的 C3，也没有保证 C3 未发布格式兼容。C3 后续可保留 `analysis.track/1` 或提供显式适配器；不得修改微秒、缺失值或分段 ID 行为来迎合本模块。
- 资源引用必须结合显式 resolver 验证实际字节；没有 Registry、自动下载或默认文件系统/网络权限。原 MVP 的媒体/模型/帧哈希保留为来源记录，缺少对应文件时不会谎称验证这些文件。
- 当前交付是相对于此引擎基线的独立源码模块，并非已发布 npm/R1 包；包身份、能力搜索、完整导出/跨机器安装等发布接线未验证。旧引擎不需要升级 ABI 才能运送 JSON，但必须安装/携带对应 Validator 才能理解新格式。
- 私有 Marker motion 投影只是实验模块间的局部适配，不是新的公共动画/Track Schema。公共跨模块格式仍然是已版本化的 Path/Mask 与原 MVP TrackData。
