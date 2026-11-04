# ACL-1：Agent 能力发现与 Inspect

提供 `capabilities search/inspect/examples`。CLI 与后续 MCP 复用 `src/capabilities/index.ts` 的 TypeScript 服务。查询基于现有 P4 搜索、Manifest、R1 记录及 Kit 元数据，不维护新的注册表、语义引擎或安装系统。

## 搜索创作函数

```powershell
frameweave capabilities search "辉光"
frameweave capabilities search "glow" --include-low-level --json
frameweave capabilities search "puppet" --limit 20 --offset 20
frameweave capabilities search "滤镜"
frameweave effects search "glow" --mode keyword
```

`capabilities search` 在 `data.functions` 返回函数名、层级、说明、命名导入、调用片段、匹配分数及所属包的精确版本和指纹。`data.items` 保留 P4 效果摘要。旧 Web 后端条目从两种搜索中排除，仍可按精确版本查询历史清单。`effects search` 保留数组格式，函数命中带 `resultType: "function"`。交互终端显示调用片段和安装状态，`--json` 保留结构化字段。函数例子是调用片段，可能需要 Stage 上下文和其他导入。

默认列出 `authoring` 函数。官方元数据来自审核过的条目和已随包交付的创作指南，指南里的条目须对应真实公开导出。加 `--include-low-level` 可查看 `low-level` 和 `reference`。后者取自官方绑定清单，暂无独立示例，`example` 为 `null`。`exampleKind: "project-file"` 表示该示例是包内工程文件。短英文词按词匹配，例如 `lut` 可以命中 `cubeLut`，而 `puppetFlutter` 中间的字母不会构成命中。

官方目录随发行包提供，源码工作区通过 `node --import tsx modules/pro-animation/scripts/build-catalog.ts` 构建。搜索和 `packages install` 使用同一官方目录。可安装的官方结果给出固定版本、指纹和来源审批信息，搜索本身不会批准来源或安装包。

第三方 Native R1 包可以在包根附带 `frameweave.functions.json`，安装到程序库后无需重建索引即可搜索。也可用 `capabilities search --catalog <目录>` 查询尚未安装的本地包。索引随包做完整性校验，作者应填写公开命名导出与匹配的调用片段。搜索读取文本，查询成功只表示找到了元数据。

用 `frameweave capabilities search "水晶"` 查找可直接调用的预设，或用 `--kind preset` 只查预设。JSON 在 `data.presets` 返回预设名、所属函数、导入和调用示例，`presetPage` 提供分页信息。SDK 已收录 `spatialVfxStage` 接受的全部场景与图像处理选项，依赖上游图像的条目会显示接线要求。

R1 包可以在已有的函数元数据条目中添加可选 `presets` 数组。每项含 `name`、`description`、`example` 和可选 `tags`。预设沿用所属函数的导入路径、包版本和安装状态。新增剪辑或音频预设时，由发布者在包中声明元数据。

目录生成时会静态读取所有正式包的公开 TypeScript 声明，并附上每个包的内容指纹。函数结果里的 `signatures` 来自实际声明，包含参数名、类型、可选性和返回类型。创作指南提供的输入输出说明在 `contract`。查询通过 `apiGroups` 返回公开工厂或回调对象上的方法及真实访问路径，精确搜索方法名可查看它的签名。`entrypoints` 返回 SDK 和源码创作入口。函数分页使用 `functionPage.total`、`nextOffset` 和 `--offset`。官方目录可以用创作指南、目录级类型索引和审核过的介绍来补充信息。已发布库的内容指纹保持原样。

同一次构建也从 SDK 的 `package.json#exports` 生成带 SDK 指纹的索引。`sdkReferences` 显示可导入的 SDK 函数及其签名，`sdkPage` 提供分页信息。精确函数名可直接查询，扩大 SDK 参考范围可加 `--include-low-level`。图像处理、剪辑和空间特效的高层入口会提供单独的说明。

```tsx
import {spatialVfxStage} from '@frameweave/engine/spatial-vfx';
export const fire = spatialVfxStage('flameVolume', {heat:1.5});
export const fog = spatialVfxStage('heightFog', {density:0.1});
// Connect the fog Stage to the fire Stage through inputs={{image:ref('fire')}}.
```

