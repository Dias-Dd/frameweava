# Deformable Effects 0.6.0

Reviewed local R1 named imports; CPU/F64 WASM XPBD projection, existing C1 Worker
and Core FixedStepRunner. The solver does not require a GPU, install a runtime,
trust code or authorize WASM. The host must explicitly allow WASM execution.

```ts
import {createDeformables,ropeOptions,clothOptions} from 'deformable-effects';
const rope=await createDeformables(ropeOptions(points,{
  fps:24,substeps:4,iterations:24,linearDensity:.3,
  compliance:1e-7,fixedParticles:[0],
  collision:{radii:.02,colliders:[
    {id:'floor',kind:'plane',normal:[0,1,0],offset:0,friction:.3},
    {id:'ball',kind:'sphere',center:[0,.3,0],radius:.6}
  ]}
}));
const state=await rope.sample(ctx); // explicit existing Stage-local FrameContext
// state.positions/velocities are owned XYZ meter values, aligned with the input.
await rope.dispose();
// const cloth=await createDeformables(clothOptions(meshData,{
//   fps:24,surfaceDensity:.3,stretchCompliance:1e-6,bendCompliance:1e-4,
//   fixedVertices:['topLeft','topRight']
// }));
```

Low-level DeformableOptions retains ordinary TS control of rest/initial positions,
velocities, inverse masses, authored distance/bend constraints and local-frame
Signal pins/acceleration. Topology/config is immutable for an owner; recreate an
owner for another topology. No scene DSL, document model, new Runner/Host/registry
or shared arbitrary JS instance is introduced. Native TS/Three/Shader authorship
remains available. Global/progress expressions reject until explicit Stage time
mapping is supported; local Keyframes/Expressions/Springs use existing evaluation.

Rope is a distance-constrained particle chain, with lumped kg/m density. It is
not a Cosserat rod, hair strand or twist/bend material. Cloth uses existing indexed
MeshData: lumped kg/m² density, edge distances (including authored triangulation
diagonals) and shared-edge upstream quadratic isometric hinges. It is a mesh
distance network, not a resolution-independent continuum/FEM calibrated material.
Nonmanifold/duplicate/degenerate geometry and ambiguous pins reject.

World axes match Graphics: meters, right handed, +Y up, +Z towards the default
viewer. Distance compliance is m/N, zero is hard. Isometric energy is dimensionless,
using the upstream negative coefficient; bend compliance is 1/(N m), with a default
zero-energy flat target. Arbitrarily curved rest shapes are not preserved as signed
dihedral angles. Low-level restEnergy must be finite and nonpositive (default zero):
the negative-semidefinite quadratic cannot reach positive energy. JS preflight and
the native binary boundary independently reject positive targets. This fixes a
parameter-domain gap in 0.1.0; existing 0.1.0 packages/locks are not rewritten.
A permitted target does not guarantee convergence for all pins/initial poses.
Multipliers are solver diagnostics,
not a direct material stress/torque claim; quadratic-bend gradients matter.

Frame0 is the explicit initial state (pins applied), measured without projection;
repeated sampling never advances time. Semi-implicit Euler applies gravity plus
uniform Signal acceleration, then exponential velocity damping per fixed substep.
Pins are sampled at substep end; acceleration at its start. No airflow pressure,
triangle/edge/self-collision, moving colliders, dynamic rigid coupling, tearing,
plasticity, FEM or GPU compute is implemented.
These omissions must not be inferred from the word cloth/physics.

Optional collision uses finite-radius vertices against immutable static planes and
spheres, in the existing WASM solver. A plane's unit normal points to its permitted
halfspace, `dot(position,normal)>=offset+radius`; sphere interiors are forbidden.
Radii are a uniform number or one owned nonnegative value per vertex. This does
not make the triangles, rope segments, or the space between vertices collision safe.

Sweep entry points generate conservative tangent-halfspace barriers, including
collisions created by structural projections. A bounded final contact sweep resolves
interacting halfspaces, without silently increasing tolerance. Initial dynamic
overlaps remain visible at frame0; later steps project them. An ambiguous sphere
center and infeasible fixed pins reject. Unresolved contacts stop the owner, rather
than publishing penetrations as success. Default tolerance is 1e-8 meters and is
configurable. Structural residuals are reported after final contact projection.

