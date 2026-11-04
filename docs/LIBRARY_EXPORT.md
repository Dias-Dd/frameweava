# 用户插件库、语义搜索、默认创作流程与工程导出

**更新：**`--single-file` 默认已改为普通扁平 TSX，当前播放器和效果后端行为见 [FLAT_PREVIEW.md](FLAT_PREVIEW.md)。本页的源码容器描述对应显式 `--layout capsule`，不再是单文件默认形式。

在引擎根目录执行以下命令。`npm ci` 安装锁定的依赖；新机器还需 Chromium/Edge/Chrome 和 FFmpeg。此版本仍执行**受信任本地代码**，不是陌生代码托管平台。

## 用户级共享插件

```powershell
npm run frameweave -- effects install plugins/shared/energy-vortex --global
npm run frameweave -- effects list
npm run frameweave -- effects info example.energy-vortex@1.0.0
```

`effects install` 未传 `--project` 时也默认安装到用户库。它保存源码和资源的不可变副本，不是对作者工作目录的引用。Windows 默认位于 `%LOCALAPPDATA%/FrameWeave/plugins/<id>@<version>`；其他系统默认 `~/.local/share/FrameWeave`。设置 `FRAMEWEAVE_HOME` 可以完整隔离用户库、搜索索引和模型缓存。相同版本相同内容可重复安装；不同内容必须升级版本。

普通新工程自动发现用户库，不必重复配置共享目录。TSX 可以直接调用：

```tsx
import {plugin,PluginStage} from '@frameweave/engine/plugins';
const visual=PluginStage({id:'art',pipeline:[
  plugin('example.energy-vortex@1.0.0',{radius:180,color:'#65e9d5'})
]});
```

项目仍须显式审核并锁定：

```powershell
npm run frameweave -- effects lock --project path/to/project.tsx
```

搜索发现不等于升级锁。构建校验插件和传递依赖的内容哈希，以及完整 SDK / package-lock 运行时哈希。当前锁命令记录可见目录；导出时只携带实际使用插件及其传递依赖。项目显式副本优先于同 ID、同版本的用户副本，锁文件继续验证内容。项目配置可设置 `"userLibrary":false` 实现可重复的封闭发现。

旧的 `effects install <directory> --project <entry>` 仍是项目级目录引用。导出的携带工程使用相对路径引用自己的副本，无需全局安装。若希望在其他工程复用携带的插件：

```powershell
npm run frameweave -- effects install delivered-project/modules --global
```

混合导出中独立文件位于 `files/`，因此对应目录为 `delivered-project/files/modules`。

## 本地语义搜索

```powershell
# 首次下载并缓存模型、建立描述向量；不上传工程或插件源码
npm run frameweave -- effects index
npm run frameweave -- effects search "文字按照顺序一个一个弹出来" --offline --limit 3
npm run frameweave -- effects search "镜头运动拖影" --mode semantic --kind image-effect --engine web
# 不需要模型、网络或凭证；支持一字符编辑距离容错
npm run frameweave -- effects search "particls" --mode keyword
```

默认 `hybrid`：多语言句向量余弦相似度加关键词评分；`semantic` 只按向量，`keyword` 使用关键词和轻量拼写容错。过滤项还包括 `--input`、`--output`、`--compatible`。结果包含具体评分，低分召回并不保证适合使用，Agent 需查看 `info` 的 IO / 参数 / 依赖。

实现使用 Apache-2.0 的 Transformers.js 4.3.2 + 本地 ONNX CPU 推理，固定 `Xenova/paraphrase-multilingual-MiniLM-L12-v2` 的提交 `2c4055b12046f11709e9df2c122e59ffbdc2f900`，q8、384 维。其上游 Sentence Transformers 模型为 Apache-2.0。首次模型缓存约 129 MiB，此后可离线推理。索引为用户库中的普通 JSON，不需要向量数据库，描述变化会重新计算对应向量。描述、名称、标签及 IO 类型进入索引，源码不进入模型。

模型不可用时明确返回 `E_SEARCH_MODEL`，不会将关键词搜索伪称语义搜索。无缓存的新环境先在线运行 `effects index`；模型不会被携带到视频工程导出物里。当前是小型目录的线性相似度检索，没有服务端市场、权限账号、多进程事务索引或 ANN 数据库。

