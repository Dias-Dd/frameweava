# Native filter, channel, colour and grain closure

Round 2 of the final three-round scope. 22 method names; 18 image/data
operations and four **official OCIO processor** operations. Existing Gaussian,
tritone, per-channel levels, curves/LUT, denoisers, radial blur and compositing
are reused rather than renamed and counted again. Main owns SDK/R1 publication,
immutable package identity, catalogs, locks and portable installation.

```ts
import {createNativeClosureEffects} from './closure-filters/index.ts';
const effects = await createNativeClosureEffects(init, {
  ocioProcessors: [preparedLook], // explicit, sealed project/resource data
});
const result = await effects.processImage(source, async (image, fx) => {
  const channels = await fx.channelCombine(image, {model: 'hsl'});
  image = await fx.channelDecode(channels);
  image = await fx.lightSweep(image, {intensity: .5});
  return fx.ocioLookTransform(image, preparedLook);
}, {context});
// dispose: await effects.dispose()
```

`../examples/closure-chain.tsx` is an editable real Stage project. Numeric and
1x1 projects exercise every method. These are Native hardware-only recipes on
the admitted owner, with ordinary JS/Signals and existing cancellation/leases.
No browser pixels, new device, file/network/process privilege in the Stage,
CPU image fallback, permanent pixel-count cap or new TVG/port/ABI is introduced.

| Methods | Defined contract |
| --- | --- |
| crossBlur | Normalized Gaussian cross PSF, half horizontal + half vertical, clamp boundary; filters associated RGBA together. |
| fastRadialBlur | Finite radial samples, mean or luma-selected brightest/darkest; pixel-centre coordinates and clamped bilinear PM sampling. |
| vectorBlur | Full-origin `f32` motion field, space=image, pixels, dx/dy, 2 components; finite directional box integration. Nonfinite motion fails GPU validation. |
| motionDeblur | Explicit odd nonnegative PSF, normalized CPU control weights, circular convolution and transpose. Iteration: x += step*(Hᵀ(y−Hx)−regularization*x). F32 intermediate publications, final requested format/amount. No blind motion estimation. |
| channelCalculations | Explicit source/reference channel or working luma and add/subtract/multiply/signed-guarded divide/min/max/difference; grey result, source coverage. |
| channelCombine / channelDecode | RGB, YUV, YIQ or reversible range-normalized HSL in **typed non-colour GPU storage**. Interleaved 12 F32 words: hi/lo pairs for three coefficients, Alpha, offset, span. Buffer cannot be serialized/persisted as Surface. Brand expires with recipe; decode publishes PM image. |
| colorNeutralize | Explicit sampled neutral point, luma/channel gains with epsilon guard. No auto illuminant estimation. |
| colorOffsetCycle | Explicit per-channel modulo with declared period. This artistic wrap is intentional, not an implicit HDR clamp. |
| colorama | Cyclic working-luma palette interpolation, explicit phase/cycles and arbitrary signed/HDR RGB colors. |
| colorMatch | Alpha-weighted RGB mean/std transfer to an explicit reference; compensated GPU row/column reduction, epsilon-protected source variance. |
| colorStabilize | Per-channel affine least-squares from three explicit matching calibration points; degenerate variance uses unit gain and mean offset. No hidden temporal Stage sampling or tracking. |
| matchGrain | GPU highpass-residual variance matching; only missing variance is added as deterministic triangular grain. Does not claim full grain-spectrum estimation. |
| noiseAlpha | Bounded coverage noise, reassociated color, explicit Alpha0 PM-emission retention; hidden straight RGB never becomes radiance. |
| noiseHls | Deterministic HSL perturbation with retained HDR offset/span. Saturation/lightness clamp applies only to the explicitly normalized HSL domain. |
| lightBurst / lightSweep / eyedropperFill | Radial sampled additive light / directional polynomial light band / Alpha-weighted probe fill. Preserve coverage and signed/HDR RGB. |

Image output is PM, inherited format unless overridden; the display transform returns explicitly typed GPU data rather than an image. Source/reference share
physical dimensions and an actual working-color conversion, never metadata
relabeling. Colour-only operations retain zero-Alpha PM emission; hidden
straight RGB is discarded. Negative RGB and HDR remain finite and unclipped
except an explicitly selected artistic mapping/OCIO transform. Standard finite
F32 parameter and real device/owner budgets apply. F16 overflow is an explicit
owner failure, never silent clipping. No automatic tiling/global-origin support
is claimed for the global reductions or current motion-pack descriptor.

## OCIO preparation and execution