Velocity response uses deterministic projected Gauss-Seidel with coefficient of
restitution [0,1] and Coulomb friction coefficient >=0 (not fractional damping).
Both structural and contact phases use the declared iteration budget; no wall-clock
quality adjustment. `maxNormalVelocityResidual` reports remaining velocity error.
This PBD method constrains the end-of-substep position; it does not integrate the
remaining bounce flight after TOI or claim exact ballistic collision trajectories.
Restitution defaults to zero; positive values can bounce under gravity at small
speeds, with no hidden speed threshold.

Frame.contacts is the last fixed substep's generated contact set, not an accumulated
frame event stream. It includes particle/collider ID, unit normal, obstacle point,
candidate sweep fraction, active flag, normal/tangent impulse and final penetration.
The obstacle point/fraction belongs to barrier generation, including constraint
motion, and need not equal the final geometric contact or physical impact time.
Impulse units are kg m/s; coupled PBD remains an approximation. Checkpoints retain
contacts/residuals together with p/v/lambda. No contact warm starting or native
mutable world survives a call. Empty/omitted collider lists keep the old no-contact
projection path. The new result fields are zero/empty on that path.

Each substep projects on real WASM; lambda resets per substep and accumulates across
its authored-order Gauss-Seidel iterations. WASM holds only immutable coefficients.
The unchanged Core Runner owns the complete mutable state: step, F64 positions,
velocities, last multipliers and separate meter/energy residuals. Checkpoints own
structured-cloneable values, with no GPU handle. External checkpoint import and
arbitrary state callbacks are not supported. Same initial conditions/controls
replay under arbitrary valid requests; no wall clock or render order enters time.

Concurrent sample/reset rejects; close drains; normal disposal drops native
coefficients/frees buffers and terminates the existing Worker. Abort terminates
the Worker and rejects pending work, without promising cooperative Rust Drop.
Direct synchronous WASM cannot be preempted. Existing WebAdapter deadlines remain.
Failed seek/output stops until reset; no stale candidate is returned. Invalid
preflight time never enters JSON and neither moves nor poisons a healthy owner.

Particle/constraint/replay/work/checkpoint budgets are configurable. Existing16MiB
bytes-v1/RPC and actual wasm32/OS memory limits remain; output cannot silently
truncate. Work units are a conservative solver plan, not CPU instruction/timing
measurements. Physical peak memory is unknown. No quality is reduced to meet FPS.
Independent installation/portable L3 and cross-platform numerical guarantees need
Main's separate acceptance. No default browser/daemon or unsafe-eval grant on import.

Since0.2.1 the module checks the own `kind` data descriptor before selecting a collider/constraint
schema, so accessors reject without being invoked or loading resources. The 0.2.0
counterexample and package/locks remain preserved. This validates plain author data;
it does not sandbox arbitrary JavaScript objects or Proxy traps in trusted local code.

## Tetrahedral soft bodies (0.3.0)

```ts
import {softBodyOptions,createDeformables} from 'deformable-effects';
const body=await createDeformables(softBodyOptions(meshData,tetrahedra,{
  fps:24,substeps:4,iterations:24,density:1000,
  edgeCompliance:1e-6,bulkModulus:1e5,
  fixedVertices:['anchor'],collision:{radii:.01,colliders}
}));
const frame=await body.sample(ctx);
// frame.maxVolumeResidual is m^3; invertedTetrahedra/collapsedTetrahedra count cells.
await body.dispose();
```

Tetrahedra are explicit four-index tuples into the same MeshData vertex array,
including interior vertices. Mesh triangles must exactly match its outward boundary.
No implicit tetrahedralizer, topology/vertex renumbering, target normalization or
hidden interpolation is performed. Reversed cell order is valid and retains its
signed rest volume. Duplicate/zero-volume cells, repeated vertices, over-shared or
same-side shared faces, missing/inward boundary faces and unused vertices reject.
These incidence checks do not prove non-adjacent cells do not geometrically overlap
or provide exact geometric predicates on arbitrary ill-conditioned input.

The recipe builds unique edges plus one signed-volume constraint per tetrahedron,
with lumped kg/m^3 density. Each cell has compliance abs(restVolume)/bulkModulus,
where bulkModulus is positive Pa (default1e5); alternatively author nonnegative
volumeCompliance directly, in m^5/N. The two parameters are mutually exclusive.
Edge compliance defaults1e-6m/N, density1000kg/m^3. This is an XPBD edge/volume
network, not calibrated resolution-independent FEM or a claim of isotropic shear.
Local-frame Signal pins/acceleration and all existing timing/lifecycle rules apply.

