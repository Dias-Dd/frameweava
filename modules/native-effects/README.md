# Native-only rendering

Web pixel execution, the Web Adapter/PNG bridge, browser compositor and old Web effect package builders have been removed. Servo, SpiderMonkey, React and the optional Chromium JS logic host remain; they record Native GPU commands, not Web pixels. Source shaders, parameter contracts and independent numeric references are retained for Native execution. Old `engine="web"` projects fail with `E_WEB_RENDERER_REMOVED`.

# Native effect library

## Main managed package

The formal R1 identity is `native-image-effects@0.5.0`, authority
`local:frameweave.gpu-images`. This is a breaking Native-only release. The former Web/Surface packages and their browser GPU owners are removed. The built catalog carries the real typed adapter
and its transitive effect sources, retaining source hashes and MIT notices.
The SDK, recording scope and device owner are supplied by the installed engine.

```sh
frameweave packages install native-image-effects@0.5.0 --project ./project.tsx --trust local:frameweave.gpu-images
frameweave packages inspect native-image-effects --project ./project.tsx
frameweave frame ./project.tsx --frame 0 --output ./frame.png
frameweave render ./project.tsx --from 0 --to 1 --output ./clip.mp4
```

Use ordinary `import {processImage, imageStats} from 'native-image-effects'`
inside a Native Stage. `processImage` takes a Stage-local `GpuPixelImage` and an
async recipe exposing 81 typed image operations plus the bounded input tool. Each Stage gets a separate
initializer/borrowed lease, including when two factories share the same import.
The managed initializer owns cleanup; authors do not dispose the native device.
Group sequential effects within one recipe: its returned handle expires on the
next recipe call. `imageStats()` measures recording, not GPU completion.
Missing hardware fails explicitly; there is no CPU/Canvas8 fallback.

The editable managed example is `examples/native-image-effects/project.tsx` in
the engine package. Copy it to a project directory and install the package there.
For a source checkout, build the read-only catalog using
`node --import tsx modules/pro-animation/scripts/build-catalog.ts`, then pass the
printed catalog path to `packages install` with `--add native-image-effects@0.5.0`.
No builder installs packages, grants trust or changes existing locks.
`--from` and `--to` use seconds; `frame --frame` uses a frame index. The 0.1.0
and 0.1.1 snapshots remain immutable. Version 0.2.0 adds 57 resident image
operations and `processRaster`/`rasterStats` for 23 raster operations. The two
recipes retain separate option contracts for `exposure` and `applyMatte`:
100 callable bindings have 98 distinct names. These reuse existing algorithms.
See `RASTER.md` for raster colour/Alpha/budget boundaries. Automatic statistics, bounded image import and Inner Shadow are available in the current Native source/package. This release
does not add spatial/particle/Servo/SpiderMonkey capabilities or modify Core.
The typed transitive source package is eligible for the existing Flat linker;
actual portability results are qualified independently for each release.

Main integrated the separate owner dispatch fix `a48f589` and evidence
`6ea0b935` for large EXR packing. The 1080p failure below is preserved historical
checkpoint evidence, not a reason to remove or rewrite the original failed log.
Main qualification results are recorded separately from the author's campaign.

Native-only source-backed entry. The migration scope is **all integrated
effect libraries, regardless of author**. `inventory.json` audits all 14 actual
module manifests, named exports and declared factory methods. Utilities, types,
factories and lifecycle methods are not counted as migrated GPU effects.
The audit describes this worktree's source, including preserved pre-existing
drafts; it does not certify package contents as immutable or installed/trusted.

Current user priority is image filters, optical/colour/channel, masks, keying
and compositing. New particle, spatial and Puppet work is deferred; prior frozen
spatial checkpoints are retained. The [raster entry](raster/README.md) adds 23
legacy Surface counterparts without changing the old API (98 distinct image
names across both Native APIs, accounting for their two overlapping names).
The [PA cleanup entry](pa/README.md) also supplies original PA Blur/Glow
contracts, sine/RG-map displacement, coverage ink and Inner Shadow. All source
entries now total117 bindings/110 distinct image-operation names, with duplicate
names and generators explicitly accounted for. Subsequent work is grouped by
effect family: complete that category's migratable chain, then one coherent
targeted validation campaign including any necessary failure repairs.
This PA source entry and same-frame input-retention improvement are unreleased;
they are not features of the immutable0.2.1 package documented above. Main owns
the next package version. The new owner image-view/resource interfaces are now
present after authorized sync. The [colour successor](color/README.md) exposes
all four automatic statistics methods and restores explicit workingColor across
the Raster/PA entry points. These are source additions for a new immutable
package, not a rewrite of the installed0.2.1 contract.

The [Core/builtin cleanup](builtin/README.md) supplies seven additional source
contracts, four distinct names, after checking the actual legacy plugin and
Core manifests. It includes sigma0..200 via typed weights, brightness, centred
transform, four-mode mix and the legacy Glow/Displacement/preset float contracts.
These are explicit professional counterparts, not Canvas8 byte-equivalence or
automatic legacy-plugin remapping. Motion Blur still requires upstream temporal
sampling; Native admission uses actual device/session budgets. Root legacy entries and pure/deferred boundaries are included in inventory.

