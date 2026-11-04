# Native image stylization

Twenty concrete image operations reuse the existing Native recipe, admitted GPU,
Pixel/Data/Compute ABIs and resource leases. No additional Host, renderer, Stage
DAG, JS runtime or CPU image fallback. Main owns official public SDK exports,
immutable R1 identity/version, catalog, pins and portable integration.

```ts
import {createNativeStylizeEffects} from './stylize/index.ts';
const effects = createNativeStylizeEffects(init);
const output = await effects.processImage(source, async (image, fx) => {
  image = await fx.mosaicMean(image, {blockSize: 3});
  image = await fx.watercolor(image, {radius: .6, bleed: .5,
    granulation: .1, edgeRetention: .06, seed: 71});
  return fx.cartoon(image, {levels: 4, threshold: .04, softness: .03});
}, {context});
// Stage dispose: await effects.dispose()
```

Editable TSX: `../examples/stylize-chain.tsx`; the actual recipe is in `stage.ts`.
Small numerical and genuine1x1 projects are `stylize-numeric.tsx` and
`stylize-boundary.tsx`. Methods consume/return owner-local GPU images. They do
not place native handles into persistent JSON or create CPU Surfaces between calls.

| New API | Actual algorithm / default controls |
| --- | --- |
| mosaicMean | Real block area-average of associated RGBA; blockSize8; partial edge blocks normalized by their actual population |
| adaptiveMosaic | Same Compute statistics, retain source where bounded straight-luma variance>.01 |
| crystallize | Seeded Voronoi feature, bilinear source-color sampling; cellSize12/jitter1 |
| stainedGlass | Voronoi source colors with explicit black leading response from distance gap, edgeWidth1 pixel |
| pointillism | Colored feature disks with cubic coverage transition from .28 to .42 cell radius |
| lumaHalftone | Altered Pixi sinusoidal dot pattern applied to working luma, period8/angle45 degrees |
| colorHalftone | Three independently rotated source-channel dot screens, angles15/45/75; not physical CMYK printing |
| crosshatch | Four Pixi-derived density bands and diagonal line families, period10/lineWidth.5 |
| engraving | Gradient-oriented density/line-width engraving, period6/lineWidth1/angle45 |
| pencilSketch | Bounded source/blurred-tone dodge ratio with epsilon.001, Gaussian radius2 |
| charcoal | Blurred tone minus gradient strokes and seeded charcoal grain.1, strength2 |
| lineArt | Threshold/softness ink edges on explicit paper; working bounded-luma Sobel, threshold.03/softness.03 |
| cartoon | Signed continuous-level color quantization plus gradient-controlled ink; levels6 |
| oilPaint | Alpha-weighted modal luminance histogram color; radius2/bins8, no 8-bit source quantization |
| watercolor | Edge-retained Gaussian color bleed.6, seeded granulation.15, edgeRetention.05; explicit artistic equation, not wet-pigment simulation |
| brushStrokes | EffectCraft-derived cell direction/jitter table and clamped associated-RGBA stroke integration; cellSize8/length12/samples9/coverage.8 |
| glassRelief | Explicit same-size height image, gradient refraction and diffuse/specular relief; refraction8 pixels |
| plasticRelief | Source-tone relief normal and lighting, ambient.25/diffuse.75/specular.5/shininess16 |
| solarize | Per-channel reflection above threshold.5, including signed/HDR results |
| paletteQuantize | Explicit nonempty working-RGB palette; minimum RGB squared distance, stable first-index tie |

Qualified Gaussian, source-over, Sobel, compensated arithmetic and previous
Median/Kuwahara/Noise/Posterize helpers are reused, not renamed or counted again.
Mosaic differs from existing block-center Pixelate: it computes actual averages
on GPU once per block. Oil paint is a modal histogram, not a Kuwahara alias.

## Precision, color, Alpha and time

Dimensions, linear working color and output F16/F32 inherit the source. An
explicit workingColor invokes the existing actual F32 conversion. Ink/paper/
palette entries are authored in that working RGB space and may be signed HDR.
No RGBA8 intermediate or hidden CPU fallback. Internal Gaussian results are F32;
block means/moments carry hi/lo pairs. Final Half uses existing owner RNE behavior.
Logical operation order and each public Half publication remain explicit.

