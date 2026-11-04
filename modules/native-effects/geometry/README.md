# Native professional resampling and 2D geometry

Project-local source entry: `modules/native-effects/geometry/index.ts`.
Main owns the immutable R1 successor, SDK exports, catalog and distribution pins;
this checkpoint does not change a published package or silently refresh locks.
It requires the existing admitted Native scope, Pixel ABI2, Compute ABI1 and
`imageToBuffer` v1. No new private device is required.

```ts
import {createNativeGeometryEffects} from './geometry/index.ts';
// Inside the existing Native Stage factory:
const effects = createNativeGeometryEffects(init);
// Inside renderAt(context, inputs):
const result = await effects.processImage(inputs.image, async (image, fx) => {
  image = await fx.resample(image, {width:1920, height:1080});
  image = await fx.twirl(image, {angle:25, radius:300});
  return fx.lensDistortion(image, {radial:[.025,-.005,0]});
}, {context});
// Stage dispose: await effects.dispose(). Never dispose the engine's GPU scope.
```

Editable TSX: `../examples/geometry-chain.tsx`. It combines GPU reconstruction,
wave, twirl, Brown-Conrady distortion and feathered local magnification, through
the existing compiler, Native Stage, Layer and media export. Numeric fixtures in
`geometry-numeric.tsx` exercise every entry separately.

The processor owns its produced images and scratch. Its returned image is
retained for the current frame until the next recipe call or disposal; it is
not a permanently caller-owned texture. It may be passed back as the next
recipe's input in the same frame. Other inputs are borrowed and are not released
by this processor. A different chain must not release or retain this result
beyond its producing processor's lifetime. Cancellation is checked before new
work is recorded; accepted work follows the existing owner contract.

| Function | Contract and principal options |
| --- | --- |
| `resample` | Centre-aligned separable nearest/triangle/Mitchell B=C=1/3/Lanczos3. Default Lanczos3, antialias true, clamp boundary. Downsampling expands support. Width/height required. |
| `homographyWarp` | Nine row-major output-centre-to-source-centre coefficients; optional output dimensions. Singular maps fail; projective poles become transparent. |
| `cornerPin` | Destination TL/TR/BR/BL; pivoted F64 preparation solves the projective map. This is a distinct authoring contract sharing the homography kernel. |
| `twirl` | Centre, physical radius and angle in degrees, squared radial falloff. A 360-degree twirl retains its spatial twist. |
| `spherize` | Radial inverse `asin(r/R)/(pi/2)`, identity outside the radius. |
| `bulge` | Elliptical radius, signed height, taper exponent, optional edge pinning. |
| `waveWarp` | Nine shapes, direction, wavelength, height, phase in degrees, explicit time/speed in cycles/second, deterministic seed and nine pin modes. |
| `ripple` | Radius, wavelength, height, phase/time/speed; optional quadrature lateral component. |
| `mirrorWarp` | One-sided reflection across an arbitrary line, defined by centre and normal angle. |
| `offset` | Fractional pixel translation; default repeat. Distinct from integer crop/pad and RGB offsets. |
| `polarCoordinates` | Rectangular/polar inverse maps with interpolation amount. Centre angle is explicitly zero. Default clamp. |
| `turbulentDisplace` | Original lattice/value-noise fBm, fractional octaves, evolution, seed, falloff, six displacement modes and nine pin modes. Original noise arithmetic is f32. |
| `opticsCompensation` | Forward/reverse radial FOV projection; horizontal/vertical/diagonal FOV reference. No automatic layer growth or undocumented resize cap. |
| `magnify` | Circular/square local magnification, feather, opacity, normal interpolation with the original image outside the lens. |
| `meshWarp` | Explicit row-major destination/source points, columns/rows and optional bilinear subdivisions. |
| `bezierWarp` | Four connected cubic edges, clockwise; Coons patch sampled to a triangle grid. Subdivisions is explicit quality, not an image-size limit. |
| `bend` | Inverse circular bend with rigid end continuation and explicit static/transparent prestart. |
| `lensWarp` | Bounded spherical lens with convergence exponent; transparent outside its aperture. |
| `tiler` | Fractional scale, rotation, centre; repeat/mirror sampling. Distinct from the existing integer `tile`. |
| `griddler` | Per-cell scale/rotation with explicit fractional gap. |
| `lensDistortion` | Brown-Conrady three radial/two tangential coefficients and explicit pixel normalization. Coefficients describe the inverse sampling map. |
| `liquify` | Ordered static push/pinch/twirl brushes. Amount is degrees for twirl, dimensionless for push/pinch; push also has a pixel offset. No hidden evolving state. |
| `kaleidoscope` | Angular wedge folding with segment count, centre and rotation. |
| `cylinderWarp` | Horizontal/vertical inverse cylindrical projection with radius and angular offset. A 2D image warp, not a 3D object renderer. |

