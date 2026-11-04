# Native temporal controls

Development entry: `temporal-controls/index.ts`. Main owns public root exports,
typed R1 sources/version/catalog/SDK pins and portable L3. These are plain typed
functions inside the existing Native Stage, not another timeline or Renderer.
`validation/temporal-scene/runtime.ts` is an installed private R1 consumer.

```ts
// Bind an actual sealed R1 source during the existing initializer.
const footage = await init.temporal.bind({version: 1, packageRef, module: 'source'});
const comparison = await init.temporal.bind({version: 1, packageRef, module: 'target'});

// Inside renderAt(c): each authenticated window returns its own copied image.
const image = managedTemporalSource(init, footage, c);
const target = managedTemporalSource(init, comparison, c);
return renderTimeDifference(init, image, target, {
  offset: -.125, contrast: 2, alpha: 'alpha-difference', format: 'rgba32float',
}, c);
// Or:
return renderTimewarp(init, {image}, {
  speed: keyframes([{frame: 0, value: 50}, {frame: 48, value: 150}]),
  sourceFps: {num: 24, den: 1}, method: 'pixel-motion',
  vectorDetails: 25, blockSize: 8, filtering: 'extreme',
  shutter: {count: 8, angleDegrees: 180},
}, c);
// The initializer must dispose both borrowed bindings during its normal teardown.
```

`managedTemporalSource(environment, binding, enclosingContext, windowOptions)`
accepts the existing Core prefix, declared-input or declared-resource binding.
It opens **one sequential Core window per sample**, copies its borrowed result
on the same GPU owner and lets Core promote the owned result. Distinct sources
can therefore combine without nested windows. Core still authenticates identity,
permissions, lifetime, parameters and context. Callers await samples in order;
the adapter does not authorize arbitrary paths/callbacks or seek historical Stages.
Existing Core isolated-seek rules apply to declared inputs.

Every explicit source callback transfers a fresh same-owner image. The effect
releases it, including invalid extent/encoding and error paths. Results are owned
by the caller until released/epoch end and provisional until the existing frame
ticket completes. No persistent image cache/history is added. Concurrent calls
must respect the existing owner's/window's ordering and command budgets.

## Time Difference: `scene-linear-time-difference/1`

`renderTimeDifference(env, source, target, options, c)` supports local-second
`offset` **or** absolute local-second `targetTime`, animated nonnegative `contrast`,
`absolute`, animated unit `opacity`, explicit Straight/PM comparison, professional
output format and existing finite `range` policies. It evaluates existing Signals.
All nine `timeDifferenceAlphaModes` are implemented, not just the original PM
subtract/absolute helper: original, target, blend, max, full-on,
lightness-of-result, max-of-result, alpha-difference, alpha-difference-only.

Default comparison unassociates RGB (zero Alpha means canonical zero), computes
`abs((a-b)*contrast)` or `(a-b)*contrast + .5`, selects/clamps physical Alpha,
then associates result RGB. Lightness explicitly means HSL `(minRGB+maxRGB)/2`
in the declared linear working encoding. Alpha-difference applies the same
contrast/absolute rule to source Alpha; alpha-difference-only has white straight
RGB. Explicit PM comparison operates on raw associated RGB and retains valid
zero-Alpha emission. `opacity` mixes in PM using shared compensated arithmetic.
RGB is unbounded by default; `rgbRange:'clamp-unit'` is an explicit float operation.

## Timewarp: `scene-linear-timewarp/1`

`renderTimewarp(env, {image, warp?, matte?}, options, c)` supports:

- `method`: whole-frames (nearest, ties forward), frame-mix, pixel-motion.
- `adjustBy`: speed percentage (default100) or source-frame; rational source fps.
  Negative speed/holds are explicit; no decoder direction or endpoint is inferred.
  Original Core key/easing integration is analytic. Other Signals are integrated
  by adaptive Simpson **over original Core evaluation**, using actual affine
  output subcontexts. `integration.absoluteTolerance` (default1e-8 seconds) and
  `maxEvaluations` (default65536) are caller-set. Error estimates are not a
  mathematical certificate for arbitrary discontinuous expressions.
- `vectorDetails` in (0,100] maps to spacing `ceil(100/details)`;100 really
  independently matches every pixel. `blockSize`, `searchRadius`, actual pyramid
  levels, median and smooth iterations call the original existing flow module.
- `rgbWeights` control grayscale analysis, not output colors.
  `correctLuminanceChanges` calls the existing GPU motion-aligned color-fit
  processor on grayscale analysis B against A; it does not recolor the artwork.
- `filtering`: nearest, normal (original compensated bilinear), extreme
  (original shared Mitchell-Netravali reconstruction, normalized4x4 taps).
  Extreme uses a Float64-generated F32-pair coefficient table; default1024 phases
  makes the maximum phase quantization half of1/1024 pixel. Caller can choose
  `filterPhases`; this is explicit approximation, not exact arbitrary-phase bicubic.
  `filterTableByteBudget` is an adjustable resource budget (default64MiB), checked
  before CPU allocation and against actual admitted GPU buffer limits.
- `buildFromOneImage` selects the nearer single warped input instead of a blend.
  `errorThreshold` raises rejection toward ordinary frame mix using a bounded,
  HDR-safe reprojected RGB residual;0 retains motion,1 is frame mix.
- `sourceCrops` remove physical integer edge pixels and repeat the remaining
  edge before analysis/reconstruction. They do not crop output dimensions.
- Optional distinct `warp` supplies motion analysis images. Optional `matte`
  samples at remapped time; Alpha/R/G/B/luminance channel partitions analysis
  into independent foreground/background flows and combines the warped results.
  `show`: final, foreground, background, matte, flow (dx/dy pixels), confidence.
  Foreground/background/matte views require a matte; diagnostics require pixel-motion.
- `shutter` reuses existing quadrature and compensated GPU reducer. Each actual
  output subframe reevaluates nonlinear timing and sources. It is not a frozen
  center-frame blend and does not invent a composition-level shutter setting.

Frames are scene-linear same-encoding F16/F32; intermediates F32, output F16/F32.
Only final physical Alpha is clamped; signed/HDR RGB remains. Native hardware
admission is required, with no CPU/browser/SDR pixel fallback. CPU work is control
math/coefficient tables. Existing matcher fields and coordinates are F32, not
GPU F64. Finite ranges are explicit and apply to all roles; wrap callbacks with
their own existing range policy if sources have different intervals.

The controls were checked against the [official Adobe time-effects documentation](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/time-effects.html).
Adobe's proprietary Kronos implementation and8-bit Time Difference pixel behavior
are **not** imported or claimed identical. This is an explicit professional-linear
implementation profile, using the already reviewed EffectCraft motion algorithm.

## Reproduction

`node modules/pro-animation/validation/run-pa4-temporal.mjs types l0 regression media`
runs scoped checks under one cumulative420-second ledger including failures,
build/install and render. Native/SM binaries are verified against their receipts.
Only `.frameweave/user-home` is used for the private install. The validator sweeps
one scenario per real frame to stay within the current command-packet/publication
limits; it does not alter Core capacity or hide the unsuccessful packing attempts.
The gallery is explicitly a clipped SDR diagnostic view of exported real GPU
floats; the final editable combined shot is encoded by the original Native
Renderer into PNG, F32 EXR and MP4.
