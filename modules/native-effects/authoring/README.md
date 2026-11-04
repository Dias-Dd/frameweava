# Image-effect authoring

Import authoring helpers from `@frameweave/engine/image-effects`. Node asset
preparation uses `@frameweave/engine/image-effects/node`. The managed
`native-image-effects@0.7.0` package continues to provide its original recipe API.

```tsx
import {imageStage, compose, exposure, glow} from '@frameweave/engine/image-effects';

export const grade = imageStage(compose(exposure(0.3), glow({radius:3, intensity:0.2})));
// In the Composition:
// <Stage id="grade" factory={grade} inputs={{image:ref('source')}} inputTypes={{image:'surface'}} />
```

Use `floatImageResource('photo')` as the Stage source when the project declares a prepared image resource.

## A complete project

Open `examples/project.tsx`, or use `examples/photo.tsx` for a normal tagged-PNG
source prepared with the existing image decoder. Neither project needs a Shader,
GPU texture allocation, effect factory initialization or disposal code:

```tsx
import {Composition, Stage, Layer, Resource, ref} from '@frameweave/engine';
import {imageStage, floatImageResource, compose, exposure, glow, vignette}
  from '../index.ts';

const look = compose(exposure(.3), glow({radius: 3, intensity: .2}), vignette());
export const finished = imageStage(look, {source: floatImageResource('photo')});

export default <Composition width={160} height={90} fps={24} durationInFrames={12}>
  <Resource id="photo" src="./assets/photo.f32" kind="file"/>
  <Stage id="finish" factory={finished}/>
  <Layer source={ref('finish')}/>
</Composition>;
```

Prepare your own image **once in an ordinary Node tool**, not inside a Stage:

```ts
import {prepareImageAsset} from '../node.ts';
const asset = await prepareImageAsset('photo.png', 'assets/photo.f32');
// asset.native contains width, height, color, alpha and format.
// Declare assets/photo.f32 as a Resource; use its ID in floatImageResource.
```

Preparation reuses the existing ICC/EXR/Surface decoder, color transform and
finite/Alpha validation. It does not execute image effects on CPU. The result is
row-major RGBA Float32 little-endian, 16 bytes/pixel, with a returned content hash
and source provenance. Existing output is rejected with `E_IMAGE_ASSET_EXISTS`;
the helper does not overwrite a creator's file. ICC source is still bounded by
the existing decoder's capabilities. Untagged SDR defaults explicitly to sRGB;
set `missingProfile: 'error'` for strict admission. Floating HDR uses EXR or the
existing Surface v2 path, not the integer ICC decoder.

If source dimensions differ from the Stage, pass `asset.native` to
`floatImageResource('photo', asset.native)` and include `resize()`. The resampler
then defaults its output width/height to the Stage dimensions. See
`examples/resized.tsx`. Resampling is GPU and retains the original method,
antialias, coverage, boundary and adjustable budget controls. No new image-size
ceiling is introduced; existing addressing/device/decoder budgets still apply.

## Composition and full controls

The effect constructors are ordinary functions returning ordinary async
image functions. `compose` preserves call order and every original logical
F16/F32 publication. It does not fuse, reorder, read back or encode intermediates.

- Blur: `blur`, `boxBlur`, `directionalBlur`, `bilateralBlur`, `unsharpMask`,
  `sharpen`; `resize` and `transform` reuse the professional geometry/builtin APIs.
- Color: `exposure`, `levels`, `curves`, `channelMix`, `colorBalance`,
  `brightnessContrast`, `hueSaturation`, `vibrance`, `tint`, `blackAndWhite`,
  `whiteBalance`, `colorWheels`, `cdl`, `liftGammaGain`, `lut1D`, `lut3D`,
  `autoLevels`, `autoContrast`, `autoColor`, `invert`.
- Optical: `glow`, `bloom` (the original `bloomPyramid`), `lensFlare`, `lightRays`,
  `halation`, `softFocus`, `chromaticAberration`, `vignette`.
- Matte/compositing: `chromaKey`, `lumaKey`, `despill`, `erodeImage`,
  `dilateImage`, `feather`, `dropShadow`, `over`, `applyMatte`.
- Stylization: `filmGrain`, `pixelate`, `posterize`, `findEdges`, `reframe`.

Options are derived from the **actual original method types**, including format,
working color where supported, Alpha, sampling and professional parameters.
Defaults remain the original defaults: for example Gaussian sigma 1 pixel,
Glow sigma 8 pixels/threshold 1/intensity 1, exposure 0 stops. `blur(2)` and
`exposure(.5)` are optional shorthand; full option objects remain available.
`blur`/Glow radius is Gaussian sigma in physical pixels; exposure is stops,
transform rotation is degrees and scale is a ratio. Other units retain the
original domain types/JSDoc; helpers do not reinterpret them.

Signals, nested option leaves, keyframes and expressions use the original
animation evaluator and the supplied Stage-local `FrameContext`. No wall-clock
time, implicit random source or new animation system is introduced. See
`examples/look.ts`. A manual `createImageTools(init).apply(...)` call must pass
`{context}` when its parameters need animation/time. Static effects may omit it.

Use the rest of the library without another wrapper or a GPU setup ceremony:

