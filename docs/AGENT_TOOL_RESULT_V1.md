# Agent tool result v1 (ACL-1 / ACL-2 / ACL-3)

共享 TypeScript 契约：`src/agent/result.ts`。业务服务返回类型化数据并抛出原有 `EngineError`；CLI/MCP 边界调用同一个 `agentResult(operation)`，使用原有 `diagnostic()` 转换错误。没有新的错误类、权限服务、能力注册表或 MCP Server。

```json
{"schemaVersion":1,"ok":true,"data":{"operationSpecific":"data"},"diagnostics":[]}
```

```json
{"schemaVersion":1,"ok":false,"data":null,"diagnostics":[{"code":"E_PLUGIN_MISSING","severity":"error","message":"Plugin not found: author.module@1.0.0","details":null}]}
```

- `schemaVersion:1` 版本化顶层和该操作的数据结构。业务数据只含 JSON，不含函数、源对象实例、WASM Memory 或原始向量。
- `ok` 表示**查询/工具操作成功**，不等于模块已安装、已信任、已授权或已验证执行。调用方必须检查业务状态。
- 失败时 `data:null`；错误 `code/message/details` 位于现有 `Diagnostic` 中，`hint/stageId/frame` 按原契约保留。缺少详情时传输层输出 `details:null`，不另造 `error` 对象。
- CLI stdout 只有一个 JSON 值与换行；错误的可读摘要写 stderr。成功退出 0，失败退出 1。`emitAgentResult` 可注入 IO，服务无 console/process 状态副作用。
- MCP 适配直接调用服务并使用同一个 envelope；当前不实现 MCP Server。不要解析旧 effects CLI 的展示文本来构造另一套结果。
- v1 顶层字段固定；改变必需字段/语义须升版本。业务对象可以增加可选字段，消费者应忽略未知可选字段。
- 结构参考：[JSON Schema](protocols/agent-tool-result-v1.schema.json)。具体 capability 数据类型在 `src/capabilities/types.ts`；服务返回值由 TypeScript 推导。

模块身份沿用现有 `id@major.minor.patch`，不创建 ACL 专属 ID。ACL-1 的 `identity.integrityKind` 明确区分 R1 canonical package hash 与 legacy P4 plugin hash；两者统一加 `sha256-` 前缀供传输，不可互换。`pluginIntegrity` 对应 P4 锁的内容身份。`--integrity` 校验选定的主身份；安装、信任和锁写入继续由原有 R1/P4 服务负责。

ACL-2/3 接线方式：

```ts
import {agentResult} from '../agent/result.ts';
import {inspectCapability} from '../capabilities/index.ts';
const result = await agentResult(() => inspectCapability(reference, {project, expectedIntegrity}));
```

CLI 集成点：`src/capabilities/cli.ts::runCapabilitiesCLI(args, io?)`；纯解析/结果函数为 `capabilitiesCLI(args)`。合并公共入口时只需 import 与 `capabilities` 分派分支；其他 Agent 无需修改本模块。没有执行分析、渲染、安装或获取授权的隐式副作用。
