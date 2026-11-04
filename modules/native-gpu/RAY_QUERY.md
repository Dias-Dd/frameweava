# Native hardware ray query v1 (experimental, opt-in)

One optional pass family in the existing wgpu owner/queue and Stage DAG. This is opaque triangle **ray query**, not a path tracer, Vulkan ray-pipeline API, OptiX integration or software fallback. Default remains disabled. No P4 ABI, TVG schema, trust decision or animation-time change.

Enable only at the operator boundary: `Renderer.create(build, {nativeGpu:{executable,rayQuery:true}})`, `renderNativeProject(entry,{...options,allowRayQuery:true})`, or `frameweave frame examples/native-ray-query/project.tsx --allow-ray-query --frame 3 --output rays.png`. Preview uses the same `--allow-ray-query` switch. A module asking for rays cannot authorize itself. Owner policy is immutable; changing it requires a new owner. Missing Vulkan/hardware support fails explicitly, never substitutes CPU traversal. wgpu 30.0.1 labels its feature experimental and requires acknowledging potential implementation unsafety; the explicit opt-in is necessary even on supported hardware. Default owners do not compile the ray pipelines.

## Author API and data semantics

See `rays.ts`, `authoring.ts` and editable `examples/native-ray-query/{effect.ts,project.tsx}`. Public API:

```ts
const scene = await gpu.createRayScene({
  version: 1, invalidGeometry: 'discard', quality: 'trace',
  geometries: [{ positions, indices, id: 17, mask: 255,
    transform: [1,0,0,0, 0,1,0,0, 0,0,1,2] }],
});
const result = await gpu.traceRayScene(scene, {
  version: 1, origins, directions, tMin: 0, tMax: 100,
});
// Connect result.hits/measurements/normals to compute or pixel ABI2.
await gpu.releaseRayScene(scene);
```

- Positions: owned F32 XYZ field (`components:3`), optional owned u32 triangle index list. `count` defaults to all vertices/indices; divisible by 3. Optional row-major affine 3x4 matrix transforms object to world coordinates. Matrix coefficients and inverse must be finite/representable F32. No arbitrary coordinate cutoff. Matrices are CPU-declared small pose metadata in v1, not a GPU indirect-instance interface.
- Rays: owned F32 XYZ origins/directions, positive count. Same world coordinate convention/unit as transforms; directions are robustly normalized on GPU, so distance interval and returned distance use world units. Default interval `[0.0001,1000000]`; mask defaults to 255. Directions need not have unit length. Triangles are double-sided and opaque. No alpha-tested any-hit, curves, procedural AABB, triangle material shader or recursive tracing API.
- Instance masks are hardware 8-bit fields; custom IDs are 24-bit. These are hardware encodings, not new engine workload caps. Triangle zero-area/ray-on-edge/subnormal results follow hardware F32 traversal conventions; boundary ties need not equal an F64 CPU oracle.

Each output has four words/ray, generic **non-color** GPU data:

| Buffer | Type | Channels |
|---|---|---|
| hits | u32 | hit 0/1, custom instance ID, primitive ID, status bits |
| measurements | f32 | world distance, barycentric U, barycentric V, reserved zero |
| normals | f32 | normalized world geometric normal XYZ, front-face 0/1 |

Normal orientation follows transformed triangle winding, including mirrored/nonuniform/sheared instances. Front face means `dot(normal, normalizedRayDirection)<0`. Miss IDs are `0xffffffff`; numeric outputs are zero. Status bits: 1 nonfinite ray, 2 zero-length direction, 4 at least one invalid triangle discarded in this scene. The explicit `invalidGeometry:'discard'` policy handles out-of-range indices/nonfinite geometry/overflowed edge differences with an engine-private GPU gather: invalid triangles become degenerate; a GPU status bit exposes this. There is no CPU geometry scan, validation readback or per-frame file hash. This is not a proof against all bugs in the experimental driver/wgpu API.

## Execution, cache and lifetime

Init may declare scenes/immutable inputs and compile kernels; actual GPU operations occur during render execution. The host remaps ordinary data indices plus earlier scene-build pass indices when combining Stages. Rays run in the same command encoder/queue as existing pixel, compute and mesh passes; no second Host, device, scheduler or native-pointer transport.

Each frame slot owns its AS lifetime. Static immutable vertices/indices reuse BLAS; changed instance matrix rebuilds TLAS. Changed source-buffer identity, geometry definition or mutable GPU geometry rebuilds BLAS. Render-time compute/write invalidates the recording cache before a later trace, so `trace -> deform -> trace` sees the new geometry. Native raw build/query commands have explicit snapshot order. wgpu currently performs builds, **not refits**, even though some upstream APIs mention update modes. Stats distinguish submitted/completed rays; `runtimeVerified` becomes true only on actual completion. Initialization is not execution proof.

