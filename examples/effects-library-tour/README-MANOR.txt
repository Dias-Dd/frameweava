THE STILL HOURS / 庄园的午后

主入口：manor-drawing-room.tsx
1920×1080，30000/1001 FPS，720 帧，约 24.024 秒，无音轨。
所有陈设、程序纹理和动作都在主 TSX 内，可直接修改。
无需外部模型、贴图、字体或网络资源。不是一张背景图做平移。

陈设
  橡木分块地板、护墙板、嵌框、腰线、齿饰檐口、吊顶线条。
  两扇有真实开口的格窗，玻璃、窗把手、窗帘褶皱、帘环、绳扣和流苏。
  壁炉石材、砌砖、柴火、余烬、炉栅、护栏、铲/刷/拨火器。
  旧书柜、68 本单独建模的书、堆叠书册、鎏金书脊和封皮。
  雕木沙发、两把翼背椅、坐垫、扣饰、滚边、钉饰、搭毯。
  地毯的层叠边框、中心纹样和逐根几何流苏。
  茶几、金属茶盘、瓷壶/壶盖/壶嘴/壶把、茶杯/杯把/碟、奶盅。
  茶水、糖块、茶匙、饼干及碎屑、杯口小缺口。
  报纸、信件、邮票、钢笔、阅读眼镜、旧地图册及松动的纸页。
  棋桌、镶嵌棋盘、22 枚盘上棋子和 3 枚盘外棋子、记谱册。
  唱机、唱片刻槽与纸标、喇叭口、摇把、曲谱。
  壁炉座钟、罗马数字表盘、分针/时针、摆锤、花瓶、微型肖像。
  油画、植物标本画、三种不同肖像、花枝、伞架和手杖。
  六臂吊灯、链条、接蜡盘、蜡烛、垂饰，以及两盏壁灯。
  猫的躯体、头、耳、口鼻、眼睛、四爪、尾巴和胡须。

动作（按绝对时间，无须先渲染前帧）
  0–5 秒：建立室内陈设，猫伏在沙发上；窗帘、钟摆、炉火、茶汽持续变化。
  5–7 秒：猫抬头、站起。
  7–8.7 秒：猫从沙发落地。
  8.7–16 秒：猫向壁炉行走，四肢交替、尾巴轻摆。
  16–22 秒：转身并逐渐伏下。
  9–14 秒：茶几上的一张松页轻轻掀起、落回；唱片缓慢转动。
  镜头缓慢推进、降低，再收回；不是镜头之外的一套交互时间轴。

仓库根目录命令
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-manor.ps1
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-manor.ps1 -Mode Frame -Frame 130
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-manor.ps1 -Mode Motion
  powershell -ExecutionPolicy Bypass -File examples/effects-library-tour/run-manor.ps1 -Mode Render

也可以直接：
  npm run frameweave -- examples/effects-library-tour/manor-drawing-room.tsx --memory-mib 4096
  npm run frameweave -- render examples/effects-library-tour/manor-drawing-room.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/manor/The-Still-Hours-1080p.mp4

MemoryMiB 和 Concurrency 是可调整的运行默认值，不是场景永久容量上限。
需要当前仓库匹配的 Native GPU/SpiderMonkey/Servo runtime、兼容硬件 GPU、
受信的 native-image-effects@0.4.0。首次安装包沿用同目录 prepare.mjs。
脚本使用已配置的 FRAMEWEAVE_SERVO_RUNTIME，未设置时使用 Main 保存的本地 runtime。

如何编辑
  FILM：画幅、帧数、曝光、采样数（当前内核结构支持 1..8）、景深、炉火、日光。
  furnishManor()：布局、家具尺寸、材质及陈设，均为普通 TS 几何组合。
  ATLAS_SCRIPT：标准 Canvas 纹样、文字、油画、报纸、信件、表盘、地图。
  ROOM_SHADER：灯光、阴影、表面老化、镜头、猫和其他动作。

实现与实际边界
  Three.js 只提供 MIT 几何与数学，Native GPU 执行真实三角形求交、遮挡和阴影。
  Servo 是同一级的普通纹理生成模块，现有效果库负责轻微 Glow/对比度/颗粒。
  当前约 153,294 三角形，约 20.37 MB typed data，使用场景专用软件 BVH。
  窗光为固定分层采样，环境反射/反弹光有近似；不是完整全局光照或照片级人物毛发。
  猫是程序几何与动作，不是实拍动物或物理肌肉/毛发模拟。
  精细场景的全分辨率预览可能低于实时播放，最终渲染不会自动降低质量。
  manor-motion-preview.tsx 是明确另列的 640×360 / 8 FPS 动作预览，24 秒；
  它沿用全部陈设、两次采样及动作，只降低输出画幅和帧率，不代表最终成片规格。

本工程暴露并推动修复了 Native 大 typed-buffer 入场：大数组改走二进制，
不再被固定 8 MiB 控制 JSON 或新增的固定 512 MiB 限制卡住。
传输预算跟随调用方策略；仍验证类型、长度、字节计费、设备能力和生命周期。
这不意味着已经验证亿级三角形，也没有宣称旧的所有协议结构限制已被移除。

实际交付证据：artifacts/manor/room-130.png、room-719.png、action-storyboard.png。
The-Still-Hours-storyboard.mp4 是 24 秒 / 1 FPS 的动作分镜，已全解码并查看六个姿态，
不是 29.97 FPS 成片。8 FPS 预览尝试在验证截止时取消，完整1080p影片未导出。
最终传输/取消专项 13/13、类型检查通过。详细失败及计时局限见 artifacts/manor/DELIVERY.txt。