```ts
import {withEffects, compose, exposure} from '../index.ts';
import {createNativeRestorationEffects} from '../../restoration/index.ts';
const clean = withEffects(createNativeRestorationEffects,
  (image, fx) => fx.nonLocalMeans(image, {noiseSigma: .02, patchRadius: 1}));
const look = compose(clean, exposure(.2));
```

Custom async callbacks, loops and conditionals work in a composition. Typed
`imageStage<I,P>` callbacks receive `inputs`, `props` and the original context.
`ImageFrame.process`/`generate` expose the complete original typed factories.
`ImageFrame.init` preserves the original low-level Native API for advanced use.
`prepare(init)` runs once for explicit custom Shader/WASM/model/geometry setup;
its returned `dispose()` handles source-owned services. No constructor grants
WASM, filesystem, network or process rights. Author-supplied models, fonts,
paths and multi-frame observations keep their existing explicit contracts.

An imperative caller can initialize `const tools = createImageTools(init)` once,
use `tools.apply(inputs.image, look, {context})` from its ordinary render function,
and call `tools.dispose()` in its existing Stage disposal. JSX is not required by
the library. Pass stable factory references to `withEffects`/`process`; creating
new anonymous factories on every frame intentionally creates new identities.
Similarly named original namespaces remain separate: convenience `exposure`
uses the raster stop/working-color contract; professional offset/gamma controls
remain available through the original grading/resident factory via `withEffects`.
No original method or option is removed or reinterpreted.

For an existing source Stage, omit `source`: `imageStage(look)` consumes
`inputs.image`. `examples/connected.tsx` uses the unchanged surface PortRef/DAG.
No new JSX component or graph language is required.

## Lifecycle and diagnostics

Each Stage lazily initializes only its requested effect factories and reuses
them. The existing owner caches compiled pipelines. Immutable float source data
and its input pipeline prepare once; image outputs are frame-owned. Original
curve/LUT scratch buffers retain their existing frame contracts; this helper
does not claim persistent GPU tables where the original factory lacks them.
Resource bytes are a verified build/session snapshot. Rebuild for changed assets;
the helper does not silently replace bytes or refresh a lock in a running session.

Recipes keep their original scratch leases. Borrowed inputs and the admitted
GPU device are not disposed by the tools. Source-owned resources and factories
close automatically in `imageStage`; close is idempotent and waits for pending
recording. An `ImageFrame` expires after its invocation. Await async operations;
concurrent tool calls reject with `E_IMAGE_AUTHORING_BUSY`. Stats describe
**recording**, not GPU completion. Cancellation after acceptance follows the
existing owner contract, with no implicit replay.

`compose` retains original `EngineError.code`, frame/hint/details and adds the
effect name/index. Missing input reports `E_IMAGE_SOURCE_MISSING` with an actual
PortRef/source suggestion. Unknown options still reach the original strict
validators. GPU handles remain Stage-local and must not enter persistent JSON.
Node/renderer cancellation uses the existing AbortSignal path. A previous frozen
SpiderMonkey host lacked the constructor; that failure is retained. This library
does not inject browser globals: caller-side renderer cancellation is qualified,
and constructing AbortSignal inside the current JS host is not newly qualified.

## Existing transient-image boundary

`imageResource` retains the current `icc-sdr`/`surface-v2` transient image bridge.
On the original pre-sync `266d2648` baseline, the full color chain produced identical
non-finite output in both original and convenient versions after requests
`[0,6,11,3,0]`. The failure and raw positions are retained. It is not declared
repaired or attributed to a specific Core fix, and its behavior is not inferred
for the synchronized `50a323bb` baseline. The ordinary examples recommend
`prepareImageAsset` + `floatImageResource`, which use the already verified
immutable-init buffer path. The latter passes the same sequence in F32/F16.
`transient*.tsx`, `manual.tsx` and `captured.tsx` are compatibility/reproduction
fixtures, not the recommended project entry. Earlier evidence calls the former
`transient.tsx` file `project.tsx`; its original source is preserved by the rename.

## Verification

Run `node modules/native-effects/authoring/validate.mjs PHASE` from this worktree.
The cumulative ledger includes every failed attempt and enforces <420 seconds;
it is not a reset of the paused spherical campaign. Raw receipts/results and
actual PNG/EXR/MP4 are frozen in `docs/native-image-authoring-evidence`.

Current evidence distinguishes exact adapter equivalence to the original
factories from independent algorithm qualification. It does not certify all AE
controls, other devices/OSes, private spherical WIP, public installation or Flat
portability. Those capabilities are not inferred from function names/counts.

## Advanced effects and auxiliary assets

`examples/advanced.tsx` is an editable complete source-backed project: animated
`twirl` → `guidedDenoise` → calibrated `spatialDeblur` → `lensDirt` →
`foregroundGrade`. It reuses the same Native owner, original algorithms and exact
option types. It is not a new installed R1 package entry.

```ts
const dirt = floatImageResource('dirt');
const look = compose(
  twirl({angle: 12, boundary: 'clamp'}),
  guidedDenoise({radius: 1}),
  lensDirt(dirt, {threshold: 1, intensity: .04}),
);
export const finished = imageStage(look, {source: floatImageResource('photo')});
```

Declare both resource IDs with `Resource`. Their dimensions/color/Alpha remain
explicit as in the image preparation example. Constructors collect auxiliary
source declarations; `compose` carries them to `imageStage`. Each distinct
source function is prepared once per Stage and disposed once, including an init
failure. Reusing a descriptor in multiple effects does not reinitialize it.
Primary and auxiliary `frame.input(source)` uses share one result within an
invocation, including an enriched Stage frame with inputs/props. Repeated access
to the same declaration does not re-evaluate its generator or release its input.
No runtime filesystem discovery or new permission grant occurs.