Release revokes the scene token immediately; recorded commands keep their resources through completion. Absent scene passes are retired at the next idle plan update, and closing the owner releases everything. Init scenes survive frame reset; render-created tokens do not. Foreign/released/disposed tokens and canceled requests fail using existing EngineError flow. Accepted GPU work cannot be retracted; existing slot cancellation, execution deadlines and device-loss cleanup remain authoritative.

Admission combines existing image/data/private vertex storage with driver-reported Vulkan BLAS/TLAS payload and build scratch sizes, across all live slots. Query limits come from the actual adapter (AS primitive/instance counts, storage binding limits and caller byte budget); no permanent maxTriangles/MiB cap was added. Scratch is conservatively summed, not assumed free. Driver allocation granularity, internal allocator arenas and physical peak remain **unknown**; reported payload is not an exact physical VRAM cap. AS budget failures close the failing owner and are structured errors. Large scenes require explicit caller budgets and real target-device tests.

## Reproduce

Use installed reviewed Rust/MSVC (or a separately qualified platform toolchain), Node and SpiderMonkey. No compiler/driver/runtime is downloaded by these steps. Keep FRAMEWEAVE_HOME in this worktree. Build sources are pinned by existing Cargo.lock/wgpu 30.0.1; new `ash` access reuses the already pinned 0.38.0 dependency.

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
$env:FRAMEWEAVE_SPIDERMONKEY = '<reviewed SpiderMonkey host executable>'
$env:FRAMEWEAVE_MEDIA_PYTHON = '<reviewed Python with OpenEXR/OCIO>'
node modules/native-gpu/build.mjs
node node_modules/typescript/bin/tsc --noEmit
node --import tsx --test tests/native-ray-query.test.ts tests/native-ray-renderer.test.ts
node --import tsx modules/native-gpu/ray-validation/benchmark.ts
```

Production build is intentionally used: explicit final buffer exports test results; authored code cannot call diagnostic readback. The reference test uses independent CPU triangle intersection, compares hit/depth/barycentrics/normals across random frames and transforms, tests GPU mutation, masks/status/error admission, two slots and scene retirement. Renderer tests cover two true TSX Stages, HDR/negative RGB/Alpha and real PNG/EXR/MP4. Benchmark records compilation, owner start, first request and each distinct request through completion separately; no readback/encoding/scanout. One-triangle numbers must not be generalized to complex scenes or used as a CPU/GPU algorithm speedup.

Measured native binary: debug profile, production features (diagnostics disabled); not a release-build claim. Qualified here: Windows 11, RTX 5070 Laptop/Vulkan/NVIDIA 596.49. AMD, Intel, Linux and macOS are untested; Metal ray query is not provided by this Vulkan-only profile. Full repo/distribution/six-export qualification belongs to Main integration. SDK content identity changes; no old lock/trust/WASM permission was silently refreshed.

## Upstream and license

Implementation uses existing locked wgpu/naga 30.0.1 (MIT OR Apache-2.0) and ash 0.38.0 (MIT OR Apache-2.0); new engine code follows repository Apache-2.0. No proprietary SDK is shipped. Source/API review: wgpu `src/api/blas.rs`, `src/api/tlas.rs`, wgpu-types `features.rs`, wgpu-hal `src/vulkan/{device.rs,command.rs}`, and the pinned [ray_scene example](https://github.com/gfx-rs/wgpu/tree/v30.0.1/examples/features/src/ray_scene). Experimental acknowledgement and read-only Vulkan build-size query are confined to `src/ray_policy.rs`; crate-level `deny(unsafe_code)` stays in force elsewhere.

## P1 integration boundary

| P1 area | Current actual scope |
|---|---|
| Vulkan RT | This opt-in opaque triangle query path; no complete ray pipeline/path tracer |
| FFmpeg/hardware media | Existing `NATIVE_MEDIA_GPU.md`, `native-video`, native encode and AU-1 audio reused; not newly invented or requalified in full here |
| OpenColorIO | Existing GPU OCIO and reference paths reused; no arbitrary transform equivalence claim |
| OpenEXR | Existing RGBA16/32F read/write retained; `src/media/ocio_bridge.py` explicitly stacks RGBA, not Deep/multichannel |
| OptiX | No SDK installed/adapter implemented. [Official SDK download](https://developer.nvidia.com/designworks/optix/download) requires license acceptance; not silently accepted or advertised available |
| OpenVDB/NanoVDB | No native sparse-volume backend implemented. Existing dense 3D fields are not renamed sparse VDB support |

P1 is not all complete. Remaining OptiX/VDB/Deep work needs separate native dependency/resource-format integration and qualification. Minimal proposed next seams: opaque owner-local sparse-volume token + declared verified VDB/NanoVDB asset + existing compute dispatch; explicit non-color named/deep channel buffers and typed EXR I/O; OptiX only behind an optional same-owner external-resource adapter with SDK/license review. Do not pretend a successful triangle query supplies these systems. Formal R1 identity/catalog/distribution, CLI help integration and final SDK Runtime Pin are Main-owned integration items.
