# P4-R1：本地模块包规范与包管理器

本实现扩展当前 FrameWeave 仓库，保留 TS/TSX → TVG → 独立 Stage 架构。未引入外部 Canvix 工程、EffectCraft、线上 Registry 或新的 npm 依赖。源码仍以现有 API 和实际运行契约为准。

## 现有设施审计

| 设施 | 当前实现 | R1 复用方式 |
| --- | --- | --- |
| P4 注册表 | `src/plugins/registry.ts`：项目/用户/内置发现、精确引用、内容摘要、SDK 指纹锁 | 受管理包中的效果注册为现有 InstalledPlugin；不创建另一套效果调度器 |
| 效果 Schema/SDK | `src/plugins/schema.ts`、`sdk.ts`：参数、端口、预设、动画信号 | effect.json 继续是效果调用协议；包清单只描述分发及模块 |
| TSX 编译器 | `src/compiler/build.ts`、`plugins/compiler.ts`：类型检查、管线展开、实际导入图边界检查 | 生成动态 import 加载器；对锁定插件启用 ESM 分块；不按效果 ID 分支 |
| TVG | `src/core/types.ts`、`graph.ts`：JSON、Stage DAG、显式 IO、时间映射 | TVG schemaVersion 保持 0.1；仅在现有 Stage.props 扩展 `$packages` JSON 元数据 |
| Web Runtime | `plugins/runtime.ts`、`web/bootstrap.ts`、`render/web-adapter.ts` | 继续初始化/逐帧渲染/释放；给 PluginInit 增加 loadModule；包错误保留错误码 |
| 隔离/资源服务 | `render/server.ts`：opaque iframe、独立 BrowserContext、CSP、构建资源白名单 | WASM 能力声明不授予执行权限；宿主显式 allowWasm/--allow-wasm 才增加 wasm-unsafe-eval；不开放 JS eval、外部网络或 Node 能力 |
| 依赖 | `package-lock.json`、现有插件传递依赖与导入图检查 | npm 依赖仍由引擎锁管理；新增模块包依赖求解，不运行安装脚本 |
| 导出 | `compiler/export.ts`、`portable.ts`、`flatten.ts` | 精确保留包原始字节，携带实际依赖闭包；现有目录/源码容器复用 |

旧 `effects install --project` 仍是显式目录引用；旧用户库仍是不可变快照。新 `packages install` 提供项目内受管理副本、来源授权、完整性和冻结恢复。它们都使用现有 PluginStage 执行效果。

## 清单 v1

每个模块包有 `frameweave.package.json`。机器可读结构见 [package.schema.json](package.schema.json)；`src/packages/manifest.ts` 还执行路径、预算、版本、effect.json 一致性等语义检查。

```json
{
  "schemaVersion": 1,
  "apiVersion": 1,
  "id": "example.orbit-grid",
  "version": "1.0.0",
  "name": "Orbit Grid",
  "description": "Deterministic orbit generator",
  "tags": ["orbit", "wasm"],
  "source": {"kind": "local", "authority": "frameweave.examples"},
  "compatible": "^0.1.0",
  "platforms": ["web"],
  "capabilities": ["canvas2d", "wasm"],
  "permissions": {"filesystem": false, "network": false, "process": false},
  "entry": "main",
  "effect": "./effect.json",
  "modules": {
    "main": {"format": "javascript", "path": "./index.ts"},
    "phase": {"format": "wasm", "path": "./phase.wasm", "abi": "core-v1"},
    "shader": {"format": "wgsl", "path": "./orbit.wgsl"},
    "palette": {"format": "resource", "path": "./palette.json"}
  },
  "dependencies": {}
}
```

`entry` 是命名模块表中的默认 JS/TS 入口。效果包另提供 `effect`，指向原有 effect.json；两者的 ID、version、compatible 和入口必须一致，后端须为 web。参数/端口/关键帧仍由原协议处理。资源包可以省略 entry/effect，只声明模块和依赖，不需要伪造视觉插件。

| format | loadModule 的结果 | R1 边界 |
| --- | --- | --- |
| javascript | JS 模块命名空间 | JS/TS/TSX 经现有强制类型检查与 esbuild；运行时动态 import；默认效果入口导出 PluginDefinition |
| wasm | WebAssembly.Instance | 预编译 core-v1；异步编译/实例化；不运行 Rust 工具链；不提供 WASI 或任何 host imports |
| wgsl | UTF-8 字符串 | 异步加载并校验；创作者可交给自己的 WebGPU Adapter；本阶段不创建 GPU 管线 |
| resource | Uint8Array | 异步读取并校验，不推断媒体解码与资源生命周期 |

Rust 预编译包使用 `format:wasm, abi:core-v1, producer:rust`，入口和 Rust 生成的导出 ABI 由 JS 胶水显式适配。R1 不支持 wasm-bindgen 自动导入、WASI 或组件模型。示例的微型 phase.wasm 来自同目录 WAT，**并非 Rust 编译产物**；本机无 Rust 工具链，没有宣称完成 Rust 编译链验收。