Low-level kind:'volume' declares four distinct particles, nonzero signed restVolume
in m^3 and nonnegative compliance. The rest tetrahedron must be nondegenerate.
The solver uses the true gradient of signed volume, including1/6. This explicitly
differs from the pinned upstream code, whose unscaled cross products under-relax
a hard constraint. Original code and a real C++ counterexample remain archived;
analytic free-vertex and finite-difference checks support the corrected derivative.
Multipliers are diagnostics, not a direct material-pressure/stress measurement.

Coplanar rank-two or inverted candidates may recover; a fully collinear constraint
with no gradient fails. There is no inversion barrier, collision-safe boundary
surface, self collision or guarantee of convergence under arbitrary pins/loads.
Frame0 remains the authored initial state; derived volume residual/counts are
measured after final contact cleanup from the returned F64 positions. They need
no new mutable checkpoint field. Finite arithmetic/underflow limits reject rather
than silently returning a zero-cost/zero-gradient approximation. CPU/WASM solves
geometry; the included GPU point/line scene is an explicit illustration, not a
solid-material/depth renderer or a GPU physics claim. Budgets remain configurable.

## Signed rest-angle hinges and curved cloth (0.4)

```ts
import {clothOptions,createDeformables} from 'deformable-effects';
const options = clothOptions(curvedMesh, {
  fps:24,bendingModel:'dihedral',surfaceDensity:.3,
  stretchCompliance:1e-7,bendCompliance:1e-4,
  fixedVertices:['v0','v6'],substeps:4,iterations:24
});
const simulation = await createDeformables(options);
const frame = await simulation.sample(ctx); // existing local FrameContext
console.log(frame.maxDihedralResidual); // radians, not isometric energy
await simulation.dispose();
```

Default bendingModel remains 'isometric', with the original quadratic flat-target
energy and unchanged default parameters. The explicit 'dihedral' model instead
records each internal edge's signed rest angle from authored curved MeshData.
It is a different constitutive constraint; equal numeric compliance does not make
the two models calibrated equivalents. Do not silently replace existing recipes.
Existing edge distances, lumped kg/m² mass, local Signal pins/acceleration,
static primitive vertex contacts, fixed-step/checkpoints and time remain.

Low-level constraints declare {kind:'dihedral',particles:[o0,o1,e0,e1],restAngle,
compliance}. Four distinct particles define opposite vertices and directed common
edge e0→e1. Normals are normalize((e0-o0)×(e1-o0)) and
normalize((e1-o1)×(e0-o1)); flat consistently oriented faces have angle0.
Angle is atan2(edgeUnit·(normal0×normal1),normal0·normal1), canonical[-pi,pi).
Targets accept[-pi,pi], +pi equivalent to -pi. Residual is the shortest wrapped
angle; an exactly pi residual chooses -pi. No accumulated angular winding,
multi-turn target, inversion barrier or guarantee across singular faces.
Use smaller substeps for large rotations; degenerate edges/faces fail explicitly.

Cloth uses shared vertex indices in ascending order for e0/e1 and opposite vertices
in authored face order. Reordering topology changes signed convention/solver order;
it is a new configuration, not an interchangeable checkpoint. Generic numeric
restAngle is static for an immutable solver. Animated rest-angle Signals are not
supported; existing Signal pins/accelerations can drive motion.

Compliance is the inverse quadratic angular-energy coefficient (radians treated
dimensionless, often written rad/(N*m)), not distance compliance m/N. This is a
per-hinge XPBD model, not resolution-independent calibrated shell/FEM material.
Lambdas reset per fixed substep and accumulate through that substep's iterations,
as before; outputs are diagnostics, not direct stress/torque sensors. Optional
maxDihedralResidual reports radians after final contact cleanup and only appears
when angular constraints exist. maxBendResidual keeps its isometric-energy meaning;
old recipes acquire no new JSON key.

Math adapts fixed MIT PBD2.2.0 solve_DihedralConstraint/Bridson gradients. Signed
atan2 replaces unsigned acos, relative scaling removes the fixed world edge epsilon,
and free common-edge vertices remain solvable even with both opposite vertices
fixed. These intentional differences have native C++ counterexamples. Gradients
have central-difference and rigid translation/rotation null checks; ordinary hard
same-branch projections match the actual selected unchanged upstream method.
The local authored scalar reference is not the full Eigen/PBD executable.
No new engine/crate dependency is introduced.