`packages install` 默认安装到 Frameweave 安装目录下的 `.frameweave/library`，源码工程可直接使用已安装的 Native 命名导出。搜索用「程序库已安装」显示该状态。已有工程级锁继续优先。若要把旧工程里锁定的库复制到程序库，使用 `packages share <id> --project <entry>`。

源码工程可以放置 `frameweave.requirements.json` 声明最低版本。检查已安装版本时不会联网。需要变更本机版本时执行 `packages install "spatial-creation>=1.1.0" --trust local:frameweave.spatial`。

```json
{"schemaVersion":1,"requirements":{"spatial-creation":">=1.1.0"}}
```

```json
{
  "schemaVersion": 1,
  "functions": [
    {
      "name": "orbitCard",
      "level": "authoring",
      "description": "给卡片添加环绕运动",
      "example": "orbitCard({ radius: 40 })",
      "tags": ["环绕", "orbit", "card"]
    }
  ]
}
```

## 命令与数据

```powershell
# npm 的 --silent 用于去掉 npm 自身的启动横幅。
npm run --silent frameweave -- capabilities search "glow" --mode keyword --limit 5 --json
npm run --silent frameweave -- capabilities search "文字依次弹出" --mode semantic --offline --json
npm run --silent frameweave -- capabilities inspect fw.glow@1.0.0 --project work/project.tsx --json
npm run --silent frameweave -- capabilities search "lyon" --catalog examples/rust-bindgen --json
npm run --silent frameweave -- capabilities inspect kit.bindgen-lyon@1.0.0 --catalog examples/rust-bindgen --json
npm run --silent frameweave -- capabilities examples kit.bindgen-lyon@1.0.0 --catalog examples/rust-bindgen --json
```

终端默认使用可读格式，`--json` 显式选择结构化输出。命令必须有一个带引号的 query 或精确 `id@version`；不接受无版本 ID 并暗中选择 latest。`--project` 接受工程文件/目录/Capsule，默认当前目录；`--catalog` 可重复，最多 16 个**显式本地 R1 目录**。查询不承诺远程库存在，也不返回远程安装 URL。

Search 默认 `keyword`，可显式选 `semantic/hybrid`。三种模式直接调用现有 `searchPlugins`，分数/过滤/拼写容错保持原样；`limit` 为 1–100，默认 10。过滤参数沿用 P4：`kind/engine/input/output/compatible`。`--platform web|node` 是待评估的目标平台，不是当前浏览器探测结果。查询最多处理 256 个目录包、512 个已安装 P4 条目（显式目录候选另计），超预算明确失败。

Inspect/Examples 接受 `--integrity sha256-...`，校验搜索结果的内容身份。Examples 的 `limit` 为 1–5，默认 3；Inspect 最多返回两条经过检查的示例。无 `--all-docs`，不会返回整个模块库文档或 index.ts。

结果 envelope 和退出码见 [共享结果 v1](AGENT_TOOL_RESULT_V1.md)。CLI 的 0 表示查询成功，**不表示可以立即执行**。

## 身份、状态与信任

搜索结果是第一层摘要：`identity/name/description/kind/source/trust/availability/locks/requirements/assessment/dependencies/commands/ranking`。

- `identity.reference` 沿用精确 P4 ID；`integrity` 是 R1 canonical package hash（有包时）或 legacy P4 plugin hash，`integrityKind` 区分两者。`pluginIntegrity` 保留 P4 锁身份。不会用 API 文本摘要代替内容哈希。
- 来源区分 bundled builtin、project、user 和 package；路径来自实际发现记录，用户库短路径/别名用 realpath 判断。R1 authority 与实际配置中的 trustedSources 对照。legacy 来源没有 R1 trust 记录时返回 `not-recorded`，不伪造批准。
- `availability.installed` 只由当前项目的实际 P4/R1 发现决定，显式目录候选为 false。状态为 `not-installed / missing-dependencies / blocked / requires-lock / eligible`。
- `eligible` 只表示已知的安装、平台、依赖和锁检查满足；所有查询均标 `runtimeVerified:false`、`assessment.execution:not-verified`。查询不启动浏览器，不证明插件实现能执行，也不证明当前主机支持 GPU/Worker。
- 锁通过现有 `registry.verify` 和 R1 `installedPackages` 检查。缺失/过期锁不会自动写入；包篡改或缺失按现有 R1 错误拒绝。因 ACL 源码增加导致 SDK pin 改变时，旧锁应明确过期，查询不会改锁。
- `requirements.hostAuthorization:["allowWasm"]` 只描述需求；查询不接受 `--allow-wasm`、不设置 Renderer 权限。Worker 详情区分元数据声明的 `moduleSupport` 与当前未探测的 `hostSupport`，Kit `configuredMode` 不是当前主机证明。

