# Shared Graphics Contracts

正式纯库 `@frameweave/graphics-contracts@1.1.0`。读取 [PUBLIC_API_V1.md](PUBLIC_API_V1.md) 获取公共 API、独立构建、R1/npm 管理边界和兼容策略；数据规范仍为 [GRAPHICS_SCHEMA_V1.md](GRAPHICS_SCHEMA_V1.md)。当前稳定化验证见 [STABILIZATION_REPORT.md](STABILIZATION_REPORT.md)。库无 Stage、AnalysisTask、Registry 或包管理器运行依赖。

```powershell
node node_modules/typescript/bin/tsc --noEmit -p modules/graphics-contracts/tsconfig.json
node --import tsx --test modules/graphics-contracts/tests/*.test.ts
node --import tsx modules/graphics-contracts/scripts/build-package.ts
node --import tsx modules/graphics-contracts/experiments/storyboard.ts
```

拼图命令依赖渲染测试生成的图片。构建器默认输出到一个新的 `artifacts/graphics-stabilization/package` 目录，已有目录会拒绝覆盖；可传入另一个新目录。全部路径均从工作区根目录执行。发布与安装的是独立构建产物，源码目录的 `dist` 不会自动生成。专项测试不读写全局插件库。

- `types.ts` / `validate.ts`：Path、Mask、Mesh、Skeleton、TextLayout 的类型与严格校验。
- `track-types.ts` / `track.ts`：正式 TrackData 类型、唯一 Validator 和原算法 Reader；原型入口仅兼容转发。
- `resources.ts`：显式资源引用与字节完整性验证。
- `path-mask.ts`：Path→Mask、单位转换、RGBA Mask 解码和采样。
- `examples/project.tsx`：独立 Vector、Mask、Track Reader、Marker Stage，通过现有 json 端口/file Resource 交换结果。
- `examples/professional-modules.ts`：未来 3D/Puppet/Typography 模块的接收边界示例。
- `examples/track-mvp.json`：原型真实验证数据的逐字节副本，不是人工轨迹；没有重新运行推理。原始媒体/模型/视频帧未复制。
- `tests/types.ts`：包含编译期反例的类型检查。

`prepare-examples.ts` 只用于有意更新本模块的例子；会复制当前 MVP 验证数据并重算本模块例子的身份，不触碰插件锁。真实 Track 来源 SHA 固定在测试中，来源变化必须审查并更新测试，不能静默伪装为同一份证据。

输出位于本工作区 `artifacts/graphics-contracts`：PNG、两项像素/查询证明、8 秒 MP4、测试日志。Mesh/Skeleton/TextLayout 仅完成静态交换契约，不包含蒙皮、字体塑形、GPU 或 WASM 执行器。

本轮独立分发与 C3 证据位于 `artifacts/graphics-stabilization`。R1 Manifest 没有 `effect` 字段，标准 ESM 代码可被 Node 工具、专业模块、AnalysisTask 与 Stage 同样调用；安装/锁定/读取文件由调用方准备层负责。Canvas 栅格化器仅在显式调用时需要浏览器 DOM。
