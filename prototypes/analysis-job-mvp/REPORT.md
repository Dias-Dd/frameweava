> 冻结说明（2026-10-28）：以下报告保留实际验证时的历史状态；文中“未提交”和基线HEAD描述验证当时，不代表冻结提交后的Git状态。源码链接已改为仓库相对位置，小型证据收入validation；影片、ZIP、模型、PNG与HTML保留在本工作区outputs/analysis-job-mvp，未作为大型生成物入库，其SHA256见validation/freeze-manifest.json。此副本仅整理归档位置，没有修改算法。

# FrameWeave Analysis Job MVP 验证报告

2026-10-28 · agents/agent-2 · 基线 f98d70504642c35573d364bf734d436c03c9ab1d

已完成真实视频→MediaPipe人脸分析→持久化TrackData→任意时间查询→既有Web Stage与动画→MP4的独立原型。未修改P4、TVG、Stage、动画或编译器核心；未新增公共AnalysisTask／AnalysisScheduler；没有commit、merge、rebase、reset或push。任务、进度、取消、缓存均留在原型局部适配层，后续交给统一C3接口承接。

**实测结果**：8秒真实视频，640×480、8 samples/s，共64个实际推理样本，57有效、7缺失；37项自动化测试通过；13项真实集成检查通过；两套类型检查通过。原引擎完成64帧H.264编码并完整解码验证。乱序重画、独立Renderer与可携带导出工程的检查通过。

打开[真实演示](../../outputs/analysis-job-mvp/face-follow.mp4)、[可携带工程](../../outputs/analysis-job-mvp/carried-demo.zip)、[原型源码](../../outputs/analysis-job-mvp/analysis-job-mvp-source.zip)、[C3接口参考](C3-INTEGRATION.md)或[源码证据](validation/source-hashes.json)。可携带工程需要现有FrameWeave引擎，不包含另一套运行时。

![第0、32、63帧；编号是连续可见片段](../../outputs/analysis-job-mvp/storyboard.png)

本报告标记：**事实**指代码或官方资料直接支持；**实测**指本机实际运行并保留证据；**建议**指尚未批准的后续方案；**未验证**不作为已支持能力。检测有效率不等于识别准确率，没有人工标注的精度评估。

## 1. 现有能力与缺口：以源码为准

审计范围包括src/core、compiler、render、web、plugins、encoding和项目依赖；检索Job、Worker、AbortSignal、WebAssembly与视频解码入口，并阅读实际执行链。主仓库名是FrameWeave；源码中兼容旧环境变量名不是外部Canvix项目依据。开始时分支为agents/agent-2，既有outputs/work未覆盖。

