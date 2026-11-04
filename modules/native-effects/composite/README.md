# Native HDR compositing and blend modes

Twenty-two named two-image operations reuse the existing admitted Native GPU,
recipe lifecycle and sealed Pixel ABI1. No new compositor Host, Stage DAG,
renderer, package manager, device or CPU fallback. Main owns public SDK/R1
identity, immutable versions, catalog, pins, installation and portable wiring.

```ts
import {createNativeCompositeEffects} from './composite/index.ts';
const effects = createNativeCompositeEffects(init);
const result = await effects.processImage(source, async (image, fx) => {
  image = await fx.softLight(image, destination, {opacity: .8});
  image = await fx.colorBlend(image, destination, {opacity: .65});
  return fx.sourceAtop(image, destination, {opacity: .9});
}, {context});
// Stage dispose: await effects.dispose()
```

Editable full TSX: `../examples/composite-chain.tsx`; actual factory `stage.ts`.
Numerical/1x1 projects are `composite-numeric.tsx`/`composite-boundary.tsx`.
Arguments are consistently **source first, destination second**. Both must have
the same dimensions. Output is PM, format inherited from source unless explicit.
workingColor defaults to source; both images use the existing actual GPU F32
color conversion where needed. It never merely relabels the destination.

| APIs | Actual color/coverage equations |
| --- | --- |
| softLight | EffectCraft soft-light branches; negative destination G uses an explicit odd extension |
| colorDodge, colorBurn | Unclipped real-valued Dodge/Burn, signed denominator guard |
| vividLight | Burn(2S) below half, Dodge(2S-1) above half |
| hardMix | Explicit binary artistic overlap transform from D+S>=1 |
| hueBlend, saturationBlend | EffectCraft SetSat/SetLum topology with actual working luma and no hidden ClipColor |
| colorBlend, luminosityBlend | Match destination/source working luma respectively without gamut clipping |
| lighterColor, darkerColor | Select the complete RGB color by working luma; destination wins ties |
| divideBlend | Destination/source with the same explicit signed denominator guard |
| negationBlend, phoenixBlend | 1-abs(1-S-D), and min(S,D)-max(S,D)+1 |
| destinationOver | D+(1-Ad)S |
| sourceOut | (1-Ad)S |
| sourceAtop | Ad*S+(1-As)D |
| destinationAtop | As*D+(1-Ad)S |
| xorComposite | (1-Ad)S+(1-As)D |
| saturateComposite | min(1,(1-Ad)/As)*S+D; source coefficient1 when As=0 |
| dissolve | Deterministic coverage sampling: selected source becomes opaque, otherwise destination; correct ensemble coverage |
| linearDodgeBlend | Color overlap S+D inside source-over coverage; distinct from associated Plus/Lighter |

Existing Darken/Lighten/Multiply/Screen/Overlay/HardLight/Difference/Exclusion,
linear variants, Source-over and Alpha Matte remain unchanged and are not
recounted. Existing `over` is reused in this recipe for explicit backgrounds.

## Explicit professional media semantics

All math is scene-linear F16/F32 with compensated intermediates and one logical
publication per call. No RGBA8 or RGB-to-Alpha clipping. Opacity defaults1,
scales source associated RGB and coverage together, and accepts existing Signals
with explicit FrameContext. Format16 retains owner Half RNE semantics; request
F32 explicitly for larger ranges. No automatic precision downgrade or CPU/Web
fallback. F16 has real finite range: arbitrary overflow is not made valid by
being a named effect. Owner publication/scanning policy is unchanged.

For color blend modes, source-over base is `S+(1-As)D`; the covered-overlap
correction is `As*Ad*(B(Cs,Cd)-Cs)`. It is evaluated only for positive coverage.
This retains Alpha0 PM source emission rather than discarding it during
unassociation. Straight Alpha0 hidden RGB is excluded. Porter-Duff coefficient
equations apply to the complete associated RGBA, including explicit emission.
No straight-alpha output or undefined RGB recovery is promised.

Nonlinear extensions are deliberate and **not unchanged legacy blend behavior**:

- Dodge/Burn/Vivid/Divide expose epsilon (default2^-10, accepted2^-20..1).
  Denominators with smaller magnitude use signed epsilon; exact zero uses positive
  epsilon. RGB is never clamped to [0,1]. The pole neighborhood is an explicit
  finite control, not a hidden zero/one display clamp.
- Soft-light G is odd for negative destination values. Positive in-range math
  retains the original polynomial/square-root branches.
- Nonseparable modes use declared working luma rather than a fixed display
  coefficient, and omit upstream ClipColor. Result can exceed gamut or be negative.
- Hard Mix intentionally quantizes overlap to0/1; this is its documented artistic
  mapping, not accidental intermediate precision loss.

Dissolve seed is exact uint32, default71. animated defaultsfalse; true hashes
the explicit integer globalFrame along with the pixel and seed. No wall clock,
uncontrolled randomness, mutable cross-frame history or temporal upstream
resampling. Layer/cache ordering remains with the existing owner. Cancellation,
failed recordings and repeat disposal use existing recipe/resource leases.

## Validation and provenance

Unknown fields, missing/mismatched images, illegal opacity/epsilon/seed/animated
values and unsupported Signals fail with `E_NATIVE_COMPOSITE_PARAMETER` and
effect/path/expected. Native ownership/color/permission errors retain engine
codes. No arbitrary permanent image ceiling is introduced; actual image/device
and session budgets govern admission. No new GPU handle is persisted in JSON.

Fixed EffectCraft MIT `common.wgsl` source, commit and hashes: `sources.json` and
`vendor/`. Altered adapter keeps equations and meaningful dependencies and uses
existing hi/lo arithmetic, uniforms and borrowed resources. The Alpha/HDR
extensions above are local adaptations. General compositing reference:
[W3C Compositing and Blending,2024-03-21](https://www.w3.org/TR/2024/CRD-compositing-1-20240321/).
No complete AE/proprietary UI or encoded-display bit parity is claimed.

One <420s cumulative campaign via `validate.mjs`: syntax, types, unit, gpu, media,
performance, freeze. All failures/build/verification count and remain below
implementation time before tests. Independent F64 equations cover22 operations,
all Alpha representations, mixed source/destination coverage, Alpha0 emission,
signed HDR, source-opacity Signals, singular denominator boundaries, genuine1x1,
initial/middle/final/repeated/random frames and cancellation/failure cleanup.
F16 results must actually be Half-representable. Gates stay scaled3e-6/F32 and
6e-4/Half. Wide fixture is128x/F32 and16x/Half to remain in the declared storage
range; these are recorded separate numeric workloads, not a speedup comparison.

Full three-effect two-input TSX chain is compared numerically; actual PNG decoded
and inspected, Float32 EXR compared exactly to GPU export and signed HDR checked,
short MP4 externally decoded as lossy SDR. Performance records init/cold/new/
repeat/random submit-to-completion at1080p/4K, cache disabled, n7 median/P95,
device/driver/power scheme and transfer/allocation counters. No timestamp-only,
physical VRAM peak, cross-environment or unlike-load speedup claim.

Other GPU vendors/OS/software adapters, all primaries/parameters/IEEE extremes,
automatic tiling,4K terminal encoding, full repository/six-mode/public R1/portable
qualification remain unverified. Automatic upstream temporal sampling is outside
the user's final three-round closure and remains Agent-2/Agent-1 work.