The [input closure](io/README.md) restores original `importImage` under the
existing owner's explicit CPU-input budget, and qualifies the declared resource
path for larger/static float/ICC inputs. It adds one input helper, not another
pixel algorithm. All82 ProfessionalFilters methods now have Native source
contracts; earlier package/verification snapshots retain their own scope.

## First frozen chain

`examples/combined.tsx` is editable TSX. It uses the original mesh-deformation
`twistPositions` compute kernel and twenty unchanged image algorithms in one
Stage: brightnessContrast, tint, tritone, colorBalance, blackAndWhite, filmGrain,
vignette, sobelEdges, reliefLighting, pixelate, darken, lighten, difference,
exclusion, overlay, hardLight, linearBurn, subtractBlend, linearLight, pinLight.
`examples/isolated.tsx` runs the identical parameters/order as 21 Stages.

```ts
const effects = createNativeImageEffects(init); // existing NativeStageInit
// Inside renderAt(context, inputs):
return effects.processImage(inputs.image, async (image, fx) => {
  image = await fx.colorBalance(image, {highlights: [.02, 0, -.01]});
  return fx.vignette(image, {amount: .2});
}, {context});
// Stage dispose: await effects.dispose();
```

The input/output is an opaque `GpuPixelImage`, not a CPU Surface. This is an
additional Native entry; existing Surface APIs, parameters, defaults and kernels
are unchanged. Use declared surface PortRefs between Stages. Do not serialize or
retain GPU references across frames. The owner controls device admission and
resource tokens; this adapter never creates or disposes an owner/device.

Each recipe releases its scratch images and retains only its result for Stage
publication. A subsequent call can reuse that result as its input in the same
frame; otherwise it expires. Data scratch is released after success/failure.
Explicit close is idempotent;
concurrent recipes reject. Cancellation is checked before delegation. Recording
statistics explicitly say `recorded-only`: `complete()` is not a Native GPU
completion fence. Accepted work follows the existing owner contract, without
implicit replay. Immutable geometry seeds persist; transformed fields/images are
per-frame. This is not persistent mutable simulation state.

## Qualified evidence and reproduction

Run `node modules/native-effects/validate.mjs <phase>` from the worktree root.
Phases: build, diagnostics, types, unit, gpu, contracts, performance, media,
extended, extendedChain, extendedMedia, regression.
The ledger retains failed attempts and enforces one cumulative <420s campaign.
Production and diagnostics binaries are built locally, locked/offline. Test home
is always this worktree's `.frameweave/user-home`. No locks/trust are refreshed.

Raw evidence is `artifacts/native-effects/checkpoint-1/`. The current campaign
uses hardware Vulkan on NVIDIA RTX 5070 Laptop, driver 596.49; exact capabilities,
power scheme, samples and execution counters are recorded. Other adapters/OSes,
software GPU, Servo and SpiderMonkey are **not qualified by this checkpoint**.

* All 20 functions: actual TSX→TVG→Native GPU, full small-image F32/F16 comparison
  against existing independent F64 equations; HDR, negative RGB, Alpha 0/.125/.5/1.
* Full 20-call chain: frames 12,0,6,239,0,12, repeated bytes identical; independent
  equations and original mesh twist equation checked. No Half fusion/reordering.
* Real lifecycle: invalid return, failed recipe, cancellation, concurrent call
  rejection, repeated disposal, owner remains alive; all through a real Stage.
* Matched 20-effect A/B, new frames n=20: 1080p median/P95 49.41/55.22ms isolated
  vs 14.26/15.67ms combined; 4K 69.87/80.88ms vs 33.76/37.52ms. These measurements
  belong to frozen source commit `22c1100676bc5c467c6a967efcb75b5eb55297f4`,
  not a performance qualification of subsequent lifecycle/API additions. Raw repeated/random
  frame samples and cold initialization are separate. This measures Node request
  through JS recording and GPU completion, **not Web→Native speedup**, scanout or
  encoded-file completion. A then B ordering is a limitation; no isolated thermal
  calibration or vendor-independent speed guarantee. No per-effect upload/readback;
  kernels reused, one device. Owner allocation and release counters are in logs.
* Production 960×540 Float32 EXR: A/B decoded pixels exactly equal. PNG initial,
  middle, final and out-of-order frames decoded; actual image visually inspected.
  Four-frame H.264 MP4 independently decoded. MP4 is lossy SDR, not HDR/PCM proof.

## Frozen extended image checkpoint

`createNativeProfessionalEffects(init)` adds the remaining **57** available
resident image operations, for **77 distinct** operations in total. The typed
name list is `additionalNativeEffectNames` in `extended.ts`; existing names,
parameters and kernels are reused. Native bindings `processImage` now exposes
this superset; the smaller `createNativeImageEffects` recipe remains compatible.
At that frozen checkpoint `importImage`, autoLevels, autoContrast, autoColor and
equalize were absent. The colour successor above qualifies the four statistics
methods; unrestricted Surface import remains separate.

