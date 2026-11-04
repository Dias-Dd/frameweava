# Canonical anchor and Bezier handle controls

Source entry `src/path-controls/index.ts`:21 operations on existing `PathData`,
not21 AE effects or a coverage percentage. All geometry is CPU Float64; actual
image work reuses the existing admitted Native GPU mesh/Glow/Layer path in PM
scene-linear16F/32F. No new path/document model, layer model, Graph, Renderer,
Signal variant, solver, persistent history or package system.

```ts
// Main public wiring pending; executable TSX uses this module-local source.
import { elevatePathSegments, smoothPathAnchors, movePathAnchors,
  clampPathHandles } from './index.ts';
const cubic = elevatePathSegments(originalPath);
const rounded = smoothPathAnchors(cubic, {mode: 'symmetric'});
const edited = movePathAnchors(rounded, {
  [selectedOriginalAnchorId]: [xSignal, ySignal],
}, {handles: 'follow'}, context);
const bounded = clampPathHandles(edited, {maxLength: 48});
// Existing preparePathFillMesh / prepareSolidPathStroke with caller-owned
// reviewed pathOperations -> existing Native drawPathFill/drawPathMesh -> Glow/Layer.
```

Executable examples: `validation/path-controls-scene/project.tsx` and `half.tsx`.
Four actual compound shapes with holes show symmetric tension, anchor constraints,
independent mirrored handles, and L/Q/C elevation/smoothing. Core keys drive the
edits. Node prepares eight explicit integer geometries through original
Clipper2/Earcut; Native logic independently recomputes all21 controls and draws
live guide meshes, then actual filled shapes/Glow/Layer. Frozen filled geometry is
not arbitrary/subframe Native-host WASM tessellation. No such capability is claimed.

| Operation | Input / behavior |
| --- | --- |
| pathAnchors | `(path, work?)` → original IDs/alias IDs, pixel position, contour/ordinal, closure and command index |
| pathHandles | `(path, work?)` → incoming/outgoing controls, owner anchor, vectors, shared-Q flag |
| pathContinuity | `(path, {tolerance?,signal?})` → endpoint/stationary/corner/cusp/G1/C1 plus actual unit-segment derivatives |
| movePathAnchors | `(path, positionsById, {handles?,signal?}, context?)` → evaluated Core XY Signals; follow/fixed controls |
| movePathHandles | `(path, positionsById, work?, context?)` → explicit control IDs, Q shared motion remains coupled |
| mirrorPathHandles | `(path, {anchors?,driver,length?,signal?})` → opposite handle, preserve/match length |
| alignPathAnchors | `(path, {anchors?,axis,target,handles?,signal?}, context?)` → min/max/center or numeric Signal target |
| distributePathAnchors | `(path, {anchors?,axis,start?,end?,handles?,signal?})` → sorted equal spacing, stable contour/ordinal ties |
| snapPathAnchors | `(path, {anchors?,grid,origin?,round?,handles?,signal?})` → explicit nearest/floor/ceil grid |
| straightenPathSegments | `(path, {anchors?,signal?})` → selected segments ENDING at anchor become L, endpoint IDs retained |
| elevatePathSegments | `(path, {anchors?,degree?,signal?})` → selective exact L→Q/C and Q→C, existing interpolation reused |
| smoothPathAnchors | `(path, {anchors?,mode?,strength?,fallback?,signal?}, context?)` → aligned/symmetric tangents, explicit fallback |
| setPathHandleLengths | `(path, {anchors?,incoming?,outgoing?,signal?}, context?)` → physical px, nonnegative lengths |
| rotatePathHandles | `(path, {anchors?,degrees,signal?}, context?)` → clockwise y-down rotation around original anchor |
| scalePathHandles | `(path, {anchors?,scale,signal?}, context?)` → component scale of handle vectors, including explicit mirroring |
| clampPathHandles | `(path, {anchors?,maxLength,signal?}, context?)` → limit length while preserving direction |
| projectPathAnchors | `(path, pureProjection, {anchors?,handles?,signal?})` → interoperability with existing point constraints |
| transformPathPoints | `(path, [a,b,c,d,tx,ty], work?)` → affine transform of every canonical anchor/control, degree/IDs retained |
| fitPathControlBounds | `(path, {box,mode?,signal?})` → centered contain/cover/stretch of explicit control-point bounds |
| reflectPathPoints | `(path, {from,to}, work?)` → existing line projection reflected, no new constraint solver |
| pinPathAnchors | `(path, explicitReference, {anchors?,handles?,signal?})` → selected original ID coordinates, not a stateful pin |

Selection defaults to all anchors; [] is a real empty selection. Coordinates are
physical px, +x right/+y down. Non-numeric XY controls require an explicit existing
FrameContext and are evaluated by Core. No global current time, new timeline or
invented ease/noise evaluator. Inputs are snapshotted by original Graphics
validation, edited outputs are frozen canonical data. Unknown IDs, conflicting
moves, invalid units/matrices, nonfinite results and pre/mid-operation cancellation
fail before publication; original inputs remain unchanged.

