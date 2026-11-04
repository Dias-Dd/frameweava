# PME：非图像输出、可选音频端口与采样区间

状态：图像/HDR 优先。本文件的 AudioPort/采样区间是后续扩展方案，当前能力查询不得把音频 Stage 标为已实现。当前已实现的是显式 PCM 资产封装与同步验证。

## 当前事实

- `src/core/types.ts::PortType` 有 surface / number / string / boolean / json；Stage 可以完全不输出图像。
- `src/render/renderer.ts::execute` 按原 DAG 与 PortRef 执行所有声明端口。`evaluateFrame` 直接返回端口与诊断，不生成假 Surface；`renderMediaFrame` 和 `renderFrame` 分别是浮点图像合成和旧 SDR 图像出口。
- `src/media/node.ts::composeMediaFrame` 只收集合成 Layer 的 source/mask 引用，不把数值或 JSON 变成图像。
- 当前 StageAdapter 只有帧求值，FrameContext 时间以有理 FPS 映射；尚无音频端口、采样块调度、跨块 DSP 状态及延迟补偿。AdapterEnvironment 目前要求 Browser，纯音频 Node/Worker 后端需要后续按能力惰性提供上下文，不能声称现在能免浏览器执行任意音频 Stage。
- 旧 VideoEncoder 使用 `-an`。ProfessionalVideoEncoder 可接显式 s24le/f32le PCM 文件、48/96kHz、1..8 声道、origin sample 0；视频结束时校验采样数与有理 FPS 的整段长度在一个采样内。MOV 可封装 pcm_s24le；MP4 使用明确的有损 AAC，不把它宣称为 24-bit PCM 保真交付。

## 建议的可选端口（未启用）

未来 TVG 的可检测扩展版本增加 `audio` 端口，而不是把 PCM 藏进 image/json 并声称已支持。原 `surface` 和其他端口保持语义；旧读者遇到不认识的端口/能力应明确拒绝。

```ts
interface AudioBlockV1 {
  kind: 'audio'; schemaVersion: 'frameweave.audio/1';
  sampleFormat: 'f32-planar' | 's24-interleaved';
  sampleRate: number;
  channelLayout: { names: string[] }; // 明确声道顺序，不只给数量
  startSample: number;              // 源时间域，整数，含起点
  sampleCount: number;              // 半开区间
  ownership: 'value';
  storage: {
    location:'cpu-inline'; encoding:'base64'; byteOrder:'little-endian';
    data:string; byteLength:number;
  }; // 首版值拥有 bytes；外部资产继续由已有 Resource/R1 验证后解析
}
interface SampleInterval {
  unit: 'samples'; sampleRate: number;
  start: number; endExclusive: number;
}
interface IntervalAdapterExtension {
  readonly intervalCapability?: {
    schemaVersion:1; unit:'samples'; seek:'stateless'|'preroll';
    lookbehindSamples:number; lookaheadSamples:number;
    latencySamples:number; tailSamples:number;
  };
  evaluateInterval?(
    stage:StageSpec,
    request:{local:SampleInterval;global:SampleInterval},
    inputs:Record<string,PortValue|AudioBlockV1>,
    props:Record<string,unknown>,
    hostOptions?:{signal?:AbortSignal}
  ):Promise<{
    outputs:Record<string,PortValue|AudioBlockV1>;
    coverage:Record<string,SampleInterval>;
    diagnostics:Diagnostic[];
  }>;
}
```

这是与图像并列的媒体值，不是第二套包协议或 Stage DAG。输入输出端口仍由同一节点和 PortRef 连接。图像合成器不消费 audio，音频封装出口不假定其他端口都是音频。

这里的 StageSpec / PortValue / Diagnostic 沿用 `src/core/types.ts`；它们没有在本轮被改为音频类型。AbortSignal 是宿主调用选项，不能序列化进 TVG 或跨 Worker 直接传递；适配器负责映射到既有取消/关闭机制。当前 `StageAdapter.renderAt` 不变，只有将来声明区间能力的后端才能接收区间请求。缺少 capability、输入覆盖不足或状态无法复现时必须拒绝，不得把逐帧图像求值伪装成采样求值。

方案比较：把 PCM 临时放进 JSON 只能验证数据搬运，不能提供速率/覆盖/延迟契约；直接假定所有适配器新增强制音频方法会破坏兼容。推荐将来增加**可选的类型化音频端口和区间方法**，复用已有 DAG 的依赖裁剪、队列与生命周期；正式启用仍需单独批准版本协商和验证规则。本轮没有添加 `audio` PortType，也没有新增调度器。

## 执行与时间

1. 保留同一拓扑排序、依赖裁剪、隔离、错误传播、取消和资源清理。区间请求传给声明支持该扩展的适配器；不建立 AudioScheduler。未提供区间入口的适配器不能被默认称为支持音频。
2. 视频帧 f 的音频覆盖：`[floor(f * sampleRate * fps.den / fps.num), floor((f+1) * sampleRate * fps.den / fps.num))`。使用整数/有理数计算（大乘积用 BigInt），相邻区间共用端点，不累加浮点 dt，避免 29.97 FPS 长片漂移。
3. 明确 global timeline 与 Stage-local/source sample timeline。复用现有 start/offset/rational rate 定义；重采样、负速率、冻结音频只有适配器明确支持时才执行，否则给出能力诊断。
4. 可视化音频可请求音频区间后在视频帧输出 Surface；图像驱动音频可通过控制数值/结构端口输入。控制信号复用既有动画求值器，不创建另一套关键帧时间系统。
5. 分块边界与算法延迟必须可声明。滤波器、卷积、重采样器等有状态处理声明 lookbehind/lookahead/latency/tail。随机区间访问复用现有 seek/fixed-step 思路，要求确定性前滚/检查点，不能拿上一块的残留状态直接回答随机请求。
6. 不隐式裁掉缺少的区间、补静音或重采样。是否允许静音补齐/截尾必须由调用方策略决定；区间不足、布局冲突和速率冲突采用稳定诊断。

## 缓存与资源

缓存身份应加入端口种类、源/算法/模型/包完整性、采样率、布局、采样格式、精确区间、Stage 时间映射、参数和必要状态检查点。不能只用视频帧号复用不同采样区间。

Stage 内设备/AudioBuffer 不跨 realm 直接传递。优先值拥有的受控 Buffer，跨进程可用当前受控文件/字节机制；借用 GPU/音频设备对象不能冒充可携带资源。PCM 资产、模型等继续用现有 Resource/P4-R1 锁定及权限，不建立新的 Registry。

## 后续验收条件

- 同一真实 DAG 中 audio → audio、audio → JSON/Surface，以及数值 → audio 的依赖求值；数据-only 分支不需要图像。
- 48/96kHz、24-bit PCM、显式声道布局；小区间拼接与整段求值数值一致。
- 非整数 FPS、多小时整数端点无漂移；随机/乱序区间、状态预滚与尾部处理可重复。
- 取消、超时、清理、损坏 bytes/哈希拒绝；旧适配器不被静默授予音频能力。
- 经过外部工具检查音视频起点、duration、time base、采样数，并实际解码 PCM 验证内容。

本轮不实施 AudioPort、DSP 图、DAW、VST 宿主或实时设备系统。可实施的图像/HDR 交付不会要求所有 Stage 输出图像，也不会把该设计文档计为音频引擎已完成。
