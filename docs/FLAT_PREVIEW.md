# 扁平 TSX、效果后端与交互预览

## 直接运行源码

```powershell
npm run frameweave -- ./my-video.tsx
# 也可控制预览分辨率；不打开窗口时会输出本地预览地址
npm run frameweave -- ./my-video.tsx --width 640 --no-open
# 复杂镜头可进一步降低预览尺寸
npm run frameweave -- ./my-video.tsx --width 480
# 比对最终像素时使用原有软件渲染和无损截图流程
npm run frameweave -- ./my-video.tsx --accurate --width 640
```

不需要 `dev` 子命令。程序启动后打开播放器并持续监听源码。支持播放/暂停、时间轴、输入帧号、前后逐帧、空格播放/暂停、方向键逐帧。保存入口、依赖源码、Shader、CSS、已声明资源或插件锁后自动重建。默认程序打开的窗口关闭时会结束；使用 `--no-open` 时，通过关闭按钮或 Ctrl+C 结束。

播放器先显示构建状态，完成编译、初始化和第一帧后开始显示画面；没有预先生成整段视频或 MP4。复用 Renderer，按当前播放时间计算需要显示的帧，渲染慢时跳过显示帧以维持播放时间。复杂工程不能保证 24/30/60 FPS。正式导出仍逐帧完整渲染。

默认采用性能预览：宽度不超过 640px，浏览器自动选择 GPU；满足严格条件的全画幅独立 Canvas 直接读出 PNG，混合 DOM、CSS 遮罩/透明度和不保留绘图缓冲的 WebGL 则回到浏览器截图。相同求值结果的声明式 Stage 可以复用缓存；原生 Stage 仍按完整时间上下文求值。最终播放器画面在不透明底色时使用质量 0.92 的 JPEG，透明画面使用 PNG。跳过逐帧空白/全黑缩略图检测；参数、端口、依赖、资源错误仍会报告。性能预览与最终导出可能有 GPU 像素和 JPEG 差异，不能作为逐像素验收依据。

`--accurate` 恢复与正式导出相同的软件渲染、完整浏览器截图、PNG 及空白检测；默认尺寸不超过 960px，可用 `--width` 指定。`frame`、`storyboard`、`preview ... --output` 片段导出和 `render` 命令继续使用精确流程。API 的 `renderFrame()` 一直返回 PNG；新的 `renderPreviewFrame()` 返回 `{image,mime,...}`，只有显式创建 `Renderer` 时启用 `{preview:true}` 才启用性能策略。预览 HTTP 接口 `/frame?...&format=png` 只指定无损显示编码，并不切换 GPU 策略。

这些优化保留每个 Stage 独立 BrowserContext、sandbox iframe、确定性时间和显式 PNG/JSON 端口。多 Stage 仍有读图、传图、解码和合成开销，尚未实现浏览器内常驻合成或解码视频代理缓存。实测数据及复现命令见 [预览性能报告](../PREVIEW_PERFORMANCE_REPORT.md)。

源码变化后，新构建使用独立输出目录及候选 Renderer，第一帧成功后才替换旧版本，避免读到被覆盖的旧资源。编译/初始化失败会显示错误并保留上一版，修改正确后恢复。该版本自动重建完整工程，**尚未实现只编译/替换受影响 Stage 的增量更新**。同一时刻只计算一个预览请求，避免请求队列无限增长。

服务只监听 127.0.0.1 的随机端口，需要每次会话生成的访问令牌；没有远程部署或多人权限服务。项目依旧是受信任代码。

## 普通单文件 TSX

```powershell
npm run frameweave -- export examples/export-demo/project.tsx --single-file --output exports/My-Film.tsx
npm run frameweave -- exports/My-Film.tsx
npm run frameweave -- frame exports/My-Film.tsx --frame 120 --output artifacts/frame.png
npm run frameweave -- render exports/My-Film.tsx --output artifacts/film.mp4
```

`--single-file` 现在默认生成扁平普通 TSX：真正的类型、接口、函数、变量、JSX、Composition 和效果实现都在源码中。没有 `frameweavePortable`、源码字符串表、eval 或恢复模块的预处理。输出使用官方 SDK 和明确的 npm 库引用，原生 Stage 通过同文件的具名工厂导出引用。

编译器用 TypeScript 的 AST、符号与别名解析进行源码转换：每个模块的顶层名称增加保留原名的 `FW_序号_` 前缀，局部变量保持作用域；对象简写保留原键名，导入绑定指向正确的定义。静态依赖按顺序展开，保留 TS 类型和顶层 await。原生 React 文件单独通过锁定版本的 TypeScript JSX 转换处理，保留类型，避免与场景 JSX Runtime 混用。最终仍交给原有严格 TypeScript 门禁和 esbuild 编译，并先实际构建一次才写出结果。

普通 CSS 在对应原生 Stage 工厂中安装，避免泄漏到其他 Stage。图片、字体、模型和媒体使用内容去重的数据常量；Resource 支持 base64 data URL。运行时仅为浏览器资源服务生成构建资产文件，不恢复隐藏的 TS/JS 模块。插件许可证和字体 OFL 等保留在注释中。

