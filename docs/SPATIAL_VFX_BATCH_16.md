# Spatial VFX batch16 ¡ª 15 resident GPU functions

Agent-4 `agents/agent-4`; actual baseline `50d9baacf247d2d4782597dbe509656c93ea576b`, Main-coordinated sync of GPU checkpoint98a6afd after prior aed8d659. Final module `spatial-vfx@0.1.1`. This is a developer-verified creative library, not a general GPU Compute/geometry platform or full fluid/physics engine. Main independent integration/installed-SDK/portable acceptance is pending. No Main merge by Agent-4. Commit hash is provided in the delivery message (the report does not embed a self-referential hash).

## Implemented and actually executed

Every row is a distinct kernel/algorithm and typed named import, not15 presets or aliases. All15 ran on actual nonfallback WebGPU in F32 and F16, with real RGBA/PNG output.

| Function | Actual algorithm / primary defaults | Boundary |
| --- | --- | --- |
| mandelbulb | Power8 distance estimator,8 iterations | F32 fractal approximation, no MC mesh |
| mengerSponge |3 levels of carved box SDF | Raymarched visual, no exported geometry |
| gyroidSurface | Triply periodic implicit, frequency3.2/thickness.15 | Bounded visual shell |
| voronoiCrystal |18 seeded neighbor halfspaces for a central convex cell | No fracture solver or full Voronoi tessellation |
| terrainRaymarch | Hermite value-noise fBm4 octaves, frequency.8/amplitude.8, conservative512 steps | Procedural heightfield, not terrain mesh/erosion |
| metaballVolume |3 animated compact polynomial density lobes, radius.85 | Emission/absorption volume, not previous isoMesh alias |
| planetAtmosphere | Radius1/thickness.4, RGB Rayleigh/HG single scattering,4 light-depth samples | Scalar extinction, artistic RGB; no spectral transport |
| heightFog | Height-density integration, distance8/falloff.5 | Explicit distance, no fake depth AOV |
| volumetricSpotlight | Finite cone medium, length3/angle.35rad, HG phase | No scene-geometry shadow; apex finite |
| smokePlume | Animated advected4-octave procedural density | No smoke PDE/solver |
| flameVolume | Tapered turbulent density plus authored heat-color ramp | No combustion/blackbody claim |
| waterCaustics | Three-wave Hessian/Jacobian focus, regularizer.08 | No traced water/receiver geometry |
| starfield | Seeded3D voxel DDA, parallax and radiance | Cell traversal bounded by explicit steps/near/far |
| orbitalTrails | Kepler equation/Newton8,6 orbits and analytic trail quadrature | No N-body physics/second Runner |
| gravitationalLensing | Thin point-mass lens equation, Einstein radius.15 | Image-plane operator, not full GR |

Main code: `modules/spatial-vfx/{index,types,shaders}.ts`; R1 initializer `bindings.ts`; reviewed immutable builder `scripts/build-package.ts`; editable TSX `examples/project.tsx` and `scene.ts`. Scope is borrowed explicitly:

```ts
import {createGpuEffectChain} from '@frameweave/engine/web';
import {starfield,gravitationalLensing,heightFog} from 'spatial-vfx';
const chain=await createGpuEffectChain({width,height,effects:[],backend:'webgpu'});
const gpu=await chain.createPixelScope(); // Stage init, one owner
const a=await starfield(gpu,ctx,{width,height});
const b=await gravitationalLensing(gpu,a,ctx); await gpu.release(a);
const c=await heightFog(gpu,b,ctx,{density:.1}); await gpu.release(b);
const surface=await gpu.readback(c); await gpu.release(c);
// Stage dispose: await chain.dispose(); use finally on failures too.
```

The existing SDK controls adapter admission, owner/gate, opaque tokens, numerical validation, budgets, submission/readback, resize and loss. Intermediate images stay on this same scope; no crossStage handle or new message bus. Return values are provisional until complete/readback. Logical release enables ordered reuse, not proof of physical completion. No in-place aliasing requested. On device/publication failure stop this scope, dispose its chain and explicitly recreate/replay; no silent CPU replay. Image ports remain existing Surface contracts; no P4/TVG/Core/GPU-owner/CLI/dependency edits.

## Color, time, precision and limits

