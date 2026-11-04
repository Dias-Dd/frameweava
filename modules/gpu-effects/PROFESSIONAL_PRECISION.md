# Professional compositor arithmetic qualification

This is the existing `createProfessionalCompositor`, with the same evaluated
`ProfessionalComposite`, Surface v2, Stage-local owner and CPU reference. It does
not add a GPU host, an animation evaluator or a second compositor API.

## Why ordinary f32 was insufficient

Two actual GPU counterexamples were reproduced against the unchanged
`src/media/compositor.ts`:

* Opaque Screen, source RGB 65504 and destination RGB `f32(1 + 2^-16)`:
  the old GPU result was zero; the CPU result is 0.0005035400390625.
* Opaque black over RGB 65504 at opacity 0.99999999: rounding opacity to f32
  first made the old GPU result zero. The CPU F32 result is approximately
  0.0006550400285050273.

`professional-shaders.ts` reuses the fixed compensated high/low f32 operations
from `float-pass-shaders.ts`. Host constants retain high and low parts. Sampling,
opacity, masks and blends keep compensation until one ordinary F32 publication
at each raster draw. Isolated groups publish F32 before the parent blend, just
as the CPU compositor does. Hidden RGB at alpha zero is retained. This is not a
claim that two f32 values implement all IEEE binary64 arithmetic.

## Qualification and failure policy

`professional-precision.ts` examines prepared input metadata and the actual
active layer/group order before GPU frame allocation or upload. It qualifies
operations, rather than imposing the Half maximum on all F32 surfaces. Integer
copy/crop/pad/mirror paths retain extended finite F32 values, including the
existing approximately ±3e30 Reframe workload.

Nonlinear blends and nontrivial sampling have a narrower arithmetic domain.
Large intermediate growth, unsafe unassociation and amplification of rounding
residuals can make an otherwise finite plan unqualified. No value is clipped to
make a plan qualify. The CPU reference continues to accept its existing domain.

* `backend: 'webgpu'`: unqualified plans reject with
  `E_GPU_FLOAT_PRECISION`, `details.commitState: 'none'`. No GPU frame buffers
  are allocated, no partial result is published and the owner remains usable.
* `backend: 'auto'`: that pre-submission rejection uses the existing CPU
  compositor and records the code and reason in `stats().fallbackReason`.
  A later successful GPU render clears that reason.
* After a render submission attempt, failures never replay on the CPU. Owned
  buffers are drained/destroyed, and later calls reject with
  `E_GPU_FLOAT_FAILED`. Dispose and recreate that owner.
* `dispose()` remains idempotent. An operation concurrent with render is still
  rejected with `E_GPU_BUSY`.

This module-level policy does not grant preview/final hardware permission, WASM
permission, network access, same-origin iframe access or cross-Stage GPU handles.
Renderer integration must retain its existing strict/auto policy and carry the
pre-submission error explicitly; it must not infer safe fallback from an
arbitrary GPU failure.

## Verification

Run the dedicated actual-browser matrix with the worktree-local Chromium and
library directories:

```powershell
$env:FRAMEWEAVE_HOME=Join-Path (Get-Location) '.frameweave/user-home'
$env:PLAYWRIGHT_BROWSERS_PATH=Join-Path (Get-Location) '.frameweave/dx1a-browsers'
$env:FRAMEWEAVE_PERFORMANCE_MODE='silent-user-selected'
node --import tsx --test tests/professional-gpu-blend-precision.test.ts
```

The test freezes source hashes and the SDK runtime content identity at both ends.
It compares decoded CPU/GPU values at the existing scaled tolerance of 3e-6,
uses bit-exact comparisons for the wide integer paths, checks preflight errors,
tests a real submission followed by an injected host failure, and checks repeated
disposal and all owned buffer counts. This is a correctness matrix, not an FPS
benchmark. Power modes and source batches must not be combined into a speedup
claim.