## 身份、信任与哈希

可信包身份是 `(source.kind, source.authority, id, version, integrity)`，不只是 ID/version。R1 来源仅支持 local；`--trust local:authority` 是宿主对已审阅本地来源的显式授权，保存在项目配置。清单自报 authority 不能自动获信任；这也不是发布者签名或身份认证。未来官方 Registry 应提供独立来源验证/签名策略，不能把本地 authority 直接当作远程认证。

完整性为 `sha256-<hex>`。包内每级目录按字符顺序遍历；每文件记录 `[相对路径, 原始字节 SHA-256 hex]`，将有序记录数组的无空白 JSON 以 UTF-8 编码后计算包 SHA-256，路径统一 `/`。JSON 编码绑定文件边界，二进制中的 NUL 不能伪造另一种文件布局。不做换行转换；清单、源码、资源和许可证都进入摘要。node_modules/.git/.frameweave 不属于包内容。拒绝内部链接、越界路径、特殊文件，最多 1000 文件/32 MiB，清单最多 64 KiB，模块最多 64 个。每个命名模块另有原始文件 SHA-256。

同 ID/version 的不同来源或内容在已安装项目中拒绝替换，必须使用新版本。发现/安装/列表/校验不执行入口、不下载代码、不执行 scripts。已复制副本不随作者目录变化。安装可以用 `--integrity sha256-...` 额外固定审核得到的摘要。

安装目录默认是项目内 `.frameweave/packages/<id>@<version>/<hash>/`。项目自定义 store 必须位于自身子目录且祖先不能是链接。安装使用 staging、复制后重新校验，再发布配置/锁。项目操作有排他文件锁；普通异常会回滚配置/锁，进程崩溃可能留下 operation 文件或未引用快照，R1 不自动清除它们，也不承诺跨断电的多文件事务。

## 依赖与双锁

`frameweave.packages.json` 保存直接 requirements、trustedSources 和可选 store；不保存作者机器绝对目录。`frameweave.packages.lock.json` v1 保存平台/API、原始要求、精确 roots、包来源、包完整性、模块完整性及精确传递 dependencies。跨项目拷贝这两个文件后可从本地可信 catalog 冻结恢复。

一个项目中每个包 ID 选一个稳定版本。沿用现有 exact、^、~ 语义，不支持 prerelease、通配符、OR 或完整 npm ranges。解析按 ID 排序、稳定版本降序回溯，新增包时优先保留已有精确锁；冲突明确失败。最多 10000 次求解尝试。缺失依赖、依赖环、不受信来源、平台/API 不兼容分别报错。`restore` 只检查精确锁，不重新选版本、不改锁；catalog 中出现更高版本不会影响恢复。

P4 的 `frameweave.plugins.lock.json` 继续固定效果 ABI/插件内容和 SDK/npm 运行时指纹。`packages install` 不悄悄刷新这个审核门。新增效果后仍需显式 `effects lock`。包 dependencies 负责包分发及 loadModule 的显式依赖访问；effect.json dependencies 保持既有 P4 定义/预设依赖含义。两层依赖各自验证，不凭名字自动暴露任意模块。

卸载只能删除直接要求，仍被其他包需要的 ID 会报 E_PACKAGE_DEPENDENT；删除直接包后会剔除不再可达的传递包，只删除工作区受管理的精确目录。

## 操作与调用

