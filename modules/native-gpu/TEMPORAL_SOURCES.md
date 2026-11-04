# Native temporal sources v1

`NativeStageInit.temporal.bindSource()` extends the existing recorder/window service. `bind()` and `native-pixel-prefix-v1` remain unchanged. No TVG, P4 manifest, pixel ABI, public integer-frame Renderer, GPU owner, scheduler, or resource trust model is replaced.

## Declared input

```ts
const source = await init.temporal!.bindSource({
  version: 1, profile: 'declared-input-v1',
  input: 'image', clock: 'consumer-local',
});
// Inside the existing renderAt(context):
return source.window(context, {}, at => timeEffects.shutterBlur(at, options, context));
// During dispose:
await source.dispose();
```

`image` must already name a declared surface input on this Stage. Only Core resolves its PortRef and existing ancestors; arbitrary Stage IDs, paths, callback evaluators and new DAG edges are not accepted. Managed initializers use the same API with their existing borrowed GPU/temporal lease; returned samples are granted to that exact lease. Package Resource access is limited to its actual binding resource IDs and admitted dependency module resources. Delegation cannot widen this set.

### Time coordinates

Every window belongs to its enclosing renderAt context and frame epoch. Every sample carries the existing complete `NativeTemporalSample` context, including source-local time/frame and retained output/global clock identity.

* `consumer-local`: `sample.context.time` is in the requesting Stage's local seconds. With composition FPS `F`, Core computes `globalFrame = consumer.start + (sample.time * F - consumer.offset) / consumer.rate`, then separately evaluates each producer using its own offset/rate/start/duration/seed. This supports PA `sourceTimeContext`, which deliberately retains the output/global clock during local retiming.
* `composition`: the requested coordinate is `sample.context.globalTime * F`; changing local time alone does not change the source. PA shutter contexts change both coordinates consistently, so the two explicit clock modes agree for an affine shutter subframe.
* A frozen requester rate (zero) has no inverse for consumer-local; use the explicit composition clock. Negative rates retain the existing reverse mapping. Composition/producer active intervals are checked; no implicit clamp or extrapolation is introduced.
* Source props/Signals are evaluated again at the producer context. The public Renderer still rejects fractional frame requests. No current-frame graph is relabelled as historical output.

## Declared images and video

```ts
const still = await init.temporal!.bindSource({
  version: 1, profile: 'declared-resource-v1', source: imageResource,
});
const movie = await init.temporal!.bindSource({
  version: 1, profile: 'declared-resource-v1',
  source: { /* existing NativeVideoResource, omit position */ },
  clock: 'local', ticksPerSecond: 24000,
});
```

An image retains its existing format/dimensions/color/Alpha and exact sealed Resource identity. Video chooses either sample-local `time` or output `globalTime`, explicitly rounds to `ticksPerSecond` (maximum time quantization error 0.5 tick), and passes rational seconds to the existing decoder/PTS search. `position` on a timed source is rejected. Integers must fit the safe-number domain; negative times reject, consistent with the existing nonnegative rational video interface. Resolve negative-time/loop policies in the existing PA time planner as needed. CPU and hardware decoder choices remain explicit; no implicit CPU fallback is added.

A raw import-only final frame is now valid in private native program v2: zero kernels is accepted only with declared image imports and zero passes, after which all existing import/lease/format/budget checks still run. This avoids a dummy dispatch or extra image copy. Kernel-free programs without imports still reject.

## Explicit JS history/seek

A source entry is **not** replayable merely because its Stage says `seek: 'stateless'`. It must explicitly implement:

```ts
temporal: {
  version: 1,
  profile: 'isolated-seek-v1',
  sampleAt(context, inputs, props) {
    // Use the existing nativeSimulation/FixedStepRunner seek/checkpoint API.
    // Define fractional interpolation explicitly; FixedStepRunner takes integers.
    simulation.seek(Math.floor(context.frame));
    return drawAtExplicitState(context, inputs, props);
  },
}
```

