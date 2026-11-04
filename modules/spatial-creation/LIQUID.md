# Native PBF liquid candidate

`defineNativeStage(init => liquidScene(init, options))` runs the supplied particles,
material, moving obstacles and free-surface field on the admitted Native GPU.
See `examples/liquid.tsx`. No pixel processing or particle solver runs in JS.
JS prepares typed parameters, geometry seeds and Core Signals. No new dependency,
Renderer, registry, simulation clock or public GPU port is introduced.

`liquidBox`, `liquidSphere` and `liquidEmitter` create explicit immutable seed data
with SI positions/velocities and local birth seconds. `liquidMaterial` selects
rest density, spacing/support, constraint iterations, XSPH viscosity, vorticity
confinement and surface-tension coefficient. Every particle has the same mass
`density * spacing³`. `liquidPlane`, `liquidSphereObstacle`, `liquidBoxObstacle`
are kinematic one-way analytic contacts. Container walls are closed. Obstacles
can move through existing Signals; they do not become Rapier bodies.

The PBF unilateral pressure constraints and cubic kernel adapt MIT
PositionBasedDynamics2.2.0 (`aa62c44f0d43956452e1f960a40333ec2d6d3ea5`).
XSPH uses disjoint Jacobi input/output, unlike upstream's in-place parallel loop.
Akinci2013 cohesion and curvature adapt pinned MIT SPlisHSPlasH
`dba6b26b9387ab6bdd187d6df0a7c9d490d03500`. The cohesion kernel follows the
continuous normalized equation in the original paper, explicitly correcting
the fixed C++ source's inner-branch subtraction outside its normalization factor.
Full original files, hashes and licenses are retained under `vendor/pbf`.
The surface-tension coefficient is the discrete Akinci coefficient, not a promise
that passing a liquid's measured N/m value yields calibrated continuum dynamics.

`createLiquidSimulation(init, options)` retains immutable seeds and managed GPU
state. Await `record(FrameContext)`. The returned `[XYZ,active,VXYZ,density]` F32
buffer is borrowed until the next recording/disposal. `reconstructLiquidField`
returns an owned F32 kg/m³ 3D field; release its `density` buffer after use.
`renderLiquidSurface` borrows that field and returns a fresh caller-owned linear
Rec709 PM F16/F32 image. It integrates the actual trilinear density, reconstructs
the isosurface normal, Beer attenuation and Fresnel reflection. Optional
`background:'inputName'` borrows a same-size, same-color explicit Native input
and provides a screen-space refractive composite; it is not a ray-traced scene.

Time uses the existing Core FixedStepRunner/NativeReplay only. Each requested
frame resets and replays the exact authored fixed steps, including historical
Signals and births. All mutable solver/collider scratch is managed state, so
`flushState` can suspend/resume across bounded same-owner packets with unchanged
iterations/substeps. No images or transient buffers exist before solver flushes.
Core rolls back GPU state on segmented-call failure and latches the failed
Renderer; ordinary JS and external side effects are not rolled back. Reopen it.
Logical resource release never implies queue completion. Await Native ticket
completion before explicit host exports. Close/dispose drains pending work and
releases module-owned leases, never its borrowed device.

Budgets (`maxBytes`, `maxWork`, `maxReplaySteps`, `maxSamples`) are adjustable;
actual device/addressing limits remain. There is no particle-neighbour cap,
automatic lower resolution or iteration reduction. Stable complete all-pairs
search is quadratic; this first implementation prioritizes deterministic offline
correctness. It has no accelerated neighbour grid, two-way fluid/rigid coupling,
multiphase/thermal fluid, sampled mesh boundaries or wall adhesion. Analytic box
sweeps use a conservative expanded AABB at corners. Physical convergence depends
on caller-selected support, particles, substeps, constraints and field resolution.
No adaptive stepping, hidden stabilization or production-platform claim is made.

Build a fresh local R1 candidate with
`node --import tsx modules/spatial-creation/scripts/build-liquid.ts .frameweave/liquid-package-UNIQUE`.
Install through existing `packages install` with explicit local trust, then use
the ordinary `frame`/`render` CLI with the matched `.frameweave/native-target/release`
owner. The candidate grants no network/filesystem/WASM rights. A GPU is required.
Focused numerical, real GPU, random-frame continuation, media and cleanup evidence
and executable commands are stored under `validation/coverage-round8`.
