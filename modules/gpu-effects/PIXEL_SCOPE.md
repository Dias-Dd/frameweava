# Resident GPU pixel scope v1

Additive API on the existing `createGpuEffectChain` / ChainCore WebGPU device.
Integrated into Main from frozen2345f9e plus dependency fix d5a5131; existing immutable P4 packages
are not silently changed to use it. Main acceptance: `docs/MAIN_GPU_RESIDENT_INTEGRATION.md`. Producer review: `docs/GPU_RESIDENT_EFFECTS_REVIEW.md`.

```ts
import {createGpuEffectChain,createGpuPixelEffects} from '@frameweave/engine/web';
// Inside a Web Stage's async create lifecycle, after ordinary authorization:
const chain=await createGpuEffectChain({width,height,effects:[],backend:'webgpu'});
const gpu=await chain.createPixelScope();
const effects=createGpuPixelEffects(gpu);
// Inside renderAt, with an explicit Surface input:
const source=await gpu.upload(input);
const blurred=await effects.blur(source,{radius:2,boundary:'clamp'});
await gpu.release(source);
const glowing=await effects.glow(blurred,{radius:3,threshold:1,intensity:.5});
await gpu.release(blurred);
const surface=await gpu.readback(glowing); // only full-image readback
await gpu.release(glowing);
// Return the real Surface through existing ports. During Stage dispose:
await chain.dispose();
```

Do not call the legacy Canvas/Surface methods while the scope is open. They keep
their existing independent publication/admission semantics. End the scope first;
`chain.resize` drains/disposes it. There is one active scope per existing chain.
Do not create a new scope/device for every effect. Independent Stage owners do
not share GPU objects.

## Authoring a new effect without Renderer wiring

```ts
const matte=await gpu.compile({
 abiVersion:1,id:'studio/apply-matte',version:'1.0.0',
 inputCount:2,parameterWords:0,
 code:`fn pixel(p:vec2u)->vec4f{
   return read0(vec2i(p))*read1(vec2i(p)).a;
 }`,
});
const result=await gpu.run(matte,[image,mask],{
 output:{format:'rgba16float',alpha:'premultiplied'},
});
```

The callable WGSL ABI is `fn pixel(p:vec2u)->vec4f`. Binding layout, 8x8 dispatch,
allocation, diagnostics and F16/F32 logical publication are owned by the scope.
Helpers: `outputSize()`, `size0()..size3()`, `alpha0()..alpha3()` (0 PM, 1 straight,
2 opaque), `read0()..read3()` (integer transparent-outside),
`sample0()..sample3()(physicalPixelCoordinate,edgeClamp)` (bilinear),
`paramU32(index)`, `paramF32(index)`. Only declared inputs have helpers.

0..4 inputs and 0..1024 parameter words are supported. Uniforms are copied when
recording; subsequent caller mutation cannot change already recorded work.
Parameters are raw F32/U32 words, **not a replacement for P4 Schema or Signals**.
Evaluate existing Signals before calling. Preserve F64 constants through explicit
hi/lo words and compensated arithmetic when the algorithm requires it.

Output defaults to the first input metadata. Generators supply width, height,
format, Alpha and color. Different source dimensions are supported through helpers;
colors must match. Color conversion must be explicit. Upload accepts scene-linear
F16/F32 Surface v2 and retains its Alpha metadata. No Canvas8 RGB bridge is used.
The existing Gaussian/Glow adapters canonicalize Alpha-zero RGB as their CPU
reference does; the generic scope and Over do not silently canonicalize emission.

## Precision and publication

Every recorded pass is a logical publication: finite RGB, Alpha [0,1], opaque
Alpha exactly 1 and F16 representability are checked. F16 is manually rounded RNE
on GPU, including ties, signed zero and binary16 subnormals, then stored as F32
GPU workspace. The following pass sees that rounded value. F32 workspace is **not
a promise of exact F64 arithmetic**. WGSL arithmetic and denormal behaviour remain
device/kernel dependent; each algorithm needs its own CPU reference and qualified
domain. Generic shader acceptance is not a precision certificate.

