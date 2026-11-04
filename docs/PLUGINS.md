# FrameWeave P4 插件 SDK

用户级默认发现、本地语义搜索、Agent 创建流程和随包导出见 [LIBRARY_EXPORT.md](LIBRARY_EXPORT.md)。本页保留初始项目级注册协议的说明；搜索 CLI 现默认 hybrid，安装不传 `--project` 时默认进入用户库。

P4 是可选能力。原生 TS/JS、React/Three.js/PixiJS Stage、手写 Shader 和原有 Layer Canvas Filter 均保留。当前工程是单包布局；没有为了插件系统改造成 monorepo。

## 注册、检索与固定版本

```powershell
npm ci
npm run frameweave -- effects list
npm run frameweave -- effects search "cinematic glowing particles"
npm run frameweave -- effects list --kind image-effect --input image --output image --engine web --compatible 0.1.0
npm run frameweave -- effects info fw.glow@1.0.0
npm run frameweave -- effects validate plugins/shared/energy-vortex
```

搜索默认对名称、描述、标签和 IO 摘要进行本地多语言向量检索，并结合关键词评分；`--mode keyword` 可显式使用关键词及轻量拼写容错。没有云端模型或向量数据库。list 返回摘要，info 单独返回参数、端口、示例、依赖、版本和完整性摘要。

工程入口同目录的 `frameweave.plugins.json`：

```json
{"schemaVersion":1,"roots":["../../../plugins/shared"],"lockfile":"./frameweave.plugins.lock.json"}
```

roots 支持一个插件目录，或包含多个插件目录的根目录；默认还加载 `plugins/builtin/` 和受管理的用户插件库。项目级安装保持目录引用；用户级安装保存不可变副本，之后新工程自动发现。仅扫描明确配置的目录和受管理用户库。

```powershell
npm run frameweave -- effects install ./plugins/shared/energy-vortex --project ./my-project/project.tsx
npm run frameweave -- effects lock --project ./my-project/project.tsx
```

install 验证本地目录与依赖并写入 roots，不执行、下载或复制插件代码。开发者审阅后显式 lock。构建不会自动更新锁。锁记录精确版本、依赖解析、插件目录内容 SHA256，以及整个引擎 src 和 package-lock 的运行时指纹；源码、资源或这些运行时文件变化时拒绝构建。浏览器和系统环境仍应同时固定，锁文件不是跨平台像素一致性的证明。

构建还检查 esbuild 的实际导入图：插件辅助文件必须在已锁定插件目录内；npm 依赖只能来自引擎受 package-lock 管理的 node_modules。拒绝未跟踪的目录外辅助代码及插件私有 node_modules。新增 npm 依赖需要在引擎中安装、固定并审查许可证，或把获许可的源码正式放入插件目录。P0–P3 的普通原生 Stage 不受此插件专用规则影响。

同一 ID 的多个稳定版本可以共存；同 ID 同版本的不同目录拒绝加载。同一物理目录经重叠根目录重复发现会去重。版本语法支持精确 `major.minor.patch`、`^`、`~`；不支持预发布、通配符、OR 或完整 npm range 语法，遇到它们会报错。

## Manifest

每个插件目录包含 `effect.json`，规范见 [plugin.schema.json](plugin.schema.json)。CLI 还执行参数默认值、路径、版本兼容和依赖图等语义检查。

```json
{
  "schemaVersion":1,"apiVersion":1,
  "id":"example.my-effect","name":"My Effect","version":"1.0.0",
  "kind":"generator","engine":"web","compatible":"^0.1.0",
  "entry":"./index.ts","description":"A deterministic visual generator",
  "tags":["procedural"],
  "parameters":{"radius":{"type":"number","default":80,"minimum":1,"maximum":500}},
  "inputs":{},"outputs":{"image":"image"},
  "resources":{},"dependencies":{},
  "examples":["plugin('example.my-effect@1.0.0',{radius:100})"]
}
```

参数是 number/string/boolean，必须提供默认值；支持 minimum/maximum、integer 和 enum。插件参数可以传关键帧、数值表达式和弹簧；构建验证静态值和关键帧端点，逐帧及每个时间样本重新检查实际值。整数参数动画应使用 step easing。

