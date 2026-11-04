# Reviewed local CUDA and TensorRT inference

This optional Windows adapter reuses the existing native inference API, Vulkan owner, GPU frame slots and D3D12 external-buffer/fence bridge. It adds ORT CUDA and direct TensorRT execution. It is not an arbitrary CUDA/PTX plugin loader or a second GPU Host. OptiX headers are acquired for the separately authorized ray adapter; their presence does not implement that adapter.

Use existing `createInference`, `runInference`, `releaseInference` with `execution.provider:'cuda'` or `'tensorrt'`; default authoring may retain `'auto'`. Exact positive static F32 shapes, stateless execution, embedded standard ONNX and sealed model Resource identity remain required. Symbolic ONNX inputs are specialized to the caller's declared fixed dimensions, and TensorRT's built output shape is checked again. No dynamic-shape authoring contract is added. TF32 and FP16 are disabled; no CPU or other-provider fallback is enabled. Models still require their own license and explicit pre/postprocessing; the qualified ESPCN fixture is SDR luminance, not generic HDR enhancement, SAM or Roto.

Native auto uses a configured DirectML runtime first (legacy behavior), otherwise a configured CUDA runtime, then TensorRT. Explicit providers never substitute one another. Configured runtimes are loaded lazily; ordinary non-inference rendering loads none of them. Each runtime uses the exact native adapter LUID; its auxiliary D3D12 device and CUDA stream/context are private to the existing owner. Multiple providers can coexist in an owner. They do not share one API device.

## Build and operator configuration

Windows x64, installed MSVC and CUDA **13.4**, RTX 5070 Laptop/driver **596.49** are the tested environment. No compiler is downloaded. The operator explicitly authorized local NVIDIA SDK use; this checkpoint **does not redistribute SDK/runtime binaries**.

```powershell
python modules/native-gpu/native-nvidia/prepare.py --accept-local-nvidia-license
node modules/native-gpu/native-nvidia/build.mjs '<installed vcvars64.bat>'
node modules/native-gpu/native-nvidia/build.mjs '<installed vcvars64.bat>' --cuda
# Rebuild the ordinary owner through its existing build.mjs after Core changes.
$env:FRAMEWEAVE_TENSORRT_RUNTIME = '<worktree>/.frameweave/nvidia/runtime-tensorrt'
$env:FRAMEWEAVE_CUDA_RUNTIME = '<worktree>/.frameweave/nvidia/runtime-cuda'
```

