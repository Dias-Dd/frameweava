# Mixed-font shaped text on curves → Native GPU

22 source functions complete an existing-data layout/control/query/draw chain.
This is not22 AE effects or a coverage/compatibility score. Main owns formal named
exports/types/R1 identity/version/permissions/Lock and L3. This source index does
not advertise a private fixture as an installed package capability.

```ts
// Canonical source already shaped by existing Unicode/HarfRust/font resource API.
const line = preparePathTextLine(paragraphIndex, {lineId: 'actual-line-id'});
const frame = await layoutPathText(line, existingCurveSampler, {
  offset: existingPositionSignal,
  control: composePathTextControls(
    pathTextTracking({amount: .8}), pathTextWordSpacing({amount: 1.5}),
  ),
}, context);
// These controls keep the original curve-distance samples, so may run directly
// in Native JS even when shaping/curve preparation ran in an authorized data host.
const live = adjustPathTextFrame(frame, composePathTextControls(
  pathTextNormalWave({amplitude: 5, wavelength: 100, phaseDegrees: phaseSignal}),
  pathTextFan({spreadDegrees: 12}),
), context);
const image = await nativeParagraph.at(context).draw(preparedParagraphHandle, {
  transform: pathTextTransform(live), ink: [-.1, .8, 3, .85],
  format: 'rgba32float',
});
// Release caller-owned image. The original paragraph renderer and curve sampler
// each retain their existing explicit prepare/dispose lifecycle.
```

No new engine, scheduler, shaper, Curve Reader, timeline, Graph/Stage/P4 contract,
resource store or renderer is created. Plain callbacks/named TS imports remain.
Original kerning/ligatures/RTL/CJK/fallback/font axes/source UTF16 remain authority.
One rigid pose applies to the whole shaped cluster, preserving attached marks;
this is not continuous bending of each glyph outline or vertical shaping.

## Layout and resident controls (5)

- `preparePathTextLine(index,{lineId?})`: derive one original horizontal line.
  Multiline needs explicit line ID. Keeps original global cluster/glyph/font IDs
  and local visual/logical ranks; uses original em/advance spans for centers.
- `layoutPathText(line,curve,options,context)`: original kurbo arclength samples,
  one batch for all whole clusters. Controls: start/end physical span, offset,
  alignment0..1, tracking, normalOffset, sizeScale, contour, side, overflow,
  fitting, orientation and one pure batch callback. Different dimensions/space,
  unresolved tangent, bad range/enum/float/callback fail E_PA_PATH_TEXT or the
  existing precise curve diagnostic. No source re-shaping happens inside drawing.
- `adjustPathTextFrame(frame,control,context)`: live normal/rotation/local scale/
  opacity after real curve sampling. **Nonzero distance is rejected**: call the
  original curve sampler/layout explicitly, never infer position along a tangent.
- `composePathTextFrames(...frames)`: merge disjoint line placements from the SAME
  canonical source/font provenance. Duplicate cluster placement rejects.
- `pathTextTransform(frame)`: immutable per-cluster affine/opacity lookup for the
  existing Native paragraph renderer. Unselected lines hide; foreign units reject.

`fit=none` preserves natural advance; `advance` redistributes distances while glyph
size stays fixed (overlap is possible); `uniform` scales both spacing and glyphs.
`sizeScale` is explicit uniform glyph/advance scale. Alignment acts within the
finite start/end span, not a new paragraph reflow. `orient=tangent|upright|keep-upright`;
keep-upright flips the pose by180° for a left-facing tangent, never mirrors outlines.
Same cluster-centered baseline anchor is used for every attached glyph.

Boundary semantics come from the shared helper extracted from existing
`glyphsOnPath`: error, whole-center clip, or closed wrap. Clip hides entire clusters
and reports W_PA_PATH_TEXT_CLIPPED; it does not cut pixels at an arbitrary path end.
Wrap needs a closed contour; requested and resolved distances stay distinguishable.
Choose a contour explicitly for a multi-contour baseline; no implicit joins.

## Batch controls (9)

