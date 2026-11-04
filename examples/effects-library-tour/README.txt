Frameweave — 全效果清单与可运行示例

清单：../../docs/effects-catalog/index.html
      ../../docs/effects-catalog/functions.txt
      ../../docs/effects-catalog/functions.json

从实际仓库根目录执行（不是 Codex 对话的空目录）：

1. 安装/恢复此示例的精确 R1 依赖，不写入全局插件库：
node --import tsx examples/effects-library-tour/prepare.mjs

2. 直接源码预览：
npm run frameweave -- examples/effects-library-tour/project.tsx

3. 单帧：
npm run frameweave -- frame examples/effects-library-tour/project.tsx --frame 36 --output artifacts/effects-tour/frame-36.png

4. 故事板（未自动降低分辨率）：
npm run frameweave -- storyboard examples/effects-library-tour/project.tsx --frames 0,24,48,60,72,95 --width 640 --height 360 --output artifacts/effects-tour/storyboard.png

5. 完整 4 秒 MP4：
npm run frameweave -- render examples/effects-library-tour/project.tsx --output artifacts/effects-tour/demo.mp4

6. 修改 width/height/fps/durationInFrames 或任意参数后再次运行即可。
   比如修改 Composition 为 1280×720；Stage 使用 init.width/init.height。

本示例实际调用：
  动画 Native 源接口：createNativeTransitions().cardFlipWipe
  图像正式 R1 接口：processRaster(... fx.over)、processImage(... fx.brightnessContrast / fx.vignette)、processPa(... fx.glow)
  空间 Native 源接口：twistPositions、wavePositions、createFeedbackParticles().sample、createNativeParticleRenderer().render
  SDK 基础：defineNativeStage、GpuPixelScope、drawMesh、withGpuResources。

native-image-effects@0.4.0 使用正式命名导入与锁；转场和空间适配器目前使用明确的仓库相对导入。
示例没有远程资源、额外图片、字体或音频；像素在 Native GPU 上生成，Stage 内为线性 F32。
MP4 为常规 SDR H.264 NVENC 输出，不宣称 HDR10 交付。没有 CPU/SDR 效果回退。
缺少已核验 Native/SpiderMonkey 可执行文件时按仓库说明显式构建/配置；不自动切到 Chromium。

已在 Main f4fafbcc 基线 + 此示例工作树实际运行：
  640×360 PNG；6帧故事板；4秒/24fps/96帧MP4；FFmpeg完整解码96帧。
  重新打开会话的第36帧重复性检查及原始日志：artifacts/effects-library-catalog。
完整清单是源码/API盘点，不代表本轮重新认证了全部函数、所有参数和跨平台执行。

当前已知限制：同一工程的多个 CLI 命令应顺序执行。
同时编译同一工程会复用相同构建目录，可能触发完整性拒绝 E_PACKAGE_INTEGRITY；本轮保留该失败，未放宽校验。

清单可再生成：
node scripts/generate-effects-catalog.mjs