在本工作区运行，涉及用户库的测试继续隔离到工作区 FRAMEWEAVE_HOME。仓库示例携带精确锁，但安装副本不入 Git；新 checkout 先 restore。新创作工程第一次添加包使用 install；已有锁的缺失/损坏副本应显式 restore，install 不会掩盖损坏状态：

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
npm run frameweave -- packages inspect plugins/packages/orbit-grid --project examples/p4-r1/project.tsx
npm run frameweave -- packages restore plugins/packages --project examples/p4-r1/project.tsx
npm run frameweave -- packages install plugins/packages/orbit-grid --project examples/p4-r1/project.tsx --trust local:frameweave.examples
npm run frameweave -- packages list --project examples/p4-r1/project.tsx
npm run frameweave -- packages verify --project examples/p4-r1/project.tsx
npm run frameweave -- effects lock --project examples/p4-r1/project.tsx
npm run frameweave -- frame examples/p4-r1/project.tsx --frame 24 --allow-wasm --output artifacts/p4-r1/frame-24.png
npm run frameweave -- packages uninstall example.orbit-grid --project examples/p4-r1/project.tsx
```

catalog 中有多个包时使用 `--add id@version` 指定直接要求，可重复 --add/--trust。packages 命令始终要求 --project。Node API 从 `@frameweave/engine/node` 导出 installPackages、restorePackages、uninstallPackage、installedPackages、verifyPackages、resolvePackages 和清单类型。

TSX 仍调用 `plugin('example.orbit-grid@1.0.0', params)`，无需导入作者机器的实现路径。插件内部：

```ts
const wasm = await init.loadModule({module:'phase', format:'wasm'});
const shader = await init.loadModule({module:'shader', format:'wgsl'});
const palette = await init.loadModule({
  dependency:'author.palette', module:'colors', format:'resource'
});
```

依赖只能使用当前包锁中声明的直接依赖 ID；返回格式必须匹配清单。模块 Promise 缓存在当前插件初始化环境；浏览器 JS 命名空间由 Stage 内 ESM 缓存。WASM 实例、内存、Canvas、GPU 对象不跨 Stage 共享。非 JS 资源在运行时校验原始字节；JS 导入图和原始包在构建时验证，编译分块经既有构建输出白名单服务。未调用的 JS 辅助模块不会被请求或执行，但仍参与类型检查、打包和内容锁。

包的资源模块按原始字节复制，包括 GLTF，不经过普通 Resource 的 URI 改写；需要解码/链接模型时由调用方显式处理模块。packages list/verify 可以检查导出 TSX 容器的实际内嵌包；安装、恢复、卸载要求在创作工程操作后重新导出，不修改临时还原缓存。

包没有默认 Node 文件系统、进程或外部网络权限。浏览器仍仅允许同一构建服务的声明资源；同一 Stage 内可信插件共享环境，能力清单不是对恶意 JS 的 OS 级沙箱。WASM 的空 imports 会拒绝 host/WASI 模块。与 [WebAssembly 的宿主导入模型](https://webassembly.org/docs/portability/) 和 [CSP3 的 WASM 专用开关](https://w3c.github.io/webappsec-csp/) 一致。

## 可复现导出与验收

普通目录导出及 `--single-file --layout capsule` 可携带实际使用的包依赖闭包。包路径相对化，原始包字节及 package lock 保持不变；不因源码改写悄悄改变包身份。导出无须真实用户库或作者目录。现有纯 TS 普通扁平导出继续保留；包的模块加载元数据尚不能扁平化，遇到包明确 E_FLAT_EXPORT，建议源码容器。新包不支持 modules external 策略，避免声称可复现却依赖任意机器路径。

```powershell
npm run typecheck
npm run test:packages
npm run verify:p4-r1
npm test
```

test:packages 覆盖依赖回溯/冲突、环、缺失包、平台拒绝、来源授权、不可变身份、包/运行时资源哈希错误、冻结恢复、卸载与路径保护，以及实际浏览器按需加载、远程请求拒绝、WASM host imports 拒绝、跨项目 RGBA 一致、可解码视频及导出渲染。

verify:p4-r1 使用真实示例 TSX，顺序 0/24/47/7/24/0 请求，再编码 640×360、24 FPS、48 帧短片；原作者目录和安装目录移开后，分别比较恢复项目、目录导出、单 TSX 容器的全部 48 帧（逆序，RGBA 容差 0），并渲染参数最小/最大值。每次独立输出到 artifacts/p4-r1/verified/run-*；latest.json 指向实际 proof.json。它不修改源码示例或其他 worktree。

当前目录较长，ONNX 原生加载器需要 Windows 扩展路径；完整历史语义检索测试可设置同一隔离库的等价路径：`$env:FRAMEWEAVE_HOME = '\\?\' + (Join-Path (Get-Location) '.frameweave/user-home')`。这不会共享其他工作区缓存。

## P4-R2 接口与未实现范围

1. 来源验证：扩展 PackageSource 的版本化联合类型，注入可信 Registry/签名验证；完整性继续固定解包后的包字节，不能只固定可变下载 URL。
2. Resolver：保留精确 PackageLock/ModuleRequest，未来可增加可审计升级、离线 cache/归档格式。R1 不包含线上 Registry、下载、发布、搜索服务或签名认证。
3. 执行后端：在现有 Stage Adapter 边界增加 WebGPU 设备/管线、WASM host ABI、资源预算及释放协议。R1 只加载 WGSL，不验证其 GPU 编译；没有自动 Rust 构建、WASI 或 wasm-bindgen 适配。
4. Agent 搜索：PackageManifest 的 description/tags/modules/capabilities/ports（effect.json）可用于静态能力索引；效果已接入原 effects search。R1 无新的语义模型或远程检索。
5. 导出：在 flat exporter 中保留 RuntimePackage + 模块加载器及嵌入字节的显式声明；本阶段先复用已验证的源码容器，不放宽旧模块语义边界。
6. 事务：补充崩溃恢复/journal、可检查的未引用快照 GC、多进程读写一致性。R1 在正常失败下回滚，但不把本地文件操作当作数据库事务。

公共新增接口集中在 packages 层、PluginInit.loadModule、生成 Stage.props.$packages。未修改关键帧/动画 AST、时间单位、Stage 输入输出或 TVG 基础 Schema；整合其他 Agent 时应协调这些共享文件。

整合后的执行策略：包声明 WASM 只描述需求。实际渲染仍需 Renderer.create(build, {allowWasm:true}) 或 CLI 的 --allow-wasm；默认拒绝。包兼容性统一读取根 package.json 的实际引擎版本。