模型来源：[ONNX 模型仓库](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2)、[上游模型及许可证](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)、[Transformers.js](https://github.com/huggingface/transformers.js)。

## 默认 Agent 创作流程

```powershell
npm run frameweave -- init projects/my-video
npm run frameweave -- workflow
npm run frameweave -- effects create projects/my-video/plugins/orbit --id my.orbit --description "可重复渲染的轨道光点"
```

根目录和 `init` 新建工程均提供 `AGENTS.md`：搜索 → 查看少量候选 → 复用精确版本，缺少能力时创建本地插件 → 类型/清单验证 → 关键帧和短片视觉检查 → 安装到用户库 → 交付与导出验证。可复用视觉算法默认进入插件；镜头布局与一次性辅助函数仍可留在工程里。纯函数脚手架不要求 GPU 生命周期；生成器和图像效果脚手架包含清理。

此流程是可发现的 Agent 指令和 CLI 支持，不是运行时拦截任意代码后自动打包。脱离这些指令的外部聊天 AI 不会自动执行本地流程。引擎不在渲染时自动发布插件，也不强迫使用效果库。

## 导出策略

```powershell
# 普通可编辑目录，源码、私有模块、资源均随包携带
npm run frameweave -- export examples/export-demo/project.tsx --output exports/my-film
# 自选名字的单 TSX；三个策略轴分别为 merge / merge / embed
npm run frameweave -- export examples/export-demo/project.tsx --format tsx --single-file --output exports/My-Own-Film.tsx
# 源码集中，插件源码及资源独立携带
npm run frameweave -- export examples/export-demo/project.tsx --output exports/mixed --sources merge --modules copy --assets copy
# 明确保留外部依赖，不宣称可移植
npm run frameweave -- export examples/export-demo/project.tsx --output exports/dependent --sources merge --modules external --assets external
```

| 策略轴 | 可选值 | 行为 |
| --- | --- | --- |
| 工程源码 | `preserve` / `merge` | 保留 TS/TSX/JS/CSS/Shader 等文件，或集中进入源码容器 |
| 私有共享模块 | `copy` / `merge` / `external` | 随包独立携带、集中进入容器、或显式保留机器环境依赖 |
| 资源 | `copy` / `embed` / `external` | 随包携带、内容寻址嵌入、或显式保留外部文件引用 |

默认是 `preserve/copy/copy`。任一集中策略需要一个入口容器时，其余独立文件放在 `files/`；纯目录模式保持普通工程结构。`--single-file` 与任何外部/分文件策略冲突都会报错，不会静默改变要求。输出已有文件/目录时拒绝覆盖。

**单 TSX 的明确格式边界：**这是包含原始模块文本和资源表的、可编辑的标准 TSX 源码容器。不是把所有模块语句扁平合并成一个普通 TS 模块，也不是转译 JS 改后缀。每个模块以带原始文件名的多行模板字符串保存，保留 TS 类型、JSX、原生 React 的 pragma、模块作用域、循环引用和顶层 await。引擎使用 TypeScript AST 读取纯字面量元数据，在 `.frameweave/portable/<hash>/` 恢复文件，再执行原有强制类型检查和 esbuild 构建。模块链接与循环语义由成熟工具处理；没有自制 JS 链接器。普通 `tsc` 不会检查字符串里的源码，**FrameWeave 构建会**。此文件需要 FrameWeave 加载，不能作为无需引擎的浏览器程序直接执行。

```powershell
npm run frameweave -- frame exports/My-Own-Film.tsx --frame 120 --output artifacts/portable-frame.png
npm run frameweave -- render exports/My-Own-Film.tsx --output artifacts/portable.mp4
# 修改容器中现有插件后，显式审核和更新嵌入锁
npm run frameweave -- effects lock --project exports/My-Own-Film.tsx
```

增加新插件应在创作工程中完成后重新导出；不会把临时缓存目录悄悄变成私有依赖。完整普通 TS 模块扁平化且保留所有类型/ESM 语义的输出格式尚未实现。

资源表以 SHA-256 保存唯一字节，多路径/多 ID 可以指向同一份字体、图片、音视频或模型数据。重复资源只在 TSX 嵌入一次；还原时保留路径别名，必要时每个使用方可创建各自的解码对象。没有承诺跨 Stage 共享活体 GPU 对象。音视频嵌入不等于新增音频混音、NLE 或视频时间轴。GLB 和 glTF 支持携带，glTF 的本地 buffer / texture 传递依赖会收集并改写到可服务的路径；不自动收集模型格式之外任意运行时代码构造的依赖。字体邻近 OFL / LICENSE 会随包保存。

默认单资源嵌入限额 16 MiB，可用 `--max-asset-mb N` 显式提高到最多 256 MiB；容器还原总量上限 256 MiB、4000 个路径。大文件建议 `--assets copy`。不可收集的计算式动态模块、宿主程序/原生插件、`import.meta` 构造资源 URL、远程 URL、越界辅助源码、缺失资源都有明确错误。第三方 npm 依赖保持显式依赖，要求目标引擎安装兼容且锁定的包；不复制整个 node_modules。任意运行时代码不可能靠静态分析完全证明资源闭包，资源应通过 Resource、manifest.resources 或静态导入声明。

导出报告记录实际策略、私有插件、npm 包版本、资源去重、外部文件和警告。`selfContained` 指工程私有代码/声明资源闭合，仍需兼容的官方 SDK、npm 依赖、浏览器和 FFmpeg。生成文件时报告明确标记 `NOT_YET_RENDERED`；真正跨实例验证证据另存，绝不以成功写文件替代渲染验收。

## 实际验证

```powershell
npm run typecheck
npm test
npm run verify:extended
```

最后一条会重新安装独立的 npm 依赖，原工程和作者插件目录暂时移走后验证，完成后在 finally 中恢复。请勿同时编辑或渲染该示例目录。比较全部 240 帧原始 RGBA，误差阈值为零，导出完整十秒 MP4并解码检查。输出位于 `artifacts/extended/verified/`。新工程 `examples/export-demo` 包含原生 Three.js、实际 GLB 模型加载、GLSL、CSS、TSX 动画标题、异步辅助模块、共享插件和重复字体引用。
