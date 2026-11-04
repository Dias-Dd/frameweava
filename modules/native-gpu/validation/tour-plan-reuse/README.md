# Effect-library tour: plan resource reuse checkpoint

The user-provided 3840x2160 / 60 Hz scenes exposed a plan update on every frame. Animated particle tile-list lengths and seed bytes genuinely change; ignoring those changes would freeze or corrupt the scene. The owner previously recreated all shaders, working allocations, mesh attachments and display resources on every update.

This checkpoint retains compatible pipelines, exact-size per-slot image allocations, mesh/depth-peel attachments, the display transform/LUTs and swapchain. Bindings, CPU seeds, headers, index counts and metadata are rebuilt against the current plan. Reused images are GPU-cleared before declared-resource imports, preserving fresh-plan zero semantics even for partial writes. Reuse requires completed slots and stays inside the existing device owner. No global cache or public protocol change. Unused resources are released with the previous plan; source/WGSL identity, session, permissions and budget checks remain in force.

## Actual measurements

Windows / RTX 5070 Laptop / NVIDIA 596.49 / Vulkan. Full 4K scene-linear Rec.709 RGBA32F, unchanged effects and precision, actual native window, three slots, 6 GiB session limit. Ten warm new-frame samples (19–23 and 169–173); frame 18 and seek 168 are retained separately. These are serial caller-to-GPU-completion times, including presentation submission; physical scanout is not measured.

| Scene | Before median / P95 | After median / P95 | Improvement |
|---|---|---|---|
| No Servo | 264.24 / 276.07 ms | 89.07 / 96.74 ms | 2.97x, 66.3% less latency |
| Servo HUD | 255.13 / 267.83 ms | 92.14 / 96.24 ms | 2.77x, 63.9% less latency |

The same scenes at explicitly requested 1920x1080 proxy computation measured approximately 33–34 ms median. This is a different preview resolution, not an equal-quality A/B or a delivery optimization. Full 4K remains approximately 11 serial new frames/s, not 60 FPS. Compile takes about 8–9 s, initial owner creation about 1.5–2 s, and first Servo publication about 0.8 s; this checkpoint does not claim a cold-start improvement.

Mean plan update dropped from 185 to 16 ms (no Servo) and 179 to 17 ms (Servo). Ack-to-completion is approximately 45–51 ms and includes more than pure GPU compute. Production counters remain zero for pixel readback, pixel transfer and per-frame hashes. Exact allocated working-image bytes remain 2,392,662,528 across three slots; this excludes mesh/display/data allocations and is not peak physical VRAM. Peak process/physical VRAM was not measured. Ten samples do not establish sustained full-clip frame rate.

## Validation and known issue

TypeScript check and 8 focused actual-GPU tests pass: fresh-plan zeros across two slots, changing data sizes/seeds, shader cache invalidation, bad shader rejection, display shader/dimensions/profile/LUT invalidation, HDR/negative RGB/Alpha/blends/mask/transform/isolation, binary16 edge values and persistent-state/reset semantics.

At 320x180, four evolving no-Servo frames match original scene/display F32 bytes exactly. An initial exact Servo comparison failed at 4 text-edge pixels. A separately rebuilt original-backend repeat exhibited the same 12 RGB-value differences (max scene 0.1172145, display 0.06137538), and optimized Servo output then matched that repeated original control byte-for-byte across all four frames. This pre-existing cross-process text-raster reproducibility limitation remains; the failed run and all diagnostics are retained. It is not treated as a zero-error comparison against the first Servo capture. Two PNGs from inspected display buffers were decoded and visually checked; they are correctness captures, not production encode performance measurements.

The first new test attempt also rejected the fixture's reserved WGSL name `meta`; the fixture variable was corrected without weakening assertions. Final tests are a single 8/8 run. Validation stayed below 420 s including build/probe failures; no full-repository, installation, MP4/EXR or cross-platform campaign was run.

## Reproduction

Use this worktree's own library and reviewed SpiderMonkey/Servo bundles. Never repoint tests at another worktree's caches. The frozen TSX copies preserve the original executable content; their isolated preparation explicitly installs native-image-effects@0.5.0, the native-only baseline version. Original Main files were read only.

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
# FRAMEWEAVE_SPIDERMONKEY and FRAMEWEAVE_SERVO_RUNTIME must identify reviewed local bundles.
node --import tsx examples/effects-library-tour/prepare.mjs
node modules/native-gpu/build.mjs --release
node --import tsx scripts/profile-effects-tour.ts current
node --import tsx scripts/profile-effects-tour.ts proxy-1080 1920
node modules/native-gpu/build.mjs --diagnostics
node --import tsx --test tests/native-plan-reuse.test.ts tests/native-gpu-composite.test.ts tests/native-state.test.ts
npm run typecheck
```

For a source A/B, preserve the original native binary before rebuilding. `scripts/verify-effects-tour-reference.ts before|after` captures/compares scene and display bytes; `FRAMEWEAVE_NATIVE_GPU` chooses the diagnostic executable explicitly. Do not overwrite reference files after a failed comparison. Servo's cross-process text issue must be separately diagnosed, as in the retained control runs.

Actual preview uses the existing CLI:

```powershell
npm run frameweave -- examples/effects-library-tour/project-servo-4k60.tsx --native .frameweave/native-target/release/frameweave-native-gpu.exe
npm run frameweave -- examples/effects-library-tour/project-servo-4k60.tsx --width 1920 --native .frameweave/native-target/release/frameweave-native-gpu.exe
```

A rebuilt/reviewed native binary is required; merely updating TypeScript while retaining the old executable cannot activate these changes. No effect-library rewrites, SDK pin refreshes or new permissions are required. The next bottlenecks are dynamic frame data/plan-update serialization and the compensated large-radius Glow/Gaussian GPU workload. GPU saturation has not yet been achieved.