Point styles preserve center Alpha and Alpha0 PM emission. Straight Alpha0 color
is excluded. Mosaic and Brush Strokes deliberately redistribute associated RGBA
and coverage; they do not silently fill a background. Glass refracts source color
inside the original coverage; it is a 2D content effect, not 3D scene ray tracing.
Spatial/color sampling clamps to the finite source canvas. Guide/height input
must match dimensions and is explicitly converted to the working color.

No RGB channel is implicitly clipped. Some artistic effects intentionally map a
bounded luminance guide to explicit ink/paper colors; palette quantization maps
to an explicit palette. Those declared mappings are not photographic HDR
reconstruction. Dot equations deliberately produce negative and high RGB. Luma
guide is .5+.5*Y/(1+abs(Y)); compute variance uses Y/(1+abs(Y)).

`amount` mixes original/target associated RGBA once at publication. Numeric
controls accept the existing Signal evaluator with explicit FrameContext.
Counts are integer control data; seeds retain exact uint32 identity. No wall
time, cross-frame mutable GPU history or implicit upstream temporal sampling.
Recipe resources expire through existing owner leases. Repeated/random frames
and cancellation/failure/retry share the same deterministic contract.

Default ink/paper are [0,0,0]/[1,1,1]. Lighting uses azimuth135/elevation45 degrees
and strength4. Brush angle45/angleJitter20 degrees, perpendicular jitter2 pixels;
CPU prepares geometry-only cell controls using a fixed uint32 hash. Pixels stay
on GPU. Brush source/cell coverage subset is explicit; original upstream surface
painting modes and per-cell UI controls are not all exposed here.

## Validation and resource boundaries

Unknown fields, invalid counts/types/seeds/Signals and malformed palette/image
inputs produce located `E_NATIVE_STYLE_PARAMETER` errors. Native color/image/
ownership errors retain existing engine codes. Missing admitted hardware fails
explicitly. SpiderMonkey has no global AbortSignal constructor; malformed explicit
signals are rejected safely and Renderer cancellation is the qualified path.

Device storage/dispatch and int32/uint32 coordinate bounds govern admission;
there is no new permanent MP/image ceiling. Periods used in trigonometric dot
screens are limited by actual coordinate/reduction precision. Oil bins fit exact
Float32 integer indices; enormous windows/counts still cost real work and remain
subject to owner budgets/timeouts. Mosaic block data and Brush control tables
use actual storage admission. No automatic tiling/global-origin/halo exchange.
Allocation counters are not measured physical VRAM peak. Arbitrary IEEE-domain
overflow and every parameter/primary/coverage combination are not qualified.

`validate.mjs` runs syntax/types/unit/gpu/media/performance/freeze as one coherent
cumulative <420s ledger, including original failures, below implementation time
before tests. Independent F64 uses direct block averages, a wider Voronoi search,
histogram loops, direct convolutions and explicit original Alpha handling.
Original scaled3e-6/F32 and6e-4/Half budgets are unchanged. Actual Half values must
be Half-representable. Tests include20 methods, Alpha0/tiny/partial/opaque,
straight/PM, signed HDR, visible wide values,1x1, initial/middle/final/repeated/
random frames, invalid parameters, cancellation, failure cleanup and disposal.

The full Compute→Pixel recipe renders actual PNG, Float32 EXR and a short MP4;
PNG is decoded/inspected, EXR compared numerically, MP4 externally decoded as
lossy SDR. Performance is complete cache-disabled submit-to-completed for actual
new/repeat/random frames,1080p/4K, init/cold separate, n7 median/P95, actual GPU/
driver/power scheme and transfer/allocation counters. No timestamp-only or
cross-algorithm speedup claim. Export/encoding/display are separate boundaries.

Other GPUs/OS/software adapters, natural-image aesthetic datasets, all parameter
combinations, antialiasing/transparent tiling,4K terminal encoding, full-repository
and six-mode/public package/portable integration remain unverified. These APIs
do not claim complete AE/CC behavior, proprietary effect parity, or that every
remaining inventory entry is finished.

## Source reuse

Fixed originals/hashes/licenses: `sources.json`, `vendor/`. Pixi Filters MIT
Dot/CrossHatch shader patterns are altered for the sealed ABI, actual linear
working luma, signed HDR, Alpha and compensated arithmetic. EffectCraft MIT
`fxs_brush` integration/control-table topology is adapted to existing image/data
leases. No external framework/device is bundled. Remaining explicit image/ink/
relief/statistics equations are local and reuse existing qualified Frameweave
math. Original algorithm authorship is retained; no full UI/bit-parity claim.
