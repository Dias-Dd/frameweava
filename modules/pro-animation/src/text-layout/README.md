# 多语言段落、精确文字查询与 Native 绘制

这是独立源码检查点；共享命名导出、正式 R1 身份、版本、权限、Lock 和 L3 由 Main 集成。
不要把私有测试 Kit 当成已安装的公开能力。实际可编辑入口：
`validation/text-layout-scene/project.tsx`，同目录 `half.tsx` 为 RGBA16F。

## 真实链路

原始字符串 → 原 Unicode16 UAX9/Script/Grapheme Rust → 原 HarfRust/Skrifa 字体 shaping
→ 原 Unicode16 UAX14 选断点并在原段落上下文重 shaping → 既有 TextLayoutData
→ 不可变查询索引 → 原 Clipper2/Earcut 字形网格 → 原 Native Glyph GPU/Glow/Layer。

`shapeBidiText` 和 contextual `analyzeLine` 是此前保留的本工作区实验，本次完成采用、回归和 Native 对接；
没有改写上游 bidi/shaping 算法。共享单字体 tessellation 只抽出同一循环，原 API 与预先取消错误保持兼容。

## 使用方式

```ts
import {
  layoutParagraph, createParagraphIndex, prepareParagraphMeshes,
  selectionRects, caretAtIndex, hitTestParagraph,
  createNativeParagraphRenderer,
} from "./index.ts"; // Main 完成正式导出后可改为 pro-animation

// 明确借用现有受控字体/itemizer服务；不是注册表、字体下载器或自动 OS 回退。
const paragraph = await layoutParagraph("AV ffi אב 123. 日本語 سَلَام", {
  itemizer, font, fontForRun, scriptForRun,
  width: 600, fontSize: 32, x: 24, baseline: 48, lineHeight: 48,
  align: "start", wrap: "word", overflow: "allow",
});
const index = createParagraphIndex(paragraph);
const selection = selectionRects(index, {start: 3, end: 5}); // 整个真实连字簇
const caret = caretAtIndex(index, 4); // 连字内部位置可明确 unresolved，不伪造 GDEF 坐标
const hit = hitTestParagraph(index, [100, 40]);
const mesh = await prepareParagraphMeshes(index, {pathOperations});

// 在既有 Native Stage init 绑定同一设备与 Stage 尺寸；不要逐帧重新 shape。
const text = createNativeParagraphRenderer(init);
const handle = await text.prepare(mesh);
const image = await text.at(context).draw(handle, {
  ink: [-0.12, 1.8, 3.1, 0.85], format: "rgba32float",
  transform: (cluster, c) => ({
    matrix: [1, 0, 0, 1, 0, Math.sin(c.time + cluster.logicalIndex)],
    opacity: 1,
  }),
});
// image 为调用方持有的帧期图像，按已有资源 arena/Stage规则释放。
// dispose 等待已有 draw/prepare 完成并释放其拥有的 GPU buffers；借用服务另由其所有者释放。
await text.dispose();
```

排版/分段准备在 Node/获准的 CPU-WASM 路径执行；不是在 Native VM 注入 Intl/Buffer/TextDecoder。
Native 可直接导入 `queries.ts` 和 `native.ts`，使用携带的 canonical layout/已记录分词；
完整 `index.ts` 包含 Unicode trie/ICU 的准备入口，不能据此宣称所有宿主都支持现场自动排版。

## 公开函数与语义

共25个功能入口；另有 `createParagraphIndex` 准备工具，不重复计数为效果或 AE 覆盖率。

| 入口 | 输入 / 输出及边界 |
| --- | --- |
| unicodeLineBreaks | 原始Unicode字符串 → UTF16断点与required；固定Unicode16默认UAX14，不执行用户规则 |
| textGraphemes / textWords | 原字符串 → 捕获的UTF16分段；平台ICU，与shaped glyph数不同；持久化记录运行时/ICU/Unicode版本 |
| layoutParagraph | 上述借用服务、width/fontSize/lineHeight、wrap/overflow等 → canonical layout+局部flow元数据 |
| paragraphMetrics / paragraphInkBounds | 段、行、字体、glyph/cluster统计；真实静态轮廓几何包围盒 |
| lineInkBounds / glyphInkBounds / rangeInkBounds | 指定行、glyph索引或原文范围的轮廓几何范围；空白glyph无ink返回null |
| lineAdvanceBox | 指定行的advance/em矩形；与ink及光晕像素边界区分 |
| glyphsInRange / clustersInRange / linesInRange / runsInRange | UTF16半开范围相交；空范围返回空；簇内部分选取扩展为整簇 |
| paragraphAtIndex / lineAtIndex | 原文标量边界及upstream/downstream归属，支持末尾空行 |
| clusterAtIndex / wordAtIndex | 原文索引 → 实际簇或捕获分词；word明确found/missing/unavailable |
| caretAtIndex | 实际簇两端或行盒边界；bidi替代位置显式返回；无GDEF内部坐标时unresolved |
| hitTestParagraph | 最近advance/em行与caret；不是字形填充/抗锯齿像素命中 |
| selectionRects | 按真实视觉位置合并每行相邻整簇矩形；保留bidi不连续选区与扩展诊断 |
| moveCaretVisual / moveCaretVertical | 显式不可变caret、屏幕左右/行增量；preferredX显式返回，不保留隐藏游标 |
| prepareParagraphMeshes | 原字形path/units → 共享原Clipper2/Earcut流程；保留全部字体身份，不伪装单字体 |
| createNativeParagraphRenderer | 原Native字形渲染器薄适配；传入回调保留实际runDirection，底层继续原paragraph方向验证 |

