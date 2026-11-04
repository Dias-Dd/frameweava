# Rigid Body Effects 0.3.0

Local reviewed R1 named imports. CPU/WASM physics; no GPU is required to solve.
Use explicit host `allowWasm:true`. The package never authorizes or trusts itself.

```ts
import {createRigidBodies} from 'rigid-body-effects';
const physics=await createRigidBodies({fps:24,substeps:4,seed:init.seed,bodies:[
  {id:'ball',kind:'dynamic',position:[0,2,0],ccd:true,
   colliders:[{id:'shape',shape:{kind:'ball',radius:.2},density:1000}]}
]});
// In renderAt, existing FrameContext; repeated frame does not advance time.
const state=await physics.sample(ctx);
const position=state.bodies[0].position; // owned XY/Z meters, +Y up, +Z towards viewer
await physics.dispose();
```

Fixed, dynamic and position-driven kinematic bodies; ball, cuboid and Y-capsule
colliders with explicit local transforms/materials; fixed, spherical, revolute,
prismatic and spring joints. Hinge/slider limits and velocity motors are supported.
Bodies/colliders/joints are created in the authored order; topology is immutable
for this owner. Add/remove/change a topology by creating another explicit owner.
No arbitrary JS instances cross realms; output positions/quaternions/velocities,
mass/sleep state and contact records are values, never raw Rapier handles.

Existing local-frame Keyframes/Spring/Expression Signals drive forces/torques at
the beginning of a fixed substep and kinematic positions at its end. Global-time
and progress expressions reject pending a formal explicit Stage mapping. No
invented timeline or implicit inference. Use existing seededRandom to construct
initial data and the explicit seed for existing random expressions. JS transcendental
input calculations do not inherit the upstream engine's cross-platform guarantee.

Core FixedStepRunner runs unchanged in the existing C1 Worker/data adapter. Rust
only computes synchronous step/snapshot/restore. Frame0 is reset. Native snapshot
bytes plus current-frame event values are owned structured-clone checkpoints;
no GPU handles. A seek error makes the owner failed until reset/dispose; no stale
candidate is published. CPU state and events are tested under shuffled requests.
Snapshots are private to the exact WASM/configuration, not a stable portable format.
Session reopening rebuilds and replays initial conditions. External snapshot import
is not implemented; the Core Runner has no public checkpoint insertion API.

0.1.1 validates frame/time/FPS before JSON transport and again in the data adapter;
NaN/Infinity/null/coerced time cannot become an accepted frame0 value. Rejected
preflight does not move or poison the healthy world. Dense body/collider/joint
arrays and representable positive f64 volume/mass/inertia scale are required;
there is no substituted minimum radius or silently clamped geometry.

Contact starts/stops distinguish sensors; solver contact points are actual world
surface points, force vectors/magnitudes come from Rapier. Force `started` means
the force threshold was newly crossed. Frame event values cover all completed
substeps of that local frame and repeat on repeated sampling; they are not pushed
or consumed once. Consumers may deduplicate by step/pair/kind. Event budgets reject
instead of silently dropping values. Contact recycling defaults off to avoid
stale contact features. Coulomb friction/8 iterations are explicit wrapper defaults.

Rapier0.36.1 automatically applies CCD to fast dynamic-vs-fixed pairs when global
ccdSubsteps>0, regardless of the body CCD flag. Set solver.ccdSubsteps=0 to disable
all CCD. Default1 follows upstream. Speed is not implicitly clamped to the upstream
400m/s default: omitted maxLinearVelocity maps to Real::MAX. Explicit speed limits,
contact softness, slop, prediction and corrective velocity remain author parameters.
Finite contact softness allows penetration; a CCD clamp alone is not proof of
zero penetration over later steps. Extreme thin/high-speed regimes require explicit
stiffness/substep qualification. Initial failing fixtures and corrected parameters
remain in the validation report; this is not a universal hard-contact guarantee.

