# Stage-local compute and non-color fields

Create the chain and its scope once in the existing Stage initialization, and
dispose the chain in that Stage's `dispose`. The scope borrows the chain's device,
queue gate, profiling queries and logical byte budget. It exposes no GPU object.
This is an additive extension to PixelScope, not a new Renderer or scheduler.

```ts
const chain = await createGpuEffectChain({
  width, height, effects: [], backend: 'webgpu', profiling: true,
});
const gpu = await chain.createPixelScope();
const positions = await gpu.createField({
  type: 'f32', dimensions: [count, 1, 1], components: 3,
  semantic: 'position', space: 'world-right-handed', units: 'meter',
});
const kernel = await gpu.compileCompute({
  abiVersion: 1, id: 'studio/update-position', version: '1.0.0',
  workgroupSize: [64, 1, 1], parameterWords: 1,
  bindings: [{type: 'f32', access: 'read_write'}],
  code: `fn compute(id:vec3u, local:vec3u, group:vec3u) {
    let i = id.x * 3u;
    store0(i, load0(i) + paramF32(0u));
  }`,
});
await gpu.dispatch(kernel, [positions], {
  workItems: [count, 1, 1], parameters: new Float32Array([delta]),
});
await gpu.complete(); // waits and verifies provisional writes, no pixel readback
console.log(gpu.timings()); // GPU passes, NOT full preview/user latency
await gpu.releaseBuffer(positions);
```

`examples/compute.tsx` is a real feedback-particle Stage with ping-pong buffers,
GPU initialization, integer atomic histogram and a data-driven image pass. It
uses the existing FixedStepRunner at 64fps with a reset-only checkpoint. Backward
seeks reset and replay; GPU capabilities never enter cloneable time snapshots.
`props.kind = 'field'` demonstrates a 3D depth field and fractional Z sampling;
`'buffers'` demonstrates ordered writes, copies and workgroup reduction.

## Three separate versions

| Layer | Contract |
|---|---|
| Image pixel kernel | ABI v1 unchanged; v2 adds typed, read-only data inputs |
| General compute kernel | ABI v1 below; independent of image ABI numbering |
| Data handle metadata | `kind: 'data', version: 1`, Stage-local/nonserializable |

P4 Manifest/API, TVG/Graphics document data, Surface color/Alpha and package
integrity contracts do not change. WGSL comes from reviewed native Stage code or
already verified Resources; the scope performs no network/file/module loading.
Hashes identify kernels, not authorization or proof of safe arbitrary code.

## Buffer/field and execution contract

- `createBuffer({type,length}, words?)` uses f32/u32/i32, four bytes per word.
  Allocation starts at zero; optional initialization must cover all words.
- `createField` adds dimensions `[x,y,z]`, components 1–4, semantic and optional
  immutable JSON. X is contiguous, then Y, then Z; components are interleaved.
  `origin` locates this resident ROI in full `domain` integer index space.
  Depth/normal/motion/position/velocity require explicit `space` and `units`.
  No color conversion, Alpha interpretation, normalization or unit conversion is
  inferred. Coverage, validity, units and temporal intervals are author data.
- `writeBuffer(buffer, words, offset)` copies CPU data. If earlier reads are
  recorded, an ordered staging copy preserves command order. `clearBuffer`,
  `copyBuffer`, `cloneBuffer` record GPU work. Offsets/lengths are WORDS.
- `readBuffer` first completes and validates pending work, then returns an owned
  typed CPU array. It does not serialize arrays through Stage JSON implicitly.
- Writable alias bindings are rejected. Use one read/write binding for local
  independent updates, ping-pong buffers for neighbor-dependent algorithms.
  Integer atomic bindings explicitly opt in with `atomic:true`; helpers provide
  atomic Add/Min/Max/Exchange and atomic reads/stores. Float atomics are unsupported.
- `dispatch` records work, it is not a commit. Call `complete`, `readBuffer` or
  image `readback` to await and validate. Cancellation before recording makes no
  new command; once submitted, failures latch the scope and invalidate its local
  data/images. No CPU replay. Dispose and rebuild through the Stage lifecycle.
  An AbortSignal cannot preempt an already running shader. Older commands already
  recorded remain recorded if a later operation is rejected before recording.
- `releaseBuffer` is idempotent for same-owner handles; pending GPU references
  retire after completion. Foreign handles, released usage and serialization
  fail explicitly. Chain disposal waits, invalidates all handles and frees
  owned buffers/queries. Parent renderer/geometry/resource ownership stays intact.
- Buffer/image bytes, temporary copies/readbacks and compiled kernels share the
  existing scope limits. Limits are logical allocations, not physical VRAM.

## Compute shader helpers (ABI 1)

`fn compute(global:vec3u, local:vec3u, group:vec3u)` is called by the owner wrapper.
`global` includes `dispatchOrigin`; `group` is local to this dispatch. Available:

| Helper | Meaning |
|---|---|
| `workItems()`, `dispatchOrigin()`, `domainSize()` | Explicit dispatch extent/origin/domain |
| `paramU32(i)`, `paramF32(i)` | Exact 32-bit parameter words |
| `loadN(i)`, `storeN(i,value)`, `dataLengthN()` | Linear words for binding N |
| `fieldN(p,c)`, `fieldClampedN(p,c)`, `storeFieldN(p,c,value)` | Global field integer centers |
| `fieldDimensionsN()`, `fieldComponentsN()`, `fieldOriginN()`, `fieldDomainN()` | Storage layout metadata |
| `sampleFieldN(p,c,edgeClamp)` | f32 trilinear interpolation; integer centers |