For an ordinary custom function, use `withImageSources(effect, source1, source2)`
and call `await frame.input(source1)` inside it. The lower-level
`createImageTools` entry instead calls `await tools.prepareSources([...])` during
Stage initialization, before the first `apply`. A prepared source first introduced
during a frame fails with `E_IMAGE_SOURCE_INITIALIZATION`, never a hidden upload
or import from an arbitrary path. Inherited Signal evaluation and frame-local
randomness are unchanged.

Advanced named families retain the original professional options:

- Geometry: homography/corner pin, mesh/Bezier warp, twirl, bulge, wave/ripple,
  mirror, offset, polar, turbulent displacement, optical compensation, magnify,
  bend/lens warp, tiling, lens distortion, liquify, kaleidoscope and cylinder.
- Spatial restoration: non-local means, guided/atrous, anisotropic diffusion,
  TV, Kuwahara/tensor Kuwahara, sigma/Wiener/Lee, joint/rolling/chroma/impulse
  denoise, bokeh, tilt shift and focus peaking. `jointBilateral` accepts an image
  input for its guide. A depth image is not silently treated as camera metres.
- Optics: anamorphic bloom, streak/diffraction glare, ghosts/halo/dirt, occluded
  rays, axial/spectral aberration, diffusion, Airy, light leak, physical vignette
  and veiling glare. Original dimensions, degrees, threshold and HDR meanings
  remain with the domain API.
- Keying/Matte: color/range/extract/difference/screen keys, spill suppression,
  unmult, cleaner/choker/refinement/decontamination/extension, light wrap,
  distance feather/outline/bevel/gradient/median/threshold/quantization,
  wire removal and professional screen/matte/foreground controls.

`keyAdvanced({inside, outside, background, ...controls})` accepts declarative
image sources in the three image fields. `hairMatte(foreground, background)`
uses explicit source estimates. `rotoMatte(strokes, options)` wraps the existing
GPU stroke trimap and random-walker solve in one recipe; points/radii are physical
pixels and foreground/background labels are required. It is not neural roto.

`convolveSpatialPsf(grid, options)` and `spatialDeblur(grid, options)` accept the
strict existing `frameweave.psf-grid` v1 calibration directly. Preparation,
convolution/solve, and diagnostic-buffer cleanup stay inside the same original
recipe, so no expired field escapes to another operation. Calibration weights
are currently prepared per recipe, not persistent GPU profile caching. Full
diagnostic buffers remain available through `withEffects` and the original
factory. Unknown/invalid professional options retain their original error codes;
`compose` adds operation name/index without removing diagnostic detail.

These additions do not complete all usability work. Service/model preparation,
remaining effect families, and Main's formal managed pure-entry and
installed/portable release qualification remain separate work. No implicit
upstream Stage re-evaluation, CPU pixel fallback or SDR downgrade is introduced.


## Depth, explicit observations and Track Reader

`examples/data.tsx` shows a complete declared-frame denoise → animated metric
DOF chain. `examples/tracked.tsx` applies magnification with the existing real MVP
track data. They remain source examples, not installed package/subpath claims.

```ts
const depth = depthMap(importedDepthValues, {width: 1920, height: 1080});
const look = depthOfField(depth, {focusDistanceM: 3, fStop: 2.8});
export const finished = imageStage(look, {source: floatImageResource('photo')});
```

`depthMap` accepts a JSON number array or Float32Array, snapshots it and validates
all values before GPU work. Units are camera-space z **metres**, x-contiguous
row-major top-left, exactly zero means missing. Positive samples must be normal
finite Float32. Width/height default to the Stage and must match the exact count.
`rangeM` normally derives from stored non-missing samples; if supplied, endpoints
are converted to the same Float32 domain and must enclose the data. All-missing
data needs an explicit admitted positive range. There is no implicit luminance,
NDC/clip-depth or normalized-image interpretation. It is a scalar data field,
without RGB/Alpha conversion. `depthOfField`, `splitDiopter` and `depthBilateral`
accept the declaration or an original borrowed `NativeDepthField`.

The depth declaration is prepared once at Stage init and released by the Stage.
This helper does not call CPU upload/write/readback per frame; physical seed
residency/rebuilds remain the existing owner's responsibility. This entry does not yet decode a
binary depth Resource: large external depth files need explicit Node conversion
or the original typed-field path. Existing device/address/session budgets apply;
no new permanent image-size ceiling is imposed.

```ts
const samples = imageSequence([
  {time: frameSeconds(0, {num: 24, den: 1}), image: floatImageResource('frame0')},
  {time: frameSeconds(1, {num: 24, den: 1}), observed: false},
  {time: frameSeconds(2, {num: 24, den: 1}), image: floatImageResource('frame2')},
]);
const clean = temporalDenoise(samples, {time: {num: 0, den: 1}});
```

Observations are explicit source images, not implicit re-evaluation of another
Stage. Exact timestamps are sorted and duplicates rejected. Missing observations
remain in place and retain the original segmentation/gap behavior. Denoising
accepts a full sequence and excludes an *observed* entry at the current input's
time, because the current image is already supplied. If that exact time is
explicitly missing, it fails rather than discarding the gap. Flow controls and
optional precomputed current-to-neighbour motion retain original typed options.
The caller is responsible for the input image matching the selected time.

