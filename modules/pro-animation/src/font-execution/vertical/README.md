# Vertical font execution

This independent entry borrows the existing owned font, contextual itemizer and path
operations. Main owns public root/R1 wiring. No new renderer, font lookup, timebase or
permission is introduced. Native pixels use the existing admitted GPU glyph renderer.

```ts
const text = createNativeVerticalText(init, {font, itemizer, pathOperations});
const image = await text.draw({
  text: '日本語AV ffi〈動き〉\n文字とSignal',
  fontSize: expr.add(30, expr.mul(2, expr.time)),
  baseline: 370, y: 20, writingMode: 'vertical-rl',
  inlineSize: 215, columnAdvance: 62, textOrientation: 'mixed',
  language: 'ja', variations: {wght: 500},
  draw: {ink: [3, -.3, 1, .7], format: 'rgba32float'}
}, context);
// image is caller-owned. Await each draw; dispose text before borrowed services.
```

`shapeVerticalRun(font, source, options)` is the low-level itemized API. Its column
baseline is x, its initial inline position is y. Upright uses actual HarfRust TTB/BTT
origins, advances, GSUB/GPOS and original outlines. `inlineDirection` selects the
original shaper's ordering; BTT does not promise negative advances (the original
library normalizes them). Sideways shapes a whole horizontal LTR/RTL run, including
kerning, ligatures, marks and joining context, and rotates positions and advances.
It preserves unrotated positioned paths and sets the canonical orientation. Core
rotates the ink exactly once about its final origin. No per-character reshaping or
second orientation transform is applied. Upright and sideways are distinct operations.

`layoutVerticalText` consumes the existing original UAX9 contextual line itemizer.
It preserves original UTF16 clusters, removes bidi controls only from the shaping
input, records ignored ranges, and places columns using `vertical-rl`/`vertical-lr`.
It uses pinned Unicode16 UAX50 data for mixed orientation and existing UAX14/ICU
grapheme boundaries for greedy wrapping. U/Tu use upright, R uses sideways-right.
Tr compares actual original vertical and horizontal glyph results: a substituted
vertical form stays upright; absence of a changed form uses rotated horizontal ink.
Disabling vert/vrt2 on a vertical run alone is not a reliable substitution probe:
the original shaper can apply required vertical features anyway. Equal adjacent
orientations merge before shaping; this preserves Latin ligatures and attached marks.

`inlineSize`, `columnAdvance`, alignment and overflow are explicit physical pixels.
No box clips ink. `overflow:'error'` diagnoses unbreakable content; `allow` preserves
it with a structured warning; `grapheme` permits reviewed grapheme breaks. Hard lines,
CRLF and source ranges remain observable. Wrapping is greedy, not paragraph-wide
optimized justification. A font/script callback must remain pure. The one explicit
font must cover the requested scripts; OS fallback is never selected.

The Native wrapper draws outline, original COLRv0/v1 and declared sbix/CBDT/EBDT/
static SVG glyphs through their existing Native consumers. Select `paint:'color'`
and an optional `paletteIndex` Signal, or `paint:{format:'sbix',strikeIndex:1}` /
`{format:'svg',viewBox:[0,-800,1000,1000],pixelsPerEm:64}`. It preserves the final
vertical positions and quarter-turn exactly once, followed by per-unit transforms.
`inkForUnit`, HDR/negative scene-linear `draw.ink`, F16/F32 PM output and physical
unit opacity apply to all paths. COLR opacity is applied once to the finished glyph,
not separately to overlapping internal layers. Explicit source selection never
turns an unsupported glyph into an invented outline or uses an OS font.

`tabs` reuses the original start/center/end/decimal solver on the physical inline
axis, including repeated grids, overlap/error policy and source-index metadata.
The shaper sees a real zero-ink font space in place of each tab. Used column-end
U+00AD becomes the real `discretionaryHyphen` (default U+2010); unused/final U+00AD
has no ink. Replacement glyphs map back to the original soft-hyphen source index.

`tateChuYoko:[{start:1,end:3}]` shapes a selected whole horizontal group, preserving
original kerning/ligatures, centered without scaling within one vertical em cell.
Its baseline uses the original font ascent/descent. Ranges are original UTF16
grapheme boundaries, nonoverlapping and atomic during wrapping. Ambiguous ranges
crossing an original contextual script/bidi item or containing tabs/hard breaks/
soft hyphens/bidi controls are diagnosed explicitly. Mixed direction content remains
handled by the original itemizer; no cross-script font-splicing is guessed.
The low-level `shapeVerticalRun` takes `tateChuYoko:true` for one clean resolved run.
Tate groups use forward vertical cells, not negative sideways-left progression.

`tsume:0..1` symmetrically removes the measured inline side bearings around original
cluster ink; it does not scale characters, split attached marks, or alter glyph IDs.
The Native wrapper also accepts an ordinary Tsume Signal. Tight Bézier bounds reuse
the existing outline query, including each glyph's actual orientation and variation.
Zero-ink spaces and intrinsic art without an original measurable outline retain
their advance; no guessed raster rectangle substitutes for font ink. Tate groups
are treated as one cell. No arbitrary artistic glyph-count limit is added.

`prepareEmbeddedFontLayout` attaches original table/strike/crop observations to an
already shaped canonical run; `createNativeEmbeddedText.drawRun` draws it using the
existing sealed resource importer. Mask/currentColor foreground defaults explicitly
to neutral white; separate linear HDR ink supplies the color. A caller can select
another SDR/sRGB intrinsic foreground. Color PNG/SVG artwork retains its original
source precision; promoting a codec raster to F32 does not invent HDR source data.
The output/composition remains professional float with no implicit SDR conversion.

Await draws. Disposal rejects late publication and releases an owned result; fonts,
itemizer and path services remain borrowed. `wait` on disposal includes the pending
operation, not a promise of preempting synchronous Rust/GPU work. Existing admission,
SVG safety, Resource/face/strike and affine/opacity checks remain authoritative.
Horizontal-only paragraph/path-text consumers still reject vertical canonical data.
This is explicit typography, not a claim to implement all CSS, ruby, every font or
Adobe's proprietary pixel calibration. Existing resource/admission budgets apply.

Reproduce the final focused qualification with
`node modules/pro-animation/validation/run-pa4-vertical-final.mjs fixtures types l0 regression media`.
It installs a new immutable **private** R1 fixture into the worktree-local home,
checks original Node references against Native/SpiderMonkey, signed/HDR/Alpha,
random/repeated frames, actual F16/F32 and real PNG/EXR/MP4. Frozen source/runtime
identity, raw failures and media are in `docs/pro-animation/vertical-final-validation`.
Public production package/version/catalog wiring remains Main's integration work.

Unicode original bytes, reduced-table generator, license and content hashes are retained
in `provenance/font-execution/vertical`. No new native dependency is required.