Default worker=true. Concurrent sample/reset rejects; close drains active work;
abort terminates the existing Worker and rejects pending work. Direct synchronous
WASM cannot be preempted, and Worker termination cannot guarantee cooperative Rust
Drop. Existing WebAdapter frame deadlines remain the hard stop. Explicit normal
dispose calls Rust world Drop, frees C1 buffers, then terminates/revokes the Worker.

Safety budgets are configurable: bodies/colliders/joints, events/points, snapshots,
checkpoint copies and replay steps. Existing bytes-v1 per-message16MiB remains;
actual CPU/GPU/OS peak is unknown. No fixed simulation duration or quality reduction
based on wall time/FPS. Author substeps/solver parameters are never auto-adjusted.

Source: exact Rapier3d-f640.36.1, serde1.0.229, serde_json1.0.154, Postcard1.1.3,
69 checksummed source inventories in Cargo.lock/build record and carried licenses.
Single-threaded enhanced-determinism, F64, full Coulomb; no parallel/FEM/SIMD feature,
no external runtime/tool download. The user-facing API does not require backend choice.

The editable example uses the existing spatial-effects hardware GPU billboard and
line renderer for a planar physics scene. It is not a new 3D mesh renderer, a GPU
physics solver or proof of 3D occlusion/AOV support. Native Three programming
remains available for other render styles. Independent SDK/portable L3 is Main's gate.

## 0.2: authored mesh environments, convex bodies and passive queries

```ts
import {createRigidBodies, type MeshData} from 'rigid-body-effects';
const simulation = await createRigidBodies({fps: 24, bodies: [
  {id: 'terrain', kind: 'fixed', colliders: [
    {id: 'terrain.shape', shape: {kind: 'trimesh', mesh: terrainMesh}}
  ]},
  {id: 'object', kind: 'dynamic', position: [0, 3, 0], colliders: [
    {id: 'object.shape', shape: {kind: 'convexHull', mesh: authoredMesh}}
  ]}
]});
const geometry = await simulation.colliderMeshes();
const state = await simulation.sample(ctx);
const hits = await simulation.castRay({origin: [0, 5, 0], direction: [0, -1, 0], maxDistance: 10});
const sweep = await simulation.castShape({shape: {kind: 'ball', radius: .2},
  position: [-3, 1, 0], velocity: [2, 0, 0], maxTime: 3});
const overlaps = await simulation.intersections({shape: {kind: 'ball', radius: 1}, position: [0, 1, 0]});
await simulation.dispose();
```

The snippets' meshes are ordinary validated Graphics MeshData v1 (right-handed
meters). A convex hull encloses all authored restPositions; it does not preserve
concavity. Trimeshes are fixed environments only. Moving concave objects require
explicit authored compound convex colliders; automatic decomposition is absent.
No simplification, implicit unit conversion, triangle deletion or hidden repair.
The default trimesh internalEdges policy is `fix-two-sided`: pinned Parry welds
exact duplicate vertices and fixes both-sided internal contact edges. Use `raw`
explicitly to retain raw edge behavior. Invalid zero-area triangles reject.

colliderMeshes returns detached actual Parry hull/processed trimesh MeshData,
collider ID/body ID/sensor and collider-local position/quaternion. Primitives are
not tessellated by this API. Apply sampled body pose * collider local pose to
render them; do not render a concave source and label it the collision hull.
Generated vertex IDs/triangle indices describe processed geometry, not original
UV/material/vertex identity; material/texture data is not copied or loaded.

Queries inspect the current successful world (including step zero), never seek,
advance, predict body velocities, consume contacts or create checkpoints. Await
them like sample: no concurrent calls or implicit ordering. A cast moves only its
supplied convex query shape with constant world linear velocity and fixed
rotation, against stationary colliders at their snapshot poses. maxTime is seconds,
maxDistance is meters, ray direction must already be unit length. Query outputs
are world coordinates. Ray results sort by distance then authored collider order;
casts by time of impact then order; overlaps by order. These methods return all
hits within budget, never a silently clipped list. A ray yields one nearest hit
per collider, not every triangle crossing. Solid ray origins inside a shape may
produce distance zero and null normal. Cast status retains upstream convergence,
iteration exhaustion, failure or initial penetration; do not treat all as exact
converged hits. Features/subshape numbers are upstream processed identities,
not stable authored triangle IDs. Overlap is a surface/shape intersection test;
an open triangle mesh is not an automatically filled volume.