`time` defaults to exact Stage-local frame seconds. `imageTime(frame, 'project')`
selects project time explicitly; a `time: frame => ...` callback supplies an
explicit source mapping. `frameSeconds(integerOrRationalFrame, fps)` multiplies
and reduces with integer arithmetic, avoiding long-sequence endpoint drift.
`FrameContext` contains only a floating fractional Stage frame, without the exact
Stage rate, so fractional-rate Stages require an explicit rational `time` option.
The helper reports `E_IMAGE_TIME_CONTEXT` instead of guessing that rational.
It does not modify the existing time or animation evaluator.

`synthesizeTemporalGrain(samples, profileOptions, synthesisOptions)` and
`temporalSpectrumView(samples, profileOptions, options)` prepare and consume the
original profile within one recipe. `matchTemporalGrain(source, reference,
options)` combines the original denoise/profile/synthesis; `stabilizeSequencePath`
preserves the original flow, model, path, crop and edge controls. The explicit
`samplePeriod` belongs to the source observations and is not inferred from output
FPS. Profile/analysis buffers are currently recipe-local, not persistent cached
analysis assets. Image sources initialize once, but the current adapter resolves
all supplied observed images before the original domain window selection;
callers should provide the intended bounded source window.

```ts
const face = trackPoint(trackJson, {sourceStartSeconds: 0, rate: 1});
const look: ImageEffect = (image, frame) => {
  const p = face(frame);
  return p.visible
    ? magnify({center: [p.x, p.y], radius: 25})(image, frame)
    : image;
};
```

`trackPoint` validates the unchanged `analysis.track/1` format and reuses its
standard reader/queryStageTrack. Default source start is the analysis start,
rate is 1, output coordinates are Stage physical pixels; missing observations
return `visible:false` with the original reason. It runs no model, creates no
keyframes and does not interpolate across occlusion. The author explicitly
chooses what to do when no observation is visible.

Custom preparation uses `ImageAsset<T>` plus `withImageAssets(effect, asset)` and
`await frame.asset(asset)`. `imageStage` prepares each declaration identity once,
propagates it through composition, and cleans up success/init-failure/close.
`createImageTools` users instead call `await tools.prepareAssets([...])` during
Stage initialization. The generic cache erases only its internal value type;
depth and domain consumers retain their strict business validators. These are
Stage-local values, never serialized into TVG or published as native handles.
A declaration grants no service/IO privilege and does not bypass the admitted
host, module trust, WASM authorization or ownership rules.


## Procedural sources, compositing and the remaining image families

`examples/procedural.tsx` is a resource-free editable project: two procedural
sources of the same family, source reuse, screen compositing, glow, async-prepared
cross blur and vignette. It needs no authored Shader, GPUTexture, device or
pipeline, and no CPU image fallback. Stage size, seed and FrameContext reach the
original generators. Defaults stay with the existing algorithms.

```ts
const clouds = fractalNoise({scale: [60, 60], seed: 37});
const detail = fractalNoise({scale: [25, 40], seed: 91});
export const finished = imageStage(compose(
  screen(detail, {opacity: .25}),
  glow({radius: 2, intensity: .12}),
), {source: clouds});
```

Twenty named generators return `ImageSource`: fractal/turbulent/ridged/curl/domain
warp/Gabor/cellular/Voronoi/crackle, marble/wood/granite/clouds/caustics,
bricks/hexagon/Truchet/weave and Julia/Mandelbrot. This is procedural texture
caustics, not a new simulation of input water geometry. Source options retain
size, scale/offset pixels, degrees, evolution Signal, seed, signed HDR colors,
opacity and F16/F32 controls. Source declarations prepare once; distinct sources
have independent result leases while borrowing the same Stage GPU owner. A source
used as both primary and auxiliary is evaluated once in that invocation. Build
declarations before the first frame; do not allocate new source identities in a
render callback and expect them to initialize implicitly.

`more-effects.ts` adds the original mosaic/crystal/glass/pointillist/halftone/
hatching/sketch/cartoon/oil/watercolor/brush/relief/palette functions, closure
warps/transitions/masks, remaining grading curves/rolloffs, raster channel/matte
operations, inner shadow, procedural displacement and cinematic glow. Required
author data stays required: palette colors, source/destination control points,
paint seed, beam endpoints and curves are not guessed. `glassRelief` and
`blobbylize` accept explicit height-image sources. `displaceWithMap` retains the
required `encoding:'rg-offset-px'`: RG are offsets in physical pixels, not
normalized color. Its map must be an opaque float linear source in the exact
working encoding; a normal premultiplied photo cannot be silently used as that
utility map. For prepared matching data use `floatImageResource(id, {alpha:
'opaque', ...metadata})`. Do not color-convert the offset numbers.

Named blends take a foreground source and composite it over the current backdrop:
`softLight`, dodge/burn/vivid/hard mix, hue/saturation/color/luminosity,
lighter/darker color, divide/negation/phoenix, Porter-Duff variants, dissolve,
linear dodge, darken/lighten/difference/exclusion/overlay/hard light/linear burn/
subtract/linear light/pin light, screen/multiply/add. Each forwards the original
Alpha, signed RGB, opacity, epsilon and logical publication semantics.
`crossfade` instead treats the current image as the first image and its argument
as the second. No blend is silently reordered or converted to RGBA8.