`ocio/prepare.ts::prepareOcio()` is a separate **Node-only offline** entry. The
caller explicitly supplies reviewed Python, compiler, project root, resources,
config and exact input/output colour metadata. It uses OpenColorIO 2.5.2's
GPUProcessor GLSL, retains its algorithms/tables and invokes pinned Naga 30.0.1
to translate IR to WGSL. Native receives sealed Pixel ABI2 plus readonly LUT
data, uploaded once at Stage initialization. There is no per-frame subprocess,
shader fetch or readback. The helper is not a sandbox for untrusted OCIO configs;
review config search paths/resources before this explicit Node operation. It
checks returned resource paths/hashes and records all used config/LUT files.

The four methods require correspondingly prepared processor kinds: color-space,
display, file and look. `ocioDisplayTransform` returns `NativeDisplayData`: a
readonly owner-local buffer token, explicit display-linear ColorEncoding,
RGBA F32 interleaved layout and requested logical F16/F32 publication. F16
values are explicitly rounded inside GPU Compute; storage stays F32. Display uses an explicit view **followed by the config's
display-encoding inverse**, so the returned data is linear in its
declared output primaries with reference=display. It cannot enter a normal
scene-linear Native image chain. The current `pixelMetadata()` contract rejects
display-referred images: Main/owner need a minimal typed display-image or
terminal output adapter before a normal Layer can publish this as its display image.
The explicit Node terminal adapter now lives in `../closure-images/display-output.ts`;
it reuses named-buffer export and PME, with a qualified colorimetric display
profile and a separately retained failing wider ACES2 numeric case.
This checkpoint does not modify that shared contract or mislabel the data. Alpha is coverage and never processed by OCIO. Unassociated RGB is
processed only where Alpha>0. Alpha0 PM emission follows the actual native
colorimetric output conversion, bypassing nonlinear looks. `amount` blends in
the output primaries against an actual converted base.

Scene-colour changes use readonly GPU image-data views and an output generator because
the existing image-input ABI requires equal color metadata. This is a supported
GPU-data path, not a surface relabel or CPU transfer. WGSL/LUT SHA256 is checked
before immutable initialization; deep freezing prevents later mutation. Exact
source hashes, official cache ID, config, compiler and dependency identities
remain preparation provenance; they do not confer package trust.

1D/2D/3D RGB or red LUT tables support nearest/linear addressing. Actual
qualification covers official ACES2 display's 1D tables and a nonlinear 3D file
LUT; arbitrary 2D configs remain unverified. Unsupported texture operations,
interpolation and dynamic Uniforms fail explicitly. LUT domain clamping is the
official selected processor's behavior. The bridge does not turn every OCIO
config into a qualified processor, and no full AE UI/legacy-bit parity is claimed.

## Reproduction

Use local FRAMEWEAVE_HOME, the reviewed Native/SpiderMonkey delivery environment
and explicit FRAMEWEAVE_MEDIA_PYTHON. Run `node .../closure-filters/validate.mjs`
with phases build, prepare, syntax, types, unit, gpu, media, performance, freeze.
All attempts share one ledger and a cumulative <420-second budget including
failures/build/preparation. The isolated Rust target stays in this worktree.
No SDK or plugin lock is refreshed. Preserved evidence includes original failed
attempts, not only final green runs. Formal multi-vendor/package/full-repository
acceptance belongs to Main.


### Preparation revision in closure round 3

The Node preparer now requests `OPTIMIZATION_NONE` for the official GPU
processor to preserve the CPU oracle's operation ordering. Typed Naga spans
select compensated transcendental functions and explicit F32 operation barriers;
LUT interpolation follows OCIO `MathUtils.h::lerpf` ordering. The helper does
not widen numeric gates or substitute a generic LUT for the official program.

Private prepared kernels now require 128 uniform words (including the existing
zero arithmetic guard), instead of the earlier four. Regenerate **unpublished**
prepared artifacts explicitly with the Node preparer; old artifacts fail
validation rather than being silently patched. The P4 ABI, package versions,
SDK/content pins, owner and public exports are unchanged. Original round2
performance numbers describe its frozen source, not these larger precision
kernels. The affected 13 unit tests and 352 GPU comparisons were rerun inside
the round3 ledger. Wider ACES2 display remains above the unchanged `3e-6` gate;
see the current image module's README for the exact measured limitation.

Operation-order source references: [OCIO MathUtils](https://github.com/AcademySoftwareFoundation/OpenColorIO/blob/v2.5.2/src/OpenColorIO/MathUtils.h),
[ACES2 matrix implementation](https://github.com/AcademySoftwareFoundation/OpenColorIO/blob/v2.5.2/src/OpenColorIO/ops/fixedfunction/ACES2/MatrixLib.h),
and [official GPU functions](https://github.com/AcademySoftwareFoundation/OpenColorIO/blob/v2.5.2/src/OpenColorIO/ops/fixedfunction/FixedFunctionOpGPU.cpp).
