# Vector, linear HDR color and canonical path key controls

Independent entry `property-keyframes/index.ts`. Four factories adapt original
Core scalar key tracks; all 23 methods below execute through existing Core /
`keyframe-control` / `time-controls` logic. They are not23 AE effects. Main owns
public root, typed R1 sources, package version/catalog/pins/NOTICE and portable L3.

```ts
const motion = createVectorKeyframeControls([
  {frame: 0, value: [0,0,0]},
  {frame: 24, value: [1,0.5,0.2], easing: 'easeInOut'},
], {units: 'm'});
const separated = createVectorKeyframeControlsFromComponents([xKeys,yKeys,zKeys], {units: 'm'});
const ink = createLinearColorKeyframeControls([
  {frame: 0, value: [-0.5,4,1,0.5]},
  {frame: 24, value: [-0.2,1,3,0.8]},
]);
const shape = createPathKeyframeControls([
  {frame: 0, value: firstPath}, {frame: 24, value: matchedPath},
]);
// In the existing Stage renderAt(c), using its actual/fractional context:
const position = separated.valueAt(c); // original separate-axis curves
const rgba = ink.valueAt(c);            // scene-linear Straight output
const path = shape.loopAt(c, {after: 'ping-pong'}); // canonical PathData
// Pass to existing Native extrusion/stroke/material/Layer functions.
```

Factory inputs are ordinary authored `{frame,value,easing?}` arrays. Storage is
one **unchanged numeric Core Keyframes** per component, exposed frozen through
`components`. No Signal tag, expression language, timeline, persistent property
schema, renderer, queue or automatic registration is added. Helpers are local
TypeScript objects, not live objects transported through Stage ports. Mutable
input arrays are snapshotted; callbacks must be pure. No fixed dimension/key cap
is introduced. Cost follows component × key count and existing scalar algorithms.

| Method | Semantics |
| --- | --- |
| `valueAt(c)` | Exact original Core values at existing local frame |
| `valueAtTime(seconds,c)` | Existing explicit local-time sampling; other clock fields retained |
| `span()` | Original authored time range/count in local frames |
| `nearest(frame,{tie?})` | Original key index and full value, earlier/later ties explicit |
| `between(start,end)` | Closed interval authored-key query |
| `shift(frames)` | Shift original key times; negative resulting keys fail |
| `retime({start,end})` | Affine original key retiming, incoming easing retained |
| `reverse({startFrame?})` | Original mirrored easing; unrepresentable reversed step jumps fail |
| `mapValues(pureMap)` | Edit authored whole values, not a promise to transform the entire continuous trajectory |
| `quantizeTimes(options)` | Existing grid and explicit error/first/last collision policies |
| `splice(others,options)` | Compatible value/topology/space tracks, original collision policies |
| `loopAt(c,options)` | Original hold/cycle/ping-pong/offset/continue and selected segments |
| `motionAt(c,options)` | Original per-component finite difference/status/error estimates; vector speed norm |
| `integral(from,to,c)` | Numeric component integrals in component-unit × local-second |
| `averageAt(c,{widthFrames,alignment?})` | Existing easing integral / physical window duration |
| `bounds()` | Original component value bounds; path anchor/control bounds, not an ink/geometric tight bound |
| `componentCrossings(indexOrName,target,options)` | Original scalar branches/plateaus/jump diagnostics |
| `componentInverse(indexOrName,target,options)` | Explicit scalar component inverse; no invented unique inverse of a whole vector/path |
| `eventsBetween(from,to)` | Original directional (from,to] authored-key crossings, no dispatch/history |
| `quantizeValues({step,origin?,round?})` | Scalar or per-component quantization settings |
| `normalize({min,max,constant?})` | Scalar or per-component range; same original constant policy |
| `blendAt(other,weight,c)` | Actual compatible component values at one context |
| `pulseAt(c,options)` | Existing key-proximity pulse, no new marker/event system |

`createVectorKeyframeControls` preserves inferred tuple dimensions with numeric
widening. The FromComponents factory accepts original independent x/y/z/... tracks
with different key times, easing and counts, without union-resampling their value
curves. `keyGrid` reports synchronized/separate. For separate grids, span is their
common range and count is the total authored channel events; nearest/between/events
return `component` plus the original channel index, full sampled value and the
selected channel's key/easing. Stable ties use frame then component order.
Retime/reverse preserve offsets in the common property range. Looping is per
original component interval. Map edits each channel at its original authored key
times; a coupled nonlinear map is not asserted to preserve an entire trajectory.
Pulse uses the union of original event times only, not a resampled property curve.

Colors are explicitly scene-linear Rec709/D65; RGB may be negative or HDR. The
default input/output is Straight, optional `alpha:'premultiplied'` is explicit.
Storage/interpolation/editing uses associated RGBA components. Alpha-zero hidden
Straight colors become canonical zero; nonzero PM RGB at Alpha zero is rejected.
Physical Alpha outside[0,1], including authored easing overshoot, fails without
clipping. Returned `domain` documents component units and Alpha. Color channel
normalization/quantization must choose physically valid Alpha/PM results. The
adapter does not reinterpret Core's legacy SDR string-color interpolation.

Paths retain existing PathData coordinates/fill/command topology/point IDs.
Different topology requires the existing explicit matching/Morph tools first.
Integral and derivative outputs are numeric coordinate data with units, never
fake positional PathData. Averaging/editing/blending retains the same topology.
Out-of-range coordinates still fail existing canonical validation. No global
path/rig/document model is introduced.

Derivative estimates retain original stencil/key/jump warnings and `certified:false`.
The Euclidean speed metric assumes commensurate vector units, not mixed angle /
distance channels. Color/path return no invented global speed norm. The measured
Node/SpiderMonkey reference permits **one ULP only for Math.hypot-derived speed**;
all other structured reference values are exact after normal JSON wire handling.
Raw native/Node norm values are retained. Frozen same-engine repeat pixels remain
SHA-exact. This is not an all-engine numerical certification.

Actual installed editable example is in
`docs/pro-animation/property-keyframes-validation/project/scene.tsx` (`gain`,`bend`).
Independent-axis meter motion + path keys + HDR/Alpha keys drive existing Native
extrusion and Glow/Layer. GPU-only F16/F32 pixels, actual fractional Stage rate,
out-of-order/repeat frames, analytic transparency, PNG/EXR/four-frame MP4 and TSX
edits are exercised. CPU does parameter/geometry mathematics, never pixel fallback.
Other devices/platforms/primaries, long/4K shots and production portable L3 are
unqualified. Original scalar endpoint/finite precision/step representation limits
remain explicit. Run `validation/run-pa4-property.mjs types l0 regression media`.
