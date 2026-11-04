# 字体检查、受控回退与版面调整

独立源码检查点；23个功能入口，另有createFontInspector资源工厂，不计为24个AE效果。
Main负责正式命名导出、R1不可变版本、受控工厂/权限、Lock与L3。
实际编辑入口：validation/typography-scene/project.tsx（720×400，8帧），half.tsx为RGBA16F。

## 一条真实链路

已授权并经Graphics Resource哈希校验的字体字节 → 原HarfRust/Skrifa WASM
→ 真实cmap/UVS/字体与glyph度量/AVAR → 原itemizer分段、整段字体回退
→ 原layoutParagraph/contextual UAX9/UAX14 → canonical TextLayoutData
→ 版面调整 → 验证原字形簇的affine映射 → 已有Native Glyph GPU/下划线/Glow/Layer。

没有字体注册表、OS字体搜索、自动下载、第二个parser/shaper、timeline、document model或Renderer。
Rust只是原适配器加元数据传输，未把成熟字体算法翻译为TS。
Inspector用一个现有shaper/Kit client；不是同时加载两个字体推理引擎。

## 普通TS调用

以下分别对应Node准备与Stage绘制；实际文件拆分见可编辑示例，不将字体初始化代码放入每次render。

```ts
import {
 createFontInspector, readFontMetrics, prepareFontFallback,
 justifyParagraphLines, trackParagraphClusters, flowParagraphColumns,
 paragraphLayoutTransform,
} from "./index.ts";
import {layoutParagraph, createParagraphIndex, prepareParagraphMeshes,
 createNativeParagraphRenderer} from "../text-layout/index.ts";

// factory由既有受控ModuleLoader提供；不接受随意路径，不由能力描述自动执行代码。
const latin = await createFontInspector(reviewedFactory, {
 bytes: authorizedFontBytes, source: declaredFontResource, coordinates,
});
const candidates = [latin, arabic, japanese, hebrew]; // 明确顺序、已初始化的受控字体
const plan = await prepareFontFallback(originalText, {itemizer, candidates, fontSize: 28});
const paragraph = await layoutParagraph(originalText, {
 itemizer, font: plan.font, fontForRun: plan.fontForRun,
 scriptForRun: plan.scriptForRun,
 fontSize: 28, width: 300, x: 30, baseline: 45, lineHeight: 42,
});
const base = createParagraphIndex(paragraph);
const mesh = await prepareParagraphMeshes(base, {pathOperations});

// 在既有Native Stage init只准备一次；布局操作也可在Stage内CPU数学执行。
const text = createNativeParagraphRenderer(init);
const handle = await text.prepare(mesh);
let adjusted = justifyParagraphLines(paragraph, {width: 315});
adjusted = trackParagraphClusters(adjusted, {amount: existingKeyframes}, context);
const target = createParagraphIndex(adjusted);
const image = await text.at(context).draw(handle, {
 transform: paragraphLayoutTransform(base, target),
 ink: [-0.18, 1.8, 3.2, 0.85], format: "rgba32float",
});
// image归调用方；按现有arena/Stage规则释放。GPU适配器及借用字体/几何服务分别dispose。
```

字体解析/回退/测量在Node或获准CPU-WASM准备阶段执行；原始字体不会由每次draw重新读取。
Native只执行版面数学、携带的canonical geometry与已有GPU绘制。
准备端完整index包含字体服务，不宣称能在任意Native VM现场初始化WASM/访问字节。
当前demo使用私有、逐源/逐模块哈希校验的正式Kit测试载体；不能当作已发布安装能力。

## API

### 字体与度量：12个功能入口

| 函数 | 实际行为 / 边界 |
| --- | --- |
| readFontMetrics | 原Skrifa当前实例全局度量，unscaled font units/y-up；不是可见像素包围盒 |
| readFontAxes | 原fvar轴tag/顺序/min/default/max/hidden |
| resolveFontLocation | 严格design-space设置 → 原Skrifa/read-fonts AVAR归一化；不改变已冻结shaping实例 |
| mapFontCharacters | 原cmap nominal glyph映射，保序/重复；不是shaping |
| mapFontVariationSequences | 区分missing/use-default/explicit-variant，保留base与selector |
| readGlyphMetrics | 原glyph advance/LSB/控制范围；不是GPOS后的紧致墨迹范围 |
| fontCoverageReport | 确定性cmap观察，原UTF16位置/缺失/default-ignorable；明确shapingRequired |
| chooseFontForRun | 按显式顺序用真实shapeRun尝试完整脚本/连接段，保留原run/字体身份/失败原因 |
| prepareFontFallback | 在原itemizer结果上预先验证整段字体，提供同步fontForRun/scriptForRun给原段落布局 |
| fontLineBox | 将真实ascent/descent/leading投影到px/y-down的baseline盒，保留leading策略 |
| fontDecoration | 原字体underline/strikeout offset/thickness → px/y-down；缺失返回null |
| measureFontKerning | 原HarfRust kern=1/0差值；不是所有GPOS能力的概括或新kerning求解器 |

createFontInspector是拥有单一现有client的工厂；Resource校验、不可变字体实例、底层WASM清理由原createFontShaper/Kit完成。
所有query与shape共享明确busy/closed边界，无自动队列或重试；并发调用报E_PA_FONT_BUSY。
查询取消在传输分块/发布边界检查，不声称中断一个瞬时WASM函数；预取消不关闭可复用字体。
dispose禁止新查询，清除缓存；等待原client清理，晚返回的查询不能发布成功。
字体单位与归一化值不隐式当px；输出源身份、faceIndex、轴设置与normalizedCoordinates保留。

### 版面与GPU桥接：11个功能入口

