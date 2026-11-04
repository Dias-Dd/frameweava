# V-SHARED Phase 2A：最小接口协调方案

状态：Main 已认可接口契约，**重叠核心文件仍待串行整合、尚未实施正式接线**；具体文件归属与结论见 `v-shared-phase2-integration/MAIN_COORDINATION.md`。

实际起点：`bb4c93820c22adb488af204329f4635866687da3`，`agents/agent-4`，工作树干净。已读 AGENTS、并行规范、DX 四 Agent 整合报告和原 V-SHARED 审计报告。当前分支有 DX Session/CLI/打包源码，未发现 PME Renderer、专业 Surface 或媒体格式实现；不能在该旧基线上宣称 PME 兼容。原 `docs/v-shared-validation/` 和原审计报告保持原样。

## 审计结论

1. Renderer 的 `renderFrame(frame,stageId?)`、`renderPreviewFrame`、`renderAt` 均无逐帧 props 参数。当前原型依赖 Renderer 持有可变 BuiltProject 引用。现有 props 已进入逐 Stage 缓存键，不能靠另设宿主 store 而不给 Stage 注入版本解决问题。
2. Renderer 返回 RenderedFrame 的时间点已经晚于所有所需 Stage、输出校验、合成和 PNG 检查；因此不需要增加任意回调式 commit hook，更不用修改 Compositor。
3. 原 DX Session 已有单一队列、资源/源码/锁/信任封印、Inspection 接口和 Renderer 生命周期。应将无浏览器依赖的事务协调器嵌入它，而不是继续扩张独立 SharedRenderSession。
4. 当前 DX `close()` 立即 stopped 并销毁页面；`cancel()` 调用同一 close。现有普通工程还允许资源变化重建、断连后下一请求重建。这些行为不能未经说明套到带历史共享状态的 Session 上。
5. iframe 的既有 MessagePort error envelope 已含 code，host.js 也将 code 附到 Error；Playwright 异常序列化丢失该自定义属性后 WebAdapter 用文本重新识别部分错误。应在 page.evaluate 内把错误转换成有界的结构化结果带回 Node，不通过文本识别共享故障，也不新建消息总线。
6. 包构建脚本遍历 src/modules，生成原生 ESM 并携带类型源，但当前 package.exports 未包含 shared-state。增加受控 export 后仍须真实 pack/install/tsc/执行，仓库内 tsx 不是发布验收。

## 请求协调的最小核心接口

### Renderer：只读的逐帧 props 附加输入

建议现有方法增加可选第三参数，原调用不变：

```ts
interface FrameExecution {
  readonly stageProps?: Readonly<Record<string, Readonly<Record<string, Json>>>>;
}
renderFrame(frame: number, stageId?: string, execution?: FrameExecution): Promise<RenderedFrame>;
```

约束：调用入队前复制并验证纯 JSON 数据、目标 Stage 存在、预算合理；一次请求只持有自己的不可变副本。覆盖仅作用于本次执行的 props，不改变 Manifest、DAG、输入边、引擎、资源或权限。在已有 authored props 求值后合并，合并后的值进入现有缓存键并传入已有 adapter；共享 envelope 仍为字符串，保留 `$expr` 等字面值。不得让可变调用参数在排队期间改变实际执行。

预计 Renderer 仅需入参捕获、传递到私有 render、合并 props 三处小改；验证/复制放独立文件。不得改 Surface、Compositor、GPU、编码或六种导出模式。preview/time 入口若尚不接受该输入，保持原签名；正式共享入口统一走 DX RenderSession 的 PNG renderFrame 路径。

### DX RenderSession：自动识别声明，复用同一队列和 Renderer

建议增加小型公共入口：

```ts
session.renderFrame(frame, {signal?, stageId?}) // PNG RenderedFrame；可选 shared 提交摘要
session.readShared(variable)                 // 排队的一致性读取
session.status()                             // 元数据；不伪装同步远程值
```

现有 inspect/renderFrames 复用同一 acquire/renderOne 路径：普通工程不创建共享协调器；只有编译结果含显式 SharedStage 声明时创建。所有新旧入口共同排队，调用 prepare 保持现有依赖与信任封印。共享事务 begin 在实际帧开始，产生上述 FrameExecution；Renderer 成功返回后校验 publication，再做没有 await 的原子 commit；抛错或取消则 abandon。Inspection 批次逐帧提交，后续文件写入/批次失败不会回滚此前成功渲染的帧事务；文档应明确帧事务与批次/文件操作的区别。

同一帧内依赖下游可见的是已被原 Renderer 接受的候选 publication，整个 Session store 要等整帧成功才提交。完整 identity/session/transaction/base revision/frame/cell version+value 进入 props 和缓存键。无关 Stage 保留缓存。普通 JS/DOM/Worker/外部副作用不回滚。