| Function | Actual behavior |
| --- | --- |
| pathTextTracking | O(n) weighted prefix gaps after preceding whole clusters; unlike index×own selector weight, following units inherit inserted spacing. |
| pathTextWordSpacing | Prefix additions after whole whitespace clusters, matching existing spaceParagraphWords policy; no kashida/CJK distributed spacing. |
| pathTextNormalWave | Normal sine displacement from original baseline center x, physical wavelength, explicit phase Signal. |
| pathTextNormalNoise | Audited existing EffectCraft scalar noise over original center x/time; deterministic seed and finite F64 cell domain, no new noise algorithm or arbitrary million-pixel/second cap. |
| pathTextFan | Visual/logical local-rank angular fan with explicit normalized center. |
| pathTextTaper | Visual/logical local-rank scale interpolation; explicit negative/zero scales remain geometric transforms. |
| pathTextStagger | Existing local-time stagger + Core Signal progress, whole-cluster normal/rotation/scale/opacity reveal; no second timeline. |
| composePathTextControls | Add distance/normal/angle, multiply local scales/opacity, evaluate each batch once. General ordered world transforms still use existing composeGlyphTransforms. |
| selectPathTextControl | Existing GlyphSelector weights blend every adjustment from identity, without splitting shaped clusters. |

Controls are synchronous `(units, FrameContext) => adjustments[]`; one entry per
existing cluster, explicit finite numbers, alpha[0,1]. Signals use existing Core
evaluation; no wall clock/random/global current frame. Source/local clocks and
existing safety policies remain. Callback closures are ordinary authored code,
not permission to execute untrusted Node plugins.

## Queries and geometry (8)

- `pathTextInkBounds`: conservative affine AABB of original tight glyph-outline
  bounds; not exact rotated Bezier extrema or pixel coverage.
- `pathTextAdvanceQuads`: actual projected em/advance quads, with source clusters.
- `hitTestPathText`: all visible inverse-affine quad hits; overlapping units remain
  explicit. Existing core invert threshold marks singular units, never fake hits.
- `pathTextCaret`: original Paragraph Reader carets projected by the same pose;
  Bidi alternatives retained, unsupported GDEF ligature interiors unresolved.
- `nearestPathTextCaret`: nearest visible **actual caret anchor**, not closest ink
  or analytic nearest-curve position. Empty/hidden results remain unresolved.
- `pathTextSelection`: original Reader range/cluster expansion, projected quads;
  does not split ligatures, surrogate pairs or attached marks.
- `pathTextMetrics`: actual visible/hidden cluster/glyph/line/font counts and
  requested/resolved distance ranges; cross-contour extents are aggregates.
- `pathTextSourceLeaders`: lazy real PathData source-baseline→placed-anchor guides.

No byte reauthentication is implied by these local derived objects. Persisted
inputs require existing verified Resource/Artifact handling; do not bypass it.
Queries do not re-shape, decode, infer, render or load fonts. Frames are immutable,
stateless values with no persistent history/cache; arbitrary order is supported.

## Precision and verification

Geometry/control/query math is CPU F64. All actual image raster/affine/palette/
Glow/Layer execution uses existing **Native GPU only**, linear signed HDR PM F16/F32,
one admitted device, no Canvas8/browser/CPU pixel fallback or new shader/owner.
Original Native raster edge/overlap policy remains; do not claim analytic AA/AE.
Existing F32 coefficient admission/F16 range checks still apply without clamping RGB.

Editable sources: `validation/path-text-scene`, prepared by
`node --import tsx modules/pro-animation/validation/prepare-path-text.ts` using actual
Noto fonts, original four-font fallback/shaping/Unicode16/kurbo/Clipper2/Earcut.
The example contains8 explicitly sampled integer-frame distance sets and evaluates
pose/noise/stagger/queries live in the Native Stage. It does not claim automatic
native-host WASM startup or arbitrary subframe/upstream Stage resampling. For a new
range/edit, explicitly regenerate samples or run the same layout in an authorized
host with the original data factory. Main owns formal installation/exports/L3.
