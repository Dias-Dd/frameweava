# Spatial motion and point constraints

26 ordinary TypeScript functions, using existing Core Signals/keyframes/springs,
the audited Inertia adapter, Bezier geometry and Layer affine convention. They
are mathematical creation functions, not 26 AE effects or a coverage percentage.
No Signal variant, expression interpreter, rig, scheduler or simulation is added.

The mathematical path is Float64 CPU and engine-independent. In the real example,
geometry goes to existing native XYZ buffers/drawMesh, then native shutter sampling,
original PA Glow and Layer. All image work is same-owner GPU/linear F16 or F32;
there is no CPU pixel fallback, Canvas8 conversion or private rendering engine.
No shared entry, Manifest, package version, lock or runtime pin is changed here.

```ts
const leader = orbitMotion2D({center: [100, 80], radius: [60, 30], frequency: .5});
const delayed = staggerMotion2D(leader, {index: 3, delaySeconds: .08});
const bounded = ctx => constrainBox2D(delayed(ctx), {
  min: [20, 20], max: [180, 140],
}).position;
// Inside an existing Stage, pass ordinary numbers to existing scene functions:
const sample = sampleMotion2D(bounded, context, {scheme: 'central'});
const rotationDegrees = orientMotion2D(sample).rotationDegrees;
const {scaleX, scaleY} = stretchMotion2D(sample, {referenceSpeed: 200});
```

Coordinates are px, +x right/+y down; rotations clockwise degrees. Time uses
existing Stage-local seconds/frames. Inputs/outputs are standard tuples and
objects; sources are **pure** `(FrameContext) => readonly [x,y]` callbacks.
Factories snapshot cloneable parameter/Signal data, not arbitrary callback state.
All results are random-access; no previous output frame is required.

## Position sources and composition (11)

* `signalMotion2D([xSignal,ySignal])`: existing numeric Signals, including keys,
  expressions and Core springs. No second expression evaluator.
* `orbitMotion2D({center,radius,frequency?,phaseDegrees?,rotationDegrees?,time?})`:
  rotated ellipse; constant frequency in cycles/sec. Signed radii can mirror it.
* `oscillateMotion2D({center,amplitude,frequencies,phasesDegrees?,time?})`:
  independent-axis sine/Lissajous. Phases are degrees; amplitudes are px.
* `spiralMotion2D({center,radius,growth,growthMode?,frequency?,phaseDegrees?,startTime?})`:
  linear growth in px/sec or exponential growth in 1/sec; no force simulation.
* `bezierMotion2D({points,progress?,boundary?})`: four cubic controls; default
  progress is existing context.progress. clamp/error/extend is explicit. Parameter
  speed is not arclength speed; existing createPathMotion handles prepared paths.
* `springMotion2D({from,to,velocity?,startFrame?,stiffness?,damping?,mass?})`:
  two existing Core analytic springs, with velocity in px/sec.
* `inertiaMotion2D({from,velocity,timeConstantSeconds?,startFrame?,boundsX?,boundsY?})`:
  original scalar Inertia per axis. Bounds hand off to a **soft** spring; this
  is not guaranteed collision containment or clamped geometry.
* `staggerMotion2D(source,{index,delaySeconds,startTime?,clock?})`: absolute
  offset, including negative source times; no accumulation of per-frame delta.
* `loopMotion2D(source,{start,duration,mode?,clock?})`: cycle, ping-pong or
  displacement-offset loops, reusing existing remapTime. It maps the entire
  source clock, including before start; it is not an AE loopOut emulation.
* `transformMotion2D(source,{x?,y?,rotationDegrees?,scale?,scaleX?,scaleY?,origin?})`:
  existing Layer affine convention, including animated Core controls.
* `blendMotion2D(a,b,weightSignal)`: positional blend, finite weight in [0,1].

Stagger/loop default `clock:'stage'` uses the existing affine Stage map to sample
global frame/time/progress consistently. `clock:'local'` explicitly changes only
local time/frame and preserves output/global properties. Stage sampling needs
nonzero finite dt; the library never guesses a paused/unknown time mapping.

