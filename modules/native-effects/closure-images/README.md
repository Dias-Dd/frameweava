# Native image, warp, mask and generator recipes

Final closure round **3/3**. These 32 actual method bodies use the existing
Native Pixel/Data/Compute owner. Main owns public SDK/R1 identities, package
versions, catalog, locks and CLI integration; none are silently refreshed here.

```ts
import {createNativeClosureImageEffects} from './closure-images/index.ts';
const effects = createNativeClosureImageEffects(init);
// Existing Native Stage renderAt(context, inputs):
const result = await effects.processImage(inputs.image, async (image, fx) => {
  image = await fx.reshapeWarp(image, {destination, source});
  image = await fx.pathStroke(image, path, {width: 3, dash: [20, 10]});
  return fx.beam(image, {from: [10, 20], to: [280, 150], intensity: 1});
}, {context});
// Existing Stage dispose(): await effects.dispose()
```

Editable real TSX: `../examples/closure-image-chain.tsx`. `types.ts` is the exact
parameter/Signal contract; ordinary JS supplies geometry and controls. Reuse
one processor in a Stage. Inputs are borrowed; produced images/scratch follow
`../images.ts` recipe lifetime. Returned images remain valid until that
processor's next recipe or dispose. Do not dispose the engine scope.

| Methods | Implemented contract |
| --- | --- |
| blobbylize | Gaussian-smoothed guide Alpha, local gradient refraction, physical pixel strength; explicit threshold. |
| floMotion | Two radial knots using the pinned EffectCraft pull/falloff equation. |
| pageTurn | Pinned Rust inverse cylindrical fold, original four-candidate order, paper/back opacity and shading. |
| ripplePulse | Expanding bounded sinusoidal radial pulse, explicit project time. |
| slantWarp | Inverse row-dependent shear and axis scale about an explicit floor. |
| smearWarp / splitWarp | Line-distance bounded displacement, one-sided or opposed components. |
| splitCorners | Four quadrants separated by explicit horizontal/vertical gaps. |
| reshapeWarp | Thin-plate destination-to-source interpolation plus affine tail; existing pivoted F64 control solver, GPU image sampling. |
| rollingShutterWarp | Explicit top/bottom/acceleration row offsets; calibrated correction, not automatic motion estimation. |
| envelopeWarp | Explicit quadratic horizontal/vertical displacement coefficients. |
| blockLoad / burnFilm | Deterministic spatial cell reveal / thresholded burn front with signed HDR additive edge light. |
| hexTile | Hexagonal cell inverse mapping, pixel radius and scale. |
| smoothPosterize | Explicit softened quantization in normalized color domain with retained HDR span/offset. |
| roughenEdges | Seeded procedural Alpha edge perturbation and feather. |
| scatter | Seeded signed per-pixel source offset, explicit axis. |
| strobe | Context-time period/duration/phase gating; no wall clock. |
| objectMatte | Exact selected **u32 IDs**, no lossy F32 identity conversion. |
| seededMatte | Exact four-neighbour connected component of explicit foreground/background color-distance candidates. |
| pathMatte | Strict shared PathData, nonzero/evenodd winding and signed-distance feather. |
| ellipseMask / gridTexture | Pixel-centre analytic ellipse coverage / grid coverage and two explicit HDR colors. |
| beam / lightning | Antialiased segment light / seeded displaced polyline segments; preserve input coverage. |
| threadsTexture / radioWaves | Explicit procedural sine threads / concentric ring light, analytic distance coverage. |
| pathStroke | Shared PathData stroke, cumulative arc-length trim/dash/phase and signed-distance feather. |
| paintBucket | Exact four-neighbour selected component; explicit seed/color-distance tolerance and PM-aware paint. |
| spectrumBars / waveformTrace | Visualize supplied **typed GPU data**, not an audio decoder or FFT. |
| radialShadow | Explicit finite ray Alpha integration away from a light; composited PM shadow. |

## Precision, coordinates, limits and lifecycle

Pixel centres are `(x+.5,y+.5)`, origin top-left, y down. Bilinear warp sampling
outside the source is transparent. Default output inherits F16/F32 precision;
logical publications and Half rounding remain individual operations. Working
color conversion is actual GPU conversion. Coverage is associated correctly,
including negative/HDR RGB and Alpha0 PM emission; hidden straight RGB does not
become radiance. Artistic domain mappings are explicit. F16 overflow fails,
not clips. No browser pixels, private device, CPU image fallback or permanent
image-resolution cap is added.

