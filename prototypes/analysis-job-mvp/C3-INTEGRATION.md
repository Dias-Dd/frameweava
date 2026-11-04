# C3 AnalysisTask 接入参考：局部适配层与真实分析模块

> 2026-10-29迁移状态：已接入正式公共C3。当前job.ts仅创建`createAnalysisTask + createNodeAnalysisExecutor`；worker.ts只导出具体`AnalysisDefinition`，不再持有IPC、状态、取消计时器或缓存发布。公共机制位于src/analysis，并由`@frameweave/engine/node`导出。正式API、Artifact v1和取消／清理边界见[ANALYSIS_TASK.md](../../docs/ANALYSIS_TASK.md)。下文保留MVP冻结时的历史设计，便于核对迁移；其中“未实施／局部Job”等描述不代表当前实现。

状态：已运行的独立原型接口说明，不是公共契约提案的批准，也没有新增公共 AnalysisTask / AnalysisScheduler。以本目录源码为准。C3 接入前继续使用本地测试，不等待 C3 调度实现。

## 替换边界

| 层 | 当前实现 | C3 接入时的处理 |
|---|---|---|
| 任务入口、状态订阅、子进程所有权 | `job.ts`，只在原型目录导出 | 由统一 AnalysisTask 的适配器替换；不把本类加入引擎入口 |
| 任务 IPC、缓存编排、结果发布 | `worker.ts` | 将 start/cancel/progress/terminal 映射到 C3；复用统一缓存服务后可替换此编排，不保留双重调度 |
| 视频解码 | `decode.ts`，既有 ffmpegPath + 异步 PNG 迭代器 | 保留算法适配；以后可替换为统一帧源，保持采样时间与坐标元数据 |
| 模型推理与资源所有权 | `face-session.ts`，私有浏览器的 MediaPipe CPU/VIDEO | 保留或替换执行载体；同一输入序列必须单调时间调用；AbortSignal 由 C3 传入 |
| 结果与时间查询 | `track.ts` | 保留版本化 TrackData 与纯查询；不是任务运行时 |
| 渲染消费 | `web-stages.ts` | 继续通过 Resource/file、显式标量与 JSON 端口消费完成结果；不引入推理依赖 |

目前 `worker.ts` 中算法循环与本地缓存编排在同一个专用文件，尚未抽取公共 runner。接入 C3 时可在此处提取内部 `runFaceAnalysis(input, {signal, frameSource, progress, artifactWriter})`，名字仅示意；不要在两边各建调度器。不要先为尚未确定的 C3 接口重构本原型。

## 输入与参数

实际 `AnalysisInput`：`mediaPath`、`modelPath`、必填 `modelVersion`；`startSeconds`、`endSeconds`；可选 `sampleRate=8`、`analysisWidth=640`、三个置信阈值均默认 0.5。

范围为素材自身的 `[startSeconds,endSeconds)`，最多20秒／600样本；采样率为1..30整数；宽度为128..1280偶数；阈值0..1。本地路径是原型的素材引用适配，不应直接固化为跨机器公共资源标识。C3 应从现有资源机制解析不可变内容引用，再交给解码器。模型身份需要版本与内容哈希，不能仅凭路径或文件修改时间。

## 本地生命周期与 IPC

`createAnalysisJob(input, cacheRoot?)` 创建本地句柄；`start()`只允许一次；`status()`返回深拷贝；`subscribe(fn)`返回取消订阅函数；`wait()`完成时返回结果，失败／取消时抛既有 EngineError。

状态：`created → running → completed|failed`；取消为 `created → cancelled` 或 `running → cancelling → cancelled`。发布已进入短暂 `committing` 时，`cancel()`返回false；终态也返回false。`progress`不是耗时预测。

| 消息方向 | 实际字段 | 意义 |
|---|---|---|
| parent→child start | `{kind:'start', input, cacheRoot, jobId}` | 一子进程只执行一个任务 |
| parent→child cancel | `{kind:'cancel'}` | 转换为 AbortController.abort |
| child→parent progress | `{kind:'progress', phase, completed, total, cacheKey?}` | 阶段与已分析样本数，hash/init/cache阶段不估计总体耗时 |
| child→parent terminal | `{kind:'terminal', state, result?, error?, cleanup}` | 子资源清理后发送；parent等待进程close才兑现wait |

阶段：starting、hashing、cache、initializing、decoding、analyzing、committing，然后终态。`JobSnapshot`另含id/state/progress/stderr等，进度为 `total ? completed/total : 0`。不要把phase当成P4 kind，也不要把该IPC字段直接认定为C3标准。

## 取消、清理与错误