`stereo(right, options)` uses the current image as the left eye. `scribble(masks,
options)`, `pathMatte(path, options)` and `pathStroke(path, options)` consume the
existing strict PathData contract and keep its coordinates, IDs, fill/transform,
unit and animation rules. They do not create a competing path language. Path
planning follows the existing domain implementation; no new persistent geometry
cache is claimed by this adapter.

## LUT files and prepared color processors

Use the separate Node entry once to read a `.cube` file:

```ts
import {prepareCubeLut} from '../node.ts';
const asset = await prepareCubeLut('look.cube', 'assets/look.json', {
  inputEncoding: 'linear', outputEncoding: 'linear',
}); // output/source SHA-256, no overwrite; adjustable maxBytes
```

In the Stage source, import that JSON and call
`lut3D(lutDefinition(lookJson), options)` (or `lut1D` for a 1D table).
`lutDefinition` delegates full validation/copying to the ONE original `defineLut`
implementation, retaining its validation identity. It does not infer encoding or
refresh a plugin lock. `prepareCubeLut` has a 16 MiB default input budget which the
caller can change; it is not a permanent LUT capacity limit. The existing LUT
address/device budgets still apply. File access remains explicit Node work,
absent from the Stage dependency graph.

Prepared OCIO JSON is used as
`ocioLookTransform(ocioDefinition(json), {uniforms: ...})`; color-space and file
transforms have matching named helpers. The existing v1/v2 validator checks the
definition shape and the original Stage initializer verifies WGSL/LUT/uniform
seals before use. Eligibility is not trust or proof of execution. No shader
compiler/process/network/file lookup runs during a frame. The existing explicit
Node `prepareOcio` entry is re-exported from `node.ts`; its project confinement,
reviewed executable paths and preparation requirements are unchanged. This batch
does not requalify that compiler/toolchain or claim they are installed elsewhere.
An OCIO display terminal returns display-referred data, so it remains the original
explicit typed terminal through `withPreparedEffects`, not a scene-linear image
operator or an implicit metadata relabel.

Other async factories can use `prepareImageEffects(init => existingFactory(init))`
and `withPreparedEffects(asset, recipe)`. Each Stage owns its prepared processor,
initializes once, propagates context/cancellation and disposes once. Prepared
operations use the same invocation tracking as ordinary recipes; returning while
one is unawaited is rejected. Cancellation during async initialization disposes a
completed processor. This helper grants no GPU/model/WASM/IO privilege and does
not create another host. Normal named color constructors hide that preparation.


## Advanced data inputs, estimation and paint

`examples/fields.tsx` is an editable resource-free shot: ordinary authored brush
points with animated stroke end, static pixel-vector blur, shared async cross
blur and a mono waveform overlay. All data is prepared through the original
Stage init and all pixel algorithms remain the original Native GPU ones.

```ts
const vectors = vectorField([.5, -.25, .5, -.25], {width: 2, height: 1});
const labels = labelMap([0xf1234567, 2], {width: 2, height: 1});
const levels = spectrumData([.2, .7, .4, 1.1]);
const samples = waveformData([-1.5, .3, 2.2, -.2]);
// Use a field matching the input's physical dimensions.
const look = compose(vectorBlur(vectors), waveformOverlay(samples));
```

- `vectorField`: row-major interleaved dx,dy in physical **pixels**, without
  implicit FPS/duration scaling. `vectorBlur` retains its dimensionless scale and
  samples controls. This is displacement for the caller's chosen sample interval,
  not automatically pixels per second or video-frame velocity.
- `motionField`: row-major dx,dy,confidence, the existing `native-motion-field`
  contract, **pixels per explicit sample pair**, current centres → reference
  centres. Confidence is [0,1]. It works with `warpByFlow`, `motionVisualize`,
  `matteVectorBlur` and explicit-input `temporalMatte` without pretending the
  three-component field is the two-component vector-blur format.
- `labelMap`: exact uint32 object IDs, including the full high-bit range. It never
  passes IDs through Float32. `objectMatte(labels, {ids:[...]})` still requires
  explicit selected IDs and matches the source pixel grid.
- `spectrumData`: one-dimensional nonnegative **linear magnitude** values,
  consumed by `spectrumBars`. It is not dB, complex FFT data or an inferred Hz
  axis. `waveformData` is explicit mono **linear amplitude** PCM-like samples for
  `waveformTrace`. Signed samples above 0 dBFS are retained. No audio decoding,
  channel selection, audio Stage/output or analysis task is implied.

The arrays/Float32Array/Uint32Array inputs are detached and checked before GPU
preparation. Image-grid dimensions default to the Stage; exact count, component
order and matching physical image dimensions are required. All fields have full
origin-zero domains and no RGB/Alpha interpretation. Each static declaration
initializes once per Stage and is released once; the helper performs no per-frame
CPU data writes/readbacks. Physical seed residency/rebuilds remain the existing
owner's responsibility. Data fields are f32/u32, not image F16/F32 formats.
The default **256 MiB input-copy budget** is adjustable with `maxBytes`; it does
not establish a permanent capacity limit. Native addressing/device/session
budgets apply independently.