## Sampling and explicit prediction (2)

`sampleMotion2D(source,context,{stepSeconds?,scheme?,clock?})` returns position,
velocity (px/sec), acceleration (px/sec²), speed and an estimated-error object.
It uses h and h/2 Richardson finite differences, default h=1/1024sec, with
central/forward/backward schemes. It is **an approximation**, not an analytic
derivative or smoothness proof. At known jumps, clamps, wrap seams or keyframe
endpoints choose an appropriate one-sided scheme or provide explicit motion.
The correction magnitude is a heuristic and can under-report error on arbitrary
callbacks. Large coordinates, small steps or poorly resolved times can lose
derivative precision; unresolved/non-finite calculations fail explicitly.

`predictMotion2D(sample,seconds,{acceleration?})` is explicit constant-velocity
or constant-acceleration extrapolation. The returned kind/horizon identify an
inference; it must not be published as observed TrackData or confidence.

## Closed-form point constraints (9)

Each returns `{position,correction,changed,status}`; none solves feedback state.

* `constrainBox2D(point,{min,max})`: nearest coordinate clamp, degenerate axes allowed.
* `constrainDistance2D(point,{center,min?,max,coincident?,restDirection?})`: radial
  annulus projection. Coincident points needing expansion use explicit rest/error
  policy; no unique normal is fabricated silently.
* `constrainLine2D(point,{from,to,extent?,degenerate?})`: nearest line/segment/ray.
* `constrainHalfPlane2D(point,{origin,normal,minDistance?})`: normalized-normal
  signed distance >= minimum; normal must be nonzero.
* `constrainAngle2D(point,{center,referenceDegrees?,limitsDegrees,coincident?})`:
  radius-preserving wedge. Limits in [-180,180], branch tie selects -180.
* `snapGrid2D(point,{step,origin?,maxDistance?})`: nearest intersection; ties
  toward positive coordinates. Optional threshold uses full 2D distance.
* `snapGuides2D(point,{x?,y?,maxDistance?})`: per-axis nearest guide, first wins
  equal-distance ties; arrays stay unchanged.
* `wrapPosition2D(point,{min,max})`: half-open spatial tiling on both axes.
* `mirrorPosition2D(point,{min,max})`: closed mirrored tiling. Neither tiling
  function is collision response; derivatives at seams may not exist.

## Pose controls and interception (4)

* `orientMotion2D(sample,{forwardDegrees?,offsetDegrees?,restDegrees?,weight?,limitsDegrees?,stationary?})`:
  existing Aim2D applied to velocity; zero velocity uses rest or errors.
* `stretchMotion2D(sample,{referenceSpeed,amount?,maxScale?,preserveArea?})`:
  returns scaleX/scaleY; area is preserved by default. Limits are explicit
  creative controls, not fixed resource ceilings or a deformation simulation.
* `bankMotion2D(sample,{referenceAcceleration,strength?,maxDegrees?,restDegrees?,minSpeed?})`:
  clockwise turn bank from signed lateral acceleration; no torque integration.
* `leadTarget2D(origin,target,targetVelocity,{speed,maxTimeSeconds?})`: scaled,
  stable quadratic constant-velocity interception. Returns intercept/coincident/
  unreachable, finite time/position/direction or null, without fabricated hits.
  It is prediction, not tracking or pursuit physics.

## Actual verification and boundaries

Editable `validation/motion-control-scene/project.tsx` and `half.tsx` exercise all
26 functions in 26 small motion cells, reusing the previous native temporal
checkpoint. Source math runs on CPU; native GPU draws all triangles and performs
real eight-subframe exposure/Glow/composition. F32 vertex transfer, F16 output,
18/0/47/18 seek, signed HDR/Alpha and real PNG/EXR/48-frame MP4 are checked.
The native rasterizer's existing spatial edge-sampling policy is retained;
this does not certify analytic area coverage, physics, IK, 3D rigging or AE parity.
L3 installation/public package/export/platform qualification remains Main-owned.

Provenance is in `provenance/motion-control/sources.json`; no new external
dependency, model, native binary or WASM permission is introduced.
