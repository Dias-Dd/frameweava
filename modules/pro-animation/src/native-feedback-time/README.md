# Persistent native feedback

`await createNativeFeedbackTimeEffects(init, setup)` allocates one Stage-local
feedback controller during the existing native initializer. It uses the original
`FixedStepRunner` for seek/checkpoint decisions and existing native persistent
state buffers for pixels. It does not create a simulation runner, Renderer,
device, queue service, timeline or professional document schema.

```ts
const feedback = await createNativeFeedbackTimeEffects(init, {
  id: 'echo', checkpointInterval: 30, maxCheckpoints: 2,
});
// renderAt(context): sourceAt uses ONLY its supplied sample.context.
const image = await feedback.render(sourceAt, {
  sourceId: 'reviewed-shot-and-parameters-v1',
  mode: 'over', decay: .85, translateX: 1,
  gain: existingCoreSignal, format: 'rgba16float',
}, context);
// Continue ordinary native composition; release image when consumed.
// Stage disposal: await feedback.dispose().
```

The development entry is `native-feedback-time/index.ts`. Main owns public
exports, production R1 identity/version/pin and L3. The editable true-history
example is `validation/feedback-time-scene/project.tsx` and `half.tsx`.

## Pixel recurrence

Frame 0 seeds history from the actual source at local frame 0. Later numbered
steps take a fresh source, transform the previous history and apply a recurrence.
Source requests, Signals and affine global/subframe mapping use existing Core
contracts; no wall clock is used. This is history feedback, not an N-frame
independent window. Controls are evaluated separately at each actual replay step.

Let A be the current associated source after opacity and RGB gain; let H be the
transformed old history after RGB historyGain, and B=H*decay:

| `mode` | Recurrence |
| --- | --- |
| `add` | A+B |
| `over` (default) | A+B*(1-A.alpha) |
| `behind` | B+A*(1-B.alpha) |
| `mix` | A*(1-decay)+B |
| `screen` | A+B-A*B |
| `maximum` / `minimum` | Per-component max/min of A and B |
| `multiply` | Per-component A*B |
| `difference` | Absolute PM RGB difference; Alpha is source-over coverage |
| `subtract` | A.rgb-B.rgb; Alpha is source-over coverage |

Every logical state step clamps Alpha to [0,1]; RGB remains signed/HDR. The
ten modes are not a claim of ten new AE effects or all AE blend-mode equivalence.
Pixels remain in paired F32 hi/lo storage, including checkpoint copies. Publishing
RGBA16F/32F does not feed quantized display pixels back into the next state step.
Actual input Half quantization is preserved. Straight inputs are associated
explicitly, hidden zero-Alpha Straight RGB is cleared, and valid PM emission is
not implicitly cleared by the feedback kernel. Other composed effects retain
their existing contracts; the raw feedback buffer is tested independently of Glow.
The actual source scene-linear colour encoding is retained and must stay fixed
for a source identity. Changing colour/precision requires reset/new sourceId.

Options: `decay` and `opacity` are Signals in [0,1]; `gain` and `historyGain` are
nonnegative RGB-only Signals. `translateX/Y` and `originX/Y` are pixels;
`rotation` is radians; nonzero `scaleX/Y` are dimensionless. History transforms
inverse-map around the default physical image centre, using the existing guarded
Pair bilinear sampler. Boundary defaults to transparent, or explicitly clamp.
Input images and outputs remain professional F16/F32; there is no CPU/SDR fallback.

## Seeking, cancellation and resources

`render(sourceAt,options,context)` accepts nonnegative **integer local frames**,
matching `FixedStepRunner`. Source time is local seconds; the supplied complete
sample context must drive source time/randomness. An outer captured context,
global clock or mutable external input is not a deterministic temporal source.
This API does not infer arbitrary Stage purity or sample frozen upstream inputs.

`sourceId` is a cache-invalidation identity, **not a trust grant**. Include the
actual source revision/resources/parameters (a future bound source can use its
verified R1 identity). Parameter/clock identity changes reset the history.
Presentation format alone can change without discarding higher precision state.
Repeated frames do not resample the source; backward seeks restore an owned GPU
checkpoint and replay fixed steps. JS snapshots contain only cloneable numeric
frame/slot/generation metadata; no live GPU handles or image pixels are cloned.

The synchronous Runner produces ordered actions; only afterward are those actions
awaited through the existing GPU API. Snapshot storage follows its bounded
eviction rule and preserves frame 0. Every snapshot restore and publication also
uses existing `stateStep` submission cursors. A discarded recording cannot silently
serve its advanced JS metadata as valid GPU history: native submission rejects a
stale sequence with `E_NATIVE_STATE_SEQUENCE`. This check needs no pixel readback.
Frame/config/generation headers provide additional GPU consistency checks; a
normal frame ticket is not advertised as a numerical scan of arbitrary shaders.

`stats()` is **recorded-only**. Await the existing Renderer frame ticket for GPU
completion. On a failed/cancelled outer render, call `invalidate()` before reuse,
or close/recreate the existing Renderer/Stage and replay. Source/recording errors
inside this controller invalidate automatically. A Stage that adds later filters
should invalidate in its own error handler. No automatic device recovery is
claimed. The real control test covers cancellation, a guaranteed discarded
recording, rejection of stale cached state, and correct subsequent replay.

Controller methods: `render`, `planSeek`, `reset`, `invalidate`, `stats`, `dispose`.
`planSeek(frame)` reports replay origin/steps and minimum owner commands, with
source commands additional. There is no permanent duration/resolution cap; an
oversized one-call seek explicitly requests bounded pre-roll through existing
Renderer integer-frame submissions. Normal sequential movie export already does
this. Existing Runner maxSteps, GPU addressing, memory and command budgets remain
effective; this module does not create a second submission scheduler. Snapshot
copy/restore uses 2D dispatch rather than imposing a one-dimensional FHD limit.

`setup` accepts id, checkpointInterval, maxCheckpoints and existing maxSteps.
Four live RGBA fields, one control header and two RGBA fields plus a header per
checkpoint are allocated. `logicalPersistentBytes` reports requested storage,
not measured driver VRAM. Configure snapshot count against actual memory budgets.
Persistent state is automatically restricted to one native frame slot by the
existing Renderer; its explicit two-slot request was tested. `dispose` releases
handle authority; the existing Stage/Renderer session owns physical persistent
allocation lifetime and must be closed. Multiple controllers need distinct ids.

Reproduction:

```powershell
node modules/pro-animation/validation/run-feedback-time.mjs types l0 stage control package
```

One cumulative <420s campaign includes failures/setup. L0 covers 8 lifecycle cases;
real native/SM execution covers all ten modes, F16/F32, random/repeated frames,
independent Float64 references, PNG/EXR and decoded MP4. FLOAT-channel EXRs reflect
the existing F32 compositor even when source/Stage precision is Half. No Main
release, six-mode export, other OS/GPU, 4K/long-video or proprietary AE equivalence
claim is made. No third-party dependency or new license is introduced; existing
Core, guarded sampler, resource protocols and their licenses are retained.