Core invokes this hook in a separate, persistent AppContainer instance of that exact sealed Stage bundle. The same NativeLogicHost creates/owns the branch, and the same native GPU owner executes its admitted command tape. Canonical ordinary-let/module state is never entered by the hook. Kernel, immutable seed, module and inference cache keys are separated from canonical Stage keys. Branch instances and resource leases retire with the existing host lifecycle. The author must implement correct absolute seeking; arbitrary hidden state cannot be inferred or reconstructed by Core.

The supplied real test uses the existing FixedStepRunner checkpoint/restore implementation, samples frames out of order, and proves that canonical ordinary-let invocation counts advance once per output rather than once per subsample.

Still **unsupported**, explicitly `E_NATIVE_TEMPORAL_SOURCE_UNSUPPORTED`: persistent GPU history without a fork/checkpoint profile; Servo/native module history; shared-transaction producers; cross-media/non-surface dependencies; nested temporal sampling inside a seek branch; arbitrary entry functions without the hook. There is no claim that all historical JS/GPU/external state can now be sampled. CPU pixel fallback is not used to hide these gaps.

## Recording, ownership and failure

The existing sequential SpiderMonkey transport is unchanged. Bootstrap suspends one render continuation and returns a versioned bounded request; Core issues fresh single-use 256-bit continuation tokens bound to that Stage's current frame/request. Pending frames reject render/init/reset reentry. Wrong, duplicate, expired and closed continuations reject. The whole frame uses one absolute deadline across every source request/resume; no per-resume timeout reset or new fixed request-count capacity is introduced.

Core grants request-scoped image lease numbers, never native pointers or trusted authored global GPU indexes. Only leases issued to the receiving Stage can be mapped into its packet. A sample branch is grafted into the current program only if its lease survives the successful recording. Failed/cancelled windows restore images, buffer ownership, passes, parameters, import declarations and external mappings; unused branch video leases release. No sample publishes/commits independently, and no extra V-SHARED transaction is created. Stateful/shared paths without an applicable frozen-read/fork contract reject.

Existing source/asset/package seals and operator permissions remain in force. Source admission is done through existing resource services. Samples remain float GPU images in the same owner; there is no PNG/Base64/HTTP pixel handoff. Explicit final inspection/export can still read back pixels. Cancellation tokens, in-order awaiting, `window()` cleanup and idempotent `dispose()` follow the existing service.

Stable errors include `E_NATIVE_TEMPORAL_RESOURCE`, `SOURCE_UNSUPPORTED`, `CONTEXT`, `RANGE`, `PHASE`, `EPOCH`, `CLOSED`, `BUSY`, `PARAMETERS` (all with the temporal prefix), `E_STAGE_BUSY`, `E_STAGE_TIMEOUT`, `E_RENDER_CANCELLED`, and existing resource/integrity errors. Unexpected source failures are normalized as `E_NATIVE_TEMPORAL_SOURCE_FAILED` before resuming the consumer.

## Evidence and reproduction

Editable entry: `examples/native-temporal-upstream/project.tsx` (producer start=1, offset=8, rate=1/2; requester start=2, offset=4, rate=2). New test fixture package identity is private `test.temporal-upstream@1.0.0`, not a published module. Its actual PA reducer is read from frozen `ba70eac38170567b48adfded74e3602f5bbf304b` and executed unchanged; Core does not import the effect library.

Use `node modules/native-gpu/validation/temporal-upstream/run.mjs <log-name> <Node arguments...>` to collect cumulative validation, including failed runs and the native build. It requires this worktree's explicitly reviewed runtime paths; edit those local paths when reproducing elsewhere. It does not install a compiler, model, SDK or browser. The receipt/outputs/raw logs in the adjacent evidence directory distinguish development attempts, final-source tests and reproduced pre-existing failures. Windows/RTX hardware is the measured platform; other vendors/OSes, full repository regression, final installed engine and six export modes remain Main integration work.
