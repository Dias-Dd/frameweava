# Native LUT and look development

21 image functions extend the existing Native recipe processor. No device,
renderer, daemon, Node pixel fallback or alternate color-management host is added.
Source checkpoint only: Main owns public SDK exports, R1 identity, immutable
successor version, catalog and locks.

```ts
import {createNativeGradingEffects, cubeLut} from './grading/index.ts';

// Bind once in defineNativeStage(init => ...).
const effects = createNativeGradingEffects(init);
// Explicit table encoding; text comes from authored code or an already
// authorized resource. This library does not open files or fetch URLs.
const look = cubeLut(cubeText, {
  inputEncoding: 'acescct', outputEncoding: 'acescct'
});
// In renderAt(context, ...):
const result = await effects.processImage(source, async (image, fx) => {
  image = await fx.whiteBalance(image, {
    sourceWhite: [.3127, .329], targetWhite: [.34567, .3585]
  });
  image = await fx.cdl(image, {
    slope: [1.02, .98, 1.01], power: [1.05, .95, 1.02]
  });
  image = await fx.lut3D(image, look, {interpolation: 'tetrahedral'});
  return fx.highlightRolloff(image, {threshold: 1, softness: 2});
}, {context});
// dispose(): await effects.dispose()
```

Choose `lut1D` for a 1D table and `lut3D` for a 3D table. `cubeLut()` reuses the
existing `src/media/color.ts` Cube parser; `defineLut()` accepts its typed table
structure and takes an immutable copy. A table and its encoding must be explicit.
The existing parser supports one table per file, 1D sizes 2..65536 / 3D 2..129;
combined shaper+3D files and other LUT formats are not added. Separately authored
1D and 3D tables can be chained in one resident recipe. Direct typed tables are
admitted by actual storage/addressing limits and Float32 integer lattice precision.
Mutating the original array cannot change a prepared table. Forged/mutable table
objects are rejected; tables do not grant filesystem or execution permission.

Editable complete TSX: `../examples/grading-chain.tsx`; the seven-step recipe
and source are in `stage.ts::gradingScene`. Numerical fixture:
`../examples/grading-numeric.tsx`.

| Task | Functions / contract |
| --- | --- |
| Tables | `lut1D`, `lut3D`: nearest / linear; 3D also tetrahedral, red-fastest Cube ordering |
| Balance and primary grade | `cdl`, `whiteBalance`, `liftGammaGain`, `printerLights`, `contrastPivot`, `logContrast` |
| Secondary curves | `lumaCurve`, `hueVsHue`, `hueVsSaturation`, `hueVsLuminance`, `saturationVsSaturation`, `luminanceVsSaturation`, `saturationVsLuminance` |
| Look development | `colorWheels`, `splitTone`, `highlightRolloff`, `shadowRolloff`, `gamutCompress`, `bleachBypass` |

## Precise semantics

- Inputs are admitted engine GPU images. Default dimensions, scene-linear color
  and F16/F32 publication inherit the image. Optional `workingColor` invokes the
  existing actual F32 color conversion before grading; encoded/display working
  metadata is rejected by the existing Native contract. Output is premultiplied.
  There is no RGBA8 intermediate. F16 is the owner's logical Half publication,
  including its existing physical storage policy, not a claim of 8 bytes/pixel.
- RGB remains signed and HDR, without general clipping. Coverage Alpha is
  preserved. PM Alpha-zero emission is retained unchanged; straight Alpha-zero
  RGB has no associated radiance. Nonlinear grading does not invent straight
  color for missing coverage. Each public operation retains its publication;
  operations are not fused or reordered.
- LUT input/output encodings are `linear`, signed-extension `srgb`, or ACEScct.
  Encoding, lookup and decoding happen inside the one shader. Encoded table
  coordinates never masquerade as a scene-linear intermediate image. ACEScct
  decoding is extended beyond 65504 for Float32, rather than importing the
  upstream Half ceiling. These are numerical encodings in the declared working
  primaries, not a complete ACES rendering transform or display configuration.
- LUT domain defaults to **extend**: boundary cells extrapolate. `domain:'clamp'`
  explicitly clamps coordinates; it does not clip output RGB. Nearest always
  selects the nearest existing endpoint outside the table. Half-grid ties select
  the higher index. For linear input encoding the nearest decision compares
  original associated color and Alpha with cross-products, avoiding a tiny
  unassociation-division error flipping an exact tie. Trilinear/tetrahedral use
  compensated weights from typed buffers, not hardware texture filtering.
