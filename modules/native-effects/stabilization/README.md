# Native sequence stabilization

Completion rounds 3 and 7/8. A private Stage-safe library on the existing Native owner,
Pixel/Compute/Field leases and recipe lifecycle. No new host, DAG, persistent
state system, CPU pixel fallback or automatic upstream sampler.

```ts
import {createNativeStabilizationEffects} from './stabilization/index.ts';
const effects = createNativeStabilizationEffects(init);
const output = await effects.processImage(current, async (image, fx) => {
  const sequence = await fx.analyzeCameraSequence(observations, {
    model: 'affine', maximumGapSeconds: .1, meshColumns: 6, meshRows: 4
  });
  const path = await fx.optimizeCameraPath(sequence, {
    acceleration: .0003, jerk: .000001
  });
  const map = await fx.stabilizationMap(path, {time, mode: 'mesh'});
  const crop = await fx.planAutoCrop([map]);
  return fx.warpStabilized(image, map, {crop});
}, {context});
// await effects.dispose();
```

`stabilizeSequencePath(image, observations, options)` composes the same methods.
Default `crop:'sequence'` computes a shared valid crop for all observed frames;
`'frame'` uses only the current mapping, and `'none'` preserves transparent edges.
The editable TSX entry is `../examples/stabilization-chain.tsx`.

## Explicit observations and time

An observation is `{time:{num,den}, image, motionToPrevious?, weight?}` or
`{time:{num,den}, observed:false}`. Times are exact rational **seconds**. Inputs
sort by integer cross-products, reject duplicates and keep explicit missing
samples. A missing sample, excessive gap, or failed fit starts a new segment.
No smoothing row crosses segments, no trajectory is invented across occlusion,
and no wall-clock history determines random/backward/repeated requests.

Optional motion is the existing full-origin f32 image field with channels
`dx,dy,confidence`, units `pixels-per-sample`, current centres to previous centres.
Without it the existing robust bidirectional pyramidal LK and confidence rejection
run on the same GPU. Models reuse the existing IRLS translation, similarity,
affine or homography fit. Dimensions and actual working colour are checked.
Weights are positive finite controls, not a new animation system. Existing
Signals resolve scalar effect controls through the supplied FrameContext.

Each model maps normalized current centres to previous centres. Composition
produces absolute segment-relative camera poses. Camera path parameters use
normalized row-major homographies with fixed last coefficient one, followed by
2D mesh-node coordinates. Diagnostics per observation are validity, data weight,
fit RMS and new-anchor flag; segment IDs remain u32. No model/pose readback to JS.

## Temporal and local solve

`optimizeCameraPath` minimizes the quadratic objective of data fidelity plus
velocity/acceleration/jerk penalties. CPU work creates only small nonuniform
divided-difference control stencils, using exact rational time differences.
GPU banded normal assembly, Cholesky and multi-right-hand-side solves operate
in O(sequence length) for fixed bandwidth. This is path optimization, rather
than blending already warped images. `strategy:'locked'` uses the segment's
anchor viewpoint for every valid observation. Rank/positive-pivot failure stays
explicit in typed GPU diagnostics.

Local mesh nodes observe robust residual motion beyond the fitted global model.
Weighted spatial regularization uses reusable observation and ping-pong buffers.
Absolute meshes compose through previous meshes; their node trajectories use
the same segment-aware temporal objective. Bilinear mesh sampling includes
analytic Jacobians. Inverse Newton mapping rejects nonpositive Jacobians,
singular projective divisions and excessive residuals. The map reports physical
source coordinates as hi/lo pairs, status 0 invalid / 1 outside source centres /
2 inside source centres, and determinant. This is a regular 2D image mesh, not
Agent-4's 3D meshes, particle/Puppet state, camera reconstruction or a new
Graphics Contracts persistent object. It is not the proprietary AE algorithm.

## Framing and sampling

`planAutoCrop` intersects the geometric validity of one or many maps entirely
on GPU. An exact u32 summed-area table tests candidate rectangles. Deterministic
binary search finds the largest aspect-preserving axis-aligned rectangle on
the integer primary-axis sample grid, then chooses the position nearest centre
with stable scan-order ties. Scaling is isotropic. Original artistic Alpha holes
do not count as geometric crop failures. No synthetic black or generated border
is used to hide a missing mapping.

`maxZoom` is optional; zero/unset means no artistic zoom constraint. If there is
no admissible nondegenerate crop, or the largest crop exceeds that constraint,
the returned transform has validity zero. Default warp yields transparent output
and retains the diagnostic; it does not silently relax quality or invent a crop.
Use `fitStabilizationFraming`, or opt into `fitMaxZoom:true` on the composite
method, for an explicit strength-versus-zoom tradeoff. Temporal observed-edge
synthesis is available separately. Arbitrary crop-rectangle rotation is not claimed.

`warpStabilized` interpolates the source-coordinate map, then samples the original
image with the existing qualified bilinear PM sampler. Crop validity guarantees
all contributing map points lie within the source-centre domain. Amount blends
with the original associated image at the normal logical publication boundary.
Default format inherits F16/F32. Signed scene-linear HDR, negative RGB, Alpha-zero
PM emission, and existing real working-colour conversion remain intact; no RGBA8
or PNG intermediate, implicit tone map, per-effect CPU transfer or reordered
Half publication is introduced.

## Ownership, budgets and qualification