`fieldN` returns zero outside the full domain; clamping clamps to that full
domain. A coordinate INSIDE the full domain but OUTSIDE the loaded ROI is an
error (missing halo), never a silent seam. `sampleFieldN` reads eight neighbors,
including zero-weight endpoints; provide that halo for sampled tiled fields.
Linear out-of-bounds reads/writes are errors. Every generated f32 store checks
finite values, records invalid writes even if overwritten, and stores zero in
their place. CPU initialization/writes validate finite data. No extra full-buffer
validation pass is needed for this invariant; raw owner bindings are inaccessible
to the supplied body. HDR and negative finite floats are preserved.

Default `mode:'element'` guards tail lanes before calling the function.
`mode:'workgroup'` invokes EVERY lane, including padded tails, for uniform
barriers/reductions. Authors must guard tail memory accesses and keep barriers
uniform. Workgroup size and storage are checked by the device compiler/limits.
Binding types and id/version are immutable within a scope. Attributes, raw
bindings, directives and reserved `fw_` identifiers in the body are rejected.
Trusted code can still loop/race or take too long: this is not a shader sandbox.

## Pixel data and sampling

Pixel ABI v2 declares `dataInputs:[{type:'f32'}]` and `run(...,{data:[field]})`.
Use `dataN(i)` or the same read-only field helpers. Existing images remain
scene-linear color images with their existing Alpha/half-rounding checks; data
fields remain separate. Max bindings depend on the actual existing device.

`sampleN(p,clamp)` keeps **integer pixel centers**. `sampleUvN(uv,clamp)` explicitly
uses `uv * size - .5`. Do not change old call sites to `uv * size`. GPU tests
include odd/non-square sizes, fractional edges, identity and a near-zero offset
using the same sampled path (no zero-strength bypass).

## Three.js bridge

`importThreeField(gpu, renderer, floatTarget, options)` borrows a caller-owned
WebGL2 renderer/2D RGBA32F NoColorSpace attachment. Explicit channel selection,
source row origin and field semantic/space/units are required. A completion
fence is polled via MessageChannel (not forbidden Stage timer APIs), then raw
float readback is packed/flipped and uploaded. Default max readback256MiB,
timeout15s; both bounded/overridable. DepthTexture must first be resolved by the
caller into a raw float AOV. Physical RGBA layout does not make it color/Alpha.

`createThreeFieldTexture(gpu, field, alreadyImportedThree)` explicitly reads back,
pads to raw RGBA32F and creates a nearest, NoColorSpace DataTexture/Data3DTexture.
`.dispose()` is idempotent; the caller owns the existing Three renderer. Its
metadata retains field semantic/origin/domain; shader indexing must respect
those. `updateThreeAttribute` explicitly checks float/count/channels/space and
copies into an existing BufferAttribute. No hidden coordinate transformation.
Both bridges report source/readback/planned-upload bytes and **zeroCopy:false**.
No cross-context texture/device sharing, material graph rewriting or native
pointer passing. Memory includes CPU packing and two API storage domains.

## Tiling and 3D fields

`planGpuTiles({domain,tile,halo})` / `gpuTiles(plan)` define nonoverlapping write
ROIs and clipped read halos, in X/Y/Z. `dispatchGpuTiles` only splits dispatch
counts on already resident bindings; it DOES NOT shrink those buffers.

`processGpuFieldTiles` accepts explicit read/write providers, one read field and
one output field plus a kernel. It loads each halo ROI and reads only its write
ROI back, bounding GPU working data independently of full domain size. Providers
own IO; no implicit file/network access. On error `tilesCompleted`, `partialOutput`
and `atomicOutput:false` describe possible external writes. Stage authors must
publish only after success or implement transactional writers with existing
resource/state facilities. It is not a transparent out-of-core solver, cross-tile
iteration scheduler or whole-image compositor tiler. Neighbor radii are explicit.

## Limits, timing and cleanup

`capabilities()` returns actual hardware-device limits, versions, profiling
availability and no handles. `hardwareVerified` means the existing hardware gate
passed, not that a particular algorithm has run. `timings()` has explicit
disabled/unavailable/idle/pending/ready/truncated states; it borrows the existing
Core query set when chain `profiling:true`. Up to256 physical pass timings per
batch, excess passes run without timing. Sum excludes submit/transfer/compile/
readback/PNG/display. Timestamp resolution is unknown (`null`), zero is valid.

`withGpuResources(gpu, async arena=>...)` is a try/finally helper: image/buffer
adoption, custom adoption, reverse sequential cleanup, explicit `keep` transfer.
It preserves original errors and reports cleanup errors, without creating a
second owner/session. It does not replace final Stage disposal or transaction
rollback. Keep callback/arena lifetime lexical; do not retain the arena itself.

`estimateGpuImage` distinguishes F16 publication8B/px from **F32 GPU working and
professional readback16B/px**. Data storage is4B/word. Physical VRAM and CPU/driver
peak memory are unknown, never inferred from packed output size.

Persistent GPU state is caller-owned native Stage state. It is NOT automatically
enrolled in V-SHARED rollback/cache identity. Follow existing Stage cache epochs,
explicit inputs and time/state/reset rules. Do not cache changed GPU state under
an unchanged identity. General particles/physics/Puppet/fluid algorithms still
need their own determinism, bounds, convergence and numerical tests.
