# Native time effects (development checkpoint)

This domain combines twelve time/plan functions and ten image operations. Names
are not AE coverage percentages. Existing remapTime, posterizeTime, createSpeedRamp,
Core keyframes/Signal and shutterSamples are reused; they are not new effects.

Time/plan exports: sourceTimeContext, shutterTimeContext, resolveTimeRange,
frameBlendSamples, echoSamples, trailSamples, wideTimeSamples, shutterTimeSamples,
freezeTimeRange, reverseTimeRange, jitterTime, strobeTime.

Image operations: retime, frameBlend, echo, trails, shutterBlur, wideTime,
posterize, strobe, timeCrossfade, timeDifference. Bind them once with
createNativeTimeEffects in existing Native Stage init. Its default time-specific
adapter reuses the shared guarded Pair arithmetic and existing resident read-only
image views/Compute/Pixel ABI2. There is no new device, history store or renderer.
Standalone named exports
call that same instance; these are not additional capabilities.

All image processing requires native GPU, scene-linear RGBA16F/32F, matching
encoding/Stage dimensions and the shared temporal pixel adapter. No CPU pixel
fallback or Canvas8 bridge. A callback receives explicit local source seconds
and a complete immutable FrameContext, and transfers a fresh same-owner image.
It can generate a procedural frame or use an existing explicitly controlled media
reader. It cannot implicitly seek another Stage, trigger inference, retain old
epoch handles or run a second Renderer. Repeated/out-of-order output frames
recompute the finite window; there is no persistent image history.

Source retiming changes local time/frame only, preserving the output clock and
progress. Shutter samples instead invert the existing nonzero affine Stage dt
to obtain actual global subframes/progress. Reverse-rate dt is supported.
Shutter sourceTime is an existing Signal evaluated at every actual subframe.
freezeTimeRange holds a finite half-open interval; after=delay shifts later
source time, after=resume returns to the output clock. reverseTimeRange reverses
both endpoints of a finite closed interval. Boundary ranges specify actual valid
sample centres, not media duration inferred from image changes.