The 57 additions include core colour/keying/unsharp (7), matte cleanup (5),
foundation spatial/colour/channel/generator/denoise operations (45). All **114**
effect×format cases pass the original 3e-6 F32 / 6e-4 F16 scaled error budgets
against independent existing equations. No tolerance was relaxed. Native scratch
release adapts Web's idempotent cleanup only for locally allocated recipe images;
foreign resources still reach the owner's strict check. Internal scratch buffers
remain GPU-resident and are cleaned on cancellation/failure.

`examples/extended-chain.tsx` composes exposure → channel mix → levels → curves →
unsharp → despill → seeded animated noise → video limiter → extract/close/feather
matte → apply matte. F32/F16 full-image comparisons at 12,0,119,239,0,12 pass;
repeats are byte-identical. The diagnostic fixture retains the original source
through the last pass because dead GPU allocations may be reused. A first failed
attempt read a dead/reused source; its log is retained. The full-chain animated
noise oracle uses an exact uint32 seed, avoiding the old numeric-option helper's
F32 conversion of large seeds; that failed oracle attempt is retained too.

The extended chain's EXR/PNG/MP4 checks are recorded separately from the first
chain: actual F32/F16-working-path EXR decoded finite with negative/HDR RGB,
PNG decoded and visually inspected, three-frame H.264 independently decoded.
The EXR encoder writes Float32 channels for both working formats, as requested
by the existing Native media service; this is not a Half-file encoding claim.
The first checkpoint's timing figures are not extrapolated to all 77
operations or this new chain. No install/portable/Servo/SpiderMonkey/full-repo
qualification is claimed; Main owns those integration gates.

## Known limits and remaining migration

Native deliberately omits production per-publication GPU numeric scans (owner
policy). `publication-policy.json` proves Alpha=2 can be corrected to 1 by a later
pass. Valid-domain numerical semantics are tested; Web's invalid-intermediate
rejection is **not** claimed. Keep finite/range parameter checks and explicit
diagnostic/oracle qualification. Do not add implicit scans or change owner policy.

The first real1080p Float32 EXR attempt failed the old encoding pack's1D dispatch
limit (129600 groups>65535), fixed independently by Main as noted above. Both
resolutions' earlier GPU execution alone did not prove final media output. The
original failure remains in `10-media/raw.log`; this colour campaign's small
media tests do not independently requalify4K final encoding.

Remaining inventory is not marked migrated just because methods exist:

| Library / category | Remaining Native work / boundary |
|---|---|
| Resident core/matte/foundations | 81 image operations plus explicit importImage source helper now qualified. Owner upload budgets remain; larger/static inputs use sealed declared resources. No effect-local readback/upload workaround. |
| Legacy gpu-image-effects facade | All23 visual operations have additive Native counterparts; the colour successor qualifies explicit workingColor. Valid-domain restrictions and structural opaque proof remain. See raster/README.md and color/README.md. Existing Surface API and old Inner Shadow draft remain untouched. |
| spatial-vfx / spatial-compute / spatial-fields | Native bindings now cover VFX15, Compute15, fields15 + depthRangeMatte, with actual GPU qualification. See spatial/README.md: VFX original-API equivalence is exact on the same Native owner; Web/Native cross-API full-image differences are explicitly not parity-qualified. CPU readback/capture helpers remain separate boundaries. |
| mesh-deformation | All15 operations now qualified against existing independent numeric references via Native. `readDeformedPositions` is explicitly rejected inside a resident effect and is not exposed as available. |
| pro-animation / graphics-contracts | Native PA entry qualifies image Blur/Glow/sine Displacement/RG-map/Coverage; Inner Shadow is separately qualified. Arbitrary CPU callback kernels and browser drawing keep their explicit contracts. Pure CPU/control libraries remain pure; do not count them as GPU effects. |
| spatial-effects / puppet / skeletal / rigid-body / deformable | Audit each factory's data/assets/WASM/worker/draw requirements. Native immutable init data is not mutable cross-frame simulation. Replay/state, mesh UV/material/arbitrary attributes and professional drawing need existing owner capabilities or minimal interface requests. |

`bindings.ts` is a Native bindings-v2 initializer only. Main owns formal new R1
identity, manifest, catalog, public names, package/SDK pins and distribution. No
published immutable package version, permission boundary or shared entry changed.
The same recipe/kernel code can be loaded by future logic hosts; there is no
second SpiderMonkey implementation. Source algorithms are reused in-repository
with their existing licenses/provenance; no new third-party shaders/dependencies.

Version 0.3.0 versions the readonly image/statistics bridge and scratch lifecycle correction; existing 0.2.0 package snapshots are unchanged.

Version 0.3.0 integrates the frozen PA image adapters (22370b1) using processPa, generatePa and paStats. Import these normally from native-image-effects after trusted R1 installation. The six adapters add four distinct names to the existing 98; Gaussian radius is sigma in [0,64]. Versions 0.1.1/0.2.0/0.2.1 remain immutable. See PA.md in the carried package, or pa/README.md in source. Typed Flat retains its separately recorded conservative-evaluator limitation.

Version 0.4.0 pins the shared image-metadata dependency after Native admission separation; existing 0.3.0 package stores remain unchanged.
