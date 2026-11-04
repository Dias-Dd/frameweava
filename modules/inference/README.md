# Native inference contract v1

One model/tensor contract for native effects and host analysis callers. Scheduling remains in the existing Stage/AnalysisTask caller. No new registry, P4 ABI, TVG type or GPU host is introduced. This checkpoint adds a real **ONNX Runtime DirectML resident F32 profile on Windows**, plus an explicit host-CPU reference/fallback adapter. Optional reviewed-local CUDA/TensorRT resident adapters now reuse this contract; see `../native-gpu/native-nvidia/README.md`. Other provider names remain explicitly unavailable until qualified.

## Authoring

Use the existing `@frameweave/engine/native` Stage lifecycle:

```tsx
const model = await init.gpu.createInference({
  version: 1, id: 'studio.model',
  model: {resource: 'weights', sha256: reviewedSha256, bytes: reviewedByteLength},
  inputs: [{name: 'input', dtype: 'float32', shape: [1, 3, 224, 224], layout: 'NCHW'}],
  outputs: [{name: 'output', dtype: 'float32', shape: [1, 1, 224, 224], layout: 'NCHW'}],
  execution: {provider: 'directml', allowCpuFallback: false,
    precision: 'float32', temporal: 'stateless'},
});
// In renderAt: existing GPU compute packs an owner-local F32 data buffer.
const {output} = await init.gpu.runInference(model, {input});
// Existing compute / pixel ABI2 / mesh code consumes output on the GPU.
await init.gpu.releaseBuffer(output); // invalidate token after recording its consumers
// In Stage dispose:
await init.gpu.releaseInference(model);
```

Declare `<Resource id="weights" src="./model.onnx" kind="file"/>`. Model bytes, length and SHA must match. `examples/native-inference/project.tsx` is the runnable example with exact names/shapes, GPU preprocessing, model execution, GPU postprocessing and publication. Its upstream ESPCN model uses **SDR luminance**, not full-color or HDR model inputs. Its display shader explicitly decodes SDR Y to scene-linear Rec.709. There is no automatic normalization, gamut transform, Alpha interpretation, HDR clipping or precision conversion in the inference API.

`types.ts` separates N-D tensor shape/layout from storage handles. A tensor is a typed `GpuDataBuffer`, never an RGBA Surface pretending to be depth/segmentation/embedding data. This resident profile accepts F32, positive static dimensions and stateless execution. The shared descriptor reserves other dtypes for qualified drivers; both included drivers currently reject non-F32 tensors. Unknown fields/versions fail. Tensor names are exact, inputs must be complete, and output buffers are newly owned handles.

`createInference` records an immutable Stage-owned declaration during initialization. Actual native model admission occurs on its first requested frame. Successful declaration/probing is not successful model execution. `runInference` records work, just as other native passes do; the existing frame ticket determines actual GPU completion. Tokens cannot cross scope/Stage ownership or be serialized. After `releaseInference`, recorded commands remain valid until their frame drains; the model is retired at the next idle plan change without active passes, or at owner close. Buffer release invalidates the authoring token; in-flight native storage remains alive until safe reuse/destruction. Model recreation requires Stage reset/reinitialization, not mutation of an admitted identity.

## Provider and host service

`InferenceSession` in `index.ts` is the independently testable service used by adapters. `InferenceDriver<Tensor, Model>` owns backend-specific tensor validation/execution. `providers.ts` applies explicit provider selection and CPU permission. Requested providers are never silently substituted. Auto-selection only chooses actually available providers. Eligibility and `runtimeVerified` are distinct; the native owner sets verification only after GPU completion and successful provider-placement evidence.

`NativeGpuClient.inferenceCapabilities()` is an explicit operator-side probe using the existing owner/session. It loads the configured runtime only on request. Ordinary rendering without inference does not load ORT or create its D3D12 device. It reports actual ORT version, adapter identity, transfer mode and provider status. Per-model executed identity/placement/completion counts are in `stats().inference.models`. A missing runtime/unsupported platform remains a structured error.

