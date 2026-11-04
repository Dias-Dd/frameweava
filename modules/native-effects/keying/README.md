# Native keying and matte

24 concrete source APIs: 23 image operations and one typed distance field. This
module extends the existing Native recipe processor, Pixel ABI and Compute ABI.
It creates no device, renderer, frame loop or shared state. Main owns public
SDK/R1/catalog integration and a new immutable package version.

```ts
import {createNativeKeyingEffects} from './keying/index.ts';

// Bind once inside defineNativeStage(init => ...).
const effects = createNativeKeyingEffects(init);
// Within renderAt(context, inputs, props):
const result = await effects.processImage(plate, async (image, fx) => {
  image = await fx.screenKey(image);             // green by default
  image = await fx.keyCleaner(image);
  image = await fx.refineMatte(image, {radius: 3, decontaminate: .2});
  image = await fx.advancedSpillSuppressor(image); // GPU automatic channel
  image = await fx.lightWrap(image, background, {sigma: 2, amount: .2});
  return fx.over(image, background);             // foreground first
}, {context});
// dispose(): await effects.dispose()
```

Editable complete TSX: [keying-chain.tsx](../examples/keying-chain.tsx).
The image/background are existing engine GPU image references; imports,
authorization and texture ownership retain the existing Native contract.

| Task | Functions |
| --- | --- |
| Keys | `colorKey`, `colorRangeKey`, `extractKey`, `differenceMatte`, `colorDifferenceKey`, `screenKey`, `innerOuterKey`, `unmult` |
| Cleanup and composite edges | `advancedSpillSuppressor`, `keyCleaner`, `matteChoker`, `refineMatte`, `edgeDecontaminate`, `edgeExtend`, `lightWrap`, `wireRemove` |
| Coverage and geometry | `matteDistance`, `distanceFeather`, `matteOutline`, `matteBevel`, `matteGradient`, `matteMedian`, `matteThreshold`, `matteQuantize` |

`types.ts` is the options contract. Numeric leaves accept existing Signals with
the explicit recipe FrameContext. Invalid fields, ranges, shapes and enums fail
with `E_NATIVE_KEY_PARAMETER`, including function, path, expected value and unit.
Controls must be zero or finite normal Float32-representable numbers; binary64
residuals are retained in paired uniforms. Subnormal controls are rejected.

## Color, coverage and units

- Default size, scene-linear color and F16/F32 precision inherit the input.
  Multi-input colors use existing working-color conversion; image coordinate
  domains must already agree. Final images are premultiplied. Each public F16
  operation retains its Half publication; internal masks/moments use F32.
- RGB is signed, unclamped HDR. Alpha is finite coverage in [0,1]. Existing
  premultiplied Alpha-zero radiance survives color/foreground operations.
  Mask-producing operations intentionally emit black RGB. No RGBA8 intermediates.
- `colorKey` uses maximum RGB channel distance. Range modes are working linear
  RGB, working-luma YUV, and CIELAB D65 via actual working primaries, with the
  standard linear extension for negative XYZ. Lab bounds use Lab units. There
  is no hidden display-sRGB encoding or 8-bit clamp.
- Gaussian values are sigma in pixels, support ceil(3 sigma), clamped boundary.
  Guided `radius` is an integer box half-window. Its signed luminance guide is
  bounded as y/(1+abs(y)); epsilon is its variance regularizer, minimum 2^-20.
  Choke >0 erodes and <0 expands. Newly covered pixels use an alpha-weighted
  foreground estimate whose support covers the complete spatial dependency.
  This is an estimate; missing foreground colors cannot be reconstructed exactly.
- Morphology is the existing square neighborhood/fractional-radius contract.
  Median is exact coverage rank selection with clamp/transparent boundary;
  its neighborhood population must fit the existing uint32 count ABI.
- Distance is exact nearest opposite coverage site, pixel centers, half-pixel
  contour offset, inside positive. Canvas exterior is background. Empty masks
  have validity 0 and finite distance 0. `matteDistance()` returns a recipe-local
  F32 field with two components `[signed-distance, validity]`, dimensions [w,h,1],
  space `image-local`, units `pixels`. It is not a color Surface or JSON port.
- Wire removal repairs a static line/capsule with bilinear two-sided samples;
  endpoints/width/feather are pixels. It is not object-aware reconstruction.
- Contrast <1 lifts zero coverage toward .5; choose this deliberately. Hard
  refinement selects stronger default contrast, not an image segmentation model.
  Automatic spill selection measures positive PM channel excess on GPU. No CPU
  image histogram/readback or opaque trained model is introduced.

## Lifetime, determinism and budget

All work borrows the admitted `init.gpu`; no software/Web pixel fallback.
Returned recipe images and fields are provisional and cannot escape as raw
handles into TVG/JSON. `processImage` retains its published result under the
existing producer contract. Do not arbitrarily release or permanently own it.
Distance/blur identity caches exist only within that recipe; no hidden frame
history. Scratch cleanup, errors, cancellation and repeated dispose reuse the
existing processor and Native owner rules. Work accepted by that owner is not
silently replayed. No wall clock drives effects.

There is no permanent resolution or megapixel ceiling in this library. Actual
device storage/image limits, int32 neighborhood coordinates, uint32 counts and
the existing session budget determine admission. Guided/median large windows,
global spill reduction and EDT have real workload/memory costs; arbitrary
transparent tiling of these algorithms has not been qualified.

## Source and acceptance

EffectCraft MIT equations/parameter preparation are pinned in `sources.json`
with exact vendored bytes and license. Scene-linear/HDR/Alpha adaptations are
explicit there. Exact EDT and rank-selection median are local implementations;
they are independently checked against exhaustive nearest-site and sorted-window
oracles. Qualified local geometry scalar arithmetic and sampling are reused.
No EffectCraft GPU host or Rust binary is loaded.

Run `node modules/native-effects/keying/validate.mjs <phase>` with the worktree's
qualified native executable and SpiderMonkey host environment. Phases: `types`,
`unit`, `gpu`, `oracle`, `media`, `performance`, `freeze`. One cumulative campaign
ledger includes failures and enforces <420s and less validation than initial
implementation time. GPU capture alone does not qualify numeric correctness;
`oracle` verifies sealed producer hash, binary content and original 3e-6 scaled
F32 / 6e-4 scaled F16 gates. Media compares the full task to independent equations.
PNG/MP4 are SDR delivery boundaries; only float EXR proves float media retention.

These APIs do not claim full AE UI parity, automatic roto/segmentation, temporal
key cleanup, multi-frame reconstruction or performance on untested GPU vendors.
Other remaining library domains are not implied complete.
