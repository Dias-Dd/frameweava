# Numeric keyframe controls → real Native shutter rendering

Source entry `src/keyframe-control/index.ts`:21 operations over existing Core
`Keyframes<number>`. Names are not21 AE effects or a coverage percentage. No new
Signal type, interpolator, expression language, timeline, scheduler, marker store,
Graph, Renderer or simulation runner. Main owns public named exports, immutable
R1 identity/version, package locks/permissions and L3.

```ts
import { keyframes } from '@frameweave/engine';
// Main public wiring pending; editable validation uses this module-local entry.
import { loopKeyframeValue } from './index.ts';
// In existing Native Stage init:
const keys = keyframes([{frame: 0, value: 0}, {frame: 24, value: 1}]);
const time = createNativeTimeEffects(init);
// Inside renderAt(context), drawOwnSource transfers one fresh same-owner image.
const image = await time.shutterBlur(sample => {
  const seconds = loopKeyframeValue(keys, sample.context, {after: 'offset'});
  return drawOwnSource({...sample, time: seconds,
    context: sourceTimeContext(sample.context, seconds)});
}, {count: 16, angleDegrees: 180, format: 'rgba32float'}, context);
// Continue with existing Native Glow/Layer. Caller owns and releases image.
```

The executable project is `validation/keyframe-control-scene/project.tsx`, with
`half.tsx` for16F. Four panels: offset, ping-pong, velocity continuation, nonlinear
inverse. Every output uses eight ACTUAL fractional affine shutter contexts, maps
them through the property control, freshly draws its own procedural geometry,
then reuses the existing compensated temporal reducer, Glow and Layer. This is
not a frozen-frame blend or automatic upstream Stage sampling. All21 operations
execute in live Native logic and are compared with Node results in the trace.

| Operation | Signature / semantics |
| --- | --- |
| keyframeSpan | `(keys)` → first/last/duration/count, in Stage-local frames |
| nearestKeyframe | `(keys, frame, {tie?})` → original0-based index, key and distance; earlier/later ties explicit |
| keyframesBetween | `(keys, start, end)` → original keys/indexes in a closed interval |
| shiftKeyframes | `(keys, frames)` → immutable original Core keys; negative resulting key times fail Core validation |
| retimeKeyframes | `(keys, {start,end})` → affine key retiming, original easing retained; no coincident keys |
| reverseKeyframes | `(keys, {startFrame?})` → reverse values/time and mirror incoming easing; unsupported stepped jumps fail |
| mapKeyframeValues | `(keys, pureMap)` → finite authored values; original time/easing retained |
| quantizeKeyframeTimes | `(keys, {grid,origin?,round?,collision?})` → key-grid snapping, explicit collision error/first/last |
| spliceKeyframes | `(tracks, {collision?})` → sorted authored keys with explicit collision policy; not concurrent-track blending |
| loopKeyframeValue | `(keys, context, {before?,after?,segments?})` → hold/cycle/ping-pong/offset/continue |
| sampleKeyframeMotion | `(keys, context, {stepSeconds?,scheme?})` → value, numerical v/a, estimate and boundary/jump/stencil diagnostics |
| integrateKeyframes | `(keys, fromFrame, toFrame, context)` → original easing integral in value×local-seconds |
| averageKeyframes | `(keys, context, {widthFrames,alignment?})` → exact Core easing-window integral / physical duration |
| keyframeValueBounds | `(keys)` → endpoints + cubic stationary values, includes overshoot; numerical, not an interval certificate |
| findKeyframeCrossings | `(keys, target, {valueTolerance?})` → all cubic branches, plateaus and discontinuity diagnostics |
| invertKeyframeValue | `(keys, target, {policy?,nearFrame?,valueTolerance?})` → explicit first/last/nearest branch or unresolved |
| keyframeEventsBetween | `(keys, fromFrame, toFrame)` → directional (from,to] crossings, no callback dispatch/history |
| quantizeKeyframeValues | `(keys, {step,origin?,round?})` → snap authored values; interpolated values still use Core easing |
| normalizeKeyframes | `(keys, {min,max,constant?})` → affine values from observed bounds, explicit constant-track policy |
| blendKeyframeValues | `(a,b,weightSignal,context)` → actual Core values at one context, unit weight |
| keyframePulse | `(keys,context,{widthFrames,shape?,amplitude?})` → proximity pulse: triangle/Gaussian/box |

Inputs are existing numeric key tracks only: string/color/path properties are not
quietly interpreted as numbers. Pure callbacks edit authored keys, not evaluated
curve samples. All return values are finite; original Core key validation rejects
negative, unordered, collapsed times and unsupported easing. Operations snapshot
mutable inputs and return frozen Core data; they are O(key count), not a global
mutable-track cache. Very large tracks should be prepared at authoring/init;
no arbitrary permanent artistic key-count cap is added.