Every PathData point keeps its original ID except newly required degree-elevation
controls/explicit closing endpoint. Straightening intentionally removes selected
control IDs. New IDs are deterministic and checked against all original IDs.
Segments are selected by their END anchor ID, including the closing segment at M.
The canonical command index may change on explicit Z-edge elevation; stable IDs
are the authoring key, not a stale command index.

A closed contour's explicit final endpoint EXACTLY coincident with M is one logical
anchor with both point IDs exposed. Both coordinates move together. No epsilon
welding, interior coincidence welding or cross-contour welding. Consequently a
newly collapsed closing edge can change logical query anchor count, while all
wire point IDs remain present. This is an observable derived grouping, not a
persistent topology identity or automatic self-intersection repair.

A quadratic has ONE shared control. Its two role records expose shared=true.
Direct movePathHandles intentionally changes both roles. Following two endpoint
moves is accepted only when both propose exactly the same control position;
conflicting moves fail rather than silently averaging. Independent mirror,
length/rotation/scale/clamp/smooth edits reject shared Q controls: explicitly use
selective elevation first. No implicit curve approximation or hidden degree change.
Whole-path affine transform is naturally valid on Q without this restriction.

Aligned smoothing preserves the two lengths; symmetric smoothing uses their mean.
Full strength aligns the travel tangents; a partial strength is an explicit blend
and does not promise G1/C1. Opposing/zero tangent sums use the declared chord/error
fallback; a zero fallback direction fails. Expanding a zero-length handle without
a direction also fails. Open endpoints have no invented opposite segment/handle.
C1 compares dP/dt for each segment on its own normalized [0,1], not arclength speed
or curvature/C2 continuity. G1 is travel-tangent alignment. Defaults use1e-9 relative
C1 speed tolerance / angular tolerance in radians; stationary derivatives remain
explicit rather than assigned a fictitious angle.

Fitting uses CONTROL bounds, not tight curve/ink/stroke/Glow bounds. The curve is
inside its control hull; stroke radius/Glow can extend outside the fitted box.
Negative handle scales, projection, alignment and snapping may create cusps,
coincident anchors or self-intersections; the explicit original fill rule and
existing fill solver remain authoritative. There is no topology/clearance/collision
certificate or Puppetry/IK/physics solver. Pins restore reference positions and
apply chosen handle-follow policy; they do not restore all original handle shapes.

No new permanent path/contour/sample cap. Original Graphics command/point/coordinate
and current Native resource admission still apply. Indexing is linear in commands,
including many contours, and avoids spreading arbitrary point arrays into argument
lists. Geometry edits are synchronous cooperative math, not preemptively cancellable
jobs. Long precomputation can use existing AnalysisTask/Worker externally.

Actual proof:16 new L0 tests + one Native16F/32F test +3 targeted existing canonical
conversion/contour/fill regressions. Node/Native traces compare original coordinates,
IDs, closures and continuity; published GPU guide positions equal the F32-quantized
Node values. This is not zero unquantized F64 geometry error. Actual interior ink,
four hole probes/frame, Alpha/HDR/negative RGB and repeat4/0/7/4 are checked.
No new analytic raster AA/edge or all-shape geometry certificate is asserted.
PNG and MP4 are explicit display conversions; EXR is the float reference. Original
transparent PNG and separate black composite are retained for viewer alpha behavior.

Reproduce with own existing frozen toolchains, no downloads/build/lock refresh:
```
node --import tsx modules/pro-animation/validation/prepare-path-controls.ts
node node_modules/typescript/bin/tsc -p modules/pro-animation/validation/path-controls-tsconfig.json
node --import tsx --test tests/pro-animation-path-controls.test.ts tests/pro-animation-path-controls-stage.test.ts
node --import tsx --test --test-name-pattern "canonical L/Q/Z|explicit contour select|canonical fill keeps" tests/pro-animation-smart-morph.test.ts
node --import tsx modules/pro-animation/validation/check-path-controls-media.ts
node --import tsx modules/pro-animation/validation/check-path-controls-png.ts
```

Main owns public named exports/R1 version/locks/SDK permission/install/six-export/L3.
The source entry is not a claim of an installed public capability. Windows RTX5070/
Vulkan is verified; other platforms,4K/long tracks and native-host WASM are not.
Automatic upstream temporal binding is separately authorized for Main/Agent-1,
awaiting implementation/verification; this module does not modify that Core seam.

Reuse/NOTICE: original Graphics and point constraints Apache-2.0; existing
EffectCraft-adapted lerpPoint MIT@861c51f; existing Clipper2 Rust1.2.0/BSL-1.0 and
Earcut3.2.4/ISC. Source hashes and existing notices are in provenance/path-controls.
No new dependency, renderer/document model, permission or foreign editor is needed.