Private configuration tag3 extends this module's bytes payload; public C1 bytes-v1
ABI, P4, Stage ports and IPC do not change. F64 Rust/WASM runs in the existing
dedicated Worker or explicit direct mode. No GPU solving/handle serialization.
State remains existing positions/velocities/checkpoints; immutable hinge data stays
native and angular residual is derived. Work accounting includes angular projection/
measurement. Existing configurable resource budgets,16MiB bytes boundary and
failure/reset/cancel/dispose rules remain. No wall-clock quality fallback;
unrepresentable arithmetic fails explicitly.

examples/dihedral-project.tsx renders blue signed-rest and orange original
isometric cloth using separate skeletal-effects0.4 native Standard float triangles/
depth. That graphics module is not a solver dependency. Physics is CPU/F64 WASM;
GPU creates the image with existing color/PM-alpha contracts. The CPU-only project
runs with software rendering; WASM authorization is still explicit. No triangle/
edge/self collision, aerodynamics, plasticity, tearing, collision-safe shells,
OIT or complete professional material platform is implied.

## Cosserat material rods (0.5.0)

`rodOptions(points, options)` creates an explicit rod variant for the SAME
`createDeformables` executor, verified C1 instance/Worker and Core FixedStepRunner.
The old ropeOptions remains a distance-only chain. Cloth/volume/dihedral paths
keep their existing semantics. The C1 bytes ABI and Worker RPC are unchanged;
module-private operation/configuration variants add immutable rod coefficients
and complete candidate orientation arrays. No second solver host or time system.

```ts
import {rodOptions,createDeformables,rodMeshDraws} from 'deformable-effects';
const spec=rodOptions(points,{fps:24,substeps:4,iterations:64,
  linearDensity:.3,fixedParticles:[0],fixedSegments:[0],
  stretchShearStiffness:[1,1,1],bendTwistStiffness:[.6,.6,.6]});
const simulation=await createDeformables(spec); // Stage init; explicit host WASM permission
const state=await simulation.sample(ctx); // positions + XYZW material frames + angular velocity
// Existing capless createTrailGeometry MeshData and createMeshRenderer:
const draws=rodMeshDraws(meshes,state,{radius:.04,crossSection:'tube'});
// Stage dispose: await simulation.dispose(); await renderer.dispose(); geometry.dispose();
```

Pinned MIT PositionBasedDynamics2.2.0, aa62c44f0d43956452e1f960a40333ec2d6d3ea5:
PositionBasedCosseratRods stretch/shear and bend/twist numerical methods, plus
first-order orientation prediction/velocity reconstruction. The exact original
C++ files, call sites, notices and source hashes are carried in vendor/pbd.
An independent dev-only C++ scalar math shim executes the selected unchanged
functions. No Eigen, full PBD engine or native dependency is distributed.

This variant is PBD, NOT XPBD: local dimensionless coefficients in [0,1], original
1e-6 regularizers, explicit iteration and timestep dependence. No Young modulus,
resolution-independent material calibration, FEM, physical torque/stress or
iteration-independent stiffness claim. Stretch/shear coefficients use material
X/Y shear and Z stretch (anisotropic coefficients rotate into world space as
fixed upstream does). Bend/twist uses relative material quaternion constraint
coordinates, retaining the upstream antipodal branch. Residuals report norm of
stretch/shear strain and XY/Z quaternion-constraint components, not radians or
torques. maxDistanceResidual still reports edge length error in meters.

Each edge has one XYZW quaternion whose +Z aligns with that directed rest edge.
Auto rest frames choose the shortest rotation from +Z; authors can provide their
own stress-free frames, initial orientations/angular velocities and per-edge
inverseOrientationMasses. Nonaligned rest frames and zero quaternions reject.
The default scalar inverse orientation inertia is 12/(linearDensity*length^3),
a thin-edge transverse approximation. The solver has one scalar orientation
weight, NOT a full anisotropic inertia tensor; override explicitly for authored
behavior. Angular acceleration is an explicit world-space rad/s^2 Signal, not
an external rigid torque system. Angular velocity uses first-order 2*deltaQ.xyz/dt;
large rotations need appropriate substeps, not automatic quality reduction.

