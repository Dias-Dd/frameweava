# Graphics Contracts v1 稳定化与 Track Reader 统一

日期：2026-10-29（Asia/Shanghai）。基线：`35b5e45`，分支：`agents/agent-3`。只在用户已同步的当前工作区开发；没有执行同步、重置、分支切换或合并操作。本报告是本轮实际运行结果，取代初始交付报告中关于 prototype/R1/C3 尚未接线的状态。

## 结果

Graphics Contracts 是正式纯库 `@frameweave/graphics-contracts@1.0.0`。发布产物包含独立 ESM、自包含 TypeScript 声明和文档，无外部运行依赖。R1 只是该产物的管理外层：`frameweave.graphics-contracts@1.0.0`、可信本地来源 `frameweave.foundation`，没有 effect、Stage 工厂或 AnalysisTask 执行要求。没有修改公共包格式、Loader ABI、TVG、P4、C3 调度或引擎版本。

正式 API 见 [PUBLIC_API_V1.md](PUBLIC_API_V1.md)，数据格式仍为 [GRAPHICS_SCHEMA_V1.md](GRAPHICS_SCHEMA_V1.md)。库可供普通 Node 工具、AnalysisTask 算法模块、Stage 或未来 Agent 适配层导入。文件读取、安装、锁定、任务执行归调用方；唯一的 Canvas 栅格化工具仅在显式调用时需要 DOM。

## 依赖审计与迁移

| 审计项目 | 之前 | 本轮完成 |
| --- | --- | --- |
| Track 类型 | prototype `track.ts` 定义 | `track-types.ts` 正式定义，`types.ts`/`track.ts` 公开导出 |
| 查询算法 | prototype 唯一实现，Graphics 依赖它 | 原算法逐分支迁入正式 `track.ts`，全仓生产代码只有一份实现 |
| Validator | Graphics 严格校验加 prototype 宽松 assertion | 正式 `validateTrackData` 为唯一规则，`assertTrackData` 调同一规则 |
| 旧入口 | 包含独立类型和查询源码 | 仅兼容转发；MediaPipe worker、Web Stage、demo、verify 已直导正式模块 |
| C3 公共层 | 泛型 Artifact/任务 API | 继续解耦，没有引入 TrackData 依赖 |
| R1 库管理 | 已支持无 effect JS/TS，锁平台固定 Web | 复用安装/校验/恢复；声明 Web+Node 的普通库，不伪装效果 |
| Graphics 包身份 | 无正式分发身份 | 标准 ESM 与无 effect R1 Manifest，两个身份对应同一产物 |

共享源码仍复用引擎中无 IO 的 JSON 校验与错误辅助函数；构建时打入纯 ESM，发布包没有指向 `src`、prototype、引擎或分析执行器的运行时 import。测试和例子使用引擎，只是消费者，不进入发布包。

兼容语义保持：微秒、素材时间、左闭右开范围、normalized 坐标、缺失值、segment ID、linear/nearest、默认 `2/sampleRate` gap、nearest 平距取左、无 bracket 和尾端策略。新测试采用迁移前真实 Reader 捕获的 **810 次查询固定摘要**，没有把兼容别名与同一函数自比当作历史证明。

旧 `assertTrackData` 曾放过缺少 metadata 的人工 fixture；现在会执行正式完整校验。测试 fixture 已补全合法元数据，没有放松校验。真实旧 MVP 和 C3 完整结果均保持可读。MediaPipe 模块的算法身份新增正式契约源哈希，会使未来新任务合法产生新缓存键；读取既有结果无需重跑推理。

## 本轮实际验证

| 测试组 | 结果 | 日志（本工作区 `artifacts/graphics-stabilization/`） |
| --- | --- | --- |
| Graphics 数据及原有 Path/Track 真实渲染 | **18/18** | `graphics-tests.log` |
| 新 C3 发布结果互操作与实际视频 | **2/2** | `c3-tests.log` |
| R1 / npm / 携带工程分发 | **3/3** | `distribution-tests.log` |
| C3 公共层、旧入口、已有 Analysis→Graphics 回归 | **26/26** | `analysis-regression.log` |
| 核心、编译器、端口、Runtime、R1 和已有 Agent3 集成 | **91/91** | `core-regression.log` |
| 引擎、Graphics、MediaPipe 生产模块类型检查 | **全部通过** | `engine-typecheck.log`、`module-typecheck.log`、`producer-typecheck.log` |
| 独立安装后的 ES2022-only 声明检查 | **通过**，`types:[]`、无 DOM/Node 类型包 | `distribution-npm-proof.json` |

本轮专项合计 **23/23**，相关回归 **117/117**。没有用历史全量测试数字作为本轮结果，也没有声称重新运行完整仓库所有测试。

Path→Mask 复跑覆盖 fill rule、单位转换、曲线 Alpha、Alpha/Luma、JSON 和 file Resource、字节完整性与浏览器像素。完整绘制、洞、边界和乱序帧比较通过。原 8 秒 Track 示例重新编码/完整解码通过。