Gaussian/Glow reuse shipped compensated arithmetic and coefficient planning.
They support the existing bounded normal/magnitude domain, PM output, radius
0..64, explicit clamp/transparent edge and F16/F32 publication. Unsupported
data detected on GPU fails the batch; it never clips or replays on CPU. Other
algorithms may retain their separately versioned domains. Over accepts same-size
PM/opaque inputs and uses compensated A+B*(1-A.alpha), including Alpha-zero RGB.

## Recording, completion and failure

`run` compiles/records; it does not wait for pixel completion. Handles are
provisional until `complete`/`readback` succeeds. `readback` submits pending work,
copies the small per-pass validation flags and final pixels in one queue
submission/read mapping, and returns a value-owned Surface. `complete` reads only
validation flags. No intermediate full-image readback is implicit.

Invalid earlier results cannot become a successful final publication. A failed
logical publication, post-submit cancellation, device loss or execution error
invalidates the scope; no CPU replay is permitted. Dispose and create a new scope.
Preflight rejections preserve previous values. GPU cancellation is cooperative
at host boundaries; it is not GPU preemption. The existing Stage timeout remains.

All operations share the chain's exclusive gate; await calls instead of using
Promise.all on the same owner. Independent scope handles cannot be mixed, cloned,
JSON serialized or posted across an iframe/Stage. Explicitly read back before
crossing existing Surface ports. No cross-context texture sharing is implied.

`release` is idempotent for a local handle. Outputs can reuse released workspace
through command ordering. Host uploads reuse a buffer only when no unsubmitted
encoder can still read its previous contents. Dispose waits for submitted work,
destroys all buffers, clears caches and is repeatable. The scope borrows the
device; only the original chain destroys it.

## Security, distribution and bounds

Kernel code is trusted native Stage implementation, not untrusted snippets. Carry
it in the sealed Stage bundle, or obtain declared resources via `init.resources`
and existing `verifyResource` **before** decoding/compiling. The scope never fetches
code, loads packages, changes CSP/WASM policy, grants trust or bypasses R1 hashes.
Immutable kernel id/version plus source SHA identifies a local compiled recipe;
it is not a registry, signature, installation grant or GPU pixel hash.

The body cannot declare bindings/entry points/directives or use reserved `fw_`
identifiers. Explicit layouts expose read-only input buffers. These guards do not
prove bounded execution of arbitrary WGSL; unsafe/infinite algorithm code is not
made safe by a hash or byte budget. Use the same review/trust boundary as native
Stage code. No new network/filesystem/worker permission is introduced.

Defaults: 512 MiB logical owner budget, 256 pending passes, 64 compiled kernels;
optional limits up to 1 GiB/1024 passes/256 kernels. Call `complete` to bound large
batches without full-image readback. Per-buffer device limits and 16 MP dimensions
are checked; v1 does not silently tile an oversized arbitrary kernel. Neighbourhood
effects need an explicit halo/tile adapter when exceeding those limits. Statistics
include owned buffers/bytes, reuse, submissions, upload/readback bytes and failures.
Driver/physical memory is unknown. No general writable state/geometry buffers,
WebGL2 interop or cross-Stage GPU transfer is claimed by v1.

Stable errors: E_GPU_PIXEL_CONTRACT / LIMIT / COLOR / SCOPE / RELEASED / CLOSED /
IDENTITY / SHADER / PUBLICATION / EXECUTION / TRANSFER / SCOPE_ACTIVE / UNAVAILABLE;
existing E_GPU_BUSY, E_RENDER_CANCELLED and hardware-policy errors are retained.

## Verification and next integration

`tests/gpu-pixel-scope.test.ts`: pure contract checks.
`tests/gpu-pixel-scope-gpu.test.ts`: real TSX/opaque Stage, CPU comparison, random
frames, F16 rounding, buffer ordering, errors, cleanup and PNG/EXR output.
`scripts/performance/gpu-resident.ts`: frozen equal-quality old versus resident
Stage A/B. `Performance.prototype.now.call(performance)` is mandatory inside a
Stage; `performance.now()` there is deterministic animation time.

Effect owners can now add kernels/adapters without Renderer changes. Migration
of the 22 existing GPU image functions is a separately versioned library batch;
this checkpoint does not claim that all 55 functions have been migrated or that
all future physics/geometry workloads are covered.