| 审计项 | 已有事实与源码证据 | 本次缺口与处理 |
|---|---|---|
| Stage与调度 | [renderer.ts:69、111–114、140–169](../../src/render/renderer.ts#L69)：逐帧队列与Stage DAG按层Promise.allSettled；[types.ts:80–85](../../src/core/types.ts#L80)：异步factory/renderAt/dispose | 没有可直接复用的通用持久分析Job生命周期。使用原型内单任务子进程句柄；Stage继续只做有界时间查询与绘制 |
| Worker／异步／WASM | [build.ts:77–80](../../src/compiler/build.ts#L77)与[typecheck.ts:21–35](../../src/compiler/typecheck.ts#L21)已有编译求值／类型检查子进程；[search.ts:8–17](../../src/plugins/search.ts#L8)已有固定版本模型异步加载；[server.ts:67](../../src/render/server.ts#L67)提供blob worker但script-src没有WASM执行许可 | 这些是专用设施，没有媒体任务取消／进度公共上下文。模型分析在本Job私有浏览器中执行，不修改Stage CSP；不在渲染帧中启动模型 |
| 资源与缓存 | [types.ts:51–55、73–78](../../src/core/types.ts#L51)：file/media/model资源、显式resources；[build.ts:126–164](../../src/compiler/build.ts#L126)：资源边界检查与复制；[cache.ts:4–22](../../src/render/cache.ts#L4)：SHA哈希、128MiB进程内LRU | StageCache不是跨进程持久结果仓库，不能直接冒称磁盘分析缓存。复用hashValue；在原型工作区内做最小磁盘结果适配。临时文件再rename的模式已有于[search.ts:23–32](../../src/plugins/search.ts#L23)，未把分析结果写进用户搜索索引 |
| TVG引用与时间 | [types.ts:4–7、30–35、57–67](../../src/core/types.ts#L4)：JSON／标量端口与ref；[time.ts:32–47](../../src/core/time.ts#L32)：Stage局部帧、局部秒及全局时间；[animation.ts:20–23、85–92、122起](../../src/core/animation.ts#L20)：既有关键帧和递归求值 | TrackData作为file资源即可；查询Stage把结果变成显式端口。无需新增TVG结果引用节点或第二套关键帧 |
| P4注册与参数 | [sdk.ts:6–30](../../src/plugins/sdk.ts#L6)：6类插件、JSON端口、标量参数、async create/render/dispose；[schema.ts:18–28、35–58](../../src/plugins/schema.ts#L18)：参数和manifest验证；[registry.ts:39–98](../../src/plugins/registry.ts#L39)：registry、内容完整性和lock | 没有analysis/job kind、执行期progress/abort接口或结构化参数schema。局部配置不用伪装成现有P4 kind；保留C3接缝，不创建包管理器 |
| 视频解码与编码 | [ffmpeg.ts:9–12、14–46、48–66](../../src/encoding/ffmpeg.ts#L9)：统一FFmpeg路径、编码器、全视频解码探测 | 缺少可取消的逐帧媒体源。decode.ts只围绕既有FFmpeg加小型PNG迭代器；导出复用VideoEncoder/probeVideo |

**实测目录检索**：以本工作区`.frameweave/user-home`为FRAMEWEAVE_HOME执行`effects search 'face tracking' --mode keyword`，结果为[]。这是关键词检索；没有把它称为语义检索。根依赖没有MediaPipe，因此仅在原型子包锁定安装`@mediapipe/tasks-vision@1.2.0`，未修改引擎package.json/package-lock或插件锁。

## 2. 真实算法、输入与执行隔离

选择MediaPipe Face Landmarker CPU／VIDEO模式，numFaces=1，使用官方float16/1模型。官方说明detectForVideo是同步调用，放在交互主线程会阻塞；本次将它隔离在子进程拥有的浏览器上下文里。[官方Web指南](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)

本次没有宣称实现Web Worker版本。调用者Node主线程只管理IPC；素材哈希、解码编排和文件写入在子进程；同步WASM只阻塞私有分析页面。另一真实浏览器UI在分析期间仍可点击。分析页面不是生产编辑器UI，后续浏览器内Worker路线仍需验证。

| 固定输入 | 值与证据 |
|---|---|
| 视频 | OpenCV extra David tracking benchmark真实视频；取前8秒；原始320×240，采样放大至640×480；3,917,558 bytes |
| 视频SHA256 | `4bbe69b7d097379af4d7ad128f02692820dc57a6d8275ea2b9e7eef4399a3e61` |
| 模型 | 官方face_landmarker/float16/1，3,758,596 bytes |
| 模型SHA256 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| 配置 | [0,8)秒；8 samples/s；width=640；三个阈值均0.5；CPU；VIDEO；单脸 |
| 版本溯源 | SDK版本、模型声明版本与内容SHA、实现SHA、WASM/加载器SHA、FFmpeg二进制SHA、浏览器版本均记录 |

[下载来源和哈希](validation/asset-provenance-check.json)由prepare-assets固定验证；SHA不符直接报错，不静默换锁。官方模型本身由多个检测／关键点模型组成；本原型保留478点计数及其2D包围盒顶部中心，未存储全部3D点、表情系数或变换矩阵。[官方任务说明](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)

分析浏览器不绑定HTTP端口。Playwright仅对白名单虚拟URL在本地直接fulfill SDK、WASM和模型，其他请求终止。实际Web Stage渲染仍使用现有引擎临时loopback服务并随Renderer关闭；没有部署分析服务器。[face-session.ts:13–56](./face-session.ts#L13)

## 3. 数据流与现有动画／渲染集成

![独立预计算和现有渲染的数据流](../../outputs/analysis-job-mvp/architecture.svg)

```text
视频内容引用 + 模型/版本 + 范围/配置
  → 局部Job适配 → FFmpeg异步采样 → 私有浏览器MediaPipe
  → TrackData + PNG + manifest → 原子发布的工作区缓存
  → prepareDemo声明Resource/file与Resource/image → 现有TSX编译为TVG
  → track Stage初始化载入JSON → renderAt按sourceStart + context.time查询
  → x/y/valid/trackId显式端口 → label Web Stage + 既有keyframes
  → 既有Layer合成 → 既有Renderer与VideoEncoder
```

真实演示用PNG采样帧显示视频，保证看到的媒体画面正是分析的采样画面。这是对既有FFmpeg的最小适配，没有新增生产视频播放器或WebCodecs解码系统。8fps演示验证跟随链路，不能作为完整帧率视频播放性能结论。

实际TSX使用既有API（完整65个资源声明见可携带工程）：

```tsx
<Resource id="track" kind="file" src="./track.json" />
<Stage id="track" factory={trackStage}
  outputs={{x:'number',y:'number',valid:'boolean',trackId:'string',sample:'json'}}
  props={{sourceStartSeconds:0}} />
<Stage id="label" factory={labelStage}
  inputs={{x:ref('track','x'),y:ref('track','y'),
    valid:ref('track','valid'),trackId:ref('track','trackId')}}
  inputTypes={{x:'number',y:'number',valid:'boolean',trackId:'string'}}
  outputs={{surface:'surface',drawn:'boolean',anchorX:'number',anchorY:'number'}}
  props={{offsetY:keyframes([
    {frame:0,value:8},{frame:8,value:0,easing:'easeOut'}
  ])}} />
<Layer source={ref('label')}
  opacity={keyframes([{frame:0,value:.65},{frame:8,value:1}])} />
```

track Stage使用初始化期fetch结果，renderAt只进行纯查询；模型、WASM和job/worker不进入渲染源依赖图。labelStage使用显式输入绘制marker、连接线和文字；offsetY与Layer.opacity由引擎原有动画求值。图层位置通过Stage属性／端口消费完成，无需改变Layer信号表达式。[web-stages.ts](./web-stages.ts)、[demo.ts:13–54](./demo.ts#L13)

**当前TVG足够，本次无核心变更请求。**非零分析起点、剪辑映射沿用现有context.time+明确素材起点；本次主演示仅验证标准速度和0起点，不能据此声称已覆盖所有剪辑／变速组合。

## 4. TrackData格式、坐标、时间与缺失行为

实际结果：[track-example.json](validation/track-example.json)。该Schema是原型结果文件版本，不是TVG版本；下例摘自真实结果，省略其余样本和哈希字段。

```json
{
  "schemaVersion":"analysis.track/1",
  "model":{"id":"face_landmarker/float16","version":"float16/1"},
  "time":{"unit":"microseconds","origin":"source-media-start",
    "range":"start-inclusive-end-exclusive","sampling":"ffmpeg-fps-near-grid",
    "startUs":0,"endUs":8000000},
  "coordinates":{"unit":"normalized","origin":"top-left","x":"right",
    "y":"down","space":"decoded-square-pixel-display-frame","width":640,"height":480},
  "samples":[
    {"timestampUs":0,"frameIndex":0,"valid":true,"trackId":"face-segment-1",
     "confidence":null,"landmarkCount":478,
     "anchor":{"x":0.576631486415863,"y":0.3554867208003998}},
    {"timestampUs":125000,"frameIndex":1,"valid":false,"trackId":null,
     "confidence":null,"landmarkCount":0,"anchor":null,"box":null}
  ]
}
```

| 契约 | 精确定义 |
|---|---|
| 时间基准 | 素材从0起算的绝对微秒，样本整数timestampUs；queryTrack调用参数为素材秒；范围左闭右开 |
| 采样 | FFmpeg fps过滤器round=near，在解码后的重采样网格上标记`startUs + round(index×1e6/rate)`；不是原始可变帧率PTS |
| 坐标 | 解码显示帧归一化坐标，左上原点；像素位置为x×width、y×height；box同单位；点可在画幅外，不通过裁切伪造检测 |
| anchor | 实际478点最小包围盒的顶部中心，是脸部锚点；不是头发或完整头顶分割 |
| 分数 | 该调用结果未给逐脸检测概率，故confidence=null；阈值仍显式输入。valid是可用观测标记，不伪造0.99分数 |
| 标识 | face-segment-N仅代表单个可见脸连续片段；缺失或归一化距离>0.3跳变后换片段；不是人物身份／跨遮挡重识别 |
| 缺失 | valid=false，anchor/box/trackId=null，landmarkCount=0；Stage输出valid=false，标签完全透明 |
| 随机时间查询 | 二分查找，O(log n)；同片段有效邻点且间隔≤2/sampleRate才默认线性插值；返回拷贝；不外推、不跨丢失插值 |
| 明确失败 | outside-range、missing-detection、gap、not-bracketed；nearest仅是显式可选查询策略 |

时间查询不推理、不运行先前帧、不生成关键帧；初次分析的VIDEO算法按单调时间顺序预计算，与渲染任意时间访问分开。[track.ts:1–60](./track.ts#L1)

## 5. 局部生命周期、缓存与C3替换点

`job.ts`仅位于prototypes，不从src/index导出。它管理一个子进程的所有权，没有任务注册中心、全局队列、分布式调度或恢复守护进程。`worker.ts`是专用媒体任务编排，`decode.ts/face-session.ts/track.ts`承担真实算法和查询。C3接入时替换job/worker生命周期与缓存适配，保留后者；避免两个调度器并存。

完整接口说明在[C3-INTEGRATION.md](C3-INTEGRATION.md)，包含实际输入／状态／IPC／返回结构／错误和取消方式。简要生命周期：

```text
created → running → completed | failed
created → cancelled
running → cancelling → cancelled
hashing → cache → initializing → decoding/analyzing → committing → terminal
```

create/start/status/subscribe/wait/cancel均已实现。progress为样本数比例，hash/init阶段不估计整任务耗时；completed不表示清理结束，wait仅在子进程close后兑现。取消通过IPC触发AbortSignal、关闭自有浏览器与FFmpeg、删除自有临时目录。短暂原子提交阶段不接受新取消请求，cancel返回false；10秒强杀兜底仅针对自有进程树，forced=true时不冒称正常清理成功。[job.ts:19–87](./job.ts#L19)

持久结果位于`.frameweave/analysis-job-mvp/cache/<key>/`。键复用既有hashValue，对规范化输入做SHA256；包含视频内容哈希、模型内容哈希／声明版本、全部检测配置、SDK版本、实际标准／nosimd WASM与加载器哈希、实现文件哈希、FFmpeg二进制哈希。模型或视频同路径内容变化也会失效。仅修改声明模型版本的测试与修改实际模型字节的测试分别保留，未把前者当成换模型的算法效果测试。

新结果先写Job专有临时目录，再同卷rename发布；manifest持有TrackData SHA，TrackData持有逐PNG SHA；缓存命中校验全部文件。损坏显式报E_ANALYSIS_CACHE，不静默覆盖。发布前重新检查输入／模型SHA，处理中被改动则拒绝发布。[worker.ts:25–33、45–108](./worker.ts#L25)

**限制**：浏览器版本已记录但未计入缓存键；跨浏览器／机器复用不保证同算法结果。manifest不是签名安全机制，结果目录按可信工作区文件处理。没有持久队列、断点恢复、磁盘配额／GC；崩溃遗留目录不做启动扫描。并发同键发布的胜者检查分支存在但未实测。C3应统一这些策略，而非扩建本地任务框架。

## 6. 实际验证与证据

所有实际运行在本工作区自己的依赖／缓存／输出中。涉及插件库的命令使用本地FRAMEWEAVE_HOME。没有改锁绕过检查。

| 验证类别 | 实际执行与结果 | 证据／边界 |
|---|---|---|
| 自动化测试 | prototype tests + tests/core.test.ts + tests/input-contracts.test.ts，37/37通过 | [TAP日志](validation/automated-tests.tap)；含6项原型测试：4项使用明确标记的人工边界fixture、2项验证取消。未将人工数据当真实轨迹；未重跑历史全部150项基线 |
| 类型检查 | 根npm run typecheck；prototype tsconfig的tsc --noEmit，均exit0 | [根日志](validation/engine-typecheck.txt)、[原型日志](validation/prototype-typecheck.txt)；原型日志为空是tsc成功无输出 |
| 真实集成／浏览器 | verify.ts共13项检查通过 | [verification.json](validation/verification.json)、[生命周期事件](validation/lifecycle-events.json) |
| 主线程与UI响应 | 真实推理期间Node事件循环持续tick；另一浏览器定时器持续运行并成功点击 | [实际UI截图](../../outputs/analysis-job-mvp/responsiveness.png)；未集成生产编辑器UI |
| 视频与轨迹 | 64样本、57有效、7缺失，每个有效观测来自478真实landmarks；x/y变化约96/88.5像素 | 非静态伪轨迹；无人工标注准确率结论 |
| 缓存命中 | 新子进程重复配置命中，inferenceFrames=0 | 持久结果跨任务复用，不是沿用同一内存模型实例 |
| 失效 | 实际镜像重编码视频、声明模型版本、采样配置改变均未命中；坏模型字节与坏视频分别失败 | 错误可观察，清理标志通过；不宣称测试了第二个有效模型的效果 |
| 取消与资源 | 在真实分析第2帧后取消，E_CANCELLED；浏览器、解码器、临时文件、子进程清理均true；forced=false | 10秒强杀分支未实测；标志不等于操作系统内存泄漏压力测试 |
| 处理中变化／损坏 | 分析中改素材拒绝发布；改持久TrackData报E_ANALYSIS_CACHE | 没有伪装缓存成功或吞错 |
| 随机时间 | 12个真实结果查询、14次乱序重复比较一致；缺失与越界行为通过 | 不依赖先前渲染帧 |
| 实际渲染 | 顺序[0,32,63,7,16,32,0]，重复帧原始RGBA相同；独立Renderer帧32相同；6帧实际青色marker像素对应目标锚点；缺失帧标签全透明 | [seek-after.json](validation/seek-after.json)及verification最终项；同时检查无模型推理依赖进入渲染图 |
| 视频导出 | 8秒／640×480／8fps／64帧MP4，既有probeVideo完整解码通过；人工检查首中末图及演示 | [render-results.json](validation/render-results.json)与[影片](../../outputs/analysis-job-mvp/face-follow.mp4) |
| 可携带导出 | 现有exportProject导出69文件、无外部文件；原导出输入目录不可用时，新构建按32→0→63渲染，3帧RGBA与原片帧相同 | [导出验证](validation/carried-demo-verification.json)；仍依赖现有引擎SDK，不宣称完全脱离引擎 |

初次乱序验证发现标签Canvas存在绘制历史相关像素差，不能因图像看起来相似而忽略。定位到标签画布后，仅在原型labelStage改成每帧新建画布／清理旧backing store；修复后video、label与最终合成的对照均0通道差异，13项集成重新通过。[初次失败记录](validation/verification-initial-failed.json)与最终验证均保留。没有修改渲染器来掩盖此问题。

另补充“starting通知回调立即取消”的边界测试：局部任务适配仅在自有子进程具备接收能力后发送开始通知，避免同步取消丢失。该测试已通过；取消与13项真实集成再次复测。

## 7. 性能实测与资源代价

环境：Windows 11 Pro 10.0.26300、Intel Core Ultra 9 275HX（24逻辑处理器）、Node v22.19.0、Edge/Chromium 156.0.4314.50、MediaPipe CPU delegate。以下分析与响应性数字取自[独立性能样本](validation/performance-sample.json)；最终边界修复后的复测见verification.json，复测期间同时执行自动化与类型检查，系统负载不同。不是跨平台基准，也不是GPU性能结论。

| 指标 | 实测 |
|---|---:|
| 冷分析子进程计时 | 4,343.29 ms |
| 其中浏览器与模型初始化 | 1,247.92 ms |
| 64帧推理单次中位／P95 | 18.80 / 22.00 ms |
| 持久缓存命中新任务 | 207.00 ms，0次推理 |
| 调用者事件循环max／P95间隔延迟 | 25.54 / 17.66 ms |
| 独立UI浏览器最大tick间隙／成功点击 | 25 ms / 1 |
| 最终64帧渲染、编码、探测与图证据生成 | 8,681.13 ms |
| SDK标准WASM文件 | 14,466,654 bytes（未压缩）；另有nosimd／module变体 |
| 模型下载体积 | 3,758,596 bytes |
| 最终MP4文件 | 887,772 bytes |

子进程elapsed不含npm安装、下载、父进程启动等待及finally资源清理；init包含在冷分析内；渲染计时含编码结束、storyboard和全片probe，不是纯Stage帧耗时。GPU未参与模型推理。未测峰值RSS、长期泄漏、并发任务吞吐或任务强杀时延，不能由这些数字推断。

小型轨迹JSON之外，本原型为演示缓存每个PNG样本，磁盘空间随样本数与分辨率增长；将来统一媒体帧缓存可避免重复。Web视频Stage仅保留最多8张已加载Image引用；取消丢弃私有模型上下文。每帧新Canvas使随机访问确定，但分配代价应在后续长片压力测试中评估。

## 8. P4-EXT审计与C3接口建议

以下仅为接口参考，未修改公共接口，也没有向其他任务发送消息。最新边界采用用户说明：Stage/TVG足够；统一轻量C3 AnalysisTask并行开发，真实算法不等待它。

| 源码缺口 | 建议交给统一接口的责任 | 本次保持的边界 |
|---|---|---|
| sdk.ts的create/render/dispose无执行进度／AbortSignal | C3以宿主执行上下文提供signal、阶段进度、Diagnostic和结果artifact；终态包含清理结果 | 保留本地IPC适配，未来替换，不新增公共Job kind |
| schema.ts仅标量参数；分析包含媒体／模型／范围配置 | 使用既有资源引用加C3类型化输入；结构化算法配置可在C3输入验证，不强行扩大全部P4参数schema | 原型AnalysisInput仅局部类型 |
| StageCache仅进程内LRU | C3统一持久artifact缓存、环境指纹、完整性、磁盘预算和崩溃清理 | 本地磁盘结果适配可删除；hashValue已复用 |
| TVG没有analysis节点 | 先继续Resource/file + JSON／标量端口，完成结果作为渲染前依赖 | 已实测可行，无需变更TVG |
| Stage CSP没有WASM许可 | 分析在宿主隔离执行，结果供Stage查询；未来若需浏览器Worker，审查能力声明及资产来源 | 不放宽现有CSP、不把推理塞进renderAt |
| P4包身份／锁与任务结果身份不同 | P4-R1提供准确包版本／内容与资源；C3记录执行输入、模型内容、环境和输出。二者用依赖指纹关联 | 不做新包管理器，不改已有锁 |

建议C3首轮集成仅替换生命周期适配，复跑本报告真实视频、缓存、取消、随机查询和像素测试；之后再扩展长片、多脸与持久队列。TrackData作为版本化文件格式可以先保留，避免公共API因本用例特化为“人脸任务”。

## 9. 复现与交付文件

在分配的agents/agent-2工作区运行。父仓库应已安装自己的依赖与可用Chromium；原型单独安装SDK，不共享其他工作区node_modules。

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
Set-Location prototypes/analysis-job-mvp
npm ci --ignore-scripts --no-audit --no-fund
npm run prepare-assets
node --import tsx run.ts --start 0 --end 8 --fps 8 --width 640
npm test
npm run verify
npm run demo
```

实际37项测试与类型检查命令（从仓库根目录）：

```powershell
node --import tsx --test prototypes/analysis-job-mvp/tests/*.test.ts tests/core.test.ts tests/input-contracts.test.ts
npm run typecheck
node node_modules/typescript/bin/tsc -p prototypes/analysis-job-mvp/tsconfig.json --noEmit
```

`run.ts`输出JSONL状态，Ctrl+C请求取消。`generated/project.tsx`可直接由现有CLI渲染；可携带zip中的project.tsx也能直接使用。carried-demo仅有结果／帧／Stage，不需要再下载模型即可渲染。原型source.zip需放回父仓库的prototypes/analysis-job-mvp目录执行；不包含node_modules、模型与原始视频，prepare-assets会按SHA下载。

| 修改范围 | 文件及用途 |
|---|---|
| 仅新增prototypes/analysis-job-mvp | job.ts／worker.ts局部任务与缓存适配；decode.ts逐帧源；face-session.ts真实WASM推理；track.ts数据与纯查询；web-stages.ts渲染消费；demo.ts／run.ts运行入口 |
| 原型验证／配置 | verify.ts；tests/track.test.ts；prepare-assets.mjs；package.json与独立package-lock；tsconfig.json；.gitignore；README.md；C3-INTEGRATION.md |
| 实际输出 | ignored assets/generated/evidence；工作区内.frameweave缓存；outputs/analysis-job-mvp报告与交付包 |
| 工作记录 | work/analysis-job中最小探测、画面差异定位和交付脚本；不接入引擎入口 |

最终tracked diff为空，新增代码留在本工作区prototypes供审查；先前graphics-review的work/outputs原样保留。已实现任务局部适配不等于已批准统一公共接口。

## 10. 许可证、已知问题与未验证项

**事实**：MediaPipe SDK包元数据标记Apache-2.0，原型锁定精确版本；附[MediaPipe源许可证](validation/licenses/mediapipe-LICENSE.txt)，来源[官方仓库LICENSE](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)。模型来自官方托管下载URL，保留来源与SHA；尚未完成其模型分发条款的单独法律审核。SDK源码许可不自动等于任意模型／素材的商用授权。

**事实／未验证**：David视频来自[OpenCV extra真实测试数据](https://github.com/opencv/opencv_extra/tree/4.x/testdata/cv/tracking/david)，已保留README和来源；未找到该文件单独的素材商业授权。本交付仅用于用户要求的内部验证演示，不能将它作为获得商业授权的生产模板素材。可携带工程含演示所需派生PNG；原型源码包不捆绑原始视频与模型。既有FFmpeg的分发许可证与编解码器策略沿用项目，未新增二进制分发包。

已知功能边界：单个可见脸、20秒／600样本上限；7个缺失样本会隐藏标签；无多人身份、遮挡重识别、光流补帧或自动跟踪修复；没有生产编辑器UI与C3公共接口集成。未验证VFR原始PTS、非方形像素／旋转元数据组合、跨浏览器／GPU一致性、长片稳定性、进程强杀清理、同键并发、断点恢复或磁盘GC。运行时schema检查覆盖当前查询所需结构，尚非完整安全边界JSON Schema校验器。

当前成果可运行、可审查；后续应将真实算法模块接到统一C3 AnalysisTask，移除重复局部编排。本次不继续扩建另一套分析框架。
