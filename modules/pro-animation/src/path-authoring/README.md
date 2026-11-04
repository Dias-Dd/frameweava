# Curves and parametric paths → Native drawing

25 useful named entries form a single geometry-to-image chain: **23 generators,
one original constant-width stroke preparation adapter and one Native drawing
convenience function**. The size/context facade is additional and not counted as
an effect. This is not25 new AE effects, full D3 compatibility or a coverage score.
Shared exports, formal R1 version/permissions/locks and L3 remain Main-owned.

## Ordinary TypeScript usage

```ts
const paths = createPathAuthoring({width: 640, height: 480});
const path = paths.at(context).catmullRomPath({
  points: [[40, 140], [120, 50], [200, 130], [300, 80]],
  alpha: .5,
});
const mesh = await prepareSolidPathStroke(path!, {
  pathOperations, // existing authorized geometry session; caller retains ownership
  context, width: 6, cap: 'round', join: 'round',
});
// In the existing Native Stage, with this explicitly prepared geometry:
const image = await drawPathMesh(init, mesh, context, {
  ink: solidStrokeInk([-.1, .8, 3, .8]),
});
```

`pathOperations` uses the existing reviewed Kit/R1 loader. This API does not download
code, invent a factory, choose a Worker file or grant WASM permissions. Expensive
geometry may be explicitly precomputed outside rendering with existing resources
and analysis infrastructure. The example carries actual geometry as ordinary typed
data; private verification fixtures are not advertised as installed capabilities.

Direct functions use `(options, environment, context?)`. `createPathAuthoring(init)`
captures dimensions/space once; `.at(context)` binds the explicit existing frame.
There is no global current frame or mutable timeline. Literal parameters do not
need a clock; Signals require an explicit FrameContext and retain Core semantics.
All outputs are canonical **PathData|null**, in top-left/y-down physical pixels.
Null means no generated commands; zero-length geometry remains explicit and may
be rejected by length/outline consumers. No fake origin point or bitmap is used.

## Curves (9)

These call the original, unchanged d3-shape curve implementations. `points` is an
ordered array of `[x,y]` numeric/Signal tuples; null creates an intentional gap.

| Function | Options and semantics |
| --- | --- |
| `linePath` | Linear; boundary clamped(default) or closed |
| `stepPath` | Before/middle(default)/after; clamped endpoints |
| `basisPath` | Cubic B-spline; clamped/open/closed |
| `cardinalPath` | Cardinal spline; tension0..1, clamped/open/closed |
| `catmullRomPath` | Alpha0..1, default centripetal .5; clamped/open/closed |
| `monotonePath` | X(default)/Y; strictly ascending or descending chosen coordinate per run; never silently sort |
| `naturalPath` | Natural cubic with zero endpoint second derivatives |
| `bumpPath` | Cubic bump with X(default)/Y-oriented tangent control |
| `bundlePath` | Original bundled basis, beta0..1; no area boundary interface |

Open spline modes need enough points under their original algorithm. Closed D3
curves can finish geometrically at their start without emitting closePath; the
adapter adds canonical Z for each closed run, including gap-delimited runs.
This preserves closed-stroke join semantics instead of treating it as an open cap.

## Areas, polar paths, arcs and symbols (5)

* `areaPath({points,curve?,...})`: `[x,lowerY,upperY]` triples/gaps; canonical closed
  boundaries. Bundle is rejected because its original curve lacks areaStart/End.
* `radialLinePath({points,center?,curve?,...})`: `[angleRadians,radiusPx]` tuples;
  original D3 polar convention is angle0 at12 o'clock, positive clockwise.
* `radialAreaPath({points,center?,curve?,...})`: `[angle,innerRadius,outerRadius]`
  triples/gaps; original polar area algorithm. Cartesian monotonicity is not
  inferred from polar input; monotone/bundle area choices are rejected explicitly.
* `arcPath({outerRadius,innerRadius?,center?,startAngle?,endAngle?,padAngle?,padRadius?,cornerRadius?})`:
  original padded/rounded D3 circular arc. Default angles0..2π; same polar convention.
  The original algorithm normalizes swapped radii and limits corners to geometry.
* `symbolPath({type?,size?,center?,rotation?})`: circle(default), cross, diamond,
  square, star, triangle, wye, asterisk, plus, times. Size is the upstream D3 px²
  measure; open stroke markers retain upstream semantics. Other D3 APIs/markers
  are not implicitly exported or claimed supported by this subset.

## Parametric primitives (9)

All placed primitives default to Stage center. Rotations are radians clockwise in
y-down coordinates. Polygon/star first point defaults to the top; other local
parameterizations start on their ordinary positive-X/trigonometric phase.