Position pins use existing local-frame Signals. Orientation pins provide four
component Signals (normalized each evaluation) and require inverse orientation
mass0; fixedSegments supplies constant rest pins. Half-sphere alignment avoids
q/-q representation jumps. No angular state is inferred from render order.
Frame0 applies pins and measures without projecting, as before. Every successful
step commits all position/orientation/angular-velocity arrays together; a failed
step stops the owner until reset, and aborted Worker results are not published.
Close drains active work; dispose releases the existing C1 buffers/Worker. Direct
synchronous WASM cannot be preempted. No ordinary TS/DOM/file rollback is claimed.

Closed rods use distinct stations without repeating the first, cyclic relative
frames and a closing mass contribution. Generic DeformableFrame fields for
unused volume/hinge constraints stay zero and PBD multipliers are empty, not
physical stress estimates. Rod fields are optional only on the generic frame;
rodOptions + the public overload produce RodFrame/RodSimulation typed results.
No GPU/resource handle appears in a serialized checkpoint.

Existing static plane/sphere finite-radius VERTEX contacts, friction and response
are reused inside rod iterations. Segments/cross sections between vertices are
not collision safe; no self/strand/triangle collision, moving rigid coupling,
plasticity, fracture, hair grooming or full Cosserat continuum platform.
All existing projection/replay/checkpoint/output budgets apply, with additional
orientation values and rod work accounted for. Counts are configurable within
existing C1/Graphics/device limits; no thinning or hidden adaptive timestep.

`rodMeshDraws` maps existing capless TrailGeometry UV station/radial topology into
actual material axes, not a Frenet-only tangent approximation. Adjacent segment
quaternions are shortest-hemisphere averaged at shared stations for display;
this is a geometric interpolation, not an extra physical degree of freedom.
Tube/ribbon cross sections, optional ellipse aspect, closed seam and existing
chunked MeshData are supported. Caps/foreign strip topology reject. Radius0 is
invisible. The function emits ordinary MeshDraw positions for the existing native
GPU renderer; physics and mesh preparation remain CPU/F64. No GPU compute or
CPU pixel renderer is introduced. Renderer F32/HDR/alpha/depth contracts remain.

Editable full chain: examples/rod/project.tsx, setup.ts and scene.ts. An ordinary
TS keyframe schedule twists one end while existing gravity/contacts evolve the
rod, and the original native GPU draws its material ribbon and center tube.
Reproduce using a private FRAMEWEAVE_HOME and reviewed Rust1.99.1 std/linker:
`node modules/deformable-effects/scripts/build-kernel.mjs`
`node modules/deformable-effects/validation/prepare-rod-reference.mjs`
`node --import tsx --test tests/cosserat-rods.test.ts`
This is optional local R1 functionality; independent installed-SDK, portable and
cross-device qualification is delegated to Main. Original failures/raw evidence
are retained; no performance or physical peak-memory claim from build success.

After hard cancellation, live diagnostics reject E_DEFORM_CANCELLED until dispose;
a terminated backend rejects E_DEFORM_BACKEND_CLOSED. Shared Kit minimal disposed
metadata is not cast into fabricated complete physics diagnostics. Post-dispose
closed diagnostics remain available. This fixes an existing lifecycle type gap,
with no numerical or IPC change; the original failing cancellation check is kept.

The raw native-renderer release record retains Three's internal texture counter1
while geometry/program counters are0 and fences balance. No new renderer code or
counter reset is used here. This batch does not measure physical peak memory or
claim that this counter alone proves a leak or a complete device-memory release.

## Thin-face wind drag and prescribed pressure (0.6.0)

```ts
const spec=clothOptions(mesh,{fps:24,substeps:8,iterations:32,
  fixedVertices:['top-left','bottom-left'],bendingModel:'dihedral',
  aerodynamics:{wind:[2,0,1],density:1.225,normalDrag:1,
    tangentialDrag:.02,pressure:0}});
const simulation=await createDeformables(spec); // existing explicit WASM permission
const state=await simulation.sample(ctx);
const forces=state.aerodynamics?.forces; // per-vertex Newtons, independent owned values
// Render state.positions with the existing createMeshRenderer; await all disposals.
```

Cloth authoring derives static triangle indices from the supplied MeshData. Generic
DeformableOptions can supply explicit aerodynamics.triangles (no rod mode). Faces
must be distinct, nondegenerate at rest, index the same particles and fit the
configurable maxAerodynamicFaces budget (default100000). Counts are not silently
reduced; existing C1 byte, projection-work, value/checkpoint and output budgets
apply. No new Engine, worker protocol, Runner, collision world or image port.