Scene-linear Rec709/D65 PM F32 default, optional F16 RNE publication. Signed/HDR RGB supported by host; output Alpha finite[0,1]. Generators default640x360; image operators preserve input dimensions and require PM/opaque linear709 input, rejecting implicit straight-alpha/other-color conversion. Volumes use midpoint front-to-back Beer¨CLambert integration. PNG/MP4 explicitly use the engine's clipped sRGB preview conversion; H.264 is lossy YUV420, not HDR evidence. Raw F32 gzip files retain original float data/hash, including soft Alpha and RGB>1. All15 sampled outputs have zero hidden RGB at Alpha0.

Existing FrameContext, Signals, keyframes and seed are used; no time advance, state runner or GPU checkpoints. Default rotation follows ctx.time independently of explicit density/noise-time overrides; author may supply rotation Signal. Kernels are F32 visual math, not compensated-F64 replicas. Noise coordinates are range-checked; cross-vendor bit identity is not claimed. Camera defaults[3,2,4] toward origin,45deg/.01..20. Default48 steps except conservative terrain512. `maxWork` default16e9 configurable planning units (not FLOPs); no automatic resolution/step reduction. Host limits/device budgets remain authoritative, no automatic tiling. Some inherited generic options only affect their applicable algorithm (e.g. density for volumes).

## Sources and permissions