`asPixelVectors`, `asLabelMap`, `asSpectrum`, `asWaveform` admit original borrowed
GPU buffers after strict descriptor checks and return semantic TypeScript brands.
They neither copy buffers nor grant ownership. They do not read GPU contents to
prove value bounds; the producing module remains responsible for its numeric
contract. The original consumer still rejects foreign/expired handles. New
static data constructors also validate every supplied value. These brands and
assets are Stage-local types, not another TVG/Graphics/file/port schema; native
buffer handles cannot be serialized into persistent TVG JSON.

Pairwise estimation no longer needs manual temporary field handling:
`stabilize(reference, options)`, `repairRollingShutter(reference, options)`,
`blindDeblur(options)`, `cameraShakeDeblur(explicitNeighbours, options)`,
`spectralMatchGrain(reference, options)`, `autoColorStabilize(reference, options)`
and `adaptiveDetailUpscale(options)` expose the original complete controls.
Missing upscale dimensions default to the Stage. Neighbours are explicit supplied
images; no timeline lookup, automatic upstream Stage evaluation or implicit
interpolation across missing observations is added.

`flowWarp(reference, {flow, warp})` computes current→reference flow, then samples
that reference in the current domain, defaulting output precision/working color
to the current image. `opticalFlowView(reference, {flow, view})` visualizes the
original estimated field. `synthesizeGrain(reference, profileOptions,
synthesisOptions)` and `grainSpectrumView(reference, profileOptions, viewOptions)`
keep profile creation and consumption in one original recipe. Scratch fields
never escape after cleanup; no persistent profile/analysis cache is claimed.

Painting uses the original stable stroke/point IDs, Signal leaves, pressure,
spacing, geometry, color, deterministic time/seed and Alpha controls. Named
entries include paint/airbrush/bristle/dry/scatter/smudge/wet mix/erase/dodge-burn,
clone and heal. Supported stencil fields accept ordinary `ImageInput` assets and
prepare them with the Stage; clone/heal references use the same mechanism.
The original sequential **smudge/wet mix algorithms reject stencils**; the new
signatures omit that option and diagnose it at construction if supplied from
JavaScript. Compose an explicit source/matte first. The original factory API and
restriction are unchanged.

`paintRelief(stroke, {height, relief})` internally prepares/uses the typed brush
height in one recipe. `contourStroke({trace, stroke})` internally traces and
renders the contours in one recipe. `autoScribble(mask, options)` accepts a
prepared image input. Original low-level factories remain available through
`withEffects` for custom field/diagnostic work. None of these functions claims
neural segmentation/model availability or changes inference/WASM permissions.


`spectrumBars` and `waveformTrace` retain the original generator semantics: the
current image is a dimension/color/precision template, not an automatic backdrop.
Use `spectrumOverlay(field, options, overOptions)` or `waveformOverlay(field,
options, overOptions)` to composite over the current image. Generation and over
stay in one original recipe so both images remain live until consumed. No clone,
CPU readback, reordering or skipped F16 publication is introduced. The separate
parameter groups retain all generator and original source-over controls. This
avoids silently discarding an earlier painted/composited backdrop.


## Optional Stage wiring

`imageStage` returns an existing Native Stage factory and manages the lifetime of
one complete image recipe. It is optional. Effects do not require a separate
Stage per call and can be used in your ordinary Stage render function:

```ts
import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {createImageTools, compose, blur, glow} from '../index.ts';
const look = compose(blur(2), glow({intensity: .2}));
export const finished = defineNativeStage(async init => {
  const tools = createImageTools(init);
  // This recipe needs no external sources or async assets. For one that does,
  // prepare look.sources and look.assets once here, before the first frame.
  return {
    renderAt: (context, inputs) => tools.apply(inputs.image, look, {context}),
    dispose: () => tools.dispose(),
  };
});
```

## Local neural model effects

`rotoModel(bundle)` is a pure declaration of the original pinned SlimSAM model
pair. It does not download, install, trust or execute a model. Reuse one declaration
for `segmentRoto`, `refinedRoto`, `rotoEdgeOverlay` and `propagateRoto` so the Stage
tools prepare one original encoder/decoder pair and release it at Stage disposal.
The existing owner still admits models, their exact hashes and the reviewed
runtime; unsupported hardware/providers fail rather than running pixel inference
on CPU. This checkpoint targets the existing DirectML F32 profile.

```ts
import bundle from './assets/slimsam-bundle.json';
import {rotoModel, refinedRoto, compose, exposure} from '../index.ts';
const model = rotoModel(bundle);
const cutout = compose(exposure(.3), refinedRoto(model, [
  {id: 'subject-point', position: [340, 250], label: 'foreground'},
], {segment: {softness: .1}, refine: {radius: 2, feather: .5}}));
// Use cutout in an existing Stage via createImageTools, or imageStage(cutout).
```

Prompt positions are physical pixels and use the existing Signal leaves and
FrameContext. The default result ID is `subject`, local to this stateless recipe;
all original segmentation, precision, color, missing-observation and edge controls
remain available. Refine/overlay consume the original temporary mask in the same
recipe; no GPU mask handle is serialized or retained across recipes.
`propagateRoto(model, reference, prompts, {flow})` requires an explicit reference;
optional flow is the original current-to-reference dx/dy/confidence field or the
typed `motionField` declaration. Omitting it invokes the original pair-flow
algorithm. No hidden history or automatic upstream temporal sampling is added.

