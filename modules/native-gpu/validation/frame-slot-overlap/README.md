# Native frame-slot overlap checkpoint

On the user's two unchanged 3840x2160 / 60 Hz / scene-linear Rec.709 RGBA32F tour projects, the actual native preview loop rendered all 240 frames. After excluding initialization and the first ten playback frames, both workloads sustained approximately 99% NVML GPU busy utilization. The user accepted that measured saturation as completion of this performance goal.

| Actual continuous preview | New-frame completion FPS | GPU mean / median / P05 | Queued latency median / P95 |
|---|---:|---:|---:|
| No Servo | 16.12 | 99.05% / 99% / 99% | 117.37 / 146.28 ms |
| Servo HUD | 16.01 | 99.03% / 99% / 99% | 119.09 / 134.95 ms |

NVML was sampled every 200 ms inside the steady interval; its driver averaging window is not per-frame shader timing or peak ALU occupancy. The 230 warm new-frame samples include actual GPU completion; physical scanout was not measured. GPU clocks averaged 2594/2570 MHz and power 79/80 W. Whole-system sampled VRAM peaked at 6405/7096 MiB; this is not owner-only memory. No foreign native GPU process was observed immediately before the run, without a system-wide exclusivity guarantee. Windows / RTX 5070 Laptop / driver 596.49 / Vulkan; other operating systems untested. Power policy was not changed.

## What changed

The existing Renderer and native owner now accept private `frameBindings` v1 alongside `submit`/`submitBatch`. An already completed slot can receive current non-persistent CPU buffer seeds and lengths, pass headers, dispatch groups and draw counts while other slots continue executing. Shaders, module definitions, resources, selectors, port layouts, permissions and the session remain admitted and unchanged. Reused image allocations retain fresh-plan zero semantics; immutable buffers and pipelines remain shared. Mutable storage is released before replacement. Full batch preflight validates candidate shape, resource bounds and the complete session budget before submissions.

Persistent state and externally published data buffers retain their previous path. Structural, capacity, immutable-source or module changes still use the original global reconfiguration boundary. An ordinary submission after a frame-local update restores its original admitted defaults. The control protocol is private; TVG, P4 ABI, animation and effect APIs are unchanged. An old native binary explicitly rejects the new fields. Build and review the matching native executable when integrating.

The preview scheduler now retains two slots when its admitted capacity permits, rather than reducing slow playback to one slot and serializing logic preparation behind GPU completion. A state/budget-limited single-slot workload remains single-slot. Throughput scheduling is unchanged.

Duplicate equal shader bodies need their own existing automatic pipeline-layout identity preserved. This was exposed by the real project, fixed with index-preserving pipeline reuse, and covered by an additional regression. Export packing pipelines are also reused with their matching bind groups.

Global program updates fell from every frame to one initialization; each continuous run used 239 frame-local updates and peaked at two submitted in-flight frames. Production preview counters remain zero for image readback, pixel transfer, per-frame hashes and numerical-validation passes. No effect-library rewrite or permission change is needed.

This is a utilization/continuous-throughput checkpoint. It does not claim a serial latency improvement: the current isolated serial samples are approximately 97–99 ms, compared with 89–92 ms in the previous checkpoint. Nor is the new continuous 16 FPS directly comparable to a previous serial FPS calculation. The actual two-slot queue accounts for the higher per-request completion latency shown above. 4K60 and 10 ms have not been reached.

## Validation

Final targeted batch: 9/9 tests passed (`native-frame-bindings`, `native-gpu-v2`), plus TypeScript checking. An earlier 7-test state/resource batch passed before the pipeline-identity correction and is kept separately. Cases cover independent three-slot data, changing logical lengths, restoring legacy submit defaults, malformed/immutable/budget rejection, batch atomic preflight, duplicate pipelines, scheduling floor and admitted single-slot limits. One initial new fixture expected a budget error beyond the existing typed-buffer limit; separate assertions now cover both existing error boundaries.

Both actual TSX scenes were evaluated at 320x180 for four evolving frames: scene and display F32 values match forced full-plan updates exactly in the same live instance. This is correctness-only, not the 4K performance measurement. Multi-slot seed isolation was separately tested. The previously observed Servo text-edge differences across fresh instances/processes remain outside this guarantee.

An actual TSX-to-H264 NVENC export produced six decodable, nonblank, distinct 320x180 frames. Two numerical-scene PNGs and a decoded video frame were visually checked. The initial real-scene pipeline-layout failure is retained; no assertion was relaxed to hide it. The successful correction is covered by the duplicate-pipeline test and complete real-scene runs.

Cumulative targeted validation was approximately 413 seconds, including failed probes and builds, below the 420-second campaign limit. Full-repository, installation, HDR format encoding, all six portable export modes, and cross-platform suites were not rerun.

Shared-memory Gaussian, partial parallel Gaussian accumulation, and conditional peel-clear probes did not produce a reliable benefit and were removed from production changes. A cumulative pass-prefix probe isolated the actual PA guarded Gaussian at roughly 29 ms and mesh at roughly 7 ms in a roughly 49 ms headless GPU-completion workload. Those prefix tests are isolation measurements, not new-frame FPS or GPU timestamps. The user then prioritized host scheduling and saturation; no effect algorithms changed in this checkpoint.

## Reproduce after rebuilding the reviewed local native runtime

Use the worktree-local FRAMEWEAVE_HOME and reviewed SpiderMonkey/Servo bundles, as in the prior tour-plan-reuse checkpoint. Never silently change existing package or SDK locks.

```powershell
node modules/native-gpu/build.mjs --release
node --import tsx scripts/profile-effects-preview.ts frame-slots 240
node modules/native-gpu/build.mjs --diagnostics
node --import tsx --test tests/native-frame-bindings.test.ts tests/native-gpu-v2.test.ts
node --import tsx scripts/verify-native-frame-bindings.mjs
npm run typecheck
```

Ordinary `frameweave <project.tsx>` native preview uses this route automatically with the rebuilt binary. Raw timing rows, utilization samples, build receipt, numerical/media checks, original failures and real media accompany this file. No Main synchronization or merge was performed.
