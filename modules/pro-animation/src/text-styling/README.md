# Shaped text paint and animator controls

This source entry builds on the existing real HarfRust/Skrifa → canonical TextLayoutData → Clipper2/Earcut → native glyph renderer chain. It adds no font loader, text schema, renderer, timer or GPU owner. Main owns production named exports, immutable R1 identity/version/locks and L3. The private install fixture is not a released capability.

```ts
import {glyphInkGradient, glyphInkExposure, composeGlyphInk,
        glyphRangeShape, glyphSkew} from './index.ts';
const range = glyphRangeShape({start: 0, end: 100, shape: 'round'});
const paint = composeGlyphInk(
  glyphInkGradient(u => u.logicalIndex / Math.max(1, u.count - 1), [
    {at: 0, ink: [-.2, 2, 4, .8]}, {at: 1, ink: [3, .1, 0, .8]},
  ]),
  glyphInkExposure(range, existingCoreSignal),
);
// Existing native renderer prepared once during the Stage initializer.
const image = await text.at(context).draw(handle, {
  inkForUnit: paint, transform: glyphSkew(range, {degrees: 12}),
  format: 'rgba32float',
});
```

`inkForUnit(unit,context,base)` is optional on the existing renderer. Without it the original uniform-ink shader and buffers are unchanged. `base` is the evaluated immutable Straight scene-linear ink, default white. A callback returns four finite Straight components; Alpha is [0,1], RGB signed/HDR. The original guarded coverage shader has a thin second-buffer palette variant. Association, unit opacity, geometry transform and actual pixels execute on the existing native GPU; CPU callbacks are control values, never pixel rasterization. Final rendering remains F16/F32; no browser, Canvas8, clipping or CPU pixel fallback.

The original ligature/mark cluster stays a single default unit. Layout glyph ids, font provenance and visual/logical order are retained. Use the existing explicit glyph-unit preparation only when intentional mark separation is appropriate. Shaping, Bidi, kerning, ligatures, CJK, paths and variable-font policies stay in their existing modules.

## Functions

| Function | Meaning |
| --- | --- |
| glyphInk(selector,rgba) | Blend base to target Straight linear RGBA by selected weight |
| glyphInkOpacity(selector,alpha) | Target Alpha alone |
| glyphInkExposure(selector,stops) | Blend identity to 2^stops RGB gain, Alpha unchanged |
| glyphInkMultiply(selector,rgb) | Per-channel RGB multipliers |
| glyphInkOffset(selector,rgb) | Per-channel signed linear RGB offsets |
| glyphInkMatrix(selector,matrix) | Row-major3x4 affine RGB control, Alpha unchanged |
| glyphInkGradient(parameter,stops) | Piecewise-linear explicit Straight RGBA ramp, clamped outside stops |
| composeGlyphInk(...controls) | Feed each output ink to the next in author order |
| mixGlyphInk(a,b,amount) | Independently evaluate two controls against the same base, then mix |
| maskGlyphInk(selector,control) | Blend base to the complete controlled result |
| glyphSkew(selector,options) | Pivoted shear with rotated axis; weighted angle must be inside ±90° |
| glyphBaselineShift(selector,amount) | Semantic adapter to the existing glyphTranslate Y control |
| glyphLineSpacing(lineIds,amount) | Additional Y per explicitly ordered canonical line |
| glyphCumulativeTracking(units,selector,amount) | Prefix-sum selected visual gaps, reset per line |
| glyphWordSpacing(units,amount) | Prefix spacing after whole horizontal-whitespace clusters |
| glyphGroupTransform(units,group,transform,options?) | Apply a control with a shared group pivot |
| glyphOrbit(selector,options) | Independent time-pure ellipse displacements and index phase |
| glyphLookAt(selector,options) | Orient unit +X toward a physical target around its baseline anchor |
| glyphTransformOrigin(control,anchor) | Substitute an explicit pivot for any compatible control |
| mixGlyphTransforms(a,b,amount) | Componentwise affine/opacity mix, not shortest-angle interpolation |
| glyphRangeShape(options) | Six integrated range shapes over original unit cells |
| combineGlyphSelectors(inputs,options?) | Add/min/max/subtract/product/difference and final bounded amount |
| smoothGlyphSelector(selector,options?) | Smoothstep selected interval |
| quantizeGlyphSelector(selector,levels) | Quantize weight into an explicit number of levels |

24 public function names form this control chain; adapters/combinators are not counted as 24 new AE effects. No proprietary parameter/pixel equivalence is asserted. Angles are clockwise degrees, positions physical px and time existing Stage seconds/FrameContext. Signals use the original evaluator and keys. There is no mutable current frame, timer or hidden history.

Range shape coordinates are indices or percent of the existing unit count (default percent), with an additive offset and logical/visual order. Each unit receives the exact shape integral over its cell, not a centre-only step; square, ramp-up/down, triangle, semicircle and smoothstep have explicit normalized primitives. Weights remain the existing [0,1] selector contract. Reversed ranges reject, zero-width ranges are empty. This is not an AE signed-amount or random-order emulation.

Tracking sums previous visual-unit gaps, so selections on earlier units move following units; it does not multiply each unit index by its own selection. It intentionally differs from the older independent post-shaping tracking control. Word spacing recognizes only complete horizontal-whitespace clusters and does not invent Arabic kashida or CJK justification. Group pivots interpolate anchor/advance extents, not font ink/ascent bounds; group callback is evaluated during preparation. It does not change original indices or pretend to rebuild a word-unit layout. Prefix tracking callbacks require pure selectors; current scalar callback adapter is O(n) per queried unit, thus O(n²) for a complete large line. No permanent glyph count cap is introduced.

Returned inks are Straight. RGB affine/exposure operations stay defined for signed/HDR linear data; no HSV operation or sRGB relabelling is hidden. Alpha and RGB are independent until the original GPU coverage association. Zero-Alpha Straight ink yields zero associated RGB. Half direct inks retain the existing 65504 profile; larger values require F32. Coefficients and geometry use the existing explicit F32-pair/F32 admission rather than silent loss or fallback.

Preparation and callback inputs must describe the same verified layout. These functions are not an Artifact/resource trust boundary. Dispose and frame-epoch image ownership remain the existing glyph renderer contract; the new palette buffer belongs to its existing per-draw arena, including errors/cancellation.

Editable real-font scene: `validation/text-controls-scene/project.tsx`, `half.tsx`, and `animation.ts`. Native glyph controls compose with existing Glow and Layer. Reproduce with:

```powershell
node modules/pro-animation/validation/run-text-controls.mjs types l0 regression stage package legacy
```

One cumulative campaign includes failed harness attempts. L0 covers all new functions and negative inputs. Real GPU comparisons cover XYZ and palette against F64 control values, F16/F32, random/repeated frames, signed HDR/Alpha, transparent PNG, FLOAT-channel EXRs and decoded MP4. The optional-free old uniform-ink/shutter/Glow output is compared to its previously frozen hashes. Exact tolerances/logs are in the machine checkpoint.

Still outside this implementation: dynamic glyph substitution, animated stroke topology/width, per-character3D/blur, vertical/color/bitmap glyphs, discretionary hyphen and proprietary AE parameter parity. These remain concrete gaps; source APIs and base infrastructure do not imply their completion. Other OS/GPU, huge-text performance and formal six-mode package exports are not verified here.