In an ordinary Node setup tool, `prepareRotoAssets({bundle, encoder, decoder},
'assets/model')` verifies all descriptor hashes/lengths before creating a fresh
output directory. Existing output is rejected. Its returned resource IDs match
the bundle and must be declared as file Resources. The adjustable
`maxModelBytes` is a preparation budget, not an engine/model capacity limit.
Copying validates bytes, not ONNX graph eligibility or runtime execution. It does
not change locks, permissions, runtime selection or trust. The Node-only entry
is `node.ts`; no filesystem helper enters a Stage.

`examples/neural.tsx` is the editable optional-wrapper scene;
`neural-stage.ts`/`examples/neural-numeric.tsx` show existing-Stage integration.
`prepare-neural-example.ts` uses already-reviewed local model data and an existing
private QA photo, with no download. Those binaries and the photo are not shipped
by this source candidate. Original model provenance/Apache-2.0 source revision is
retained in `../roto-authoring/onnx-source.json`; the tracked descriptor fixes the
exact derived model identities. Original preprocessing normalizes an SDR model
input; the resulting mask applies to the original signed HDR/Alpha image. No
claim of a trained HDR segmentation model is made.

Current source checkpoint evidence: six unit checks, scoped TypeScript checking,
ten exact original-entry GPU comparisons over F16/F32, random/repeated frames,
614x410 PNG/Float32 EXR and independently decoded three-frame H264. The clip uses
the existing public native service with explicit `maxConcurrency: 1`. Default
multi-slot MP4 encountered a Windows ONNX lease cleanup `EBUSY`; that failure is
retained and reported to Main. It is not repaired or qualified by these helpers.
Only NVIDIA RTX5070 Laptop/Vulkan + reviewed DirectML inference is verified here;
formal package/public bindings, installation and portable qualification remain
Main-owned. Reproduction phases (fresh example preparation required) are:
`node modules/native-effects/authoring/validate-neural.mjs <phase>` with
`prepare`, `types`, `unit`, `gpu`, `media`, then `clip`/`clipPixels` for the explicit
single-slot route. No global library, runtime trust or lock is modified.


## Video sources and multi-frame effects

```ts
import {videoResource, videoSequence, temporalDenoise, compose, glow}
  from '../index.ts';
const clip = videoResource('clip');
const samples = videoSequence('clip', [
  {time: {num: 0, den: 1}, position: {frame: 0}},
  {time: {num: 1, den: 24}, position: {frame: 1}},
  {time: {num: 5, den: 48}, observed: false},
  {time: {num: 3, den: 24}, position: {frame: 2}},
]);
const look = compose(temporalDenoise(samples), glow({intensity: .1}));
// Use clip as your existing tools.apply source, or imageStage(look, {source: clip}).
// Declare <Resource id="clip" src="./clip.mp4" kind="media"/> in the project.
```

`videoResource` defaults to exact Stage-local seconds using the existing time
helpers. The existing decoder selects presentation timestamps, including VFR;
source frame 5 is not assumed to mean 5/StageFPS seconds. Set
`position: {frame: 5}` for source display-frame order, `{num: 5, den: 24}` for
source seconds, or a normal `frame => position` callback for explicit mapping.
A fractional Stage frame requires an explicit rational position callback;
no guessed accumulated float clock is introduced. Boundary defaults to `error`;
`clamp`/`loop` reuse the decoder's existing behavior.

Observation timestamps use the original `imageSequence`/temporal-effect clock.
Each optional `position` separately selects a source frame or time; omitted
position uses that observation's exact seconds. Samples sort on observation time,
duplicate times fail, and missing samples neither decode nor invent images.
This is declared-media sampling, not automatic reevaluation of another Stage.

The current helper defaults to the existing explicit `decoder: 'cpu'` FFmpeg
media-input route. Pixel effects still execute on Native GPU; decoded input is
not a CPU pixel-effect fallback. `decoder: 'hardware'` forwards the original
admitted hardware profile and fails when unavailable; this checkpoint makes no
new hardware-decoding qualification or automatic fallback claim. Decoder caches,
source seals, file access, subprocess lifecycle and cancellation stay Host-owned.
`cacheBytes` remains adjustable. No decoder or new resource manager is created
by the helper itself.

Default source interpretation is Rec709/display/100-nit reference white with
metadata validation, and output is opaque scene-linear Rec709/F32 at Stage size.
Unknown/conflicting source tags retain the original diagnostics. Supply an
explicit original interpretation for PQ/HLG or other supported metadata; no
silent override or claim of alpha-video support is added. F16, output color,
dimensions, decoder policy and cache budget remain configurable. The original
CPU input decoder's size conversion is bilinear; for professional resizing,
import at known source dimensions and compose the existing GPU `resize()`.
See editable `examples/video.tsx` and `video-stage.ts` (existing-Stage integration).

This source checkpoint qualified five unit checks, scoped TypeScript checking,
30 exact F16/F32 original-entry GPU comparisons, VFR timestamp versus display-frame
selection, random/repeated requests, PNG, exact Float32 EXR and a three-frame
independently decoded/default-batch MP4 with a lossy pixel-error gate. Source
fixture is tagged Rec709 SDR; output headroom and negative RGB are checked.
PQ/HLG/other codecs and hardware decoding are not requalified here. Raw commands,
PTS, input, hashes and outputs are in native-image-video-authoring-evidence.
Reproduce with `node modules/native-effects/authoring/validate-video.mjs <phase>`:
`prepare`, `types`, `unit`, `gpu`, `media`, `pixels` on a fresh example directory.
The validator records the explicitly selected system FFprobe and uses this
worktree's existing FFmpeg, native-bin and local FRAMEWEAVE_HOME.