`commands.install` 是现有 `packages install` 的 argv，带精确版本和单包完整性，未批准的来源显式标 `requiresSourceApproval:true`。它是供审阅的候选命令，不是授权或自动执行请求；R1 在真正安装时继续验证所有依赖/来源/平台。查询只对当前已信任来源做原有 resolver 的只读检查，不添加 authority。依赖候选在其他目录中不等于已安装；可能需要先用原有 R1 处理依赖。Capsule 不能安装新包，必须回作者工程修改再导出。

P4 摘要与 R1 函数索引独立。`coverage.packageOnlyCount/packageOnlyDescriptors` 记录显式目录中没有 effect 描述的包，即使这些包的函数已能通过 `data.functions` 发现。P4 inspect 对无 effect 描述的显式目录包返回 `E_CAPABILITY_DESCRIPTOR`，包级信息可通过 `packages inspect` 读取。

## 按需 Inspect

第二层返回选定模块的完整说明、原始参数定义、端口、资源哈希、R1 模块信息、可选 API、示例及声明的限制。

`parameters.schemaVersion` 为现有 1/2；`definitions` 原样来自 Manifest。默认值、范围、必填数组、嵌套对象和数组元素类型均保留，不扁平化、不创建竞争参数系统。`ports` 保留现有 P4 输入输出。资源通过现有路径边界检查并返回实际 SHA-256；选定业务数据最多 128 KiB、资源最多 128 个，不能截断 Schema 冒充完整数据。

Kit v2 `generated/agent-api.json` 存在时读取其真实签名/JSDoc/错误/环境；校验 schemaVersion、精确 p4Reference 和参数 Schema。已知 wasm-bindgen profile 还与实际 `dist/generated/module.d.ts` 对照方法。缺失时为 `api.state:missing`；陈旧/不一致元数据为 `E_CAPABILITY_METADATA`。元数据来源路径和哈希同时返回。Kit 的函数签名如实表示 wasm-bindgen Engine 声明层；generated/api.ts 的异步适配和 P4 TSX 参数层仍由各自既有接口负责，不把 Engine 方法名当作新的 CLI 执行能力。未声明的限制返回 `not-declared`，不自动生成模型摘要。

选定记录在读取 API/资源/示例后再次核对包或插件哈希，检测读取期间的变动。下一操作仍应携带预期内容身份，查询结果不是跨时间锁或执行租约。

## 示例的真实性

仅使用 Manifest `examples`，或已识别 Kit v1/v2 的 `demo/project.tsx`。普通模块缺少这些来源时明确 `E_CAPABILITY_EXAMPLES_MISSING`；旧 `effects info` 的合成 fallback 不用于 ACL-1。

返回格式：`tsx-expression` 是作者提供的 pipeline step（需要其端口上下文）；`tsx-project` 是作者提供的完整 Kit demo。返回原始文本和来源哈希，不把裸表达式伪装成完整工程。

校验：精确引用 → 参数字面量提取 → **现有** `parameters/v2Parameters`（keyframes 使用官方 helper）→ **现有** `typecheckProject`。只允许可明确检查的字面量与 SDK keyframes，不求值任意函数、不解析并执行用户模块。示例代码依赖只支持公开 SDK imports；其他代码 imports 或不能静态解析的动态参数明确 `E_CAPABILITY_EXAMPLE_UNSUPPORTED`，不声称已验证。检查不执行场景，也不复制/验证任意场景素材；素材是否齐全仍需原有 build/render 流程检查。校验状态分别报告 exact / p4-static / TypeScript passed / execution not-run。失败诊断映射到作者来源路径、示例索引和内容哈希，避免随机临时目录让重复错误不稳定；类型诊断行列对应只读校验视图。