C3 使用当前仓库 `docs/analysis-c3-validation` 中已完成真实 MediaPipe 任务的发布 Manifest 与 Track 文件：64 样本、7 缺失；Track SHA-256 为 `7e286a2915347b3c04602157939bc6be0c6e3b1f859decc0dbca81dbd47018b2`。检查文件格式、长度/哈希、cacheKey、source/model/algorithm/runtime 身份。`0.3125s` 有效插值、`0.125s` 缺失、末尾无 bracket、越界及任意顺序查询均通过。

真实 C3→Reader→Stage 影片为 128×96、16 FPS、128 帧、8 秒；全部帧坐标和实际标记像素经过检查，缺失帧完全透明，乱序/重复/新 Renderer 的 RGBA 零容差一致，MP4 完整解码通过。浏览器构建不包含 prototype 或 `src/analysis`；renderAt 没有运行分析或模型。已查看首帧、缺失帧、插值帧 PNG。

## 安装与可携带性

实际完成：

1. 从独立构建目录按预期内容哈希安装 R1 普通库，精确锁到 1.0.0。
2. 隐藏原作者构建目录后，通过安装快照在无 DOM 的独立 Node 进程调用所有主要公开 API。
3. 跨项目复制配置和锁，以已验证快照为 catalog 冻结恢复；锁文件字节不变，查询结果一致。
4. 修改已锁定包 JS 后，`verifyPackages` 明确返回 `E_PACKAGE_INTEGRITY`。
5. 离线 npm pack/install，禁用脚本、网络 Registry 不可用；无引擎安装仍能运行，声明正反例检查通过。
6. 安装包的 Validator 在真实 Stage 中出错时，原 `[E_GRAPHICS_VERSION]` 和 `$.version` 保留；遵循既有宿主 `E_STAGE_RENDER` 包装。Node 按 `code/details.path` 识别，不依赖跨 bundle 的 instanceof。
7. 默认隐藏 `.frameweave/packages` 的源码树/capsule 导出失败被显式断言为 `E_COMPILE`。这是当前导出器丢失 `./` 的限制，没有修改核心绕过。
8. 正常安装后把已有配置 store 改为 `./vendor/packages`，用**原锁**执行 frozen restore，再验证快照。源码树和 capsule 均在原工程隐藏后完成 5 个乱序帧 RGBA 零容差比较。

发布目录：`artifacts/graphics-stabilization/package-final/`；标准离线安装包：`frameweave-graphics-contracts-1.0.0.tgz`。最终产物再次实际 R1 安装和校验通过；哈希、文件清单与回执见 `distribution-final-package.json`。所有发布文件均是普通文件，没有共享 node_modules 或构建缓存。

## 修改范围

- 正式库：`track-types.ts`、`track.ts`、`types.ts`、`index.ts`。
- 分发：`package.json`、`frameweave.package.json`、`scripts/build-package.ts`。
- 测试：新增 `tests/c3-artifact.test.ts`、`tests/distribution.test.ts`；更新既有 Graphics 测试到正式入口。
- 文档/配置：公共 API、数据规范、README、独立 tsconfig、本报告；原报告标为历史记录。
- 兼容消费者：prototype track 转发入口、worker/Web Stage/demo/verify、旧 fixture、已有 analysis-graphics 集成测试的导入。
- 引擎 `src`、根 package.json/lock、包管理器、核心 Schema/ABI 及既有锁没有改动；没有更新 SDK Runtime Pin 或自动刷新锁。

## 剩余风险与最小后续提案

- R1 的 resolver/lock 仍固定 Web；标准 ESM 的 Node 支持已验证，但不能宣称已有通用 Node R1 Loader。
- 无 PluginStage 的普通库静态导入，核心构建不会自动校验 R1 锁。调用方准备层必须显式 verify；这不应成为纯库的导入副作用。
- 默认隐藏 store 导出路径有上述已验证限制。vendor 配置只证明代码可携带；当前导出器**不会自动保留普通库的 R1 身份和锁**。未来最小提案是显式库依赖元数据、修正相对路径和导出身份收集，需另行评审公共接线，不把纯库改成 effect。
- 当前 C3 交付不含原 Artifact 的所有 PNG、诊断文件和 `complete.json`。只验证可用发布 Manifest 与 Track 文件，没有重建或假称验证了完整缓存目录。
- 数据 v1 的既有限制不变：无新增 Feather/SDF/时序 Mask/Puppet/IK/塑形/模型下载器。Mesh/Skeleton/TextLayout 仍是静态契约；跨浏览器像素一致性未验证。
- 没有发布线上 Registry 或 npm Registry。本地 tarball/R1 普通库产物可用于后续审查；提交只在当前独立分支，不自动合并 Main。Git Commit Hash 与交付文件哈希见随交付 `CHANGESET.json`。
