# Native resident counterparts of the Surface image effects

`createNativeRasterEffects(init)` supplies **23 actual operations** listed in
`nativeRasterEffectNames`. This is an additive `GpuPixelImage` API; the existing
Surface-in/out API is unchanged. `exposure` and `applyMatte` also exist in the
77-method resident library, with different option contracts. Consequently the
two libraries have 100 bindings but **98 distinct names**, not 100 new effects.

```ts
const raster = createNativeRasterEffects(init); // existing NativeStageInit
// renderAt(context, inputs):
return raster.processImage(inputs.image, async (image, fx) => {
  const matte = await fx.feather(image, {radius: 2});
  image = await fx.fill(image, {color: [3, -.25, .5]});
  image = await fx.applyMatte(image, matte);
  const shadow = await fx.dropShadow(image, {radius: 4, offset: [4.25, 3.5]});
  image = await fx.over(image, shadow);
  return fx.glow(image, {radius: 3, threshold: 1, intensity: .5});
}, {context});
// dispose(): await raster.dispose();
```

Editable TSX: `../examples/raster-chain.tsx`. It is a deterministic technical
HDR/Alpha pattern, not a visual quality benchmark. `raster-numeric.tsx` and
`raster-web-baseline.tsx` are verification fixtures, not installed packages.
Main owns the formal public names, typed source package, immutable R1 version,
manifest, locks, pins and distribution. No package availability is claimed here.

## Reuse and numerical boundaries

The original parameter resolvers and existing animation evaluator are used.
Gaussian/Glow use `createGpuPixelEffects` verbatim. Other adapters use the
shipped compensated Pair arithmetic; source-over/Screen/Multiply extract the
original `professionalShader` body verbatim, replacing bindings and writes.
No third-party code/dependency/license was added. Upstream is the existing
Frameweave source at base `043c5ff44ef24e4ddd32c8d15fc75dabb8fcad94`, with its
existing licenses. The unrelated pre-existing Inner Shadow draft is untouched
and is not imported by these adapters or verification baseline.

All pixel arithmetic executes through the admitted existing scope. Each logical
effect publishes F16/F32 in the original order; Gaussian intermediates remain
F32. There is no cross-effect fusion, colour clipping, RGBA8 intermediate,
effect-local device, CPU pixel fallback, PNG encoding, upload or readback.
Drop Shadow includes the Gaussian halo outside the original canvas before
fractional translation. Reframe remains integer crop/pad/flip, not resampling.
Tile remains integer repeat/mirror, with safe-integer offsets reduced on CPU;
this checkpoint does not qualify all subnormal/signed-zero bit patterns.

GPU resources are Stage-local, not JSON or persistent TVG values. The existing
recipe processor tracks scratch, retains one result, expires earlier results,
rejects overlapping recipes, checks cancellation and closes idempotently. It
does not dispose the borrowed owner. Completion means recorded work, not a GPU
fence; the Renderer ticket supplies actual GPU completion. Nothing here creates
persistent mutable state across frames.

Compatibility limits are explicit:

* The later [colour successor](../color/README.md) implements the existing
  workingColor option through explicit owner conversion before the operation.
  Raw gain RGB must already have target metadata and is never converted.
  Ordinary `scope.run` still rejects colour changes; no relabelled handles.
* Opaque publication requires full coverage provable from input metadata and
  parameters. Otherwise `E_NATIVE_EFFECTS_ALPHA` rejects it; use PM/straight.
  Actual opaque pixels labelled PM may therefore need an explicit upstream
  opaque declaration. This is more conservative than the old CPU pixel scan.
* Native production deliberately has no per-publication numeric scans. Valid
  domain numerics are qualified; Web's rejection of invalid/subnormal/overflow
  intermediate pixels is not reproduced. Parameter validation remains active.
* Explicit `maxBufferBytes` conservatively bounds resident operation scratch;
  exceeding it fails instead of invoking legacy CPU tiled Surface transport.
  Session/device budgets still apply. No new permanent resolution cap is added.
* The original raster checkpoint below did not qualify statistics, colour
  conversion or Inner Shadow. See the later colour and PA entries for their
  separate actual evidence. Unrestricted Surface import remains separate.
  Small-media tests here do not qualify4K final encoding.

## Reproduction and evidence

From this worktree, run `node modules/native-effects/validate.mjs raster-<phase>`:
`types`, `unit`, `gpu`, `media`, `performance`, `ab`, `evidence`. The cumulative
ledger is `artifacts/native-effects/checkpoint-raster/campaign.json`; it includes
failed attempts and stays below 420s for this **new 23-operation campaign**.
Earlier image/spatial campaigns remain frozen. Test home is this worktree's
`.frameweave/user-home`; binaries are existing worktree-local receipt-checked
release/debug builds. No SDK/trust/content lock or owner code changed.

GPU tests compare all 23 operations against independent F64/exact dyadic
references, F16/F32 and PM/straight/opaque input. Thresholds remain scaled
3e-6/F32 and 6e-4/Half. Initial/middle/end, Signals, random/repeated frames,
crop dimensions, fractional shadow, extreme tile offsets, cancellation and
parameter/colour/opaque/budget rejection are exercised through actual TSX→TVG
→Native Stage. A diagnostic-only raw snapshot retains seed allocations; reading
capacity outside an image's declared extent is excluded. No diagnostic
readback enters a production effect.

Real production media: decoded PNGs, Float32 EXR with exact decoded-vs-diagnostic
hash equality, independently decoded four-frame libx264 MP4. MP4 is lossy SDR;
the EXR is Float32 file output, not a Half-file encoding claim. Actual image was
opened for visual inspection. Initial/middle/final/random/repeated output and
Native process exit/repeated close are asserted.

Timing logs record actual NVIDIA RTX 5070 Laptop / Vulkan, driver and power
scheme. The eight-operation workload runs 1080p/4K new/repeated/random frames,
including JS recording and GPU completion, excluding encoding/scanout. An
earlier measured 4K P95 outlier of 193.26ms is retained; do not cherry-pick a later
sample or claim universal speedup. Logical total image bytes are not physical
peak GPU memory. Owner counters show one device and no image transfer/readback.

The separate A/B uses identical Exposure→OffsetRGB→Screen→Crossfade math,
parameters and F32 inputs. At 320×180 every pixel is compared (max scaled error
1.745e-7); 1080p/4K are real execution/transport measurements, not full-image
parity checks through the bounded diagnostic channel. Web uses original Surface
functions, its original tiled transport, explicit 16MP owner opt-in / 512MiB GPU
budget / 2GiB CPU working budget, hardware WebGPU and no CPU fallback. Both sides
are timed sequentially with no Stage cache. Native endpoint is a resident
GPU-ready image; Web endpoint is a CPU Surface after its required readbacks and
Stage transport. These are **different materialization endpoints**; no ratio is
claimed. Cold initialization/first request and all raw samples are separate.
Browser underlying API is not confirmed by its hardware-adapter evidence.

Untested: other GPUs/OSes, software adapters, large-image Native media output,
full pixel-domain exceptions/bit transport, Servo/SpiderMonkey, R1 install,
portable/typed-flat export and full-repository regression. Main owns centralized
integration. Particle/spatial/Puppet additions are deferred by current user scope.