FastNoiseLite v1.1.1 commit `7ccfbc16eb1c932568f177d63a9ba51d89bbe516`, MIT: archived GLSL98,037B SHA256 `71c9af239e4f75617c74f74a9266fd944550edfa4ddc31920703e2cdb836cef2`, license and `vendor/SOURCE.json`. Only Hash3D/ValCoord3D/Hermite value-lattice subset ported; custom fBm is not upstream configuration compatibility. Other implementations are authored mathematical code, Apache2; no GPL/Blender/NVIDIA source copied, no new npm/WASM/native binary or second external engine. [JPL Kepler formulas](https://ssd.jpl.nasa.gov/planets/approx_pos.html) and [GPU Gems volume-rendering math](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-39-volume-rendering-techniques) are mathematical references, not source-code licenses.

Catalog evidence: explicit keyword search of the worktree-private/current built-in catalog found no compatible match (`catalog.txt`), not semantic retrieval or a claim about every external catalog. R1 local authority was explicitly approved only in a worktree-private test library, permissions network/filesystem/process false. Installed does not mean globally trusted.

## Actual tests and evidence

Commands from this worktree (PowerShell, no shared user library):

```powershell
$env:FRAMEWEAVE_HOME='\\?\'+(Join-Path (Get-Location) '.frameweave/agent4-spatial-home')
npx tsc --noEmit
npx tsx --test tests/spatial-vfx.test.ts tests/gpu-pixel-scope.test.ts tests/spatial-noise.test.ts tests/shared-state-coordinator.test.ts tests/stage-orchestration.test.ts
npx tsx scripts/verify-spatial-vfx-numeric.ts
npx tsx scripts/verify-spatial-vfx.ts docs/spatial-vfx-validation/reproduction
npx tsx scripts/inspect-spatial-vfx-evidence.ts docs/spatial-vfx-validation/reproduction
```

The verifier builds a fresh immutable candidate below `.frameweave/spatial-vfx`, installs/reviews local R1, verifies the content lock, explicitly creates only a NEW plugin/SDK lock, runs real Stage/Surface/RenderSession Final, PNG/storyboard and renderCreation MP4. It prints the prepared project path; this is also the editable CLI entry for `npx tsx src/cli.ts frame <project.tsx> --frame 60 --output <png>`, `storyboard <project.tsx> --frames 0,60,119 --output <png>`, `render <project.tsx> --output <mp4>`. Native TSX is checked through the existing compiler/R1 path, no private GPU device access. This is source-SDK/local-package verification, not independently installed SDK or portable L3 verification.

- Typecheck final: exit0,8.69s.35 distinct targeted automated cases pass (includes5 new L0 cases, not40); regression exit0/110.74s. L0 parameter bounds, Signals, cancellation preflight, camera degeneracy, layout/Alpha/color, budget and per-scope kernel cache tested.
- Actual GPU: NVIDIA/Blackwell nonfallback WebGPU.30 effect/format cases, frame100¡ú0¡ú100 replay on6 representative kernels, analytic lens identity exact, constant fog maxAbs1.28641e-7, zero-chop caustic maxAbs2.86223e-8. No tolerance relaxed.
- Independent numerical GPU probes:4 seeds¡Á32 locations incl negative noise coordinates, maxAbs9.11343e-8 vs archived official JS FNL1.1.1;32 orbit positions vs independent F64 Newton20 oracle maxAbs1.22952e-6; exact cone-apex singular case finite. Gate3e-6. This does not prove full fractal/volume image agreement with a CPU reference or spectral truth.
- Three-pass resident starfield¡úlensing¡úfog: delta3 runs,0 uploads,1 final full readback. Disposal double-safe: active images0, live bytes0, created/destroyed103/103; reused54; peak owned bytes11,061,104. Physical GPU/browser peak unknown. Not a throughput benchmark; queue/GPU timestamps not measured, never reported as zero.
- Fresh public R1 package Final: frames0/60/119/100/0/100, real PNGs, cache and new Session frame100 hash match; video640x360/24fps/5s, all120 frames fully decoded. Final campaign65.23s incl video36.84s; not an isolated initialization/GPU execution metric. Storyboard and decoded0/60/119 actually visually inspected.
- H.264 decoded-vs-lossless PNG RMSE in8bit code values:2.9161/2.1554/3.1211, max76/25/27 (subsampled bright thin structures). These are lossy codec errors, not raw GPU math errors. Raw F32/Alpha retained; full-F16 numerical oracle across all15 not separately claimed (host publication is inherited and format/finite/range are exercised).
- Cumulative command time including failures/retries and regression is under400s, below600s; `commands.json` records exact conservative sum. Repeated5-case L0 not counted as new unique cases.

Raw receipts: `spatial-vfx-validation/final-011/{result.json,image-analysis.json,storyboard.png,decoded-storyboard.png,frame-*.png,rgba*.png,*.f32.gz,spatial-vfx.mp4}`, numerical raw expected/actual in `numeric.json`, logs/command ledger/source hashes/verified fresh locks alongside. Hashes verify gzip decompression to the original raw bytes; uncompressed originals and older duplicate trial images remain local rather than duplicating large Git blobs.

Original failures preserved: WGSL required parentheses between XOR/multiplication; insufficient conservative terrain samples produced an empty image; diagnostic fixture needed a semantic version; negative-coordinate nested noise interpolation differed up to.64 from the fixed oracle. Final implementation uses explicit lattice coordinates and scalar trilinear interpolation, passing the same oracle gate. A driver/compiler root cause was NOT established. Added finite cone-apex handling and near/far clipping;0.1.0 test candidate was never overwritten,0.1.1 is a new immutable package. Original result/logs are retained; the original allPassed flag covers the assertions of that trial, not these later-added numerical tests.

Final package integrity `sha256-726fe82677199f7bbcaec8fad9a45fb7cb57254735b9ea98013f391d0bc3ed96`; main `sha256-2d3eed5d312e0cf95b9aea7adc9f76e7fdbb4e1d36603fbd548ae8a12cc6a247`, bindings `sha256-00d85453936616cb66c687395aaa8e2fa72a061b3cad4024e5890952a184860e`. Fresh SDK pin `76fce110edc0372b7007dc0ff1d9a1b046a3e8f20ffe76dcbbd04b7e6eb0de00`: new module changes SDK sources; no historical plugin/resource/version/lock was refreshed. Old paused waves WIP was preserved byte-for-byte in `drafts/agent4-paused-waves/PRESERVED.json` outside SDK scanned modules, remains unsubmitted and is not part of15 functions.

## Delivery scope and remaining work

Changed only the new module, dedicated tests/scripts/evidence/report and Agent-4 matrix append. Main owns shared GPU, Core, source-distribution and formal integration; Agent-2 animation and Agent-3 pixel/matte source untouched. Spatial heightFog/lensing are consumers of existing image contracts, not ownership changes. No Compute/writable-state/geometry API was invented.

Not supported/verified: full physics fluids/fire, scene AOV occlusion/shadows, spectral radiative transfer, adaptive antialiasing, generic GPU tiling, cross-adapter determinism, broad resolution/performance cohort, GPU-loss reconstruction during an in-flight library call, other OS/adapters, standalone installed SDK and5 portable modes. Existing scope/owner loss diagnostics and admission policies are reused, not independently reimplemented. Main may perform L3; no claim Main already accepted these15. User requested this batch commit then stop; no next batch, background task or automatic development is started.

Delivery diff check: authored files pass `git diff --cached --check` with the fixed upstream GLSL archive excluded; upstream file retains its original10 whitespace warnings to preserve the reviewed SHA256. No vendor normalization.