| Path | This checkpoint | Hardware verification |
| --- | --- | --- |
| Windows DirectML + same-adapter Vulkan buffers | Implemented, F32 resident | RTX 5070 Laptop, driver 596.49 |
| Windows AMD / Intel DirectML | Same adapter code, hardware and import capability required | No AMD/Intel device available here |
| CPU via `ort-cpu.ts` | Explicit host-memory adapter, same source/shape contract | Windows x64 only tested |
| Windows NVIDIA CUDA13 / ORT GPU F32 | Optional reviewed-local resident adapter | RTX5070 Laptop / driver596.49 numerical proof |
| Windows NVIDIA TensorRT11.4 F32 | Optional reviewed-local direct TensorRT adapter, TF32/FP16 off | RTX5070 Laptop / driver596.49 numerical proof |
| CoreML / OpenVINO / MIGraphX | Provider identifiers and driver seam only; native profile returns unavailable | Not implemented/qualified |
| Apple Metal/CoreML or Linux resident sharing | Requires platform adapter | Not implemented/qualified |

`ort-cpu.ts` consumes caller-supplied resource bytes and rechecks declared identity and embedded-model admission. Use `InferenceSession.create(source, ortCpuDriver({readModel, maxModelBytes, maxTensorBytes}))` with `provider:'cpu', allowCpuFallback:true`. Its `ort.Tensor` inputs/outputs are explicitly host memory. It never claims GPU residency. This is the numerical reference/necessary fallback, not an automatic slow rendering path. The caller must preserve its existing resource authorization in `readModel`; this callback is not a filesystem/network entitlement.

The host service serializes calls and drains accepted work before idempotent disposal. Pre-admission cancellation rejects without executing. Once driver work starts, cancellation discards the result after completion and fails the session closed; it cannot retract submitted GPU work. Native frame cancellation and timeout continue to use the existing Renderer/process deadline and safe frame-slot ownership. No new Analysis scheduler is added. A failed driver session must be disposed and recreated.

## Resident execution and safety

`native-inference/bridge.cpp` embeds reviewed ORT C API/DirectML binding code. The existing Vulkan owner imports engine-created D3D12 buffer leases with exact version, byte length, allocation size and private fence. One auxiliary D3D12/DirectML device/queue is owned by this native runtime on the same adapter LUID. This is **not** a claim that D3D12 and Vulkan share one API device. No author-supplied handles or DLLs are admitted.

```
existing GPU compute -> F32 working buffer
  -> GPU copy into shared tensor -> external ownership + fence
  -> ORT DirectML on the same adapter -> ownership + fence
  -> GPU copy into existing data buffer -> existing pixel/compute/mesh consumers
```

The path is GPU resident, not zero-copy: one input/output GPU buffer copy remains at the interop boundary. There is no CPU tensor map/readback/re-upload, Base64, HTTP or PNG transport. CPU model parsing, graph optimization, weight admission and first-use shader compilation remain initialization work. ORT's internal waits/scratch/weight memory are not fully observable; do not interpret the bridge's zero per-run host-fence waits as proof that the runtime never waits internally. Idle retirement/close deliberately waits for safe teardown.

Existing build sealing, Resource collection and private leases carry the model. It is length/hash checked and locked against write/delete on native admission; reviewed runtime DLLs are checked/locked once per owner. No per-frame model/DLL file hashes or numerical scans are introduced. Model bytes are passed to ORT from memory. Embedded ONNX v1 rejects external_data files, custom operator domains, local functions/training graphs and stochastic operators. No custom-op DLL registration, implicit remote code/model fetching, WASI or permission relaxation is added. General native trusted-code execution boundaries remain unchanged; this is not a new arbitrary hostile-model sandbox.

ORT session options disable CPU EP fallback, disable memory patterns and use sequential execution as required by DirectML. Prebound GPU I/O plus `disable_synchronize_execution_providers=1` avoids adding a bridge CPU fence wait per run. First-run profiling verifies observed `DmlExecutionProvider` nodes and absence of CPU nodes, then stops. The existing native frame fence proves completion. The model test compares every output scalar against an independent CPU session, checks repeat/random frames and simultaneous slots, and explicitly reads back only for verification. No approximate GPU numerical check is installed in production.

Caller native memory admission includes shared tensor allocations per frame slot, source weight bytes, working buffers and normal compositor/export allocations. ORT internal allocations are additional and currently unknown; `maxBytes` does not impose an ORT allocator hard cap. Large/dynamic/control-flow/operator models may be rejected by this profile or by DirectML. Genuine model workloads must be profiled; the small ESPCN result is not a 4K arbitrary-model guarantee.

## Build and reproduce

Use the already installed Rust/MSVC/Windows SDK and the existing locked `onnxruntime-node` dependency. No toolchain/provider download is hidden in the build. The optional helper consumes an operator-reviewed runtime directory; it is not automatically installed/trusted by a package or carried inside a project.

