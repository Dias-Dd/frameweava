# Native spatial bindings

`nativeSpatialFrame(init, context)` binds **61 original algorithms**: mesh15,
spatial Compute15, spatial fields15 + depthRangeMatte, spatial VFX15. The actual
typed names are `nativeSpatialNames` in `frame.ts`. `generate-bindings.mjs` reads
the original source signatures; no algorithm or WGSL is copied/reimplemented.
Factories, upload/release helpers and numeric probes are not additional effects.

```ts
const scene = defineNativeStage(init => ({
  async renderAt(context) {
    const {vfx} = nativeSpatialFrame(init, context);
    const smoke = await vfx.smokePlume({format: 'rgba16float'});
    try { return await vfx.heightFog(smoke, {density: .1}); }
    finally { await init.gpu.release(smoke); }
  }
}));
```

No device/context/queue is created. The original admitted Stage/R1 scope owns
everything. All effect calls keep Promise rejection semantics, including default
dimension validation. Generators inherit Stage dimensions unless explicitly
overridden. Image operators preserve their input dimensions. Existing parameters,
units, defaults other than this explicit Native dimension inheritance, Signals,
budget/format/color checks and per-pass Half publications remain original.
VFX retains its explicit scene-linear Rec709/D65 profile, not implicit arbitrary
working-color conversion. Compute/spatial fields remain non-color typed buffers;
validity is independent of Alpha. Images are opaque owner-local GPU references.

Methods allocate no persistent wrapper state. Await operations, release outputs
or let the existing frame lifetime end; never serialize/retain references across
frames or put them in JSON ports. The Native Stage still has its existing single
surface publication. Compute stepping functions are single explicit numerical
steps; this adapter does not claim a persistent GPU simulation/replay engine.
`uploadSpatialField` supports explicit CPU seed/control data, not CPU snapshots
of simulated GPU state. Image upload, CPU readback, capture and renderer factories
are not exposed as if supported. The same source works with later logic hosts;
no SpiderMonkey-specific algorithm fork exists.

## Qualification

Run `node modules/native-effects/validate.mjs spatial-<phase>` with phases types,
unit, numeric, math, vfx, contracts, media, performance. Raw commands, failures and
elapsed time are retained in `artifacts/native-effects/checkpoint-spatial/`.
This is new work after frozen image commit95b74c7, with a separate coherent scope;
it does not reset the prior image campaign or rerun its deferred export gates.
Existing locally built production/diagnostics binaries are reused, never shared
with another worktree. Test home is this worktree's `.frameweave/user-home`.

* Mesh21 fixtures cover all15 operations, F64 geometric/noise references, neutral
  limits and keyframes. Compute14 data operators and F32/F16 volume integration
  use the existing independent F64/FNL/analytic cases and original error budgets.
* Fields25 analytic plane/sphere/Snell fixtures cover all15 original operators;
  depthRangeMatte additionally checks both image formats, missing observations and
  feather edges. Diagnostic scalar-in-R fixtures are test transport only: not a
  public Surface or data interchange contract. No GPU result is read back inside
  a production effect.
* Numeric case selection uses globalFrame while Stage rate0 holds local t=0 for
  the frozen existing references. Ordinary-rate media separately checks actual
  rational-FPS time, first/middle/final/random/repeated frames.
* VFX30 full-image cases match the **direct original API on the same Native
  owner exactly**, both F16/F32. Original FastNoiseLite hash/value and independent
  F64 20-step Kepler references pass the original3e-6 absolute gate.
* **Web/Native full-image parity is not claimed.** The existing Web hardware
  backend and Native Vulkan differ for several VFX cases, including Mandelbulb
  max scaled0.03757 and atmosphere around0.03 in this cohort. The original
  3e-6/6e-4 thresholds and each failed comparison remain in `vfx.json`; they were
  not relaxed (17/30 format-cases exceed them). Both sides' actual compressed F32
  frames, hashes and representative PNGs are retained. Browser backend evidence
  establishes NVIDIA/non-fallback WebGPU; its underlying API is not exposed here.
  Same-owner binding equality and cross-API differences are separate
  evidence. No claim of full-F64 fractal equivalence or cross-vendor bit identity.