协作式取消关闭本任务自己的MediaPipe浏览器、FFmpeg进程，删除本任务的临时目录。父进程断开也触发abort。`cleanup`记录 `browserClosed/decoderClosed/tempRemoved/childExited/forced`。正常完成、模型失败、解码失败、实际推理中取消的测试均得到前三项和childExited=true、forced=false。

10秒兜底只终止拥有的进程树。强杀路径未测试；此时子资源清理可能未知，返回false标记，不能显示为正常dispose成功。崩溃遗留目录的启动扫描／GC由未来统一服务处理，本原型没有实现。

主要错误：E_ANALYSIS_CONFIG、E_ANALYSIS_MODEL、E_ANALYSIS_DECODE、E_ANALYSIS_CACHE、E_ANALYSIS_INPUT_CHANGED、E_ANALYSIS_PROCESS、E_CANCELLED。使用既有Diagnostic形状 `{code,severity,message,details?}`，不吞掉模型或解码错误。终态与清理标志应一起交给C3。

## 持久化缓存与结果句柄

默认根目录为本工作区`.frameweave/analysis-job-mvp`。`cache/<key>/`包含track.json、manifest.json、逐样本PNG和analysis-diagnostics.json。JobResult含 `trackPath/cacheDirectory/cacheKey/cacheHit/metrics/cleanup`。C3应替换机器路径为既有资源体系可解析的artifact引用；渲染端只需TrackData与明确声明的媒体资源。

实际缓存键使用引擎hashValue；将固定顺序构造的对象JSON序列化后SHA256：

```ts
{
  schema: 'analysis.track/1',
  media: videoBytesSha256,
  model: {version: declaredVersion, sha256: modelBytesSha256},
  algorithm: {
    id: 'mediapipe.FaceLandmarker', packageVersion,
    runtimeSha256, implementationSha256, decoderSha256,
    delegate: 'CPU', runningMode: 'VIDEO', numFaces: 1
  },
  config: normalizedConfig
}
```

runtimeSha256覆盖ESM包与当前标准／nosimd WASM及其JS加载器；implementationSha256覆盖worker/track/decode/face-session；decoderSha256覆盖实际FFmpeg二进制。路径名不用于识别素材；同内容可复用。browserVersion只记录在结果，尚未加入键；因此跨浏览器／平台缓存可移植性不作保证，C3应补充环境指纹策略。文件下载固定SHA不匹配时报错，不静默刷新。

完整结果写入Job专有临时目录，完成后同卷rename发布；命中时核对TrackData哈希、样本结构及每个PNG哈希。发布前重读素材与模型哈希，发现任务期间修改则失败且不发布。损坏缓存显式报错，不自动覆盖。相同键并发发布有胜者验证分支，但该并发场景未实测。

不要将模型库、结果缓存和用户插件库合为同一目录。P4-R1继续负责包安装、版本／完整性锁与依赖；C3负责执行生命周期和结果依赖。算法只声明模型与输入，不创建包管理器。

## TrackData 与任意时间查询

实际完整示例在generated/track.json及evidence/track-example.json；类型与运行时检查在track.ts。schemaVersion为analysis.track/1，属于结果文件版本，不是TVG schemaVersion。

- 时间：整型微秒、素材起始为0、半开区间；FFmpeg fps近邻重采样网格，非原始VFR PTS承诺。
- 坐标：归一化、解码显示帧、左上原点、x右y下；同时存width/height。anchor是478点包围盒顶部中心；框不含头发／头顶。
- 缺失：valid=false，anchor/box/trackId=null，landmarkCount=0。逐脸分数未由此SDK接口提供，confidence=null；不拿阈值充当分数。
- 身份：face-segment-N仅为连续可见片段；无检测或大跳变后新编号；不是人物身份或遮挡重识别。

`queryTrack(data, sourceTimeSeconds, {mode?,maxGapSeconds?})`纯二分查询：精确样本原值；默认只在相邻均有效、同片段且间隙不超过2/sampleRate时线性插值。nearest为显式可选策略；不外推。缺失返回outside-range/missing-detection/gap/not-bracketed。不依赖以前渲染的帧，不维护播放时间。

Stage初始化读取结果；renderAt使用 `sourceStartSeconds + context.time` 查询。props.offsetY和Layer.opacity继续由既有keyframes/evaluate求值。多段剪辑／变速映射应沿用现有Stage.time，并另明确素材起点；本次未完成所有剪辑映射的浏览器验证。

## C3 接入验收建议（未实施）

先仅替换job/worker的生命周期适配，保留本次真实视频、模型、TrackData、时间查询及Stage像素测试。统一接口必须继续通过：新任务缓存命中0推理、视频／模型版本／参数失效、取消清理、失败可观察、乱序查询一致，以及不加载模型的原引擎渲染。随后再扩展多脸、长片、跨平台缓存、持久队列与磁盘预算；这些不属于本次已验证能力。
