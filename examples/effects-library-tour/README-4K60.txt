Frameweave — 4K / 60 FPS 效果库示例

源码：project-4k60.tsx
参数：3840×2160，60 FPS，4秒，240帧。
旧版 project.tsx 保留。

在实际 Frameweave 仓库根目录运行：
node --import tsx examples/effects-library-tour/prepare.mjs

完整视频：
npm run frameweave -- render examples/effects-library-tour/project-4k60.tsx --memory-mib 4096 --max-concurrency 1 --initial-concurrency 1 --output artifacts/effects-library-4k60/Effects-Library-Tour-4K60.mp4

原生 4K 单帧（第90帧 / 1.5秒）：
npm run frameweave -- frame examples/effects-library-tour/project-4k60.tsx --frame 90 --memory-mib 4096 --max-concurrency 1 --output artifacts/effects-library-4k60/frame-90.png

采用真正4K逐帧渲染，Stage内F32；H.264 NVENC输出为SDR8视频。
不是旧视频放大，也没有帧插值。
粒子模拟改为60Hz；拖尾采样间隔5/60秒，保持与旧版2/24秒一致。
Glow半径由2.5px改为15px，保持6倍分辨率下的相对视觉宽度。
粒子局部工作预算明确为256MiB；Renderer内存预算4GiB；单槽控制并行驻留数量。
预算不代表实际VRAM峰值，不改变图像尺寸、采样质量或精度。
同一工程的CLI命令应顺序执行。

原始日志与验证：artifacts/effects-library-4k60。