不导入 Frameweave 源码的独立消费者：`scripts/acl-1-consumer.mjs`。它只通过 CLI JSON 搜索、inspect、examples，核对身份后写出获得的完整 TSX。由外部提供 CLI launcher，消费者没有 SDK 导入或源码读取：

```powershell
$env:FRAMEWEAVE_CLI_JSON = '["node","--import","tsx","C:/path/to/frameweave/src/cli.ts"]'
node scripts/acl-1-consumer.mjs work/project examples/rust-bindgen/lyon lyon work/project/project.tsx
```

消费者不安装或渲染。验证脚本 `scripts/verify-acl-1.mjs` 在专项测试通过后，显式批准本仓库示例的 R1 authority，运行原有安装/锁定/PNG/storyboard/MP4 命令，并验证默认 WASM 仍被拒绝。没有实现 AnalysisTask、渲染或预览的新公共协议。

## 搜索模型与 Windows 缓存

继续使用 `src/plugins/search.ts::embeddingModel` 的固定 Xenova multilingual MiniLM revision、CPU q8、384 维及既有 `search-v1.json`。ACL 查询固定 offline，不自动下载；缺失/打不开时保留 `E_SEARCH_MODEL`，详情提供 `--mode keyword` 的机器 argv。不会静默换搜索模式。

本工作区存在真实缓存，但长路径使原生 ONNX Runtime 报 file-does-not-exist。采用**同一工作区目录**的 NTFS 短路径后，现有 P4 和 ACL 离线语义测试均可运行；未下载/替换模型。测试写入仍位于本工作区 `.frameweave/user-home`：

```powershell
$fs = New-Object -ComObject Scripting.FileSystemObject
$env:FRAMEWEAVE_HOME = $fs.GetFolder((Join-Path (Get-Location) '.frameweave/user-home')).ShortPath
node --import tsx --test tests/capabilities.test.ts
```

其他环境使用其已准备的固定缓存；需要首次获取模型时，显式调用原有 `effects index`。原生模型加载错误可能是缓存缺失或文件系统路径限制；不要伪造权重或改变固定 revision 来绕过错误。搜索结果不包含原始向量。

## 复用清单与实现边界

| 能力 | 实际复用入口 | ACL-1 的最小工作 |
|---|---|---|
| 发现/优先级/版本 | plugins/registry.ts::projectPlugins, PluginRegistry | 内存查询视图加显式本地 R1 effect 候选，不持久化 |
| 关键词/语义/hybrid | plugins/search.ts::searchPlugins, keywordScore, embeddingModel | 限定输出投影、模式透明、缺模型提示 |
| Manifest/参数 | plugins/schema.ts, parameters-v2.ts | 返回原定义并验证示例，不修改 Schema |
| 包/信任/依赖/锁 | packages/manifest.ts、manager.ts::installedPackages/resolvePackages | 读取/验证事实，候选 argv，不安装 |
| SDK/P4 锁 | registry.ts::readLock/verify | 报 missing/stale/verified，不刷新 |
| API | Kit v2 agent-api.json + module.d.ts | 校验、按需投影，允许旧插件缺失 |
| 示例类型 | compiler/typecheck.ts::typecheckProject | 有界临时校验，不执行 |
| 错误 | core/errors.ts::EngineError/diagnostic | 小型共享传输 envelope |

独立服务/接线点：`src/capabilities/index.ts`、`cli.ts::capabilitiesCLI/runCapabilitiesCLI`。公共 `src/cli.ts` 仅新增 import、分派和三行 help，可在统一集成时独立接线。未修改其他工作区、TVG、P4 ABI、Stage DAG、时间语义、安全策略、R1 格式、旧搜索实现、AnalysisTask 或 GPU 契约。

验证日志位于 `artifacts/acl-1`；最终交付记录列出提交、测试结果和明确未验证范围。当前不实现 MCP Server，不声称支持任意作者的外部示例依赖或通用 R1 JS 导出反射。
