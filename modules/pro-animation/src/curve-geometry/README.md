# Precise original-curve queries → motion → Native GPU

22 useful source functions and one uncounted owned factory form the chain. These
are not22 AE effects or a coverage/compatibility score. Main owns formal public
exports/types/R1 version/permissions/Lock/L3; private test identities are not
installed public capabilities.

```ts
const geometry = await createCurveGeometry(reviewedCurveKernelFactory, path);
const project = curveProjectionMotion(geometry, existingCoreMotionCallback);
const result = await project(context); // actual nearest quintic solve + derivative
const pieces = await curveClipRect(geometry, [20, 20, 600, 350], {segment: 0});
// Existing canonical outline preparation, Native drawPathMesh, Glow and Layer:
// PathData -> prepareSolidPathStroke(...existingPathOperations) -> Native pixels.
await geometry.dispose();
```

Factory is an existing authorized R1/Kit data loader, not an arbitrary Worker file,
module path, download or Node plugin runner. **Same original createCurveSampler
initializes and owns the same original Engine**; new geometry methods add owned
query-result transport. No second reader, scheduler, renderer, time/Graph system,
registry/store or Core/P4 contract is introduced. Original sampler values match
exactly through the extended carrier. Units: top-left/y-down physical pixels,
local segment parameter t[0,1], derivatives px/t and px/t², curvature1/px.
Core Signal/FrameContext stays unchanged; queries contain no wall-clock/history.

## Capabilities

| Function | Contract |
| --- | --- |
| curveBounds | Original tight Bezier extrema AABB of selected nonzero curve segments. |
| curveControlBounds | Original representation's control hull AABB, distinct from tight outline bounds. |
| curveSignedArea | Explicit closed contour analytic algebraic area, translated/compensated; positive clockwise in y-down coordinates. Not aggregate fill/Boolean coverage. |
| curveWindingAt | Original closed-contour winding for ordered physical XY batches, including duplicates. |
| nearestCurvePoints | Original quintic/line/quad nearest, source segment/t/point/squared distance/arclength prefix; ordered duplicates preserved. Empty/degenerate projection=null. |
| curveContact | Nearest boundary distance + declared selected-contour NonZero/evenodd classification. No aggregate multi-contour/hole fill inference. |
| curveJets | Original evaluation/first and second derivatives/speed/tangent/curvature for ordered t batches. Exact stationary derivative gives null tangent/curvature. |
| curveNormals | Real canonical normal-guide PathData; undefined directions have no fabricated guide. |
| curveOsculatingCircles | Signed-curvature centers/radii; stationary/straight return explicit null. |
| curveExtrema | Original isolated interior extremum parameters and points. |
| curveInflections | Original cubic/raised-quad inflection events. |
| curveTangentsFrom | Original isolated tangent-to-external-point roots; coincident/continuum solutions not enumerated. |
| curveLineCrossings | Original finite probe intersections; source/probe parameter and endpoint-extension status, chunked by source segments. |
| curvePortion | Exact original L/Q/C subsegment, including explicitly reversed t ranges. |
| curveSplit | Strictly ordered distinct user cuts, preserving original polynomial portions. |
| curveMonotonePieces | Original extrema-range decomposition with retained L/Q/C. |
| curveInflectionPieces | Original inflection parameters split exact source portions. |
| curveFlatten | Original kurbo tolerance-driven flatten, canonical path chunks; no whole-path artistic cap. |
| curveQuadraticPieces | Original cubic-to-quadratic approximation with source t ranges. |
| curveClipRect | Open centerline clipping retaining original subcurves. Not reconstruction of a filled region/Boolean or certified topology. |
| curveProjectionMotion | Existing authored point motion at explicit context → nearest projection → original derivative orientation. No timeline or simulation runner. |
| curveProjectionLeaders | Lazy canonical source-to-projection guides for actual observed query results. |

Select `contour` explicitly for compounds; `segment` means ORIGINAL source segment
ordinal, including gaps from zero-length segments elided by the original sampler.
Move-only/zero geometry yields null bounds/projection; querying an excluded segment
fails explicitly. No point at the origin is manufactured. For one-sided endpoint
limits use the original CurveSampler; raw differential jets report true zero
speed instead of substituting a limit. Exact original sampling budget remains.

## Numerical boundaries

- `parameterAccuracy` defaults1e-9, must be(0,1], and is **root parameter tolerance**,
  not a physical nearest-distance certificate. Approximation `tolerance` is in px;
  original coordinate-resolution checks reject unattainable requests explicitly.
- Original kurbo curvature sign is negated to standard dx*ddy-dy*ddx convention;
  exact stationary values remain null. Huge/nonfinite results require rescaling,
  never implicit clipping or substitution.
- Original intersect_line has internal EPS=1e-9, does not enumerate coincident
  spans and can return slightly extended endpoint roots (flagged withinSegment).
  Clip uses isolated intersections and midpoint interval classification. Tangent
  contacts of zero measure are not emitted as fake filled path pieces. These APIs
  do not certify arbitrary near-degenerate/overlap topology or replace Clipper2.
- Original approximation/decomposition code is retained. Quadratics need not be
  G1 continuous. Tolerance tests compare actual numeric errors; no analytic AA or
  path equivalence claim is inferred from an image.
- Queries batch transport in1024 points/128 segments/read4096 words, not total
  artistic caps. Existing Graphics command policy chunks flattened paths. One
  original approximation segment is still buffered in WASM/JS; not a bounded-total-
  memory or real-time guarantee for extreme tolerances. Owner/Kit memory and
  canonical safety limits remain; no permanent resolution/path/simulation cap.

## Lifetime, resources and drawing

One owned client, one current query result; concurrent calls reject E_PA_GEOMETRY_BUSY.
Source path is an immutable prepared snapshot. Parameters/owned result rows are
validated, and each completed/failed query clears its result. Pre-abort preserves a
healthy client; in-flight abort terminates the owned client. dispose waits for active
cleanup and reports cooperative versus terminated without inventing Rust Drop0.
No cache or partial success Artifact is published. Persisted query data must use
existing Resource/AnalysisArtifact integrity; this local API doesn't authenticate
arbitrary external JSON or GPU buffers. No unapproved resident-GPU geometry export.

Geometry is CPU F64/original Rust-WASM. Pixels use the EXISTING admitted Native GPU
mesh/stroke/palette/Glow/Layer only, signed linear HDR PM F16/F32. No CPU/Canvas8/
browser pixel fallback, new device/shader or implicit SDR reduction. Existing
F32 upload/stride/dimension/F16 range/raster policies remain, no threshold loosening.

Editable TSX/data preparation: validation/curve-geometry-scene and
`node --import tsx modules/pro-animation/validation/prepare-curve-geometry.ts`.
The example explicitly prepares8 original-query geometry frames, then evaluates
existing motion Signals/cubic arithmetic live in Native JS. It does not claim
native-host WASM initialization, arbitrary subframes or automatic upstream Stage
resampling. Main/Agent-1 have confirmed that last Core gap remains unimplemented;
see docs/pro-animation/PA3_TEMPORAL_UPSTREAM_REQUEST.md. Formal install, six-export,
additional platforms/GPUs/4K/extreme geometry pressure stay Main L3.