## Media, time and precision

Physical pixels use top-left origin, y down, centres at `(x+.5,y+.5)`. Boundary
options are transparent/clamp/repeat/mirror, applied to each contributing texel.
Sampling is bilinear or nearest for warps. Resize uses its reconstruction method.
Repeat interpolates across its seam; it does not clamp the wrapped coordinate's
neighbours as some upstream UI effects do.

Inputs must already have explicit scene-linear color. Color identity is retained;
this domain does not perform a gamut/display transform. Straight RGB associates
with Alpha before spatial filtering; premultiplied zero-Alpha radiance is retained.
Output is premultiplied RGBA16F/32F, defaulting to input precision. RGB remains
signed HDR. No RGBA8 intermediate, PNG bridge, CPU pixel fallback or GPU owner is
introduced. Missing hardware admission fails through the existing recipe service.

Signed reconstruction lobes can produce out-of-range coverage. `resample` has an
explicit `coverage:'clamp'` policy: raw signed high/low horizontal scratch is typed
GPU data, vertical reconstruction completes, then Alpha clamps once at publication.
RGB is never clipped or rescaled by that Alpha clamp. Each public call publishes
at its requested precision; calls are not fused/reordered. `maxWorkingBytes` adds
an optional caller budget to actual Native device/session admission. Buffer sizes,
component indices and dispatches retain the existing uint32/device limits; there
is no permanent MP/8K/16K or triangle-count policy.

Geometric mappings use compensated high/low coordinates and argument-reduced
series for susceptible trig/power calculations. They do not require shader-f64.
Noise deliberately retains the original f32 lattice semantics; its coordinate
range is checked against actual f32/int32 addressing. This is not an arbitrary
precision image algebra guarantee for every extreme finite parameter combination.
Homographies are normalized for homogeneous scale; the normalized denominator's
pole exclusion is `abs(w)<1e-12`. This avoids dividing through an unstable pole.

Number parameters and point leaves accept existing Signals and require a
FrameContext when animated. Time is explicit or `context.time`; no wall clock,
history, frame-index matching or persistent GPU simulation is created. A repeated
or backward frame is evaluated from the same controls. Topology is supplied by
the caller; changing mesh/brush counts does not imply animation morph matching.

Unknown fields and wrong enums fail with `E_NATIVE_GEOMETRY_PARAMETER`. Existing
`E_NATIVE_IMAGE_LIMIT`, owner/scope errors and `E_RENDER_CANCELLED` remain intact.
Mesh cells split TL/TR/BR then TL/BR/BL; row buckets preserve order. First geometric
coverage wins, including zero-Alpha emission. Degenerate triangles are skipped;
uncovered pixels are transparent. Overlap priority is independent of pixel Alpha.
The Coons patch is piecewise affine at the requested tessellation, not an exact
analytic inverse of an arbitrary folded bicubic surface.

## Source provenance and limits

`sources.json` pins EffectCraft commit and exact source hashes. MIT originals and
license are in `vendor/effectcraft`. Twirl, spherical/bulge/wave/ripple/mirror/polar,
fBm, optical projection, local magnification, grid/Coons, bend, lens and tiling
equations are adapted from its real Rust/WGSL. The adapter replaces only framework
context/resources/sampling and adds the current precision/Alpha contract. Standard
reconstruction, Brown-Conrady, static brushes, angular folding and cylinder mapping
are local mathematical kernels, not claimed as verbatim upstream shader reuse.
No upstream editor, engine, Rust binary or external rendering framework is loaded.
Reconstruction and mesh processing currently require whole-image GPU buffers;
arbitrary warps do not transparently tile. Grid preparation costs depend on
triangle/row overlap; folded surfaces use the stated deterministic coverage
order. Larger workloads remain subject to actual session/device budgets.

Not complete AE parameter/UI compatibility. No temporal resampling, LUT, DOF,
advanced denoise, complex optics or advanced key cleanup is delivered by this
domain. Agent-2's independently frozen temporal work is a separate integration;
its availability is not inferred from these image APIs. Other GPU vendors/OS,
software adapters, full-repository/six-mode distribution and 4K terminal media
remain separate qualification. Raw campaign commands, failures, timing, device,
PNG/EXR/MP4 and measurements accompany the checkpoint evidence.