## Video Roto with explicit observations

```ts
import {videoRotoModel, trackVideoRoto, imageResource, compose, exposure}
  from '../index.ts';
import bundle from './assets/sam2-bundle.json';
const model = videoRotoModel(bundle);
const frames = [imageResource('frame0'), undefined, imageResource('frame2')];
const cutout = compose(trackVideoRoto(model, frames, {
  frame: f => f.context!.frame, // Explicit source-frame mapping, not guessed FPS.
  seedMask: imageResource('authored-mask'),
  softness: .15,
}), exposure(.3));
```

`videoRotoModel` prepares one original vision/seed/tracking declaration set per
Stage asset identity. It validates the pinned original bundle, never downloads
weights, installs a runtime or grants trust. `prepareVideoRotoAssets` in the
Node-only entry verifies and copies three explicitly supplied local model files,
then writes the validated bundle. All files are sealed before output creation
and checked again during streamed copy. Partial files created by the call are
cleaned on failure; existing output is rejected. Its adjustable `maxModelBytes`
is a per-file preparation budget (default512MiB), not a video-duration/engine
capacity limit. Core still validates actual ONNX graphs and exact Resource seals.

`trackVideoRoto` returns an ordinary image effect. Source-frame mapping and seed
Mask are explicit; seedFrame defaults to0, ID to `subject`, and source length is
inferred from a dense frame array. Use explicit `undefined` for a missing frame;
sparse arrays fail. For larger or generated sources, pass
`{totalFrames, read: async (index, frame) => imageOrSource, sources: [...]}`.
It is an ordinary JS reader, not a graph language. Declare any source requiring
initialization in `sources`; use the existing `withImageAssets` for custom assets.
Reader results are resolved through the same Frame input cache and owner guards.
The current recipe input is the current source frame, as in the original API;
prior samples come from the reader. Keep their intended processing/color mapping
consistent. No hidden upstream Stage reevaluation is added.

The original stateless replay, missing-observation behavior, model memory bank,
preallocated outputs, optional same-frame segmentation and cancellation remain
unchanged. `maxReplayFrames` is adjustable; exceeding it rejects instead of
silently truncating. `segmentFrames` retains original behavior. No persistent
cross-frame replay checkpoint, constant-memory streaming or automatic history is
claimed. Temporary result fields stay in the original recipe. Full low-level
results/diagnostics remain available via `withPreparedEffects(model, recipe)`.

Threshold, softness and analysis-background RGB leaves additionally accept the
existing Signal type, evaluated with the supplied FrameContext before delegating
to the original strict numeric controls. Source-frame indices remain exact
integers: supply a plain callback for retiming; no automatic rounding occurs.
The model's original SDR normalization is distinct from final signed HDR/F16/F32
mask application. `examples/sam2.tsx` is editable and `sam2-stage.ts` demonstrates
existing-Stage use; its original QA authored-mask shader is isolated in
sam2-fixture.ts. Creators can simply declare their own alpha-mask image.
Model source revision/license remains in `../video-roto/sources.json` and
MODEL-NOTICE.md. This is the same learned algorithm/weights, not a new model.

This checkpoint qualified five unit checks, scoped types and ten exact original-
entry F16/F32 GPU comparisons, including an ordinary async reader, animated
softness, explicit missing observation and real same-frame continuation. Three
original model sessions remain one Stage-local declaration set. PNG initial/
middle/final/random/repeat and Float32 EXR hash equality passed. MP4 FAILED at
old-Core model-file cleanup EBUSY; no usable MP4 was retained or claimed. Main's
cf214adb cleanup fix is known but not synchronized here, so full clip qualification
is pending integration. The rejected v11 optimized bundle, unchanged admission
results, standard v10 identities and all raw failures remain in evidence. No
policy/hash/lock was altered to admit v11.

Private photographic QA outputs stay local because the inherited photograph
redistribution license is unconfirmed. Evidence keeps paths, hashes, dimensions
and numeric results; do not carry those images/videos into a published package.
Use your own declared image/alpha-mask assets for distributed projects. Original
`RotoPrompt`, `BrushStroke`, and `StrokePoint` types are available as normal named
type imports for separately authored prompt/stroke variables.


Post-sync qualification: after new explicit human authorization, Main backported
only cf214adb's Renderer/LogicHost close ordering at local commit0e527142. The
same actual SAM2 scene now completes the existing single-slot native MP4 service,
three frames independently decode, RGB byte MAE0.542 is below the predeclared8
budget, and close succeeds. Prior EBUSY and v11-admission failures remain intact.
See native-image-sam2-authoring-evidence/completion.json for the authoritative
follow-up; earlier blocked fields describe the original freeze, not current
single-slot status. Runtime binaries, third-party locks/trust, other Main work
and the pre-existing spherical drafts were not synchronized or changed. This
one-time synchronization authorization is fulfilled. The complete public-module
entry, immutable identity, ordinary installed imports and portable validation
still belong to Main and are not claimed qualified by source-only tests.
