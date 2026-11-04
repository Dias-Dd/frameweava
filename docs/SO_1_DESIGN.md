# SO-1 最小契约与协调

2026-10-30，Agent-4；起点/本地 Main 都是 `4411d8dba0350f6bb84f33dc93deda312776bbb7`，工作树干净，无需额外同步。已读 MAIN_PME_SHARED_REPORT、旧 PME_SHARED 报告、AGENTS 和并行规则。新报告明确正式 V-SHARED 已接线，旧 Phase 2 未完成报告只是历史。

Main 两次确认：4411d8d 是可用基线；Renderer 与 PME-PERF/Agent-1 重叠，Session 要接 AU-1，暂不直接修改；公共出口由 Main 组合。Agent-4 可实施独立编排组件、测试和 V-SHARED 调用级最小扩展。具体确认见主会话协调 turn `01a18a58-2dbc-7b70-a823-0799b0343578`；不读写其他 Agent 工作区。

## 已有设施与缺口

- Renderer 的 evaluateFrame(stageId) 仍递归依赖闭包；不能拿它伪装“只执行目标”。Stage 输入复制、Adapter、输出验证、缓存均在共同 execute，SO-1 的最终接线必须复用这一份逻辑。
- DX 已有串行队列、前后封印、graceful close/terminal cancel。正式 run 应在这套队列内执行，不另外管理浏览器。
- V-SHARED 原 begin/complete 是完整 Composition 边界；需要明确 beginCall 的作用域，而非伪造上游 publication。

## 独立调用契约

`StageCaller.run(stageRef<I,O> | stageId, {inputs,frame?,time?,signal?,cache?:'none'})` 是内部集成组件，**尚不是正式 Session API**。Host 必须提供既有队列、封印校验、活性检查、实际 Adapter 调用及缓存失效钩子；组件不拥有 Registry/Browser/Cache/Queue。定义可以重复使用，普通 TS for/if 负责顺序；参考 TSX 同时包含定义与控制函数。

调用参数在排队前复制、验证、冻结。所有普通必需端口每次显式给出，即使自动 DAG 中原来有 literal/PortRef 绑定；optional 可以省略。PortRef 对象不会被解析成隐式依赖。只构造本次调用的输入视图，不改 Manifest。旧 DAG 环检测与调度不变。

frame/time 统一换算为原帧上下文，同时给出但不一致则拒绝；省略固定帧 0，不承接上次预览帧，不自动递增。保持 Stage 活动区间/时间映射，未加入音频 sample interval（归 AU-1）。

每次 run 有唯一 callId；输出按声明端口/类型校验，输入输出各沿用 FrameExecution 4 MiB JSON 预算，PNG/专业 Surface 仍校验实际内容。较大 Surface 是本原型限制，不改 PME 格式/全局预算。每次实际 invoke 都标记目标的 DAG 缓存身份失效，失败也如此，因为普通模块副作用可能已发生。首版 run 不缓存结果，拒绝 pure 请求；DAG 原 Cache 仍可用。pure memoization 留待明确纯度声明和共用 StageCache 身份设计，不能用静态 stateless 冒充 runtimeVerified。

## 调用级 V-SHARED

beginCall(stageId,frame) 复用同一 Session store、attempt/revision/cell version，Runtime 增加宿主 callStage。sharedFrame 在调用模式只读自己声明变量的已提交快照，不执行/伪造上游。临时输入视图去掉编译器生成的 managed 读取绑定；调用者不得覆盖该保留端口。complete 只接受目标 Stage 的输出，只提交它获准写入的变量；其他 writer 不要求执行。旧全帧 begin 行为不变。

输出验证和前后封印都成功，且宿主仍 active，才同步原子提交。第五次失败保留前四次提交；普通 TS、模块、DOM/Worker/文件不回滚。缓存旧 publication、跨目标快照、扩大 writer 作用域均应拒绝。

## 接线/冲突

Renderer 需共同单 Stage 执行函数与逐 Stage cache epoch（不改 Surface/Compositor/Encoder）；Session 需 run 入口复用 prepare/acquire/queue/seal/cancel。这两处只提供补丁，不直接编辑。AU-1 音频时间、FW-1 编译/默认输出、PME-PERF 像素复制与缓存实现保持其归属；package/bin/SDK pin 最终审查由 Main 负责。不刷新旧锁。

测试宿主只用于独立原型：从现有 Renderer 注册点借用真实 WebAdapter，复用既有封印工具；其队列不是正式 Session。DAG cache epoch 通过测试宿主的 FrameExecution props 模拟接线，不能声称生产 Renderer 已具备此策略。正式 SDK/CLI 入口未接线时须标为未完成。