The force math is authored elementary SI thin-sheet drag/traction in Rust/F64,
not a copied Bullet/NvCloth engine or a full aerodynamic solver. Existing pinned
MIT PBD2.2.0 constraints, Rust std/C1, Worker, Core Signal/Runner/checkpoints and
native Three GPU mesh rendering are reused. No new library or unverified licensed
source enters this package. The source audit rejected blind porting of legacy
velocity clamps or files requiring separately clarified licenses.

For each CURRENT deformed triangle, area A=length(cross(edge1,edge2))/2 and unit
normal n follows winding. u=wind-mean(vertex velocities), un=dot(u,n), ut=u-un*n.
The force is:
  F = .5*rho*A*(normalDrag*un*abs(un)*n + tangentialDrag*length(ut)*ut)
      + pressure*A*n
Integrated linear triangle shape functions assign F/3 to each vertex. Positions
are meters, velocities/wind m/s, density kg/m^3, pressure Pa, force N, acceleration
m/s^2 and dissipatedPower W. Drag coefficients are dimensionless artist inputs,
not calibrated textile or continuum parameters. Normal drag is two-sided and
winding invariant; prescribed pressure is signed and follows winding. Pressure on
an open sheet is an external traction, not automatically an enclosed gas. There
is no temperature/mass/equation-of-state simulation, flow occlusion, wake, CFD,
compressibility, measured lift curve or fluid/rigid coupling.

Wind, density, both drag coefficients and pressure accept the EXISTING local-time
numeric Signals. A fixed substep samples them at its START, computes forces from
completed previous positions/velocities, adds inverseMass*force to the original
acceleration and uses the unchanged semi-implicit Euler/damping/XPBD/contact path.
Signals never use render duration or a hidden clock. The author selects substeps;
explicit quadratic drag/pressure can require smaller steps for stiff/high-speed
loads. No velocity clamp, drag limiter or automatic/adaptive timestep is inserted.
Existing distance/bending compliances remain resolution/constraint parameters.

Frame0 measures initial loads without integrating. aerodynamics.evaluatedAtTime
and integrated distinguish that from the last successful substep's APPLIED load;
it is not a post-constraint acceleration or constraint stress measurement. forces
and totalForce include fixed-vertex loads, dynamicForce/maxAcceleration include
only mobile vertices. These loads are not complete anchor reaction forces.
Dissipated power covers the drag component relative to air, excluding prescribed
pressure work. Runtime exact-zero-area faces contribute0 and are counted explicitly;
there is no topology repair or epsilon area cutoff. Nonfinite math rejects.

All candidate force/control/position/velocity values commit in the SAME existing
Runner step and are included in cloneable checkpoints, never GPU handles. A bad
later Signal/projection leaves the last committed step, latches failure until
reset, and does not return stale forces. Busy/close/drain and hard Worker abort
are the original C1 lifecycle; synchronous direct WASM is not preemptible. No
rollback of author JS/DOM/files or cooperative Rust Drop after termination claim.
Omitting aerodynamics retains old frame JSON/math. The frozen0.5 WASM/Worker is a
compatibility fixture only, excluded from distribution. A deliberate module0.6
build also binds the newly synchronized Core inputs; no old SDK lock is refreshed.
The numeric value plan adds one F64 XYZ force array plus176 bytes per snapshot;
JS/native allocator and physical device peak memory remain unknown.

Editable complete scene: examples/aerodynamics/project.tsx, setup.ts, scene.ts.
Blue flag uses relative wind; the separate closed orange cloth surface uses an
explicit pressure curve. GPU draws the resulting triangles; physics/force data
remain CPU/F64 WASM, not GPU Compute. No self/edge/triangle collision is added.
Reproduce with private FRAMEWEAVE_HOME and reviewed Rust1.99.1 std toolchain:
`node modules/deformable-effects/scripts/build-kernel.mjs`
`node --import tsx --test tests/cloth-aerodynamics.test.ts tests/cloth-aerodynamics-worker.test.ts`
`node --import tsx scripts/verify-cloth-aerodynamics.ts artifacts/cloth-aerodynamics/media`
The validator uses actual R1 named imports, default WASM denial/explicit allow,
software CPU evaluation, hardware Final/preview/replay/cache/reopen/F16, PNG/raw
RGBA and full MP4 decode. SDR preview/video uses explicit display conversion;
raw scene-linear intermediates and original precision budgets stay unchanged.
Installed SDK, portable/cross-device and broader integration L3 belong to Main.