这是一条有明确边界的源码转换路径，不是完整通用 ESM 链接器。普通静态同步循环已支持；含顶层异步求值的循环、动态 import/require、import.meta 模块身份、CSS modules、含运行时代码的仅类型依赖等会明确报错。外部库的直接重导出需改成先 import 再 export。满足条件的单文件再次导出保持原始字节，详见 [重复导出及 P2 改进](P2_POLISH.md)。普通目录导出仍可用于其他模块结构；源码容器必须显式选择：

```powershell
npm run frameweave -- export ./project.tsx --single-file --layout capsule --output exports/Source-Capsule.tsx
```

生成文件不等于视觉验收；仍需指定帧和完整视频对比。官方 SDK、npm 依赖、浏览器、FFmpeg 继续属于运行环境。

### Runtime 约束与资源完整性（F01 / F02）

新导出的普通 TSX 包含可读的 `export const frameweaveRuntime = {...} as const`。这是普通 TypeScript 数据声明，不恢复源码模块、不执行 eval。构建器在执行工程代码前检查实际 SDK 版本、SDK/编译器源码与 package.json / package-lock.json 的 SHA256 指纹，以及导出时使用的外部 npm 包版本；不匹配报 `E_RUNTIME_LOCK`。导入的 TS 模块和原生 Stage 模块中的约束也会检查。该名称为导出协议保留。

capsule 同样携带约束；普通目录导出携带 `frameweave.runtime.json`。插件的 `compatible` 检查读取实际 package.json 版本，已取消写死的 0.1.0。正常手写 TS/TSX 不强制添加该声明。旧 flat 文件没有新增指纹，需要从原工程重新导出，才能获得同等保证。升级 SDK 应审查并重新导出，不自动修改旧约束。

内容约束用于发现运行环境不一致，不是安全认证。已安装 npm 包内容依赖正确的锁定安装；浏览器、驱动、操作系统和 FFmpeg 仍是运行环境的一部分，不宣称跨 GPU / 操作系统逐像素一致。

SVG 本地 `image` / `feImage` 的 href、xlink:href 支持递归嵌入 PNG/JPEG/WebP/SVG。原工程渲染与导出使用相同处理，因此嵌套图片在导出前就必须正确；传递文件也纳入源码监听。PNG 等已有 data URL 保留；无须改写的普通 SVG 保留原始字节。

缺失文件、网络或绝对路径、越过项目/插件根目录、循环引用均报 `E_SVG_RESOURCE`。暂不支持的外部 use、CSS 外部 url()/@import、DOCTYPE、xml:base、处理指令、script、foreignObject、SMIL 动画等也明确拒绝。相对图片引用不能藏在无文件基址的 SVG data URL 中。单次 SVG 处理限制为 32 MiB、8 层外部依赖、256 个图片引用、20,000 个元素，导出策略可进一步收紧资源大小。自定义原生 Stage 代码仍可自行实现其他 SVG/图形算法。

## 普通可导入效果模块

效果定义是普通 TS 对象，可在同一文件定义，也可通过标准 import 引入。`defineEffect` 不在导入时检查后端或执行效果：

```tsx
import {defineEffect, canvasSurface, PluginStage} from '@frameweave/engine/plugins';

export const Dot = defineEffect<{speed:number}>({
  schemaVersion:1, apiVersion:1, id:'my.dot', version:'1.0.0',
  name:'Moving Dot', description:'按绝对时间移动的光点',
  kind:'generator', engine:'web', compatible:'^0.1.0',
  parameters:{speed:{type:'number',default:1,minimum:0,maximum:10}},
  inputs:{}, outputs:{image:'image'},
}, {
  kind:'generator',
  create(init) {
    const surface=canvasSurface(init);
    return {
      render(time,_inputs,params) {
        surface.clear();
        surface.context.fillStyle='#65e9d5';
        surface.context.fillRect(init.width/2+Math.sin(time.time*params.speed)*40,20,8,8);
        return {image:surface.canvas};
      },
      dispose() {surface.dispose();},
    };
  },
});

// 放入 Composition；与现有插件引用可以组合
const visual=<PluginStage id="visual" engine="web" pipeline={[Dot.use({speed:2})]}/>;
```

从其他文件导入时，入口需要具名重导出所用效果，供引擎定位可编译源码，类似现有原生 Stage 工厂契约：

```ts
import {Dot} from './effects/dot.ts';
export {Dot};
```

扁平导出会自动生成这些具名绑定，并携带实际使用的效果及依赖实现。因此导出文件可以在没有原私有库、用户库或插件锁的目录中运行。纯内联效果按普通工程源码管理；使用安装目录的插件仍保留原有内容锁及导入图约束。

## 后端检查

构建 Stage 时比较 `effect.manifest.engine` 和 `stage.engine`，包括实际使用的传递依赖。不匹配返回 `E_EFFECT_BACKEND`，包含效果、要求后端和 Stage 后端。未使用的效果即使声明其他后端也不会因此报错。

后端匹配后，具体库、GPU 等问题交给原生执行及错误诊断，不引入额外能力分类。原有参数、输入输出、版本和生命周期检查继续保留。当前只有 Web 的真实执行适配；两个声明都写 Blender 时，匹配检查通过，但会返回 `E_BACKEND_UNAVAILABLE`，不宣称已支持 Blender 渲染。