端口包括 image、number、string、boolean、json。image 是 **Stage 内**的 Canvas/ImageBitmap，不能跨 Stage 共享；跨 Stage 仍通过原有 surface PNG 和 JSON 契约传输。

分类和生命周期：

| kind | 调用形式与含义 |
| --- | --- |
| function | evaluate(context, inputs, params)，不要求初始化或释放；用于纯计算 |
| generator | create(init) → render(context, inputs, params) → dispose；生成图像或文字内容 |
| modifier | 同上；修改输入图像所代表对象的变换或属性 |
| image-effect | 同上；像素处理，输入输出均明确声明 |
| composite-effect | 同上；多个显式命名图像输入进行合成 |
| preset | 无执行入口；声明 pipeline，构建时展开，支持嵌套及 `{"$param":"name"}` 参数转发 |

preset 必须声明其实际子插件的依赖版本、输入和输出；当前输入沿管线传递，输入重映射写在具体步骤上。别名在整个 Stage 内唯一。预设深度最多 8，展开后每个 Stage 最多 16 步。

## 公共调用 API

```tsx
import {PluginStage,plugin,effects} from '@frameweave/engine/plugins';
<PluginStage id="visual" pipeline={[
  plugin('example.energy-vortex@1.0.0',{radius:220},{as:'vortex'}),
  plugin('fw.particles@1.0.0',{seed:12},{as:'dust'}),
  plugin('fw.mix@1.0.0',{mode:'screen'}, {
    inputs:{image:'vortex.image',overlay:'dust.image'}
  }),
  effects.motionBlur({samples:4,shutter:1}),
  effects.displacement({amount:5}),
  effects.glow({intensity:1.6,radius:12}),
  effects.typography({text:'ENERGY',x:60,y:220})
]}/>
```

管线按数组从前往后执行。默认输入读取当前同名端口；显式 inputs 可引用此前步骤 `alias.port`，或 Stage 输入 `stage.port`。输出更新同名当前端口，其他端口继续保留。最终必须存在 image，由宿主绘制并作为 Stage 的 surface 输出。效果不作为 Layer 的普通子节点，不会隐式作用于任意相邻元素。

PluginStage 接受普通 Stage 的输入、inputTypes、时间映射和尺寸属性，固定输出 surface。外部 PNG 在宿主解码为 image；跨 Stage 不传原生对象。原有 `<Stage factory={...}>` 和 `<Layer effects={...}>` 无须迁移。

`effects` 提供五类效果的类型化参数封装。第三方作者可发布只含类型和引用的小型 companion：

```ts
import {typedPlugin} from '@frameweave/engine/plugins';
export interface Parameters {radius:number;color:string}
export const myEffect=typedPlugin<Parameters>('example.my-effect@1.0.0');
```

原生实现由注册表加载，而非由 companion 复制。Energy Vortex 的真实例子见 `plugins/shared/energy-vortex/api.ts`。使用字符串 `plugin(...)` 时运行时 Schema 仍强制执行，但不会静态推导任意字符串 ID 的 TS 参数类型。

## 开发原生实现

```ts
import {definePlugin,canvasSurface} from '@frameweave/engine/plugins';
interface Parameters {radius:number}
export default definePlugin<Parameters>({kind:'generator',create(init){
  const surface=canvasSurface(init);
  return {
    render(context,_inputs,params){
      surface.clear();
      const c=surface.context;
      c.fillStyle='#64efdf';c.beginPath();
      c.arc(init.width/2,init.height/2,params.radius*init.pixelRatio,
        0,Math.PI*2*(.5+.5*Math.sin(context.time)));
      c.fill();return {image:surface.canvas};
    },
    dispose:surface.dispose
  };
}});
```

init.width/height 是实际像素尺寸；logicalWidth/logicalHeight 是设计尺寸，pixelRatio 是引擎请求的捕获比例。init.container 是此插件的独立离屏容器；最终画面来自返回的 image。可以在其中使用原生 WebGL/Three.js/PixiJS，只要按绝对时间绘制并返回保留像素的 Canvas。系统不强迫使用 Canvas2D 算法。