共享 Session 的源码/资源/锁/信任变化、Stage 超时、Browser 丢失：丢弃候选，诊断为需要显式重开，绝不带旧逻辑状态自动恢复新的 JS realm。普通 Session 保持已有恢复行为。`refresh()` 对已启用共享状态的实例应明确拒绝或要求重开，不能隐式重置。

**需要主会话决策的生命周期兼容点**：本轮要求 close 排空、cancel 立即中断；现有 DX close 与 cancel 都立即中断。建议统一为 graceful close + terminal cancel，并保留 close/cancel 并发幂等、创建中的清理。若普通 close 的既有立即中断语义必须保持，则需要明确过渡方式或仅为共享/新 raw API 启用排空，不能悄悄改变。此点在协调完成前不改。

既有 SharedRenderSession 可作为不在正式包出口中的过渡兼容入口；`create()` 应委托 DX，而不是再持有工程打开和信任流程。低层 fromBuilt 的保留/弃用与原型 8/8 测试迁移需标明，不把无封印的 built-only 工具称为正式入口。

### 诊断与发布

WebAdapter 在现有 evaluate 边界接回 `{ok,value|error}`，error 只含可序列化 code/message/stack 等有界数据；共享错误可保留稳定 `E_SHARED_*` 并在 details 中保留原因，普通错误的已有对外码保持兼容。IPC 方法与 iframe CSP 不改。具体是否需要在 host.js 补充原始 details，应以实现审计证明必要，尽量不改 bootstrap。

增加 `@frameweave/engine/shared-state` browser-safe authoring/type 出口；宿主仍用既有 `/render-session`，不公开第二套正式 Session。CLI 优先让现有 `frameweave session` 直接支持；frame/render 等旧入口若未接线，返回机器可读稳定 E_SHARED_HOST_REQUIRED，不能静默运行。公共 CLI 主路由/bin 不必新增命令。包接线和结构化诊断涉及 Agent-1 范围，需一并确认文件归属。

## 拟修改范围与 PME 冲突

| 文件/范围 | 用途 | 协调状态 |
|---|---|---|
| `src/render/renderer.ts` | 可选 FrameExecution，逐帧快照与缓存键 | 待协调，可能和 PME 重叠 |
| 新 `src/render/frame-execution.ts` 或等价辅助文件 | 受控复制/验证，无媒体实现 | 待确认核心命名 |
| `modules/render-session/index.ts` | 单一宿主、队列、共享事务、生命周期 | 待协调 |
| `modules/render-inspection/types.ts` 等最小适配 | 可选共享提交元数据；不变旧必需字段 | 待协调 |
| `src/render/web-adapter.ts`，必要时 server/bootstrap | 结构化跨 evaluate 错误，不改权限 | 待协调 |
| `package.json`、必要的公共类型出口 | shared-state export，沿用现有构建器 | 待协调 Agent-1 归属 |
| `modules/shared-state`、新增测试/示例/验证脚本/Phase 2 文档 | 抽出无 Renderer 生命周期的事务模块、负例与验收 | 可独立推进 |
| Surface/Compositor/GPU/Encoder/媒体格式/Stage DAG/P4 ABI | 不修改 | 不申请修改 |

核心源码与 package 改动会自然改变现有 SDK 内容指纹。**不修改 Runtime Pin 算法、不静默刷新任何现有锁**。需要主会话确认最终 SDK-only 锁审查由谁负责；在此之前，测试可用新建私有 fixture 的显式锁，旧锁不匹配必须如实报告，不能掩盖。

## 可独立推进与验收

协调期间先提取 `SharedStateCoordinator`：它只接收计划、frame、stageOutputs，返回不可变执行输入与已验证候选，提供原子提交/丢弃/失效/读取；不编译、不创建浏览器、不发 IPC、不建立队列。真实传输测试通过测试侧 closure 构造执行时 StageSpec 副本，使用既有 adapter 接口，不修改 Manifest 或核心文件；这仅证明独立模块，不冒称正式 DX 接线。

验收矩阵包括普通/共享工程、100→0→100→100、缓存开关、同层多 writer（不同变量）、多级依赖、未声明/重复 writer、非活动 Stage、Compositor/帧结束前故障、publication 校验、重试、真实 RPC 取消、close/cancel 竞态、信任/源码变更、超时与断连、类型与独立 npm 安装、PNG/MP4。PME 不在当前基线，暂列合并前待验证；不擅自合并更新。

本文件是供 Main Agent 协调的具体设计，不代表核心接口已获批准或正式集成已经完成。
