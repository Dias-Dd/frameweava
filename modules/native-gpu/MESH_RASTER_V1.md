# Native mesh raster v1

`drawMesh()` now accepts optional `raster`. The old omitted mode keeps its
nearest-depth replacement behavior. These profiles operate within a **single**
mesh draw, using the existing owner/device, Surface, UV, color and lifecycle
contracts. Separate `drawMesh()` results still do not share a depth buffer.

```ts
// Binary masks / holes. A discarded fragment does not write depth.
raster: {version:1, mode:'cutout', alphaCutoff:0.5}

// Fast hardware F32 PM source-over. The caller explicitly guarantees primitive
// order from back to front. Global sorting cannot fix intersecting surfaces.
raster: {version:1, mode:'source-over', order:'back-to-front'}

// Actual per-pixel depth order, including crossing surfaces and coplanar ties.
// No author sorting, approximation, silently truncated layer count or readback.
raster: {version:1, mode:'depth-peel'}
```

`NativeMeshRaster` is exported from `@frameweave/engine/native`. Texture and flat
materials both work, with indexed or nonindexed triangles, existing transforms,
Straight/PM/Opaque texture input, and Straight/PM output. Output cannot be tagged
opaque because coverage can have holes. In the two over profiles, PM alpha-zero
nonzero RGB is emission and remains part of the blend; only alpha-zero all-zero
RGB may be discarded. Straight output cannot represent PM alpha-zero emission
through unassociation; use PM output to retain that contribution. Input colors must still equal output
colors; use explicit `convertColor`. Texture sampling remains normalized
top-left, perspective-correct, with PM filtering and the v1 UV/wrap contract.

Cutout defaults to 0.5, accepts finite thresholds [0,1], and discards alpha less
than or equal to the threshold. Accepted fragments retain their Alpha and use
nearest-depth replacement; this is **not** semitransparent source-over. Alpha-zero
holes no longer occlude back geometry. Use an over profile for soft transparency.

Source-over writes PM into an RGBA32Float target with blend factors One and
OneMinusSrcAlpha; depth testing remains enabled, depth writes are disabled. It
requires actual hardware `FLOAT32_BLENDABLE`. The existing device requests that
optional feature only when supported, including its existing Windows external
image path. Lack of the feature raises `E_NATIVE_MESH_CAPABILITY`, never a CPU,
F16 or SDR fallback. `gpu.capabilities().nativeMesh` optionally reports
`{version:1,float32Blendable,exactAdmission:"session-budget"}` from the real device handshake.
An old/unverified host may lack the field; it does not prove support. Exact
depth-peel does not require the optional F32 blending feature.

Exact depth-peel rasterizes into two alternating F32 color / Depth32Float /
R32Uint primitive-ID targets, accumulating PM source-over from front to back.
Each pass selects the next actual per-pixel depth and ID. Coplanar ties put later
submitted primitives in front. Indexed vertices are expanded in the existing
vertex shader using the owner-local u32 index buffer, not CPU geometry readback
or an optional primitive-index builtin. Single-sample raster coverage/clipping
is retained. This is exact layer ordering, not a guarantee of F64 bit-identical
arithmetic; pixel arithmetic and accumulation are F32.

Alpha and remaining transmittance are accumulated separately. Using `1-alpha`
after Alpha has rounded to one would wrongly lose extreme HDR behind nearly
opaque layers; deriving Alpha from transmittance would lose tiny nonzero Alpha.
Only genuinely zero remaining transmittance skips fully covered pixels. Final
Straight conversion and binary16 RNE happen once, after all layers. Negative RGB,
HDR and reference-white/color metadata are retained without clipping.

The exact layer bound is the submitted triangle count. There is no fixed
triangle-count ceiling and no user-supplied smaller layer cap. Resource admission
uses the existing session budget; execution retains its deadline. Three reusable
first/even/odd binding records replace per-triangle records, so their allocation
is constant rather than proportional to triangle count. GPU-written indirect draw
and dispatch commands stop geometry/accumulation after an empty layer. The CPU
still records the bounded pass list, and render-pass/clear bookkeeping remains;
do not mistake early termination for free handling of arbitrarily large meshes.
There are no CPU/GPU numerical queries, new per-frame waits, transfer hashes,
source hashes, HTTP, PNG transport or pixel readbacks in these paths.

Auxiliary raw resource budget per slot is 20 bytes/pixel for cutout/ordered over;
exact peeling uses 52 bytes/pixel plus 136 bytes and, only when
nonindexed, `4*vertexCount` identity-index bytes. The existing F32 image output,
data and parameter allocations are counted separately. Physical GPU/driver peak
memory is not measured by these byte budgets. All resources belong to the
existing admitted frame slot and are released on reconfiguration/close. GPU
indirect buffers are distinct from their current writable outputs, avoiding
indirect/storage usage aliasing. Version/threshold/header/profile validation
still occurs at admission; malformed profiles are rejected, not reinterpreted.

Private native protocol 2 adds optional kernel `meshMode`; header word 11 is the
profile (0 legacy, 1 cutout, 2 ordered over, 3 exact), word 13 is the cutoff's
F32 bit pattern. No P4 ABI, TVG, Stage DAG, package, trust or WASM policy changes.
Old binaries reject unsupported fields; rebuild the native owner and verify its
receipt. Both old and new paths share the binary16 implementation in
`src/half.wgsl`, now included in build provenance with `mesh_transparency.rs`.

Reproduce the targeted campaign:

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
node modules/native-gpu/validation/validate-mesh-transparency.mjs
```

Editable real TSX: `examples/mesh-transparency-v1.tsx`. It renders crossing cards,
transparent holes, GPU-deformed depth and HDR/negative RGB. The verifier checks
0/12/23/0 random access, exports PNG, F32 EXR and six-frame MP4, numerically
compares EXR with the explicit host buffer reference, and fully decodes MP4.
The separate frozen benchmark workload is 100 overlapping sorted cards / 200
triangles, changing new frames at 1080p/4K. It measures Native parameter/control
IPC through GPU completion, **excluding TSX recording, display and encoding**;
it is not a complete-preview or all-effects latency claim. Raw timings retain
init, first submission, all samples, median/P95, actual adapter and zero-transfer
counters. It compares valid ordered and exact strategies, not a speedup over
the visually incorrect old replacement mode. No fixed performance assertion
makes correctness tests depend on machine load.

Qualification is Windows / RTX 5070 Laptop / Vulkan. Other adapters/platforms,
SpiderMonkey, new package installation, all portable export modes and whole-repo
regression belong to integration validation and are not implied by this campaign.

Historical checkpoint `36e1b4b` validation (before removal of the former fixed
triangle cap): 28/28 tests, no skips; both typechecks; actual 640×360 PNG,
F32 EXR and fully decoded six-frame MP4. EXR RGB range is
[-0.2103366554,3.3804140091], with zero difference from the explicit GPU buffer
reference. Random 0/12/23/0 repeats exactly. The recorded campaign takes 127.54 s
including builds. Earlier focused development runs are separately retained.
For the frozen 100-card benchmark (20 measured new frames after two startup
frames), ordered-over median/P95 is 2.07/3.14 ms at 1080p and 4.13/6.06 ms at
4K; exact peeling is 14.21/15.43 ms and 26.58/28.03 ms respectively. These are
different valid transparency strategies, not a before/after speedup; power and
machine load were uncontrolled. Raw samples, actual adapter, counted resource
budgets, build receipts and media hashes accompany the checkpoint. There is no
claim of 10 ms complete preview or arbitrary high-overdraw real-time rendering.