所有位置为 Stage top-left、x-right/y-down 物理px；原文索引为 UTF16 scalar boundary。
时间仅使用原 FrameContext/Signal；不创建 timeline 或状态ful layout runtime。
`ParagraphLayout/ParagraphIndex` 是本地派生结果，不是新的 Graphics/TVG/Artifact schema。

## 排版与查询策略

- word：原UAX14许可断点与grapheme边界交集；按真实 contextual shaping advance 贪心选行。
  grapheme：显式允许在完整grapheme之间重 shaping；none：只保留硬换行及显式softBreaks。
- overflow allow：保留超宽单元并发出 W_PA_TEXT_UNBREAKABLE；error：明确失败；grapheme：局部退到完整grapheme重 shaping。
  不截glyph、不自动缩小、不隐式丢弃空格。显式softBreaks保持原严格校验。
- 对每次准备缓存已测原文范围；普通长文候选游标前进，不每行重新扫描所有旧候选。
  非单调字体advance情形采用首个超宽即止的greedy规则；不是最优断行或Knuth-Plass。
- 字体/script回调必须纯且与探测顺序无关；最终advance不符合测量计划时 E_PA_TEXT_WRAP_UNSTABLE。
- 索引深拷贝/冻结原布局、字体与映射；没有全局缓存。来自持久Resource/Artifact的数据先走原完整性/信任验证；
  createParagraphIndex不是认证边界，不能把任意外部JSON当可信artifact。
- selection/caret 基于明确lineHeight与em ascent，不声称使用真实ascender/descender/GDEF度量；
  outline bounds不是变换后、Glow后或空间抗锯齿后的像素范围。
- caret只给真实簇边界与行盒边界；RTL、ligature和combining mark不强行等宽分配。
  选区不会自动分裂emoji/连字，缺失caret有明确reason。
- index不持有字体/WASM/GPU资源。prepare需要现有pathOperations；每次Glyph GPU draw仅持当前帧图像。
  Native handle不能跨实例使用；变造的canonical布局/units/fontInstances不允许替换已准备映射。

## 精度、后端与限制

实际绘制只复用 admitted Native GPU：scene-linear、premultiplied RGBA16F/32F；
负RGB与HDR保留，无Canvas8/CPU像素/浏览器后备。使用既有设备/guarded Pair/mesh/Glow；
没有新Renderer、GPU owner或shader算法。尺寸、Alpha/格式与资源准入沿用已有校验。

本入口仍未实现：justification、可见discretionary soft-hyphen替换、自动逐grapheme字体fallback、
vertical/color/bitmap/SVG字形、GDEF连字内caret、AE参数/像素等价。
自动换行遇U+00AD明确 E_PA_TEXT_DISCRETIONARY；不会悄悄产生缺失连字符的结果。
variable-font轴沿用已有font shaper显式控制，不新增自动字体实例策略。
旧 Web/Canvas `text-lines-scene` 实验保留在工作树，不能当作本次Native证据。

Noto Latin/Arabic/Japanese/Hebrew为原OFL1.1夹具；真实shape与glyph轮廓可验证，但不代表全世界字体/文字已穷尽覆盖。
当前 Native 空间栅格沿用既有策略，不宣称解析面积AA、跨后端像素等价。
透明PNG保留alpha；若查看器把近零alpha下的HDR/Glow RGB直接显示，可看实际PNG经黑底合成的 `project-black.png`；
这张图仅是查看辅助，不能替代原始PNG/EXR/GPU数值验收。

## 复现与分层验收

工作区内已审查载体存在时：

