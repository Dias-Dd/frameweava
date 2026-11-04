# Native capacity and continuation

This checkpoint removes authored-workload count ceilings. It does not promise
unlimited allocation, throughput or driver/compiler support. Resource ownership,
sealed bytes, explicit permissions, deterministic time and transaction rules stay
in force. P4, TVG and Pixel/Compute ABI versions are unchanged.

| Area | Capacity policy |
| --- | --- |
| Images, buffers, kernels, passes, imports, publications, module instances | Program metadata and allocations must fit caller `maxBytes`; actual device limits still apply. No 256/1024/64/16 count gates. |
| Kernel source and parameters | Accounted metadata and actual uniform/storage binding sizes. No 256/512 KiB shader or 1024-word parameter policy. |
| Frame slots and queued work | Positive representable slot count, allocation accounting, `transport.maxQueuedBytes`. 128 is a tunable default, not a maximum. State remains ordered with one slot. |
| Servo source and controls | Explicit timeout, byte accounting and u32 control encoding. No 16 MP / 2 MiB source / 4092-byte controls / 30-second maximum. Runtime receipts and module permissions remain required. |
| Native logic | `Renderer.nativeGpu.logicLimits.maxMessageBytes/maxMemoryBytes`; u32 framing. The process memory Job and execution deadline remain enforced. No fixed nesting/node/microtask/timer counts. |
| Sealed package module snapshots | Caller byte/count budgets within message framing; exact dependency identities and SHA-256 remain checked. |
| Video/cache/probe | `resourceLimits.maxBytes/maxSourceBytes/maxRetainedVideoFrames/maxProbeBytes/timeoutMs`. Defaults are adjustable; container references still must be self-contained. |
| Preview/storyboard | `--max-concurrency`, `--memory-mib`; storyboard canvas must fit the byte budget. No 48-frame count gate. |
| GPU media shader/LUT | Reviewed source, configurable preparation bytes/deadline and actual D3D texture/SRV/sampler limits. No 512 KiB shader, eight-LUT or 128-encoder-slot policy. |

`prepareNativeMediaExport` accepts optional `{maxPreparedBytes, timeoutMs}`;
the Native service derives preparation bytes from its render budget.
Standalone host transport defaults remain 64 MiB messages / 1 GiB process memory,
but are adjustable. NativeLogicHost derives its defaults from the render budget.
The host build receipt now identifies `caller-bytes-v1`; an older receipt rejects
nonlegacy budgets explicitly. Deliver matching source, owner and host receipts.
No host import, filesystem, network or WASM authority is added.

## Actual boundaries and batching

u32 wire lengths/indices and pixel addressing, safe JS arithmetic, fixed versioned
header layout (four image inputs in Pixel ABI v1/v2), finite values, valid IDs,
color/alpha contracts, device storage/uniform/binding/dispatch/texture limits,
and serial persistent-state execution remain enforced. They are not arbitrary
effect-count ceilings. F16 logical images still use 16 working bytes/pixel.
64 KiB transfer chunks and 128-result polling batches are chunk sizes, not totals.

`createNativeReplay(...,{segmentPasses})` defaults to 768 pending passes per
same-frame submission. Recording statistics expose optional
`stateSegmentEligible`; module/mesh/ray programs stay whole instead
of being forced through unsupported continuation. The complete recording still
has byte/device admission. `maxSteps` remains an explicit adjustable replay budget;
no authored step or sample is silently dropped.

Private `stateContinuation` plans contain same-frame pixel/color/compute/state/inference updates.
They retain the existing owner's active encoder and resource leases, and emit no
visible media frame. Successful batch output commits the corresponding native
continuation. Media rollback after committed frames is rejected, not replayed into
an existing file. Preallocated inference outputs and explicit managed-state inference continuation
are supported; see `../inference/OUTPUT_BUFFERS.md`. Versioned same-frame image/data prefixes are supported; Servo/mesh/ray
continuations remain outside this profile.

## Reproduction and evidence

Run `node modules/native-gpu/validation/capacity/run.mjs NAME <node arguments>`
from the worktree. One ledger includes all builds, failures and test attempts;
it must stay below 420 seconds. Raw logs and result summaries accompany delivery.
The tests use explicit rebuilt local runtimes and a worktree-only user home.

- `tests/native-capacity.test.ts`: actual GPU workload beyond former counts,
  exact F16/F32 HDR/negative RGB/alpha, 100→0→100, bindings/parameters, queue/slots,
  byte/device rejection, replay batching and metadata.
- `tests/native-capacity-host.test.ts`: real isolated >64 MiB messages,
  long microtasks/timers, deep codec and unchanged absent IO/WASM authority.
- `tests/native-capacity-media.test.ts`: real long TSX replay to decoded PNG/MP4,
  numeric EXR and GPU HDR10 HEVC with zero CPU image readbacks.

Large source/module/state declarations are not proof of 17 simultaneous real
Servo instances or maximum VRAM workloads. Validation is Windows/NVIDIA only;
AMD, Intel, Apple, Linux and macOS are unverified. No new FPS claim is made.
Main owns catalog/SDK pin integration, independent installation and broad export
regression. Known unrelated baseline Web-removal test failures are preserved in
the campaign logs, not hidden by changing their assertions.