Path input uses `graphics-contracts` validation and adaptive de Casteljau
flattening. Optional six-coefficient `transform` explicitly places an existing
path into another physical extent. Storage-derived budgets fail rather than
truncate geometry. Nearest-edge ties use stable first-segment order within
`2^-40 * max(1, absolute pixel/end-point coordinates)`; dash/trim endpoints use
the declared feather ramp (default half-pixel, zero is hard).

TPS preparation admits its dense control matrix against the existing data
storage budget. Image evaluation stays GPU-resident. Region connectivity uses
monotone atomic union-find and compression, not a guessed number of dilation
passes, CPU flood fill, convergence polling or pixel readback. Seeded matte
requires distinct foreground/background pixels; a 1x1 image cannot provide
both and is rejected. Object IDs require full-origin scalar image-space
`u32` indices with units `id`; spectrum/waveform require scalar `f32`, space
`frequency`/`audio-samples`, units `linear-amplitude`. Foreign runtime handles
are not JSON/TVG resources.

Each frame derives from explicit context, seeds and controls. Random/backward
frames need no mutable history. Cancellation rejects before new work; accepted
work follows the owner. Repeated disposal, failure cleanup and retries are
verified. Global connectivity/TPS/path controls are not automatically tiled;
real owner/device limits still apply. No blind tracking, neural segmentation,
Mocha file importer, full proprietary AE option parity or automatic upstream
Stage temporal sampling is claimed.

## Explicit display delivery boundary

`display-output.ts` is a separate **Node-only** entry, deliberately absent from
the Stage-safe index. It reads a caller-selected, allowlisted named
`NativeDisplayData` lease after completion, validates layout/color/Alpha,
and uses existing PME EXR/PNG/video IO. `writeNativeDisplayFrame` requires an
explicit PNG clip policy; EXR retains F32 display-linear values. Video requires
explicit frame order, FPS, clip and Alpha matte. The caller owns and closes
the Renderer. Final delivery reads back; effects inside the Stage do not.

`../examples/closure-image-ocio.tsx` plus `verify-display.ts delivery` exercises
OCIO's official **Video (colorimetric)** view, five random/repeated HDR frames,
exact GPU-to-F32-EXR export, decoded PNG and decoded four-frame SDR H.264 MP4.
Its ordinary Layer is only the scheduling/presentation source image; the Node
terminal explicitly selects `ocio/display`. It does not relabel display data as
a scene image. Public normal-Layer/CLI display selection remains Main work.

**Known failed qualification:** `verify-display.ts` without `delivery` retains
the original official ACES 2.0 view and unchanged `3e-6` gate on a 320x180 HDR
ramp. Latest max scaled error is `3.2186508178710938e-6`; this wider ACES2
case is **not qualified**. The original smaller ACES2 regression still passes.
Neither fixture nor tolerance was weakened. Failed attempts and numeric worst
samples remain in the cumulative campaign. This checkpoint therefore does not
claim every original closure gap or every OCIO profile is fully complete.

## Reproduction and provenance

One cumulative campaign: `node modules/native-effects/closure-images/validate.mjs`
with phases syntax/types/unit/gpu/media/performance, ocioBuild/ocioPrepare/
ocioSyntax/ocioUnit/ocioGpu, displayPrepare/displayDelivery, and freeze.
The strict ACES2 `display` phase is expected to expose the recorded failure.
Use worktree-local FRAMEWEAVE_HOME and the reviewed Native/SpiderMonkey and
PME Python environment. Preserve all attempts under the same <420s budget;
never reset it to hide failures. GPU tests use actual hardware, not `auto`
as proof. Other vendors, OSes, all parameter combinations, arbitrary OCIO
configs, device-limit tiling, 4K terminal encoding, public SDK/installation and
full repository acceptance are unverified here.

`sources.json` pins EffectCraft commit/source hashes and MIT license. Necessary
WGSL/Rust equations are adapted; existing Gaussian/EDT/compensated math, matrix
solver and strict graphics contracts are reused. OCIO remains official 2.5.2
BSD-3-Clause GPU extraction with pinned Naga 30.0.1 (MIT OR Apache-2.0), with
explicit compensated transcendental/F32 operation-order hooks. No new host or
permission mechanism is introduced.