- `cdl` follows ASC slope/offset/power/saturation ordering and fixed ASC luma
  [.2126,.7152,.0722]. Default `no-clamp` bypasses power for negative pre-power
  values, matching the audited upstream behavior; it is not signed power.
  `style:'clamp'` deliberately clips each channel at the specified CDL steps.
  Inverse rejects zero slope/saturation. Inverse of a clipped transform is not
  promised to reconstruct lost values.
- `whiteBalance` performs Bradford adaptation in the actual working RGB basis;
  whites are CIE xy pairs. This is an artistic image operation, not metadata
  relabeling. `printerLights` uses RGB printer points / pointsPerStop (default12).
  `liftGammaGain`: gain * signedPower(c + lift*(1-c), 1/gamma).
  `contrastPivot`: pivot * signedPower(c/pivot, contrast).
  `logContrast` uses signed log1p(abs(c)/toe), contrast around log1p(pivot/toe),
  and its signed expm1 inverse. It supports negative RGB without log clipping.
- Curves are static, binary64 [x,y] knots, piecewise linear with endpoint segment
  extrapolation. No animation engine is replaced. Numeric scalar options accept
  existing Signals using the explicit FrameContext; authors may construct new
  curve/table inputs explicitly. Hue curves require equal-valued 0/360 degree
  endpoints. Hue offset knots have a qualified +/-36000 degree reduction range.
- Secondary curves use working-luma opponent coordinates:
  U=(B-Y)/(2(1-wB)), V=(R-Y)/(2(1-wR)), hue=atan2(V,U),
  saturation=hypot(U,V)/(1+abs(Y)). This is an explicit signed-HDR extension,
  not an HSV/AE numerical-compatibility claim. HueVsHue values are degree offsets;
  hue/luminance-vs-saturation and hue/saturation-vs-luminance values are gains;
  saturationVsSaturation maps the saturation coordinate. LumaCurve maps Y and
  preserves opponent differences. Other curves preserve the stated untouched axes.
- Color wheels are shadow/midtone/highlight RGB exposure stops with quadratic
  Bernstein weights over clamp(Y/white). Split tone adds luma-neutral color tint
  through an explicit linear transition. Rolloff maps Y using exponential
  shoulders and adds the luma delta to RGB; it preserves opponent differences,
  rather than claiming chromaticity preservation. Gamut compression contracts
  channel distance below the largest positive channel with an explicit power
  knee; all-negative RGB is retained. It is not certified ACES gamut mapping.
  Bleach bypass is an unclamped scene-linear multiply/screen look with a luma
  selector; the user controls its amount. See `types.ts` for options/defaults.

## Ownership, source and limits

The existing admitted/borrowed `init.gpu` supplies all allocations and work.
Table/curve/dummy data caches exist only inside that recipe and are released by
the existing processor. No cross-frame mutable GPU state or hidden current Stage
is used. Images returned inside the recipe are provisional; `processImage`
retains its published result under the producer's existing lifetime. Do not put
handles in JSON/TVG, retain expired frame images or arbitrarily release results.
Cancellation, recorded failure, retries and repeated dispose reuse that lifecycle.

EffectCraft WGSL table ordering/interpolation, CDL and transfer-function equations
are pinned with exact hashes and MIT license in `sources.json` and `vendor/`.
Frameweave's qualified paired arithmetic, Native color conversion and lifecycle
are reused. Artist grading equations are local. No full external color program
interpreter/configuration engine or external GPU host is copied.

No image megapixel limit is introduced. Actual device/session limits and safe
buffer/coordinate addressing govern admission. Nonlinear grades and extrapolated
LUTs can exceed representable Float32/Half output for extreme input/parameters;
general IEEE-domain overflow diagnosis follows the existing owner and is not
claimed here. Explicit clamp/rolloff is a creative choice, never an automatic
precision fallback. Full OCIO configs, 3D inverse LUTs, arbitrary-file loading,
other parser formats and display rendering transforms remain outside this API.

`validate.mjs` records all attempts in one <420s cumulative campaign, also less
than the implementation interval before first test. Phases: types, unit, gpu,
media, performance, freeze. GPU uses independent F64 equations, eight-corner
trilinear sums, barycentric tetrahedra and Gaussian-elimination white adaptation;
gates remain scaled3e-6 F32 /6e-4 Half. PNG/MP4 are SDR delivery boundaries;
Float32 EXR is separately decoded and compared exactly to GPU output. Performance
measures complete submit-to-completion requests with cache disabled; cold init,
warm/new, repeat and random frames are separate. Other GPUs/OSes, full-repo,
all working-primary combinations and Main public packaging remain separate gates.