Sequences, optimized paths, maps and crops belong to this recipe only. Kinds,
versions, dimensions, time and ownership are checked; runtime handles never
enter persistent TVG/JSON. Cancellation rejects new recordings; already accepted
work follows the owner. Scratch and result leases use the existing processor;
double disposal and failure/retry are tested. An optional inspection callback
publishes admitted GPU data, never grants Stage filesystem/network/readback.

No image or sequence-size ceiling is introduced by this module. Full coordinate
maps must fit actual binding/session budgets; common crop may retain multiple
maps. These global operations are not claimed transparently tileable. The
synchronized frozen Core ba2b2d6 provides configurable declaration admission;
original guard failures remain in the earlier evidence. Observation, flow and
framing workspaces reuse buffers; device/session budgets still apply. This does
not establish unbounded sequence capacity or repair cross-frame binary Resource
seed identity.

`NUMERICS.json` fixes unchanged scaled F32 `3e-6` / F16 `6e-4` gates before tests.
The independent F64 reference uses a dense solve and exhaustive crop search,
not the production banded/area-table implementation. `validate.mjs` keeps one
cumulative campaign below 420 seconds including original failures and setup.
Actual device/driver, binary/source receipts, raw commands/logs, PNG, F32 EXR,
decoded MP4 and performance are frozen as evidence. The matching local
SpiderMonkey debug host and Native production release are explicitly recorded.

Public SDK/R1/portable identity is Main-owned. Other vendors/OS, all parameter
combinations, arbitrary footage and proprietary AE control/pixel parity are not
inferred from numeric fixtures. This checkpoint does not prove total AE coverage;
the complete requirement/parameter crosswalk and remaining rounds stay open.

## Round 7 framing and observed-edge synthesis

```ts
const framing = await fx.fitStabilizationFraming(path, {
  time, mode: 'mesh', maxZoom: 1.2, strengthSamples: 17,
  scope: 'sequence', preserveScale: true
});
const cropped = await fx.warpStabilized(image, framing.map, {
  crop: framing.crop, cropMode: 'mask' // fixed canvas, no enlargement
});
const filled = await fx.synthesizeStabilizedEdges(image, path, {
  time, mode: 'mesh', inputRangeSeconds: .25,
  timeSigmaSeconds: .125, edgeFeatherPixels: 0,
  edgeCrop: [0, 0, 0, 0]
});
return filled.image;
```

These are independent output alternatives; the composite
`stabilizeSequencePath` also accepts `crop:'synthesize'`, or
`crop:'frame'|'sequence', fitMaxZoom:true`. Existing defaults retain the
previous strength and zoom-failure behavior. `cropMode:'scale'` remains the
default. `cropMode:'mask'` requires a crop and masks outside its integer rectangle
on the original fixed canvas; it neither changes output dimensions nor enlarges
the retained image.

The framing planner checks every strength on the declared finite lattice from
zero to the requested strength. It selects the **largest admissible sampled**
strength; it does not assume that arbitrary mesh validity is monotone. The
returned resolution and sample count state the search quality explicitly. A
fixed map, validity/prefix/crop workspace is reused across candidates and
observations. No per-candidate GPU readback or JS geometry decision occurs.

`preserveScale:true` removes the change in global camera magnification measured
at the image centre: the target input coordinates are multiplied by
`sqrt(det J_original / det J_target)` before inverse mapping. Global and local
mesh mapping use the same centre scale. This is a precisely defined global
magnification constraint, not a guarantee of area preservation at every pixel
under projective/local deformation. Nonpositive or singular determinants remain
invalid. To prevent numerical roundoff from adding an entire crop row, the new
planner snaps coordinates within `max(width,height)*2^-40` pixels of an exact
source-centre boundary; it never substitutes the larger artist Newton tolerance.

Edge synthesis reads the **actual observations recorded by this analysis**, not
an automatic upstream Stage sampler. It maps primary coordinates through the
camera/mesh path into each eligible donor, requires the same segment and valid
geometry, bilinearly samples associated source pixels and normalizes explicit
Gaussian time weights. Missing observations, excessive gaps and failed fits
retain the original segmentation and forbid cross-gap borrowing. Range and sigma
are seconds; crop order is left/top/right/bottom in source pixels. Geometry is
separate from artistic Alpha: with the default zero feather all valid primary
samples, including Alpha-zero emission, remain unchanged. Uncovered edges retain
the original transparent warp. The typed GPU coverage field reports synthesized
fraction and donor weight; it is not invented scene content or a confidence
estimate of disoccluded objects. Moving subjects can require narrower donor
ranges/crops. A learned generative inpainting model is not implied.

All intermediate maps, image views and accumulators remain on the existing owner.
F16 publication rounding, signed HDR/negative RGB and premultiplied Alpha are
retained. These transient GPU leases cannot be serialized into TVG. No host,
permission, shared port or public package identity changes accompany this source
checkpoint. Use `../examples/stabilization-borders-scene.tsx` for an editable shot;
the half, missing, unit-boundary and zoom entries are numerical fixtures.

Run `node modules/native-effects/stabilization/validate-borders.mjs <phase>`;
phases share the single cumulative campaign in
`artifacts/native-effects/stabilization-borders/campaign.json`, including original
failures and local matching Core builds. Frozen raw evidence lives in
`docs/native-stabilization-borders-evidence`. Other GPU vendors/OS, arbitrary
footage, runtime device loss, proprietary AE subspace/control parity, public
SDK/R1 installation and portable distribution remain separate qualification.
