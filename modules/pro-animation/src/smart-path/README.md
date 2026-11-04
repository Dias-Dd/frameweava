# Curve Morph → canonical fill → Native GPU

21 meaningful source functions plus one owned client factory form this chain.
These are not21 AE effects or an AE compatibility/coverage score. Shared named
exports, formal package identity/version/permissions/locks and L3 belong to Main.
The source index is `src/smart-path/index.ts`; it does not claim installation.

```ts
const morph = await createSmartMorphEngine(reviewedKernelFactory);
const pair = await prepareSmartMorph(morph, fromPath, toPath, {
  contourMap: [0, 1], // explicit outer/hole correspondence for compound inputs
  matching: 'curve', addVertices: {mode: 'total', value: 48},
});
const path = await interpolateSmartMorph(morph, pair, progressSignal, context);
const mesh = await preparePathFillMesh([path], {pathOperations});
// Reuse the existing Native Stage, owner and normal composition/Glow/Layer:
const image = await drawPathFill(init, mesh, context, {
  color: [-.1, .8, 3, .8], format: 'rgba32float',
});
// Caller releases image. Close its own reusable geometry clients after use:
await morph.dispose();
```

`reviewedKernelFactory` is supplied through the existing authorized R1/Kit module
loader, not an arbitrary Worker path/export or download. One engine owns one
original WASM client. Operations require explicit pixel PathData and use Float64;
Core Signal evaluation uses the supplied unmodified FrameContext. No timeline,
runner, registry, store or Graph/Stage/P4 contract is added.

## Functions

| Family | Names | Contract |
| --- | --- | --- |
| Canonical editing7 | pathToCubics, splitPathContours, joinPathContours, selectPathContours, reorderPathContours, openPathContours, closePathContours | Pure canonical PathData; deterministic local point IDs, explicit coordinate/fill equality and contour permutation. L/Q→C is polynomially exact; Z closure becomes an explicit cubic edge. Opening preserves that encoded edge, so coincident endpoints are intentional. |
| Original curve operations4 | reverseSmartPath, rotateSmartPath, insertPathVertices, resampleSmartPath | Single contour. Reverse swaps controls correctly; rotation changes closed first vertex. Insertion uses original DeCasteljau subdivision, preserving the outline within F64. Explicit resampling creates an approximate polyline, including approximate32-sample-per-segment spacing. |
| Correspondence/time2 | prepareSmartMorph, interpolateSmartMorph | Equal contour counts/closure, explicit bijective compound mapping. Prepare matches winding and optionally first vertex with original shape-context/position search. Original Procrustes rotation/scale plus residual or explicit linear interpolation. Prepared endpoints returned exactly at0/1; default rejects progress outside[0,1], explicit extrapolate available. |
| Diagnostics5 | morphMatchCost, morphCrossings, morphShapeContexts, morphMetrics, morphVertexPaths | Per-contour matching cost/crossing count, original5×12 descriptor, vertex-polygon/mean/RMS/approximate24-sample length metrics, and straight vertex-link PathData iterator. Crossings/links are not actual nonlinear time trajectories; none certify topology. |
| Fill3 | normalizePathFill, preparePathFillMesh, drawPathFill | Existing streamed Clipper2 fill normalization → unchanged Earcut with≤1e-10 relative area guard → existing Native mesh raster. Uniform signed/HDR straight ink becomes PM output F16/F32, scene linear; transforms/opacity use existing Signals. No gradient invented from fill u=0. |

Defaults: matching=curve (preserves original corner/curve outlines), quality50,
bendingResistance50, firstVerticesMatch=true, oneToOne=false,
addVertices={mode:pixels,value:15}. Quality/bending are finite0..100. Add total is
positive integral; percent is(0,100]; spacing positive. Original oneToOne with equal
counts takes precedence over added counts. Caller may disable addition with null.
No original artistic2000 cap is imposed: adapter preallocates requested counts
with the original subdivision algorithm and then invokes original correspondence.
Existing canonical command/resource/safe-integer policies remain enforced.

Shape-context search is O(n²) (and tested rotation candidates add cost); do not
assume real-time matching of huge paths. Prepare once in an authorized Worker or
existing analysis task when costly, retain immutable correspondence, then query
at any t without replaying history. Only one last plan/contour is resident per
client; no persistent result cache or timeline. Cancellation reaches the factory's
AbortSignal and closes the owned client; future operations require a fresh engine.
Pre-abort rejects without consuming a healthy client. Concurrent operations reject
E_PA_SMART_BUSY. dispose waits for active operation cleanup; forced termination is
reported separately and never claims a cooperative zero-session proof.

Compound mapping is deliberately explicit: no automatic semantic hole matching,
contour birth/death, feather, global shape segmentation or self-intersection-free
certification. Arc allocation/length/matching remain original approximations;
use the existing kurbo sampler for precision arclength, not morphMetrics.

## Fill repair and precision

Some retained old NonZero faces contain same-winding child loops alongside a real
hole; blindly passing every later loop as an Earcut hole rejects valid fill.
`canonicalFilledFaces` drains the original iterator, then calls SAME original
Clipper2 client/union at SAME explicit grid only for anomalous faces. It emits
W_PA_FILL_RENORMALIZED (two quantized solves). Ordinary faces pass through unchanged.
Second solve can slightly change integer-grid geometry; this is not exact source
area/Hausdorff/topology equivalence. Existing1e-10 triangulation gate remains.
Same fix is used by the existing stroke and text outline preparation paths.
A missing normalizer or still-incompatible face fails explicitly; no dropped loops,
manual hole guesses, ignored area error or unlimited normalization retries.

Meshes retain physical-pixel F64 coordinates; existing Native admission validates
F32 upload, stride/format/dimensions and F16 range. Actual pixels use one admitted
hardware owner, original native mesh/depth-peel/palette/Glow; no CPU/Canvas8/browser
fallback or new raster/Shader. Existing spatial raster edge/overlap policy remains,
not a claim of analytic AA or AE pixels. All input/color conversion is explicit.

## Reproduce the checkpoint (own isolated environment)

```powershell
node modules/pro-animation/validation/build-smart-morph.mjs
node --import tsx --test tests/pro-animation-smart-morph.test.ts tests/pro-animation-filled-faces.test.ts
node --import tsx modules/pro-animation/validation/prepare-smart-morph.ts
node node_modules/typescript/bin/tsc -p modules/pro-animation/validation/smart-morph-tsconfig.json --noEmit
node --import tsx --test tests/pro-animation-smart-morph-stage.test.ts
node --import tsx modules/pro-animation/validation/check-smart-morph-media.ts
```

Editable cases/TSX: `validation/smart-morph-scene`. Explicit preparation carries8
integer-frame geometries from original Rust/WASM; edit/reprepare for another range.
It is not native-host WASM startup, arbitrary subframe geometry, inference or
automatic upstream Stage temporal sampling. Runtime fractional times remain the
public Morph algorithm's responsibility in a host with authorized data execution.
Native media tests use the already-frozen matched SDK/native/SpiderMonkey binaries;
Main owns cross-platform/4K/long-pressure, formal install and six-export L3.