resources 将清单内资源名映射到白名单 URL。资源路径必须留在插件目录内，复制进构建并参与摘要。自行加载资源必须等待完成；Canvas 文字应在绘制前等待所需字体。dependencies 提供锁定的可执行依赖定义；作者如果手动创建依赖实例，就负责它们的释放。preset 依赖仅用于构建展开。

render 可以异步，必须按 context.time/frame 设置绝对状态；禁止依赖上一帧累积、独立动画循环或墙钟。输入图像视为只读借用，输出必须与 Stage 的实际像素尺寸相同。错误会带插件、Stage、帧信息返回，释放异常也会在清理完成后上报。

## 已实现的效果与边界

| 插件 | 实现及验证方式 |
| --- | --- |
| fw.glow | 亮度阈值提取 + Chromium 原生 Gaussian blur + screen 合成；强度 0、阈值 1 的恒等对照 |
| fw.particles | 绝对时间生命周期、种子、区域、速度、颜色和尺寸变化；乱序/新上下文一致 |
| fw.displacement | 带种子和时间变化的波形位移场、CPU RGBA 采样；amount 0 恒等，非零改变像素 |
| fw.motion-blur | 快门内 1–16 个真实时间样本；上游生成器及参数重新求值；运动源水平拖影、静止源清晰 |
| fw.kinetic-type | 逐字素/逐词错峰、弹性入场、多行、关键帧参数；字体加载完成后绘制 |
| fw.noise | 无初始化的种子函数 |
| fw.transform | 图像对象的旋转、缩放、透明度 modifier |
| fw.mix | 两个显式图像端口的混合/合成 |
| fw.cinematic-glow | 可嵌套的位移与发光预设 |
| example.energy-vortex | 独立共享插件目录中的程序化漩涡 |

本组内置算法只需 Chromium Canvas2D，无额外 GPU 依赖；位移采用 CPU 最近邻采样，发光采用浏览器原生滤镜。运动模糊是 sRGB/premultiplied-alpha 时间平均，不是线性光色彩工作流。不能对单张外部 Stage PNG 推断运动；这种调用会明确拒绝，未来需要时间采样 Adapter。不同平台/浏览器没有逐像素一致性承诺。

## 信任与预算

只运行审阅过的本地插件。发现、检索、Schema 检查不执行入口；实际插件代码在原有独立 BrowserContext / opaque sandbox iframe 的 Stage 中运行，同 Stage 的插件共享可信执行环境。CSP 禁止任意远程连接，只允许构建白名单资源。既有构建 worker 有当前用户的 Node 文件权限；本系统不是可托管陌生代码的安全服务，不使用 Node vm 充当安全边界。

元数据 64 KiB；每插件目录最多 1000 文件 / 32 MiB；Stage 画布最多 4 Mi 像素；时间快照池最多 64 Mi 像素；每帧最多 512 步更新。Stage 超时会关闭上下文。以上是宿主和合作代码的预算，不是 OS 级内存/CPU/GPU 安全配额，不能阻止恶意插件绕过自身分配规则；上线多租户服务之前仍需要容器/独立进程及系统资源限制。

## 真实示例与测试

```powershell
npm run typecheck
npm test
npm run test:p4
npm run demo:p4:frame
npm run demo:p4:render
npm run frameweave -- storyboard examples/p4/advanced-mg/project.tsx --frames 0,30,75,150,225,285 --output artifacts/p4/storyboard.png
```

`examples/p4/first-project` 和 `reuse-project` 指向同一个共享 Energy Vortex 目录。`advanced-mg` 是 10 秒完整作品。代码、原始 PNG 像素对照、实际 MP4 和测试日志均在工程内；最终状态见根目录 `P4_REPORT.md`。

没有新增 npm 依赖；本次 SDK、内置效果与 Energy Vortex 均为原创 Apache-2.0。已有字体、FFmpeg、浏览器和原生库继续遵守各自许可证，见 NOTICE 与 licenses/inventory.json。未使用 Remotion 源码。