Fixed upstreams: TensorRT **11.4.0.106 CUDA13.4**, ONNX Runtime GPU **1.30.0**, cuDNN CUDA13 **9.27.0.42**. OptiX **9.1.0** source headers are a future integration dependency. `prepare.py` uses official fixed NVIDIA/GitHub/NuGet/PyPI release URLs, records SHA256, and verifies the whole pinned ORT/cuDNN archive hashes. TensorRT uses HTTPS exact ranges, ZIP CRC/length and materialized file hashes; it does **not** claim a whole-archive hash. The script is an explicit build-time operation, never a Stage/runtime downloader. Dependencies, their licenses and build receipts stay in the ignored worktree cache. See [TensorRT installation](https://docs.nvidia.com/deeplearning/tensorrt/11.4.0/installing-tensorrt/install-zip.html), [OptiX license](https://github.com/NVIDIA/optix-dev/blob/v9.1.0/LICENSE.txt), and each acquired package's notices before any future distribution decision.

Runtime admission requires an exact known profile/provider/file set and operator `trusted_local` receipt. Files are hashed and opened without write sharing before DLL loading, once per owner/runtime admission, not every frame. Only exact receipt-verified private DLL paths are preloaded for delayed vendor dependencies; no global PATH/DLL-search relaxation or arbitrary DLL loader is installed. A build failure removes its old admission receipt so an obsolete binary cannot silently pass as a successful rebuild.

## Transfers, placement and lifetime

The native Vulkan owner copies inputs on the GPU into slot-local shared D3D12/CUDA buffers; CUDA/TensorRT waits on an imported D3D12 fence, enqueues work, then signals that fence. Vulkan waits on the GPU and copies outputs into its existing owned buffers. This is **GPU-resident with GPU copies**, not zero-copy. Each run copies the sum of input and output tensor byte lengths; allocation rounds each shared tensor to 256 bytes plus D3D12 allocation alignment. Two frame slots own distinct buffers and TensorRT execution contexts. ORT uses one owner stream and slot-local bindings.

Pixels do not return to CPU in the bridge. Model weights, builder plans and small parameter/placement metadata use host memory during admission; backend-managed GPU memory, internal vendor waits and physical peak memory remain **unknown**, not zero. TensorRT engine building and debug-build SHA validation make cold admission expensive. No new per-frame hashes or numeric scans are added. Terminal numerical test exports are explicit readbacks and are counted separately.

CUDA placement evidence is the actual ORT execution profile with CUDA nodes and no CPU nodes. Direct TensorRT is not labeled an ORT provider: its `TensorRTNative` marker records a successfully built/deserialized F32 engine and successful `enqueueV3`; `runtimeVerified` is set only by existing native frame completion. Device lost, missing/mismatched runtime, unsupported model/shape or invocation failure returns an existing structured inference error. Cancellation is existing frame/owner cancellation, not hardware kernel preemption. Retirement drains existing GPU tickets before releasing external leases, contexts, sessions and streams; no per-run bridge host-fence wait is added.

## Frozen verification scope

`tests/nvidia-inference.test.ts` drives the real existing recorder/client with the sealed ESPCN Resource and independent ORT CPU reference: frames 0/3/5/1/0, repeated exact outputs, two simultaneous frame slots, shrinking to one slot and disposal. Max errors are approximately 1.02e-6 CUDA and 7.16e-7 TensorRT. Warm distinct-frame completion is about 3–11 ms for this small model; it excludes terminal numeric readback, display and encoding. Cold first frames were about 25 s CUDA and 36 s TensorRT in the **debug** owner, including runtime integrity loading and model preparation. These numbers are not 4K preview or general model throughput claims.

Current Core DirectML numerical/slot/retirement regression and TypeScript checks passed. Raw failures, exact receipts and result/source versions are retained; no single combined all-provider-green run is claimed. Full TSX/R1-installed CUDA/TensorRT media, other GPUs/OS, release-build throughput and untrusted-model fuzzing are not yet qualified. Main owns final packaging, Runtime Pin and combined distribution acceptance. The SDK preparation's new common download wrapper is syntax-checked; its individual acquisition operations were actually run and verified in this worktree, rather than redundantly downloading all SDKs again.

## OptiX opaque-triangle queries (optional)

The same authorized `gpu.createRayScene({version:1, backend:'optix', invalidGeometry:'discard', geometries:[...]})`, `traceRayScene` and `releaseRayScene` API selects OptiX. Omitting `backend` keeps Vulkan. The existing operator `--allow-ray-query` / `nativeGpu.rayQuery` permission is still required. No CUDA pointer, SBT, module path or authored OptiX shader crosses the authoring boundary. Results keep the existing hit/id/primitive/status, physical distance/barycentrics and world normal/front-face buffers; they are data, not colour images. Inputs may be updated by earlier GPU compute passes.

Example: `examples/native-optix/project.tsx`. Explicitly configure `FRAMEWEAVE_OPTIX_RUNTIME` to the reviewed local runtime directory and pass `--allow-ray-query` to the native render service/CLI. No runtime acquisition or provider substitution occurs. Missing runtime, changed files, unknown backend, invalid geometry/ray layouts or actual-device allocation excess fail with structured `E_NATIVE_OPTIX_*` / existing ray contract errors. The fixed shader only handles opaque triangles, including masks and nonuniform/reflected affine transforms; it is not an OptiX denoiser, full integrator, custom intersection/SBT system or volume renderer.

Build (Windows, operator-authorized SDKs only):

```
python modules/native-gpu/native-nvidia/prepare_optix_compiler.py --acquire-reviewed-cuda-tools
node modules/native-gpu/native-nvidia/build.mjs "<existing vcvars64.bat>" --optix
node modules/native-gpu/build.mjs
node --import tsx --test tests/native-optix.test.ts tests/native-optix-renderer.test.ts
node --import tsx modules/native-gpu/validation/optix/hdr.ts
```

Preparation is a separate explicit opt-in, not a build-time surprise. It verifies fixed SHA256 archives from NVIDIA's official CUDA redistributable endpoints and extracts only a private worktree toolchain; it never runs an installer or changes a driver/PATH. Header/compiler per-file integrity is checked during build. Current qualified combination is OptiX9.1 / compatible CUDA13.0.2 OptiX IR compiler (13.0.88 nvcc), existing MSVC14.44, CUDA13.4 host runtime and NVIDIA596.49 on RTX5070 Laptop. CUDA13.4 OptiX IR was too new for this driver's OptiX JIT; original failed attempts remain in the evidence. No IR version rewriting, unsupported-compiler bypass or driver replacement is used. The exact three-file runtime admission receipt covers the bridge DLL, cudart and fixed OptiX IR, retained under read locks for its lifetime. SDK license acceptance is for local development only; no vendor binaries are distributed in this repository/package.

The existing native owner sanitizes triangle vertices/indices using its existing GPU gather shader. Each ordered OptiX query owns slot-local shared D3D12/CUDA tensors, GAS/TLAS, scratch, SBT and pinned metadata. The actual adapter LUID must match. Vulkan -> shared tensor and shared tensor -> Vulkan transfers are GPU copies with imported GPU fence waits/signals, not zero-copy and not host pixel/geometry readback. One wgpu owner additionally creates an auxiliary D3D12 device and CUDA context/stream. Small instance/SBT/launch metadata is copied from pinned CPU memory each query. The current implementation rebuilds AS per query; it does not yet cache/refit AS or qualify OptiX as faster than Vulkan.

Driver AS/scratch sizes and D3D12 allocation sizes are queried and checked against the remaining session budget before allocation, including retained query slots. Frame-capacity estimates do not predict vendor-managed/driver physical memory; actual preflight can reject an optimistic slot count. Scene/ray-count layout changes require the existing idle program reconfigure, which retires external leases/AS. Repeated disposal is safe. No new per-frame file/hash/numeric scan or bridge host-fence wait is added; GPU dependencies and frame completion remain necessary. Vendor internal waits/physical peak memory are unknown. Cancellation uses existing frame/owner cancellation, not hardware kernel preemption.

Current verification covers CPU numerical reference, GPU-updated geometry, masks/statuses, positive/reflected transforms, two frame slots, random/repeated frames, permission/runtime/hash/budget rejection, active runtime file locks, retirement, real TSX/two Stage and PNG/F32 EXR/MP4/HDR10 media. Ray completion timings at 160x90 are for this small test only, excluding terminal export, display and encode; they are not 4K preview performance. HDR10 passes existing GPU OCIO -> NVENC and has no CPU pixel readback/upload. Main owns final installed R1 distribution and Runtime Pin; other vendors/OS, release throughput, fuzzing, OptiX denoising and full production workloads are not qualified.
