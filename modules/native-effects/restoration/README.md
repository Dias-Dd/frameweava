# Native spatial restoration and focus

20 image methods and one typed CoC-field method reuse the existing Native recipe,
Pixel/Data/Compute ABI, admitted GPU and resource lifecycle. No additional GPU
host, renderer, animation system or CPU image-effect fallback is introduced.
Main owns public SDK/R1 exports, immutable package identity, catalog and pins.

```ts
import {createNativeRestorationEffects, depthField} from './restoration/index.ts';
const effects = createNativeRestorationEffects(init); // once in Native Stage init
// depthBuffer comes from an admitted in-Stage metric-depth producer.
const depth = depthField(depthBuffer);
const result = await effects.processImage(source, async (image, fx) => {
  image = await fx.nonLocalMeans(image, {radius: 1, patchRadius: 1,
    strength: .25, noiseSigma: .03});
  image = await fx.guidedDenoise(image, {radius: 1, epsilon: .004});
  image = await fx.depthOfField(image, depth, {
    focalLengthMm: 35, fStop: 8, focusDistanceM: 3, sensorWidthMm: 36
  });
  return fx.over(image, knownBackground); // existing qualified source-over
}, {context});
// dispose(): await effects.dispose()
```

Editable complete TSX: `../examples/restoration-chain.tsx`; actual recipe and
synthetic depth producer: `stage.ts::restorationScene`. Numerical/boundary projects:
`restoration-numeric.tsx` and `restoration-boundary.tsx` in that examples directory.
The example supplies a real known background in the same Stage. A single depth
plate cannot reconstruct hidden background; defocus preserves its computed Alpha
and the caller composites available layers explicitly.

| Family | New functions |
| --- | --- |
| Patch and edge-aware restoration | `nonLocalMeans`, `guidedDenoise`, `atrousDenoise`, `anisotropicDiffusion`, `totalVariationDenoise` |
| Adaptive statistics | `kuwahara`, `anisotropicKuwahara`, `sigmaDenoise`, `wienerDenoise`, `leeDenoise` |
| Guidance and robust cleanup | `jointBilateral`, `rollingGuidance`, `chromaDenoise`, `impulseDenoise` |
| Focus and aperture | `bokehBlur`, `depthOfField`, `tiltShift`, `splitDiopter`, `depthBilateral`, `focusPeaking`, `circleOfConfusion` |

Existing Median, Bilateral, Smart Blur and other ProfessionalFilters are also
available in the recipe and are not counted again. `over` is reused, not new.

## Image, precision and time

Default dimensions, scene-linear working color and F16/F32 publication inherit
the source. Optional workingColor invokes the existing actual F32 conversion;
output is PM. Signed HDR RGB is not clipped. Spatial denoisers preserve center
coverage and PM Alpha-zero radiance, exclude missing neighboring color and use
coverage-weighted statistics. Straight Alpha-zero RGB is not associated light.
Blur/defocus filter associated RGBA and may change coverage. No RGBA8 intermediate.
F16 follows the existing owner's logical Half RNE publication/storage policy.

Iterations publish F32 internally; public output rounds to the requested format
once. Operations are not fused/reordered. Scalar numeric options use the existing
Signal evaluator with explicit FrameContext. Loop counts, levels, aperture blades
and quadrature populations are explicit integers. There is no wall-clock state,
temporal denoising or cross-frame mutable GPU history. TV dual state is cleared
on GPU for each request. Prefix reuse is limited to exact immutable image identity
inside the recipe. Random/repeated frames and failure/retry use the same contract.

`types.ts` defines options. Errors use EngineError `E_NATIVE_RESTORE_PARAMETER`
with function/path/expected/unit. Unknown fields, malformed data and illegal
counts fail explicitly. Diffusion step <=1/4, projected-dual TV step <=1/8 and
regularization >=2^-20; guided epsilon >=2^-20. Positive squared range/strength
controls use the normal-F32-safe square domain. No automatic precision reduction.
General IEEE-domain overflow/intermediate scanning follows the existing owner;
arbitrary extreme values and all parameter combinations are not qualified.

## Algorithms

NLM averages patch-similar neighbors, subtracting 2*noiseSigma² from patch MSE.
Guided RGB uses a scalar bounded signed-luma guide y/(1+abs(y)), weighted moments,
regularized linear coefficients and two separable means in typed buffers.
À-trous uses dyadic B3-spline taps with guide-range rejection. Diffusion supports
exponential/reciprocal Perona-Malik conductance. TV is vectorial projected-dual
ROF with no-flux invalid/boundary edges and explicit F32 primal/dual publications.

