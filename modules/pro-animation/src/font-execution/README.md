# Font execution

The functions in `index.ts` extend the existing owned font inspector. The factory path uses the official Kit/AbortSignal; `createFontExecutionFontFromKernel` transfers an already-authorized direct client for Native without a DOM controller. Await each operation; a font rejects concurrent calls. Disposal closes the same font/Kit client. No OS lookup, download, registry or renderer is introduced.

```ts
const axes = selectFontAxes(
  unit => unit.index < 3,
  fontAxes({wght: expr.add(250, expr.mul(300, expr.time)), wdth: 100}),
  fontAxes({wght: 750, wdth: 80})
);
const fx = createNativeVariableText(init, {font, pathOperations});
const image = await fx.draw({
  text: 'AV ffi', script: 'Latn', language: 'en',
  fontSize: 48, x: 20, baseline: 82, axes,
  draw: {ink: [3, -.25, 1, .8], format: 'rgba32float'}
}, context);
// Caller owns the image. Dispose fx, borrowed font and pathOperations at Stage teardown.
```

`fontAxes`/`fontAxis`, `composeFontAxes`, `mixFontAxes`, `selectFontAxes`, `staggerFontAxes` and `mapFontAxes` compose ordinary parameter functions. Signals use the existing evaluator. Axis values are absolute design-space coordinates; unknown/out-of-range values fail in the original library rather than clamp. A query restores the immutable base instance even on failure. Adjacent equal instances merge to preserve liga/kern. A genuine axis boundary splits the style run: original HarfRust pre/post context preserves joining, but a ligature cannot span different axis instances. `shapeVariableRun` accepts one itemized horizontal run, not paragraph bidi. It returns canonical TextLayoutData/PathData plus local per-instance provenance. Stage-local time/frame are explicit, and random access has no previous-frame dependency.

`readDirectedFontRun` returns actual original-library font-unit/y-up data for LTR/RTL/TTB/BTT. It does **not** label vertical glyphs as a valid horizontal canonical paragraph. Main's frozen vertical contract is integrated. The independent vertical/ entry now provides shapeVerticalRun, layoutVerticalText and createNativeVerticalText using that exact contract; see vertical/README.md.

`readColorGlyphPaint` preserves original Skrifa COLRv0/v1 callbacks; `readColorPalette` explicitly returns source sRGB straight RGBA. The raw callback reader remains an observation API; actual COLRv1 drawing is implemented by the reviewed Native painter and profile1 kernel. `createNativeColorText` now executes COLRv0 solid layers through the existing Native glyph coverage and compensated over; it also preserves monochrome glyphs. `prepareColorGlyphLayers` and `cpalLinearInk` expose the thin geometry/palette adapters. CPAL is explicitly decoded from sRGB; foreground sentinel 65535 accepts linear HDR/negative ink. Native COLRv1 uses the full font-local gradient/clip/transform/composite adapter; an older raw-parser kernel is rejected for v1 execution via E_PA_FONT_COLOR_PROFILE, never approximated as a solid. Do not directly treat source sRGB values as scene-linear ink.

`readFontBitmapStrikes` and `readEmbeddedFontGlyph` select exact original bitmap/SVG subresources. Bytes remain encoded/packed and are not executable XML or a GPU admission receipt. SVG preserves document ranges, shared bytes, fragment identity and gzip status. Bitmap metadata separates font-unit and strike-pixel bearings; upstream bitmap bearings are font-default metrics. The current Core rederives/authenticates the selector from a sealed parent font Resource before fixed decode/color conversion and same-owner import. No caller offsets, paths or pixel-buffer bypass are supported.

GPU output uses the existing Native owner/glyph mesh/coverage path and F16/F32 scene-linear premultiplied Alpha. Real Noto axes, HDR/negative RGB, exact repeat-frame hashes and media evidence are in the dedicated validation checkpoint. COLRv1 Native paint is implemented and qualified in colr-paint-validation. Actual mixed-orientation columns, original contextual bidi, greedy wrapping and per-unit Native drawing are implemented and qualified; optimized paragraph composition and broader typography policies remain separate. Controlled embedded import and its consumer are now exercised below. Main owns public root exports, immutable R1 identity/version/permissions and L3 release qualification.


## Embedded bitmap and static SVG glyphs (Native consumer)

`prepareEmbeddedFontRun(font, text, options)` shapes one explicitly itemized horizontal run
using the original HarfRust context/variation API, retaining final GID, clusters, advances,
font Resource identity and exact original strike metadata. It returns canonical
`TextLayoutData` and local placement metadata, without invented outline coverage.
`embeddedBitmapRect` combines original Skrifa outer bearings (font units), inner bearings
(strike pixels) and top/bottom-left placement. Advances always come from shaping.

`createNativeEmbeddedText(init, {font})` draws the prepared glyphs through existing
`fontGlyphResource` / `gpu.importResource`, ordinary textured `drawMesh` and compensated
GPU `over`. Module-owned fonts use the admitted `init.moduleResources[name].resourceId`
when creating the inspected font; observations/encoded bytes are never import receipts.
Returned images are caller-owned and frame-local. Await each call; concurrent calls fail
with `E_PA_TEXT_BUSY`. Cancel/close before publication releases temporary images/buffers;
`dispose()` waits for active recording, while the caller retains font/scope ownership.

```ts
const text = createNativeEmbeddedText(init, {font: inspectedFont});
const image = await text.draw({
  text: 'A B', script: 'Latn', fontSize: 80, x: 20, baseline: 24,
  source: {format: 'svg', viewBox: [0, 0, 1000, 1000]},
  ink: [2, -.3, 1.4, .8], // scene-linear multiplicative HDR tint
  transform: glyphTranslate3D(selection, {y: offsetSignal}),
  format: 'rgba32float'
}, context);
```

Bitmap selection requires an exact `strikeIndex`; SVG requires an explicit finite
font-unit crop `viewBox` and optionally raster `pixelsPerEm`. This crop is AFTER the
original SVG viewport transformation, not an instruction to replace the font's viewBox.
There is no guessed ink bound or silent crop. A caller wanting the complete artwork must
choose its actual bounds. Original SVG tables may shift ink away from the nominal baseline.
The existing Core static SVG security profile applies; no new XML/network/script path.

Intrinsic source artwork is explicitly SDR/sRGB (including existing static SVG raster
precision); Core converts it to linear float. GPU intermediates stay F32, final output
is F16/F32 with premultiplied Alpha. Negative/HDR tint is applied only on GPU, separately
from bounded encoded `source.foreground`. No claim that an 8-bit bitmap contains HDR
source information or that this supplies an unrestricted float SVG vector rasterizer.

Missing glyph/artwork, unsupported table/strike, invalid crop and cancelled operations
fail visibly. No outline/OS-font fallback is invented. Whitespace has original advance
without fabricated ink. Bitmap bearings remain original font-default metrics; variable
axes affect real shaping, not nonexistent variable bitmap artwork. Paragraph fallback,
canonical vertical layout and full COLRv1 Native paint are implemented in their independent entries; the embedded wrapper remains a horizontal consumer.

Independent module entry and private standard-R1 validation are provided. Shared root
exports, next immutable public package version and L3 distribution remain Main-owned.

See `colr/README.md` for profile1, GPU precision, source corrections and actual validation limits.