Incoming key owns easing exactly as Core. Reverse swaps easeIn/easeOut and mirrors
cubic controls; a nonconstant incoming step reverses to a right-hold jump that
Core's incoming step cannot represent. `reverseKeyframes` therefore fails. For
that case sample the original track using existing `sampleSignalAtTime` and an
explicit reverse time map, preserving the original discontinuity. No step ABI
change or epsilon-spaced fake keys. Quantization/splice first/last policies are
explicit edits and do not promise shape preservation after collapsing keys.

Loop defaults are before=hold, after=cycle. The actual authored interval is always
unchanged, including the exact final key value. Optional segments chooses the
first N key intervals before the first key, last N after the last. Offset adds
whole-cycle endpoint delta. Continue uses the analytic ONE-SIDED endpoint slope
of the declared easing, including higher-order cubic cancellation; it rejects
infinite slopes and a jumped trailing endpoint. It does not substitute an eased
endpoint secant. This is the underlying continuous curve slope, not a claim about
the derivative of Core's finite36-step Bezier inversion quantization or AE's
private velocity implementation. Ordinary queries do not mutate any context.

Derivative estimates reuse `sampleMotion2D`, explicitly local clock, with
Richardson error heuristics. They do not certify smoothness: a key/step or stencil
crossing is reported. Exposed stepSeconds is in local seconds; v is value/sec and
a value/sec². Integral/average directly reuse existing `createSpeedRamp` as a
unit adapter, without another evaluator. Core's finite precision and primitive
subtraction residuals remain; huge nearly cancelling intervals are not certified.

Bounds/crossings derive stationary frame fractions from the declared cubic and
reuse the already-audited EffectCraft-adapted `cubicPoint`. Actual property values
and bisection decisions use Core `keyframesAt` exclusively. Every monotonic piece
is queried, including overshoot. Default absolute valueTolerance1e-8 is a query
residual target, not a frame or pixel tolerance. Point results retain their actual
residual and resolution-limit when Float64/Core inversion prevents convergence.
Flat intervals preserve right inclusion; step interiors produce jump diagnostics,
never an invented interpolated time. An open plateau's last IEEE Float64 frame is
used for last/nearest queries. Numeric inverse branches are not media optical flow
or a proof of invertibility. No permanent root-count or artist sampling cap: each
Core cubic has finitely many stationary pieces; bisection stops at Float64 precision.

Events return0-based original key indexes in traversal order. Forward excludes
fromFrame and includes toFrame; reverse does the corresponding reversed interval.
Same-time queries return no events. Overlapping queries may return the same key:
no implicit exactly-once queue or side effect is claimed. These are authored key
crossings, not audio beats, tracking observations or new timeline markers.

Pixel work is exclusively existing admitted Native GPU, scene-linear PM16F/32F,
signed HDR, one owner, no CPU pixels/browser/SDR fallback. Math is CPU Float64.
This module adds no GPU shader or general image kernel, no Resource import/state
mechanism and no new rendering path. The four-panel reference independently checks
uniform moving-rectangle coverage away from raster edges against source-time plans;
that is not an analytic AA or arbitrary-shape area certificate. Explicit post-ticket
GPU buffer exports are test diagnostics; the pipeline is not claimed readback-free.
PNG/MP4 are explicit display conversions; EXR is the professional float reference.

Automatic same-Stage stateless upstream temporal sampling is separately authorized
by the human for Main/Agent-1; it remains awaiting implementation/verification.
This module uses only the pre-existing explicit NativeTimeSource and cannot seek
other Stages, replay arbitrary JS, fork V-SHARED commits or restore simulations.
Core/owner work is not implemented or authorized to Agent-2 by this checkpoint.

Reproduce with worktree-local existing frozen Native/SpiderMonkey binaries:
```
node --import tsx --test tests/pro-animation-keyframe-control.test.ts tests/pro-animation-keyframe-control-stage.test.ts tests/pro-animation-pa3-time.test.ts tests/pro-animation-native-time-lifecycle.test.ts
node node_modules/typescript/bin/tsc -p modules/pro-animation/validation/keyframe-control-tsconfig.json
node --import tsx modules/pro-animation/validation/check-keyframe-control-media.ts
node --import tsx modules/pro-animation/validation/check-keyframe-control-png.ts
```
No build/download/install/permission/lock refresh is necessary. Evidence covers
Windows RTX5070/Vulkan,8 finite output frames and source L0/L1/L2. Main formal
R1/install/six-export/platform/L3 remains separate. No AE private parameter/pixel
compatibility test or coverage percentage is claimed.

Reuse: Core Apache-2.0 interpolation/validation; original speed integral/remap and
motion sampler; existing EffectCraft path interpolation MIT at fixed commit
861c51f8187bf56efc77cc7b60fc4a513d2b7198. No translated foreign time engine is needed.
Source identities/NOTICE: `provenance/keyframe-control/`. The official
[Adobe expression reference](https://helpx.adobe.com/after-effects/desktop/work-with-expressions/expression-language-reference/expression-language-reference.html)
is a behavior-category reference only; no Adobe code, assets or object model copied.