| 函数 | 实际行为 / 边界 |
| --- | --- |
| alignParagraphLines | left/right/center/start/end对齐已有行；不重排字形 |
| justifyParagraphLines | interior U+0020空格分配；可选末行/收缩/minSpaceRatio，残量明确诊断 |
| spaceParagraphWords | 在已有横向空格簇增加物理advance，不改断点/Unicode |
| trackParagraphClusters | 完整shaped cluster间距；不会拆连字/附标，RTL保持逻辑起始边 |
| setParagraphLeading | 显式行高与段间距；同步移动canonical baseline和原路径 |
| shiftParagraphBaseline | 指定行/全部行偏移，支持现有Signal/显式FrameContext |
| snapParagraphBaselines | 对既有行baseline应用明确像素网格/offset |
| indentParagraphLines | 已排版行的首行/后续行缩进，LTR/RTL方向明确；不隐式重新断行 |
| flowParagraphColumns | 将已按列宽排好的行放入显式有限列；行过宽/过高/列耗尽直接报错，不丢字 |
| fitParagraphBox | 原unhinted outline/advance/style字号的统一比例适配；不是重新选择字体或字体hinting |
| paragraphLayoutTransform | 验证原source/font/cluster/outline仍满足每簇同一affine，然后直接复用原Native已准备网格 |

版面函数是纯CPU/Float64 canonical geometry操作；不持有Surface，不新建时间轴。
Signal使用既有evaluate；没有全局current time。每次返回独立冻结结果，原输入不被修改。
文字、glyphID、原UTF16簇、字体资源/轴身份及mark/ligature归属不改变。
GPOS偏移已包含于glyph与原路径，移动时一起保留；spacing更新真实advance。
查询继续使用原createParagraphIndex，不建第二个queryTrack或文字查询器。

paragraphLayoutTransform逐glyph/outline校验既有拓扑与统一簇affine；浮点代数重排预算
32×Number.EPSILON×坐标量级，不是允许任意改路径。字体、glyph、轮廓改变须重新准备网格。
原Native GPU仍负责字形XYZ变换、PM HDR ink、栅格、Glow与Layer；没有新GPU kernel/owner。
动态图像仅F16/F32场景线性、正确PM Alpha；无CPU/Canvas8/SDR8后备。
透明PNG是明确交付编码；project-black.png只将真实透明PNG合成黑底，便于查看器显示。

## 排版边界

- 回退使用完整原itemized run，保持连接文字。没有一个候选支持时明确失败，
  不用逐字符换字体破坏Arabic连接；更细的joining-aware字体切分/跨字体context仍未实现。
- 控件/硬换行不作为shaping文本送入font；原UAX9/段落换行仍由原模块负责。
  line item必须落在已验证原字体run内，否则E_PA_FONT_FALLBACK_PLAN，不猜字体。
- cmap/UVS观察不宣称字形可见、彩色字体可渲染或字体质量；真实fallback进一步执行原shaper/outline检查。
- 两端齐仅空格，不做Arabic kashida、CJK分散/标点挤压，也不伪造GDEF连字内部caret。
  没有可分配空格/收缩不足时返回结构化诊断。
- 版面操作不是重新断行或页模型。缩进/字距/适配后需要重wrap时由调用方明确重新layout；
  columns按指定line-height盒重新放置，不隐式继承之前所有段间空白。
- base索引/列定位默认仍是原声明em/lineHeight；fontLineBox是独立真实字体度量，
  不把原em盒升级宣称为自动混合字体ascender策略。
- 字号统一缩放保留原unhinted路径；可变轴仍是原固定实例，已有variable-outline精度警告不被消除。
- Native沿用已有空间栅格策略；不宣称解析面积AA/AE像素等价或跨后端像素一致。

## 来源、验证与复现

固定Skrifa0.49.0（MIT OR Apache-2.0）、HarfRust0.15.0（MIT）；见provenance/typography与rust/font-metadata/NOTICE.md。
自有版面/布局桥接很小，直接变换现有canonical geometry；引入外部排版器的文档模型/Renderer将超过这些独立数学的适配成本。
本组直接复用已经落地的Skrifa/Unicode/Clipper2链路，不新增EffectCraft代码或其编辑器/时间轴。
字体沿用四个已固定OFL1.1 Noto夹具，不下载、不更改原字节。
独立FontTools4.68.0为测试参考；原表/cmap/hmtx/fvar一致，AVAR最多一单位2.14量化差异，
原值与参考值均保留；不能据此扩大为所有可变字体/outline严格等价。

```powershell
node modules/pro-animation/validation/build-font-metadata.mjs
node --import tsx modules/pro-animation/validation/prepare-typography.ts
node node_modules/typescript/bin/tsc --project modules/pro-animation/validation/typography-tsconfig.json --noEmit
node --import tsx --test tests/pro-animation-typography-fonts.test.ts tests/pro-animation-typography-layout.test.ts tests/pro-animation-text-layout.test.ts
.frameweave/pa3-shaping/python/Scripts/python.exe modules/pro-animation/validation/check-typography-font-oracle.py
node --import tsx --test tests/pro-animation-typography-stage.test.ts
node --import tsx modules/pro-animation/validation/check-typography-media.ts
node --import tsx modules/pro-animation/validation/check-typography-png.ts
```

正常Rust构建offline/locked；仅显式--fetch允许获取固定依赖，测试载体非发布包。
环境复用同工作区既有Rust/FontTools/Native/SpiderMonkey/media Python，无SDK锁或权限更改。
Windows/RTX5070Laptop/Vulkan实际验收；其他平台/GPU、4K/长文压力、
正式包安装与六种便携导出未在本组执行，归Main L3。