Kuwahara selects minimum bounded-guide variance among four quadrants. Its
anisotropic variant smooths a structure tensor, aligns an ellipse with contours
and blends eight polynomial sectors by variance. Sigma uses local adaptive
standard deviations and minimum accepted weight. Wiener models additive variance;
Lee models multiplicative variance. Joint bilateral uses an explicit color guide;
rolling guidance iterates against the original source. Chroma denoising retains
center working luma. Hampel impulse cleanup uses sorted/radix straight-color
medians and MAD with a noise floor. These are explicit local implementations,
not claims of upstream/AE parameter or bit parity.

Constant bokeh ports audited EffectCraft iris spans: integer ties away from zero,
inclusive horizontal spans, normalized direct footprint, clamp boundary. GPU row
prefix sums retain hi/lo residuals for signed HDR. Tilt shift uses deterministic
paired aperture quadrature and compensated bilinear sampling. Variable-CoC DOF
uses continuous one-pixel aperture edges, per-source normalization, near/far
coverage accumulation and near-over-far composition. It cannot infer hidden
scene layers. Split diopter interpolates focus in diopters across an authored
screen transition. Focus peaking is a technical guide-gradient overlay, not an
autofocus or aesthetic score.

## Metric depth contract

The existing core `depth` semantic requires **one** f32 component. `depthField()`
validates `[width,height,1]`, origin zero/domain equal dimensions, semantic depth,
camera space, metres, channel `z`, and metadata `{rangeM:[min,max]}`. Values are
positive camera-axis Z distances, not Euclidean ray range or encoded NDC. Zero
means missing. Non-finite/out-of-range samples are invalid. The existing owner
still verifies provenance, read/write permissions and expiry. NDC/vision/3D
producer conversion must be explicit; this module adds no depth extraction.

`circleOfConfusion()` returns a recipe-local generic f32 field with two channels
`[signed-radius,validity]`, image-local pixels, positive far / negative near.
Radius is half the thin-lens sensor blur diameter converted using full image width:
f²/(N*(1000*focus-f)) * (1-focus/z) * width/(2*sensorWidthMm).
Unknown samples produce radius0/validity0 and remain sharp; valid neighboring
foreground can still cover them. Depth bilateral skips unknown observations.
Focus must lie beyond focal length. Declared depth range bounds gather support.
Fields and GPU images are live resources, not persistent JSON or TVG ports.

The producer retains its published processImage result. Scratch fields/images
expire under the existing processor/owner rules; callers own their input depth
and image resources. Await recipes, avoid escaping their facades/fields and call
dispose. No device ownership is transferred. Cancellation before acceptance,
accepted-work completion and repeated disposal retain the existing owner policy.

## Source, scale and acceptance

Pinned EffectCraft MIT Rust iris/prefix source and exact hashes are in
`sources.json` and `vendor/`; the small required parameter preparation is adapted
without importing its rendering framework. Existing Frameweave paired arithmetic,
Gaussian, box means and raster source-over are reused. Advanced restoration math
is local; no IPOL restricted/GPL implementation is copied. Method references:
[NLM](https://www.ipol.im/pub/art/2011/bcm_nlm/),
[Guided Image Filtering](https://kaiminghe.com/eccv10/), and
[anisotropic Kuwahara](https://www.kyprianidis.com/p/tpcg2010/).

No permanent image/megapixel ceiling is added. Actual device/session storage,
int32 neighborhoods and uint32 rank/addressing limits govern admission. Large
windows have real workload cost. This implementation uses full-frame fields;
automatic tiling, global tile coordinates and iterative halo exchange are not
qualified. Guided moments, TV state, aperture prefixes and CoC neighborhoods need
their own tiling plans; do not assume arbitrary shaders can be tiled transparently.

`validate.mjs` phases: syntax (delimiter preflight only), types, unit, gpu, media,
performance, freeze. All attempts/failures share one <420s ledger, below the
implementation interval before first test. Actual Native parsing/execution is
required beyond delimiter/type checks. Independent F64 references use direct
convolution/windows, sorted medians and explicit F32 publications. Original gates
remain scaled3e-6 F32 /6e-4 Half. Media includes actual decoded PNG, exact float
EXR and fully decoded lossy SDR MP4. Synthetic flat-region MSE and nonzero defocus
change are technical checks, not photographic quality or aesthetics benchmarks.
Performance reports cold/new/repeat/random frames, cache disabled, GPU-generated
source, complete submit-to-completion time, and terminal encoding separately.
Media uses a 4mm synthetic sensor for visible 320px defocus; performance uses
the same 36mm f35/f8/focus3m camera at both 1080p/4K. No unlike-load speedup ratio.
Allocation counters are not measured physical VRAM peak. Other GPUs/OSes, full
repository, all primaries/parameter extremes, public R1/portable wiring and 4K
terminal encoding remain Main/integration qualification work.