Echo samples include current time plus N echoes; signed interval is in seconds.
Weights are intensity*decay^index. Blend divides by sample count; weighted-mean
divides by weight sum. These differ when opacity decays. In-front keeps the
current image in front; in-back puts later echoes in front (explicit semantics,
without claiming every product's enum labels match). Add clamps only final Alpha,
not negative/HDR RGB. Min/max include transparent zero samples. Source-over weights
must preserve valid coverage; unsupported numerical domains must fail explicitly.

Transparent range samples participate in the denominator and do not call sourceAt.
Zero-weight samples similarly avoid unnecessary generation. Returned results are
caller-owned, provisional until the existing Native frame ticket completes.
Cancellation/failure closes the source iterator and releases transferred images;
callback-owned allocations made before an exception remain the callback's cleanup
responsibility. No implicit frame/device/worker is disposed by this adapter.
The minimum known pass count is admitted against the owner's CURRENT remaining
command budget, with E_PA_TIME_ADMISSION on failure. Source generation adds its
own commands. No effect-level permanent echo count or resolution cap is added;
automatic cross-submission temporal reduction/tiling is not provided here.

```ts
// In defineNativeStage(init => ...), normal functions and existing keyframes:
const time = createNativeTimeEffects(init);
// sourceAt returns a fresh same-owner image generated at sample.context.time.
const blurred = await time.shutterBlur(sourceAt, {
  count: 16, angleDegrees: 180, sourceTime: existingTimeSignal,
  range: {start: 0, end: 1, boundary: 'transparent'},
}, context);
// Continue with existing Native Glow / Layer; release caller-owned intermediates.
```

timeDifference uses the existing professional PM difference/subtract blend kernel
at two specified times. It is not AE's SDR-clamped comparison with nine Alpha
policies. Optical-flow interpolation, motion-vector blur, arbitrary upstream
Stage-prefix sampling, per-pixel time displacement and history-feedback Time Blend
are outside this explicit-source interface. They must not be reported as covered
by ordinary frame interpolation or finite-window trails.

Shared entry/Manifest/version/catalog/Lock/L3 remain Main-owned. Development
source is not proof of an installed package, completed GPU execution or full AE
parameter compatibility. Actual checkpoint machine results qualify each claim.

Actual source fixture: validation/native-time-scene/project.tsx (F32) and
half.tsx (F16), four panels: exact retime, Echo, shutter, wide-time window.
All use the same existing Native owner and SpiderMonkey host, explicit imported
linear Resource, and existing PA Glow and Layer compositor. Real MP4 decoded
frames show the changing motion; the transparent PNG's signed HDR colours are
display-referred only for preview. EXR is the signed linear reference, not PNG.


## Declared upstream sources (fourth completion checkpoint)

The same `createNativeManagedTimeEffects` adapter now accepts the actual Core
`native-pixel-prefix-v1`, `declared-input-v1` and `declared-resource-v1` bindings.
There is one reducer and one Core window/ownership/cancellation implementation.
No second source registry, history cache, scheduler or renderer is created.

```ts
const binding = await init.temporal.bindSource({
  version: 1, profile: 'declared-input-v1', input: 'image', clock: 'consumer-local',
});
const time = createNativeManagedTimeEffects(init, binding);
// image is already a declared Stage surface input; Core resolves its existing DAG.
return time.shutterBlur({count: 8, angleDegrees: 180}, context);
// Or time.echo, frameBlend, trails, retime, wideTime, posterize, strobe,
// timeCrossfade, timeDifference. Caller disposes the borrowed binding after work.
```

This requires Core source checkpoint `f36feba48db87f6b6e02c23766542c42f115dd9e`
and matching Native binary/receipt. The test SDK additionally uses Main's decoder
fix `992fe3408843b25e6cedeef1a82cd3b0a9ee1310` with its matching host binary.
The feature is not declared installed merely because this branch has the adapter.
Main owns their actual integration, release exports, immutable version and SDK Pin.

Core reevaluates qualified ancestors and their original Signals/props at real
fractional contexts. Consumer-local time is inverted through its start/offset/rate,
then each producer gets its own context. The composition clock is explicit.
Still/video sampling uses an existing sealed Resource, explicit decoder/interpretation,
local/global clock and rational tick quantization. No query relabels a current frame
as a prior frame, performs browser/CPU pixel fallback, or changes integer Renderer API.

An ordinary JS factory needs the explicit isolated-seek hook: use the existing
nativeSimulation/FixedStepRunner absolute seek/checkpoint semantics and declare
fractional interpolation. Its independent Core branch leaves canonical ordinary-let
state alone. A 'stateless' label is not proof of rewindability. Persistent GPU-history
forks, V-SHARED, Servo/native module history, nested seek windows, undeclared source
edges and cross-media dependencies remain Core rejections, not covered capabilities.

Validation entry: `validation/check-general-source.ts` creates the real editable TSX
and exact trusted private R1 fixture; `validation/check-general-sources.ts` checks
isolated history, F32 HDR still Resources and actual hardware video PTS. These are
consumer evidence, not production package identities. Shared types/opaque cancellation
are qualified by `validation/qualify-general-source-types.mjs` against frozen Core.

Reproduction (own worktree and local reviewed binaries/toolchain only):

```
node modules/pro-animation/validation/run-upstream.mjs generalSnapshot l0 generalTypes types general
node modules/pro-animation/validation/run-upstream.mjs mediaBuild generalSources generalAudit
```

The runner appends to the original upstream campaign including failed attempts;
never reset it to evade 420 seconds. The helper build uses the existing MSVC path
in the adapter; no compiler download. Native binaries are copied only after exact
frozen SHA and source-receipt verification. Final L3 package/export and other OS/GPU
qualification remain Main-owned. CPU video decode is used only as an explicit test
oracle; the production timed source is hardware-only and its missing helper failed
explicitly before the reviewed own build was configured.
