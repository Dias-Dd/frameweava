# Spatial PSF and joint restoration

`createNativePsfRestorationEffects(init)` uses the existing admitted Native GPU
scope. It owns no device, renderer, time engine, model runtime or file access.
Editable examples are in `../examples/psf-*.tsx`; start with `psf-chain.tsx`.
Public SDK/R1 identity and installed/portable integration remain Main's work.

```ts
const fx = createNativePsfRestorationEffects(init);
// Inside the ordinary Native renderAt:
return fx.processImage(observedA, async (image, f) => {
  const a = await f.prepareSpatialPsf(image, calibrationA);
  const b = await f.prepareSpatialPsf(observedB, calibrationB);
  return (await f.jointDeblur(image, [
    {id: 'a', time: {num: 0, den: 1}, alignment: 'registered-reference',
     image, psf: a},
    {id: 'b', time: {num: 1001, den: 30000},
     alignment: 'registered-reference', image: observedB, psf: b,
     mask: observationConfidence},
  ], {iterations: 12, regularization: 0.0001})).image;
}, {context});
// Dispose fx in the existing Stage lifecycle.
```

`spatialDeblur(image, psf, options)` is the one-observation solve.
`convolveSpatialPsf(image, psf, options)` applies the calibrated forward model.
It is also useful for independently inspecting a PSF or simulating degradation.

## Calibration v1 and pixel coordinates

```json
{
  "kind": "frameweave.psf-grid",
  "schemaVersion": 1,
  "anchor": "input",
  "columns": 1,
  "rows": 1,
  "kernelWidth": 3,
  "kernelHeight": 3,
  "kernels": [[0, 0, 0, 0.25, 0.5, 0.25, 0, 0, 0]]
}
```

Each row-major grid knot contains a row-major, odd-size kernel with finite,
nonnegative weights and positive mass. Kernels are individually normalized in
binary64, encoded as F32 high/low pairs, then interpolated bilinearly. Grid
endpoints coincide with the first/last image pixel centres; one knot is constant.
Support offset is `(kx - floor(kernelWidth/2), ky - floor(kernelHeight/2))` in
pixels. No implicit half-pixel shift or centring of an asymmetric kernel occurs.

Let `p` be an observed output pixel, `d` a kernel offset and `q = B(p-d)` a
boundary-mapped input pixel. The forward operator is

```
output anchor (default): (A x)[p] = sum_d K(p,d) x[B(p-d)]
input anchor:            (A x)[p] = sum_d K(B(p-d),d) x[B(p-d)]
```

Input anchoring describes a kernel indexed by the emitting/input position.
Output anchoring describes locally weighted gathers. These operators differ
when the PSF varies; do not interchange their calibration files. Input anchoring
does not silently renormalize output rows or suppress radiance concentration.

Boundaries are `zero`, `clamp` (default), `mirror` (reflect without duplicating
edge samples; a unit-size axis stays constant), and `wrap`. Zero extension loses
off-image contributions; no undocumented edge normalization is applied.
The transpose sums **all boundary preimages**, with the correct PSF anchor.
Kernel flipping alone is not the transpose of this spatially varying operator.

Unknown fields/versions, sparse arrays, even support, negative/nonfinite weights,
zero mass and storage outside actual device limits fail with located diagnostics.
The calibration JSON is serializable; `SpatialPsf` contains an owner-local GPU
buffer and is recipe-local. Do not serialize it into TVG or reuse it across Stages.

## One shared latent image

For registered observations `y[j]`, scalar normalized weights `beta[j]`, alpha
confidence masks `W[j]`, and the supplied initial/reference image `x0`, solve

```
F(x) = 1/2 sum_j beta[j] ||sqrt(W[j]) (A[j] x - y[j])||^2
       + ridge/2 ||x-x0||^2 + smoothness/2 ||D x||^2
```

This is a joint signed least-squares inverse, not an average of separate restored
images. It reuses the project's existing residual/gradient approach with an
explicit space-varying operator and exact transpose. RGB is never projected to
nonnegative/SDR values. No Richardson–Lucy positivity assumption is introduced.

The fixed-iteration update uses the diagonal majorizer
`sum beta A^T W A 1 + ridge + 8*smoothness`, with `0 < step < 2`. For nonnegative
`A`, Jensen/Cauchy–Schwarz gives `A^T W A <= diag(A^T W A 1)` in the quadratic-form
sense; the four-neighbour Neumann smoothness term has bound `8*smoothness`.
An unobservable pixel with zero denominator retains its initial value. No CPU
readback, convergence scan or guessed per-image spectral norm is needed.

Default options: 12 iterations, step 1, ridge 0.0001, smoothness 0,
`alpha:'preserve-reference'`. Scalars support the existing Signals/FrameContext;
this module adds no expression or animation evaluation. Confidence comes only
from the supplied mask's alpha; its RGB/colour space is irrelevant.

Observations explicitly declare `alignment:'registered-reference'`, matching
dimensions, and PSFs expressed on that same pixel grid. Existing registration or
motion warps may be composed before this call. A raw camera PSF cannot be assumed
unchanged by a nonrigid warp. This API does not automatically register, infer PSFs
or evaluate upstream frames. Exact rational times and stable IDs select canonical
accumulation order; missing observations are skipped, never interpolated.

## Media, alpha and lifetime

All observations are converted by the existing working-colour path to the actual
reference working space. Internal data is associated, signed, linear F32 RGBA.
Float16 inputs retain their quantization; requested F16/F32 is published at the
logical output boundary. There is no RGBA8 intermediate or hidden RGB clipping.

`convolveSpatialPsf` defaults to linear alpha filtering followed by explicit
projection to `[0,1]` at image publication. An input-anchored nonuniform kernel
may have non-unit row mass. Use `alpha:'preserve-reference'` when coverage is
known and must remain fixed. `jointDeblur` preserves reference alpha by default;
`alpha:'restore'` solves alpha with per-iteration box projection. Preserving alpha
also preserves the original hidden RGB of zero-alpha reference pixels, matching
the existing image-effect convention. Alpha is not an HDR radiance channel.

The solve reuses fixed scratch buffers for every iteration. The returned
`normalDiagonal` is a GPU data diagnostic, not a variance/confidence estimate or
proof of convergence. Results/PSFs expire at recipe end under the existing
processor; consume/publish diagnostic buffers inside the callback. Inspection
callbacks record GPU work; frame-ticket completion proves execution. Tests clone
reused iterates only to retain independent numeric snapshots. Production performs
no per-step image upload, pixel readback or extra diagnostic copy.

No permanent MP/8K cap is added. Full-domain fields must fit the device's storage
binding and the caller's existing byte budget. Direct support evaluation costs
pixels × kernel area × iterations × observations; clamp preimages add boundary
work. Large-support/large-domain tiling and low-rank/FFT acceleration are not
claimed by this version. No rank truncation, support truncation or CPU fallback
silently changes the requested operator. The current evidence is from one actual
RTX5070 Laptop/Vulkan device; other devices/OS and package distribution remain
unqualified.