Collision groups are 32-bit unsigned memberships/filter masks. Both directions
must intersect (AND). Omitted collider groups preserve Rapier's existing default.
Query filters default to excluding sensors, no exclusion IDs, no group constraint;
explicit query groups use the same AND rule. Unknown exclusions reject, not ignore.
Queries currently scan existing world colliders O(N), with Parry's per-mesh BVH;
there is no second broad-phase/index/world and no fake zero-dt physics step.

Geometry and query safety budgets are configurable, alongside existing snapshot,
checkpoint and byte budgets. Graphics v1 still limits each MeshData to 16384
vertices and 100000 index values; C1 bytes-v1 still limits each message to16MiB.
Large environments can use explicit fixed collider chunks; this release does not
stream or tile a monolithic mesh. maxGeometryVertices/maxGeometryTriangles bound
aggregate authored world geometry; maxConfigBytes bounds authored JSON before
initialization/queries; maxQueryResults bounds complete hit lists. Snapshot growth
can require a larger maxSnapshotBytes/checkpoint plan. No auto quality/step change.
A failed seek disables queries until reset. Invalid query preflight or hit-budget
failure leaves the successfully sampled world intact. Reply-byte failure retains
the existing conservative failed-owner/reset rule. Normal dispose releases the
same C1 world/buffers/Worker; no additional service or runtime is introduced.

Editable complete example: examples/mesh/project.tsx -> world.ts -> scene.ts.
It uses this CPU/WASM solver and the existing skeletal-effects@0.6.3 native Three
MeshRenderer: real depth-tested standard-lit F32 surfaces, explicit appearance,
processed collision meshes, ray hit marker, sensor and shape-cast/overlap data.
GPU rendering requires compatible hardware WebGL2/float targets and has no software
pixel fallback. The solver and CPU geometry/query entry remain GPU-independent.
The skeletal 0.6.3 change only declares its three existing renderer exports as
GPU-required so default Final can choose hardware; no renderer algorithm changes.
Explicit host allowWasm remains required. No new permission, public P4 port, Core
Runner, GPU host or scene DSL. See the batch18 report for measured acceptance and
unverified platforms; these are not GPU collision/physics solvers.


### Static collision tool for feedback particles (0.3)

`await createCollisionEnvironment(world, {signal, filter})` uses the same verified
C1 direct resource/data adapter. Only fixed bodies and no joints are accepted.
Sensors remain non-solid. Initialization is async; `sweepSphere`, `colliderMeshes`,
`check`, `diagnostics`, and `dispose` then execute synchronously in this Stage.
No Worker proxy, old result or implicit simulation time is hidden behind the API.
Synchronous CPU/WASM work cannot be preempted; host Stage deadlines remain relevant.
The tool never steps its immutable world. Its SHA256 identity seals normalized
configuration, and particle checkpoints contain only particle data, not this owner.

Pass it explicitly to `createFeedbackParticles(options, {collisionEnvironment})`
from spatial-effects@0.3.0. The simulation borrows it; the Stage owns/disposes it.
Normal disposal or AbortSignal invalidates even cached particle samples. Query and
reply budgets reject instead of dropping hits. Reply capacity defaults are planned
from authored data/count and stay inside C1's16MiB limit; explicit budgets win.
Initial penetration uses Parry's actual witness separation; unconverged or undefined
normals fail. Separating zero-time contacts are recast using upstream semantics,
so a different face on the same concave mesh can still be hit. Open meshes remain
two-sided surfaces, not filled volumes; moving obstacles and sensor enter/exit
tracking are not part of this tool. Friction is Coulomb mu, not tangent damping.
Editable full scene: modules/spatial-effects/examples/mesh-collision/project.tsx.