* Real admitted-scope checks: cancellation/invalid options do no GPU work; getters
  do not execute; authored failure after recording is not submitted; subsequent
  retry and repeated frames succeed; close is repeated safely. CPU readback and
  initialization-buffer mutation fail explicitly with E_NATIVE_SCOPE.
* `../examples/spatial-chain.tsx` is the real geometry→mesh→volume→fog/lens→depth
  matte→colour chain. Small production EXR decoded pixels equal diagnostics bytes;
  HDR and partial Alpha are checked, PNGs decoded/visually inspected, four-frame
  H.264 MP4 independently decoded. MP4 is explicit lossy SDR, not HDR delivery.
  Its depth field is explicitly authored on GPU, not captured from drawMesh or
  advertised as a G-buffer/AOV export.
* Actual1080p/4K F32 full chain executes on RTX5070 Laptop/Vulkan. Raw timings
  distinguish cold/init, distinct/repeated/random frames and GPU completion from
  encoded-file completion. No speedup ratio against another workload is claimed.
  The scene explicitly plans full volume work via maxWork; the original default
  remains unchanged. The failed4K default-budget attempt is retained. No image
  scale/step/precision reduction and no CPU/software fallback.
  Current frozen new-frame medians/P95 (n20) are1080p10.88/14.35ms and4K22.08/23.60ms.
  The4K owner reports398,131,200 allocated image bytes plus66,357,464 data bytes;
  logical working image bytes are separate. These are owner allocation counters,
  not a claim about actual physical peak GPU memory. In-flight work completes
  before close; `closed.json` records the observed process exit/disconnection.

Upstream algorithms/licenses remain in their original modules: existing authored
code plus FastNoiseLite v1.1.1/MIT, commit
`7ccfbc16eb1c932568f177d63a9ba51d89bbe516`; their vendor SOURCE.json hashes remain
authoritative. No third-party code or dependency was downloaded/added. Main owns
the next immutable R1 identity, typed transitive packaging, public entry/SDK pin,
install/Capsule/Flat validation; this checkpoint does not certify those gates.

## Concrete remaining boundaries

* `readDeformedPositions` / spatial readback helpers need an explicit completed
  data-export boundary. Current resident readBuffer refuses. Do not emulate with
  diagnostic images or invent a public JSON GPU handle.
* Mutable cross-frame GPU fields need owner leases/synchronization plus explicit
  reset/replay/transaction semantics. Current init data is immutable, frame data
  expires. No per-frame CPU readback/reupload workaround is implemented.
* Existing Three-based professional renderers require UV/normals/materials/
  instancing/capture beyond the current positions/indices/matrix/constant-colour
  drawMesh. Their pure rig/sampling/geometry functions remain separate migration
  candidates; the missing renderer does not block all of that library.
  The existing256-image/1024-pass command-packet safety budgets still apply;
  this entry does not promise all available algorithms fit simultaneously.
* Full1080p/4K EXR delivery remains unqualified **in this unsynchronized worktree**;
  Main/Agent-1 have a separate frozen PACK fix. No self-sync or owner edits occur.

The global objective remains all migratable effects. Legacy Surface adapters,
pure/control libraries and other authors' rig/physics/geometry functions are
still pending individually; they are not labelled impossible merely because
their current package manifest says Web or their built main file is absent.

For integration, Native bindings now export `spatialFrame` alongside `processImage`
and `imageStats`. Main must use a new immutable package version and mark the
GPU-dependent `spatialFrame` export in its existing bindings-v2 manifest. Carry
the real typed transitive source graph; this source entry is not a claim that
the current published20-function package already includes the new algorithms.
