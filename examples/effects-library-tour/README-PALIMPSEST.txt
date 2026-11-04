PALIMPSEST / 岁月的刻度

入口：palimpsest-orrery.tsx
1920×1080，30000/1001 FPS，180 帧（6.006 秒），无音轨。
这是可编辑的 Frameweave TSX 工程，不需要 Blender、外部模型或贴图。

创作：浑天仪式旧黄铜星象仪，深蓝绿色星球、鎏金经纬线和星点；
三道实体环架、罗马数字刻度、螺丝槽、车制立柱、旧木底座。
表面包括磨亮的边缘、黄铜斑驳、氧化色、细划痕和木纹；镜头缓慢绕行。

在仓库根目录：
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-palimpsest.ps1
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-palimpsest.ps1 -Frame
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-palimpsest.ps1 -Render

或直接运行：
  npm run frameweave -- examples/effects-library-tour/palimpsest-orrery.tsx --memory-mib 4096
  npm run frameweave -- render examples/effects-library-tour/palimpsest-orrery.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/palimpsest/Palimpsest-1080p.mp4

前提：当前仓库配套的 Native GPU 与 SpiderMonkey runtime、兼容硬件 GPU、
受信 native-image-effects@0.4.0 和 Servo。脚本优先使用已经设置的
FRAMEWEAVE_SERVO_RUNTIME，否则使用 Main 已保存的本地交付 runtime。
如果迁移仓库，请重新配置 runtime 路径；这些运行时不是内嵌进 TSX 的。
包尚未安装时可执行：node --import tsx examples/effects-library-tour/prepare.mjs
现有包的完整性、版本、锁和权限仍由正常加载流程验证。

可修改 LOOK：width/height、frames、age（0..1）、exposure、aperture（景深）、
samples（整数 1..4）、cameraArc（弧度）。表面、实体形状和灯光在 TSX 内。
renderAt 按指定帧求值；没有依赖前帧累积的动画状态。

技术边界：Native GPU 执行场景专用 WGSL 距离场求交、阴影、金属 BRDF、
有限的桌面反射和环境光近似；并非完整路径追踪、全局光照或物理光学。
Servo 以普通模块生成二维 Canvas 刻度贴图，不承担第二套 Renderer。
现有效果库提供克制的 Glow 和对比度调整。场景使用线性 Rec.709 F32，
最终 PNG/MP4 是 SDR 交付，不宣称这是 HDR 成片。
这是想象中的古董道具；星点、刻度布局不用于科学测量或文物复原。
修改源码即可继续预览；没有更改 Core、包锁或其他 Agent 的工作区。