| Function | Inputs |
| --- | --- |
| `rectanglePath` | size `[width,height]`; rotation/center |
| `roundedRectanglePath` | size and circular radius; explicit clamp to half each dimension |
| `ellipsePath` | radius `[rx,ry]`; affine-scaled circular cubic lowering |
| `regularPolygonPath` | integer sides>=3 and radius |
| `polystarPath` | integer points>=2, outerRadius, innerRadius(default half), inner<=outer |
| `spiralPath` | linearly changing start/end radius, signed turns(default3) |
| `sineWavePath` | positive length, amplitude, cycles(default2), phase in cycles |
| `lissajousPath` | radius, frequency(default3/2), phase radians(defaultπ/2,0); closed requires integer frequencies |
| `superellipsePath` | radius, positive power(default4) |

Last four use an explicit polygon sample count, default128. This is a quality
setting, not an upper cap or universal error guarantee. Tests include5000 samples.
Existing Graphics command limits and optional caller maxCommands remain in force.
Use existing modifiers, Boolean/Offset, Trim and Morph for downstream composition;
none are replaced by these generators. No new global geometry/document model exists.

## Precision and data

Pure geometry/control uses Float64. Original D3 cubic interpolation is retained;
there is no SVG string serialization or decimal rounding. Circular callbacks must
lower to existing PathData cubic commands: cubic Hermite interpolation uses the
per-coordinate real-arithmetic bound r·angle⁴/384, conservatively propagated through
the affine map. Default arcTolerance .001px. This interpolation bound excludes
ordinary Float64/trig roundoff, upstream arc tolerances and later tessellation;
it is not an aggregate Hausdorff/pixel certificate for arbitrary scales or cusps.

`prepareSolidPathStroke(path,{pathOperations,width,context?,cap?,join?,...})` borrows
the original Clipper2 stroke solver, including its flattening/grid/arc tolerances
and resource/abort diagnostics. Unchanged Earcut triangulates canonical solid
faces, rebased locally for area arithmetic. Relative area disagreement above
1e-10 fails. Input PathData is not modified. Returned local PreparedStrokeMesh is
for **uniform ink**, with u=0; it invents no path-distance mapping for offset faces.
It is an existing local draw result type, not a new Graphics/TVG professional schema.

`drawPathMesh(init,mesh,context,options?)` uses the existing Native stroke adapter,
shader arithmetic, texture and mesh pipeline. It uploads only the current geometry,
cleans temporary geometry/ink buffers, and transfers a caller-owned image. Init
supplies dimensions/device and default linear709/F32. Existing options expose
linear ink, opacity, position/rotation/scale/anchor, F16/F32 and cancellation.
Stable meshes may keep the lower-level createNativeStrokeRenderer prepared handle.
No second device, renderer, scheduler, pixel kernel, CPU bitmap or browser is created.
Cleanup failures are observable; returned images obey the existing frame epoch.

The real demo explicitly precomputes eight integer-frame geometries and streams
one to the existing owner per frame. Holding all eight GPU geometries during init
exceeded the existing8MiB control-message admission; this adapter preserves that
policy rather than increasing it. It is not continuous/subframe topology inference.
All23 generators also execute live inside the actual Native Stage; paired control
words are compared with Node, independently of the frozen geometry payload.
Compact integer-grid data reconstructs once and asserts the original F32 lowering.

Native pixels remain scene-linear PM RGBA16F/32F with signed/HDR RGB and explicit
F32 geometry lowering; unsupported hardware/precision fails through existing
diagnostics. No SDR8 fallback, color relabeling or hidden clipping is introduced.
Native spatial edge sampling is retained, not a new analytic-area AA certificate.

## Known boundary discovered during this batch

The earlier variable-width rib/fan preparation produced a nested tiny positive
contour inside another hole for the areaPath fixture. Its Earcut independent-hole
assumption fails the unchanged area guard (raw/local/grid deviation≈4.5196e-5).
The attempted origin-only correction was reverted; the condition remains rejected,
not silently rendered or claimed fixed. This batch uses the already implemented
constant-width offset solver, which passes all23 cases/eight frames. Raw failing
face and diagnostics are retained under docs/pro-animation/path-authoring-validation.

No AE pixel/parameter parity, R1/public installation, six-export, cross-platform,
4K or long-video qualification is claimed. Default PNG/video display conversions
are not a cross-format linear-RGB oracle; EXR is compared with actual GPU pixels.
PNG Alpha has its own8-bit quantization check. See the checkpoint/raw logs for
actual limits, command times and device evidence.