```powershell
node examples/native-inference/fetch-model.mjs
node modules/native-gpu/native-inference/build.mjs '<installed vcvars64.bat>' node_modules/onnxruntime-node/bin/napi-v6/win32/x64
node modules/native-gpu/build.mjs
$env:FRAMEWEAVE_HOME = '<this worktree>/.frameweave/user-home'
$env:FRAMEWEAVE_INFERENCE_RUNTIME = '<this worktree>/.frameweave/inference/runtime'
$env:FRAMEWEAVE_SPIDERMONKEY = '<installed reviewed SpiderMonkey host>'
npm run typecheck
node --import tsx --test --test-concurrency=1 tests/inference-contract.test.ts tests/inference-native.test.ts tests/inference-failures.test.ts tests/inference-renderer.test.ts
node --import tsx modules/inference/validation/benchmark.ts
npm run frameweave -- frame examples/native-inference/project.tsx --frame 3 --output artifacts/inference.png --native '<native executable>' --json
npm run frameweave -- render examples/native-inference/project.tsx --output artifacts/inference.mp4 --native '<native executable>' --max-concurrency 2 --json
```

The explicit fixture-fetch command validates the pinned 240,078-byte upstream SHA before writing. Rendering never downloads it. Existing Capsule export embeds the declared model; the portable test moves the original model away before compiling/running the Capsule. Engine/SpiderMonkey/inference runtime installation remains an external, declared requirement. No P4-R1 format, trust policy, package lock or SDK pin is rewritten. Formal package identity/export wiring and SDK runtime pin review remain Main integration work; the tested example uses the already supported declared Resource channel. An independently installed package and all six export modes have not been requalified in this checkpoint.

`validation/benchmark.ts` records a fixed 64-time workload with 8 startup/warmup frames excluded from warm percentiles, actual frame-ticket completion, environment, source/build identities and raw rows. It includes TSX/JS submission + GPU inference/postprocess/compositor, excludes physical display scanout and encoding, and has no repeat-frame cache. PNG/MP4 startup/export timings are separate. The evidence preserves failed attempts rather than calling mixed batches one green run.

## Integration notes

Main approved the precise official SDK export identities `inference/{types,native,schema}.ts` and existing `spidermonkey-host/{module-resources,bootstrap}.ts`. Only those five resolved, ordinary SDK-root files are excluded from project captures. Adjacent host adapters, lookalike prefixes and arbitrary project-external sources still fail. No directory-wide entitlement, transport code or native runtime download is added. Current `runtimePin` already hashes module implementation source; the evidence records its new identity without refreshing any existing project lock.

Existing P4 module snapshot limits (48/63 MiB and the C1 64 MiB transport boundary) are unchanged. This export fix does not qualify those old limits as a configurable-capacity implementation. Model weights on the declared Resource/private lease route do not travel through a Stage's JS/WASM byte snapshot. Main owns any separate budget/transport upgrade and final distribution integration.

One existing regression test, `native-gpu-security.test.ts`, currently expects ordinary JS eval to be denied and fails with `ISOLATION_REGRESSION`. A probe through the **unmodified** SpiderMonkey transport/runtime, without loading NativeRecordingScope or inference, reports eval allowed, parent/network denied, WebAssembly/process undefined. This is recorded as an existing host/test policy mismatch, not silently skipped or asserted green; no host policy or old test assertion was changed. Main must resolve the policy/test expectation separately.

## Sources and licensing

- ONNX model: [Model Zoo ESPCN](https://github.com/onnx/models/tree/main/validated/vision/super_resolution/sub_pixel_cnn_2016), Apache-2.0; see `MODEL-LICENSE`, exact content identity in the example/fetch script. BSD300-trained Y-channel example, not a production model recommendation.
- ORT C headers: microsoft/onnxruntime `v1.23.2`, MIT, vendored unchanged with exact build pins and `native-inference/vendor/ORT-LICENSE`. Tested C API23 against installed ORT1.30.0. No new npm/Cargo runtime dependency added.
- [DirectML EP API/requirements](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html) and [GPU I/O Binding](https://onnxruntime.ai/docs/performance/tune-performance/iobinding.html). DirectML is supported by ORT; new Windows application guidance also discusses WinML. No WinML migration is included.
- DirectML/DXCompiler/DXIL runtime DLLs remain the reviewed installed dependency. This checkpoint commits no DLL/model binary bundle and does not settle redistribution terms for a future packaged native runtime; Main must review the provider's binary notices/licensing before shipping it.
