AFTERLIGHT / 余晖
================

入口：afterlight-1080p-2997.tsx
规格：1920×1080，30000/1001 FPS，1798帧，59.9932666667秒。
音频：原创程序化配乐，48kHz立体声，通过 Audio Stage 和普通 Layer 放置。
这是另存的新作品，前面两份 TIDES 源文件保留。

创作意图
--------
一束光像记忆一样展开，短暂地把自己的形状留在纸上，然后退去。
以墨黑、旧金、暖纸白为主色，铜红只在高潮附近出现。
开场将主体放在右侧，给左侧标题留下空间；中段让绸带越过画框，
从“看一个物体”进入“身处折面之间”；最后重新拉开距离。
整段不显示章节编号、运行参数或技术说明。

时间和镜头
----------
00—03秒：由黑显影，一道窄金线。先让眼睛适应，再给信息。
03—10秒：左侧 AFTER / LIGHT 双行标题，右侧金线缓慢变化。
09—24秒：金线逐渐舒展为绸带，构图向左漂移，近景有意裁出画面。
24—34秒：绸带收拢为不规则花冠，光和声音同时积蓄。
34—39秒：唯一一次明显的调性转换；金色形体变成暖纸上的深色印记。
40—43秒：画面和声音一起退到很低，给高潮留下停顿。
43—52秒：余光和少量粒子收束，形体变小，留白逐渐增加。
52—60秒：片名和 LIGHT LEAVES A SHAPE 出现，尾音与画面淡出。
这些是重叠、长度不同的乐句，形体连续变化，不是等长的效果轮播。

现有效果库的用途
----------------
Mesh Deformation：Morph、Twist、Bend、Wave、Ripple、Taper、Transform，
  作用于同一组有对应顶点的绸带。形态是镜头内容，不是逐项列举函数。
Spatial Effects：原生分形噪声与域扭曲生成背景和材质的微小不均匀；
  固定步长粒子只在展开、绽放和收束期间承担流光与余烬。
Native Image Effects@0.4.0：渐变、渐变映射、Overlay 构造折面材质，
  混合、位移、Gaussian Blur、Glow、调色、Tritone、暗角和颗粒完成画面。
Native Transitions：只使用 Cross Dissolve，让同一画面在发光与印记之间变化。
  没有为展示转场种类而另加翻牌或扫屏。
自写部分是控制几何、镜头调度、原创线条字形、片尾淡出和音符编排。
材质属于艺术化着色，不宣称物理正确的金属/PBR或真实流体模拟。

运行（在 frameweave-engine 仓库根目录）
-------------------------------------
如果还没准备过该示例目录的受管理图像模块：
  node --import tsx examples/effects-library-tour/prepare.mjs

画面预览：
  npm run frameweave -- examples/effects-library-tour/afterlight-1080p-2997.tsx --memory-mib 4096

完整有声 MP4：
  npm run frameweave -- render examples/effects-library-tour/afterlight-1080p-2997.tsx --memory-mib 4096 --max-concurrency 1 --output artifacts/afterlight/Afterlight-1080p-2997.mp4

相同入口的命令请依次执行；该 Main 基线尚有并发编译同一入口时共享目录的问题。
当前原生预览窗口只显示画面，音频需导出 MP4 后在播放器中听。
4096 MiB 是 Native 资源预算，并不是对实际进程/驱动峰值的测量或保证。

如何改
------
ART：分辨率、主色、Glow 半径。像素半径按实际输出高度相对1080p缩放。
renderAt 中的 unfurl / blossom / crest / pause / recession：作品的节奏。
Stage props 中的 light / bloom：正式关键帧控制的光量与辉光强度。
score 中的 phrases / strike：不等长和弦、孤立钟声以及高潮的位置。
SOUND.volume：普通音频 Layer 的总音量；其他字段控制配乐层次。
几何与噪声用绝对时间，配乐用绝对采样位置；粒子使用已有回放/检查点机制。
本文件不加载外部图片、字体、采样音频或 Servo，也不创建第二套 Renderer。
图像中间结果为场景线性 F32；所列 MP4 命令交付 SDR 视频和 AAC 声音。

状态
----
按用户要求，仅编写与人工阅读源码；没有编译、类型检查、自动测试、
预览、单帧/视频渲染、数值检查、性能测量或试听。
艺术处理已经写进工程，但实际画面、音量平衡和运行结果均未验证。
没有修改引擎、包锁、Runtime Pin 或其他 Agent 工作区。
这是当前源码仓库内的可编辑工程，尚未打包成独立便携导出。