```powershell
node --import tsx modules/pro-animation/validation/prepare-text-layout.ts
node node_modules/typescript/bin/tsc --project modules/pro-animation/validation/text-layout-tsconfig.json --noEmit
node --import tsx --test tests/pro-animation-text-layout.test.ts tests/pro-animation-text-animation.test.ts tests/pro-animation-pa3-bidi-text.test.ts
node --import tsx modules/pro-animation/validation/check-text-layout-linebreak.ts
node --import tsx --test tests/pro-animation-text-layout-stage.test.ts
node --import tsx modules/pro-animation/validation/check-text-layout-media.ts
node --import tsx modules/pro-animation/validation/check-text-layout-png.ts
```

断行原样本URL/SHA见conformance脚本与provenance；原文大文件留本工作区缓存。
首次需要手工审查构建原shaping/pathops/contextual Kit，使用各自既有脚本；正常构建offline/locked，不自动下载模型。
本次复用已存在且源文件/产物哈希匹配的carrier，不重复编译Rust。
真实环境：Windows、Node22.19/ICU77.1/Unicode16、SpiderMonkey、RTX5070Laptop/Vulkan。
macOS/Linux/其他GPU、4K/长文压力、正式R1安装与六种工程导出未在本检查点验收，归Main L3。

## 显式 Tab 停靠

`layoutParagraph`、`shapeBidiText` 与 `shapeBidiLine` 现在接受可选 `tabs`。没有提供它时，原先的 Tab 拒绝诊断保持不变；没有 Tab 的既有结果也保持一致。

```ts
const paragraph = await layoutParagraph("AV ffi\t12.34\n日本語\t42.0", {
  ...existingBorrowedServices, width: 660, fontSize: 30,
  x: 24, baseline: 58, lineHeight: 72,
  tabs: {
    stops: [{position: 320, align: 'decimal', decimal: '.'}],
    repeat: 160, afterLast: 'repeat', overlap: 'error',
  },
});
```

`TextTabOptions`/`TextTabStop` 的定义在 `text-layout/tabs.ts`；不是新的 Graphics 数据格式或排版运行时。
位置、repeat 均为物理 px。stops 严格递增；align 为 start/center/end/decimal。位置相对每行段落前沿，LTR 从左、RTL 从右；整个行盒的原有 align/width 仍生效。最后一个显式停靠后，默认按 repeat 延续（缺省4em）；afterLast:error 明确拒绝没有后续停靠的字段。不会静默截断。

原始 Unicode 字符串先执行原 UAX9；只在原字体 shaping 的 Tab 位置借用实际空格字形，并验证它必须是独立、无轮廓的水平字形，再赋予声明的停靠 advance。不是虚构glyphId、方框/位图或更换原文；TextLayoutData.text、UTF16 clusters、原字体实例及路径都保留。原 contextual 断行/字体回调、CJK、Arabic、Hebrew、ligature 按原实现执行。字体不能提供独立无 ink 的 Tab 占位时明确失败，不把 .notdef 当作空格。

decimal 对齐到该字段原文中的第一个声明标记的真实 glyph origin；没有标记时按 end。标记如果在不可分解连字内部，明确报无法定位，不伪造等宽坐标。方向以原 paragraph 为准；这不是全世界数字书写格式的自动推断或 AE 参数等价保证。

默认字段重叠为 E_PA_TEXT_TAB；显式 overlap:allow 保留负 advance 并发出 W_PA_TEXT_TAB_OVERLAP。超过 width 保留内容并报告 W_PA_TEXT_TAB_OVERFLOW。自动换行测量与最终布局使用同一 Tab 策略；每行重新从前沿定位。硬换行、空字段、连续及末尾 Tab 均有定义。

单行 `.tabs`、多行 `.lines[].tabs` 返回已实际采用的停靠决策，保留全局原文索引与 glyphIndex。它们是布局时的局部派生记录；后续字形/版面变换以更新后的 canonical geometry 为准，不能把这些规划距离当作变换后的像素测量。caret/selection 仍使用真实簇和 computed advance，不拆连字或制造墨迹。

全部像素继续走原 Native paragraph/glyph → scene-linear RGBA16F/32F → Glow/Layer。实际示例是 `validation/tab-text-scene/project.tsx`；`prepare-tab-text.ts` 只复用已审字体和 WASM 几何服务准备真实轮廓，不在 Native VM 暗中下载/初始化字体服务。第三轮累计测试继续记录到同一个 `run-text-controls.mjs` 日志和 <420s 预算，不另起预算。

```powershell
node modules/pro-animation/validation/run-text-controls.mjs types tabs paragraphRegression prepareTabs tabStage tabPackage
```

私有 R1 fixture 验证的是完整携带的真实 Tab 几何在 Native 中执行，不代表正式的受控 font/itemizer factory 已安装。正式命名导出、模块身份/权限、Lock 及六模式L3仍归 Main。
