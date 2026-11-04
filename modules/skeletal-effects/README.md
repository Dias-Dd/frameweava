# Skeletal Effects 0.6.2

Ordinary named R1 imports; existing Graphics MeshData/SkeletonData and Signal.
The CPU rig does not create a GPU context, browser, daemon or WASM instance.

```ts
import {createSkeletonRig,createSkinnedRenderer} from 'skeletal-effects';
const rig=await createSkeletonRig(meshData,skeletonData);
const pose=rig.sample(ctx,{
  deltas:[{bone:'root',rotation:[0,0,angle]}],
  ik:[{id:'hand',effector:'tip',links:[{bone:'elbow'},{bone:'root'}],
    target:[x,y,z],iterations:48,tolerance:1e-5}]
});
const image=createSkinnedRenderer(rig,{width:1920,height:1080});
const surface=await image.render(pose,{camera,ink:[.4,1.5,4]});
await image.dispose(); // owns native GPU resources; borrows the CPU rig
rig.dispose();
```

Bind matrices are global mesh-space, column-major/column-vector. Parent-local
bind matrices are explicitly derived without assuming declaration order. Each
sample starts from bind and current controls, independent of previous requests.
Translation deltas use parent axes; Euler XYZ rotation (radians)/scale deltas
postmultiply local bind. Explicit localMatrices are absolute parent-local affine
overrides, mutually exclusive with a delta for that bone. FK retains shear and
reflection; IK requires positive uniform-scale similarity transforms for its links.

Links explicitly follow effector direct parents, nearest first; no hidden links or
length changes. Ball links use robust CCD; hinge axis is unit bind-local, min/max
within [-PI,PI], with initial FK twist in its interval and no unsupported swing.
Hinge blend interpolates allowed angles; ball blend uses quaternion slerp. Shared
joints require identical hinge declarations. Chains execute in authored order;
final residuals are recomputed after all blends/chains. Unreachable goals return
converged:false; strict:true rejects without changing the rig. Multiple solutions
and CCD local minima remain possible; no pole-vector/retarget/contact claim.

Existing full FrameContext/Signal evaluation is used, including explicit global
time/progress. No new time system, warm start, Simulation Runner or frame advance.
RigPose is detached module data with SHA-256 content identity, not a Graphics
schema/permission token. Derived matrices and final diagnostics are validated.
Generated local and global matrices use the same finite, nonzero determinant
domain as validated poses; underflow/overflow rejects before publication with
E_RIG_MATRIX, without a fixed world-scale epsilon. A failed sample leaves the
stateless rig usable for later valid requests.
skin(pose) is an explicit F64 CPU geometry query, never a pixel-render fallback.

Rendering uses real native Three Bone/Skeleton/SkinnedMesh and GPU vertex skinning,
float32 color plus actual float32 depth, scene-linear premultiplied HDR Surface.
Geometry/bind palettes are rebased about a mesh center. Authored weights remain
unchanged, including the Graphics normalization tolerance; an explicit static
origin*(sumWeights-1) attribute preserves that affine meaning. Float32 upload
range and actual device capabilities are checked, with no CPU or SDR fallback.
probePositions returns owned Stage-local GPU F32 relative positions plus the
explicit origin restored in F64. It is not a new image/AOV port and must not be
serialized as a large JSON/base64 carrier between Stages.

The provided material is flat geometric-normal lighting with explicit HDR ink;
depth resolves the frontmost triangle. opacity is applied after that visibility,
not multi-layer transparency/OIT or transmission. No PBR/texture/resource loading
is implicit; authored material currently rejects. Degenerate raster triangles
produce no coverage. Float16 output is explicit; alpha underflow rejects instead
of emitting hidden RGB. Context loss/failed work stops until recreation; busy
calls reject, disposal drains, cancellation never publishes a partial candidate.

Budgets maxWork/maxBytes and GPU maxBytes/fenceTimeoutMs are configurable, with
existing Graphics v1 bounds (256 bones, 1–4 weights/vertex, 16384 vertices) and
Surface/device limits preserved. No new arbitrary mesh/bone hard limit. Larger
contracts need Main coordination. Numeric buffer plans are not physical peak
measurements. No automatic quality/precision reduction to meet real-time FPS.

Build a fresh reviewed local R1 package with scripts/build-package.ts before
installation; no automatic trust, install, lock refresh or runtime permission.
Fixed native dependency: Three0.186.1/MIT. Full installed-SDK/portable L3 and
cross-device numerical guarantees require separate Main acceptance.

## Native MeshData surfaces (0.3.0)

```ts
import {createMeshRenderer} from 'skeletal-effects';
const image=createMeshRenderer([bodyMesh,floorMesh],{
  width:1920,height:1080,shading:'standard',normals:'flat'
});
const surface=await image.render({context:ctx,camera,objects:[
  {id:bodyMesh.id,positions:physicalFrame.positions,
    appearance:{color:[.1,.5,1],emissive:[0,0,1.5],roughness:.5,metalness:.1}},
  {id:floorMesh.id,appearance:{color:[.2,.2,.2]}}
]});
await image.dispose();
```

Immutable MeshData definitions/topology are snapshotted once. Each render declares
all mesh IDs exactly once; visible:false hides an object. Positions preserve vertex
order; omission explicitly uses authored rest positions, never previous output.
Model matrices are affine column-major/column-vector. Current geometry is rebased
in F64 before F32 upload, with an algebraically compensated model transform.
A full FrameContext or frame/time/FPS value is accepted; no time is advanced and
no simulation/checkpoint system is introduced. No GPU data handle is public.

Real native Three MeshStandardMaterial or MeshBasicMaterial supplies the pixels,
with actual float32 color/depth and existing GPU owner/fences. Standard uses native
metallic/roughness per-fragment shading; flat geometric normals are GPU derivatives,
optional smooth normals are native CPU area-weighted BufferGeometry computations.
Geometry deformation from an explicit CPU/WASM solver is an explicit vertex upload,
not a CPU pixel-render fallback. Static buffers/materials are reused. Standard base
reflectance is[0,1]; use nonnegative emission/light intensity for HDR. Unlit color
may exceed1. All RGB is scene-linear Rec.709; other spaces reject until an explicit
conversion adapter is present. MeshData material/texture rejects instead of silently
ignoring it or acquiring unreviewed resources. Native Three/shader authors remain
available directly for other material workflows.

Double side defaults to one native draw pass with depth writes. Opacity is applied
to the frontmost resolved surface, with premultiplied alpha and NoBlending; it does
not transmit other triangles or simulate multilayer glass/OIT. Zero opacity hides
the mesh including its depth. No MSAA/feathering, texture/normal/environment maps,
shadows, refraction, ambient occlusion or spectral/path-traced material claim.
Ambient plus a directional array are explicit; default directional is towards
[.4,.8,1], white/intensity3, ambient[.25,.25,.25]. maxLights defaults64, configurable;
real shader/uniform/device failures reject rather than drop lights. No wall-clock
quality or resolution reduction. Triangle/Surface/byte limits remain existing
Graphics/device limits, with configurable maxBytes/fenceTimeoutMs.

The mesh API wraps shared owner error causes as E_MESH_*, returns owned Surface
values, rejects invalid preflight without drawing/poisoning, drains dispose and
releases geometry/material CPU references. Active cancel/context loss stops until
recreation. A float16 request uses the float32 attachment followed by explicit
half conversion; alpha underflow or out-of-range HDR rejects, never SDR fallback.
Formal Main GPU eligibility metadata integration remains separate on this older
branch schema; the local verified route uses explicit hardware preview mode.

## Surface sampling and native instanced mesh particles (0.3)

```ts
import {createSurfaceSampler,createInstancedMeshRenderer} from 'skeletal-effects';
const sampler = await createSurfaceSampler(emitterMesh, {
  maxSamples: 1_000_000, maxWork: 100_000_000, maxBytes: 128 * 1024 * 1024
});
const anchors = sampler.sample(6400, {seed:73});
const image = createInstancedMeshRenderer([{mesh:grainMesh,capacity:6400}], {
  width:640,height:360,maxBytes:512*1024*1024
});
// Within an existing Stage renderAt(ctx), with explicit deformed vertex positions:
const bound = sampler.project(anchors,positionsAt(ctx.time));
const surface = await image.render({context:ctx,camera,objects:[{
  id:grainMesh.id,instances:{count:anchors.count,positions:bound.positions,
    uniformScale:[.02,.04,.02]},appearance:{color:[.1,.5,1]}
}]});
await image.dispose(); sampler.dispose();
```

The full editable `examples/scatter-project.tsx` uses 6,400 bound tetrahedra,
800 analytical floating tetrahedra and one floor in three native GPU instanced
draws. `scatter-cpu-project.tsx` uses only the sampler under default software mode.
Neither example requests WASM. Ordinary TS can control every position, unit XYZW
quaternion, positive per-instance scale and optional Float32 RGB multiplier.
No backend selection, extra time system, scene DSL or native dependency is needed.

The CPU sampler clones validated Graphics MeshData before asynchronous SHA
initialization. SHA is source identity, not trust/permission. `sample` is uniform
over current triangle area; optional nonnegative `vertexDensity` supports existing
Signal values with an explicit FrameContext. Density is a continuous linear field
inside a triangle: face probability integrates that field, and an exact
Dirichlet-mixture barycentric sampler distributes points within the face. This
intentionally differs from upstream face-only weighting. `positions` resamples
according to explicitly deformed area; `project` preserves the original triangle
and barycentric binding instead, so emitted material points stay attached.

Returned owned arrays are F64 positions/normals/barycentrics/UV and Uint32 triangle
indices. Normals are local geometric unit normals, UV keeps the MeshData top-left
convention. Nondegenerate triangles are required for projected bindings. Zero-area
source faces are skipped, all-zero area rejects, all-zero density permits only
count0. All arrays are Stage-local, not image/AOV/JSON ports or a new cross-Stage
contract. Use existing declared data ports for separately validated serializable
summaries, not these buffers or GPU handles.

Each ordinal uses existing Core seededRandom(seed,0,ordinal+slot). No implicit
frame seed or history: `sample(32,{seed,offset:32})` exactly matches that slice of
`sample(64,{seed})`; independently created samplers replay. RNG has the existing
32-bit resolution, not cryptographic or unlimited precision. F64 CDF retains
increments lost by upstream F32, but rejects positive mass rounded away, overflow
or unrepresentable density ratios; explicitly partition such inputs. Not Poisson
disk, blue-noise/minimum spacing, volume sampling or automatic mesh repair.

Sampler budgets above are configurable numeric plans, not exact JS heap peaks.
Synchronous sampling/projection does not promise mid-call cancellation; chunk with
offset and yield in author TS if needed. Dispose is idempotent and releases retained
source/CDF; all later operations reject. No GPU/browser/context is created by a
sampler. Large arrays/JSON are never silently converted or base64 encoded.

Each renderer definition freezes topology/capacity; every render explicitly supplies
all batch IDs. Native ArrayBuffer-backed Float64 positions and optional quaternion/
scale arrays and Float32 colors must have exact lengths; shared buffers/custom
fields reject. Buffers are snapshotted before GPU work. Count may be0 through
capacity; omitted properties reset defaults, never inherit a previous frame.
Positive nonuniform scale and rotation are supported, negative/zero scale and
per-instance shear are rejected/not exposed. Standard smooth normals use the
native shader inverse-scale rule; the batch model remains affine. Per-instance
color multiplies base diffuse RGB, not emission or alpha. Use separate batches
for different materials/opacity. Input floats, source local origins and cloud
origins are rebased in F64 before F32 upload, including compensated batch models.

Vertex transforms, material shading and depth are real GPU operations. CPU prepares
instance matrices; this is not GPU state update/physics. Native Three is fixed at
0.186.1/MIT, with original reviewed sampler/instancing/shader/disposal files archived
by SHA. Static buffers/materials and instance attribute capacity are reused. Live
count updates only the declared active attributes. Capacity has the real GLsizei
limit and configurable maxBytes; allocation/device/Surface failures reject, never
silently reduce count, quality or resolution. Physical GPU peak memory is unknown.

All existing mesh color/float Surface/alpha/frontmost opacity constraints apply.
No OIT, transparent depth sorting, billboards, textures/sprite atlas, GPU Compute,
instance picking/physics, formal AOV output or new public GPU port is claimed.
Hardware WebGL2/float color/depth is probed, SwiftShader explicitly refuses. Active
cancel/loss/failure stops the owner; dispose and recreate to rebuild. Preflight
rejection does not poison it. Render/resize overlap rejects, dispose drains active
work/fences. Native InstancedMesh disposal releases its GPU attributes. Standard's
shared native DFG LUT object is cached in Three; renderer.info can retain a logical
texture count1 after disposal. Actual owner context loss is separately verified;
the count is preserved as reported, not zeroed or treated as live post-loss memory.

References: [upstream sampling](https://threejs.org/docs/pages/MeshSurfaceSampler.html),
[native instancing](https://threejs.org/docs/pages/InstancedMesh.html),
[fixed MIT license](https://github.com/mrdoob/three.js/blob/r186/LICENSE).

## Continuous 3D tube and ribbon trails (0.4)

```ts
import {createTrailGeometry,createMeshRenderer} from 'skeletal-effects';
const trail = createTrailGeometry({id:'trail.blue',pointCount:49,
  kind:'tube',radialSegments:8,caps:true,coordinates});
const image = createMeshRenderer(trail.meshes,{width:640,height:360});
// Inside existing renderAt(ctx). Points are explicit world/local meters;
// they may be existing fixed-step particle history, rope positions or analytic samples.
const shape = trail.sample({points,radius:.04,twist:0,context:ctx});
const surface = await image.render({context:ctx,camera,objects:
  shape.draws.map(draw=>({...draw,appearance:{color:[.1,.5,1],emissive:[0,0,2]}}))});
await image.dispose();trail.dispose();
```

`kind:'ribbon'` creates two vertices per station; radius means half-width.
Tube radius is physical radius, radialSegments defaults8. Native Three0.186.1/MIT
Curve moving-frame/TubeGeometry algorithms were reviewed and archived, then adapted
to explicit F64 point lists, atan2 rotations and orthonormal projection. This is not
automatic curve resampling or a new PathData/animation DSL. Curve authors retain
native TS/Three control. CPU builds geometry and existing native GPU renders actual
triangles, Standard/unlit shading and float depth; no CPU pixel rendering or GPU
simulation claim.

Open pointCount is capacity: any0..capacity ordered stations are accepted. Missing
prefix rows repeat the complete first ring (degenerate length), never invent caps
or borrow previous samples. Empty, one-point and stationary histories are invisible;
no fake tangent is published. Consecutive repeated stations preserve slots and
share neighboring nonzero edge directions. Interior tangent is the normalized
incoming/outgoing unit-edge bisector; exact reversals/cusps reject with E_TRAIL_CUSP
until explicitly split by the author. This is a sampled polyline sweep, not an
automatic bevel/miter/fillet, C1 spline or collision-free offset surface.

First normal defaults to the native least-aligned-axis rule; explicit firstNormal
is projected orthogonal to the first tangent, and parallel/zero values reject.
Frames propagate by minimal rotation, use atan2(cross length,dot) to preserve tiny
angles, and re-orthogonalize. Closed:true requires all pointCount station slots;
the API appends the seam, corrects holonomy by physical arc length and duplicates
that seam exactly. The author supplies a unique-loop list, without appending an
extra closure station. Radius/twist vary per station using numbers or existing
Signal with full FrameContext. Angles are right-handed radians, radius nonnegative;
all-zero widths keep centerline data but are invisible. No time advances internally.

Mesh topology and IDs stay fixed. Actual Graphics v1 limits (16384 vertices,
100000 indices per mesh) are met by whole-trail chunking with shared exact rings;
all station samples and radial segments remain, and internal seams have no caps.
Only explicit open tube caps add endpoint fans. maxVerticesPerMesh can request
smaller chunks, never raise the existing contract limit. Each MeshData is validated.
Whole-trajectory pointCount is not given a new fixed ceiling; maxBytes (default
128MiB) and maxWork (100M) are configurable numeric plans. These are not measured
heap/GPU peaks. Cross-sections that cannot fit a single contract chunk reject;
large values/positive F64 length loss/complete positive-radius collapse reject,
with explicit local geometry plus model transforms suggested for large origins.

Generated UV is fixed station-index U and cross-section V in top-left convention,
not dynamic arc-length texturing; returned frame lengths report physical distances.
Existing mesh material currently has no texture workflow. Frame normals orient
the geometry, not a new Graphics normals port. Flat shading uses actual GPU face
derivatives; optional native CPU smooth normals have existing duplicated-seam
limits and are not an analytic swept-surface normal claim. No arbitrary instance
sharing, public GPU handle, self-intersection repair, ribbon self-collision, swept
volume collision or OIT. Tight bends/large radii may intersect; author controls
station placement and geometric accuracy, with no wall-clock quality reduction.

All samples are stateless, owned current data. dispose blocks later operations;
already returned MeshData/draw data belongs to the caller and is not erased. R1
binding disposes its CPU factories after draining GPU renderers. Factory/import
creates no GPU context or WASM; GPU factory still probes/refuses SwiftShader and
obeys all existing float/color/alpha/cancel/loss/disposal rules above. No new GPU
export is introduced: createTrailGeometry remains CPU, createMeshRenderer is GPU.

`examples/trail-project.tsx` reuses spatial-effects0.2.1 FixedStepRunner feedback
histories to render six tube/ribbon pairs. This separate explicit example dependency
does not make spatial-effects a runtime prerequisite of the geometry library.
At frame0 there is no formed history; it correctly shows no trail. The101-frame
`trail-cpu-project.tsx` runs100/0/100 under default software mode without WASM.
See [native tube reference](https://threejs.org/docs/pages/TubeGeometry.html).

## Branched electric arcs (0.5)

```ts
import {createLightningGeometry,createMeshRenderer} from 'skeletal-effects';
const arc=createLightningGeometry({id:'shot.arc',seed:83,
  subdivisions:5,branchGenerations:2,branchesPerBolt:2});
const image=createMeshRenderer(arc.meshes,{width:1920,height:1080,shading:'unlit'});
// In renderAt(ctx): all geometry is a function of this explicit context and inputs.
const sample=arc.sample({context:ctx,start:[-2,0,0],end:[2,1,0],
  radius:.02,amplitude:.12,phase:ctx.time*4});
const surface=await image.render({context:ctx,camera,
  objects:sample.draws.map(d=>({...d,appearance:{color:[1.4,3.2,7]}}))});
// At Stage dispose: drain the GPU owner, then close CPU geometry.
await image.dispose();arc.dispose();
```

This is an authored, stateless midpoint-displacement **visual geometry** model,
not a dielectric breakdown/plasma solver. It reuses the existing MIT tube sweep,
Core seededRandom, Signal evaluation and native GPU float renderer. The historical
Three r152 LightningStrike was reviewed but is not shipped or imported: it used
a separate seeded-generator protocol, SimplexNoise, subray lifecycle/draw ranges
and mutable BufferGeometry; its default randomness was not reproducible. Current
Three0.186.1 has no such addon. No old Three, new runtime or dependency is installed.

Each bolt has 2**subdivisions segments (default5). A complete fixed tree has
1+B+...+B**G bolts, where B=branchesPerBolt (2), G=branchGenerations (2). No branch
is silently discarded or reduced for frame rate. Zero branches means root-only;
subdivisions0 is valid for root-only, while branches require an interior station.
The configurable default bytes/work plans are 128MiB/100M; they bound authored
numeric estimates, not measured JS heap, driver memory or peak GPU allocation.
Large root, tree and cross-section plans reject before topology allocation.
All stations/radial segments survive existing Graphics chunking, including seams.
The ID reserves suffix space (maximum96 characters). No whole-effect particle,
duration or geometry limit is introduced beyond explicit budgets and numeric/port
domains. Increase budgets/resolution explicitly; no wall-clock quality changes.

Core seed is XORed with the explicit option seed. Parent tree, attachment station
and azimuth depend on that seed; attachments stay at an exact interior parent
station and follow its current positions. Child chord length=parent chord length
times branchLength (.4), direction uses branchAngle (.8 radians) and stable azimuth.
Root/tip anchors are exact. Midpoint offsets lie transverse to each bolt's chord;
roughness (.55, range0..1) scales successive subdivision levels. Amplitude (.12)
is relative to that bolt's chord length. No new noise library is implied: each
independent Core RNG lattice value is blended with quintic interpolation in phase.
Phase is a **direct address**, default ctx.time*3; changing it jumps/deforms directly,
never integrates time or changes frame/sample time. Positive/negative phase and
100/0/100 requests are supported within the safe-integer lattice domain. Changing
seed can change attachment topology; there is no promised smooth seed transition.

Radius (default .02 meters), amplitude, phase and start/end support existing Signal
with full local FrameContext. Radius tapers linearly along station index to tipScale
(.1, range0..1). A child root inherits its parent's radius at the attachment times
branchRadius (.55). Chord-length/radius multipliers are nonnegative and finite;
they can exceed1 if the declared budget/geometry remains representable. Coincident
anchors produce inactive zero-length geometry; radius0 hides all tubes. No stale
sample or wall time is read. Returned bolts/draws are independent caller-owned
values, and failed samples do not poison the next call. dispose is idempotent;
R1 binding owns and closes this CPU factory without creating GPU/WASM itself.

MeshData coordinates default to right-handed meters in trail.world. Tube topology,
UV, winding, normals, local-origin precision and self-intersection limitations
remain those documented above. Branch attachments are connected centerlines,
not a watertight boolean union; tube junctions can intersect. Extreme amplitudes
can create tight bends; tiny positive sections that collapse in F64 reject.
No collision, glow, bloom, additive blend, automatic occlusion repair, OIT,
volumetric light, GPU compute or arbitrary object/texture sharing is added.
The scene example uses native unlit RGBA32F/depth32, linear Rec709/D65 and
premultiplied alpha; HDR output is not silently clipped to SDR. Explicit sRGB
preview/MP4 view conversion clips highlights by author choice, and H264 is lossy.
No GPU means the renderer fails; CPU geometry remains usable without GPU.

Editable examples: lightning-project.tsx (49frames/24fps), lightning-scene.ts,
lightning-recipe.ts and lightning-cpu-project.tsx (101frames numeric-only).
The example needs only this reviewed package; no WASM permission or spatial module.

## Scalar isosurfaces and compact metaballs (0.6)

```ts
import {createIsosurfaceGeometry,createMeshRenderer} from 'skeletal-effects';
const geometry=createIsosurfaceGeometry({id:'organic',cells:[28,28,28],
  bounds:{min:[-1.6,-1.3,-1.3],max:[1.6,1.3,1.3]},triangleCapacity:8000});
const image=createMeshRenderer(geometry.meshes,
  {width:1920,height:1080,normals:'provided'});
// In renderAt(ctx), ordinary TS controls the ball positions; existing Signals work.
const sample=geometry.sampleMetaballs({context:ctx,balls:[
  {center:[Math.sin(ctx.time)*.5,0,0],radius:1},
  {center:[-.4,.2,0],radius:.8,strength:.8}
]});
const surface=await image.render({context:ctx,camera,objects:sample.draws});
// At dispose:
await image.dispose();geometry.dispose();
```

This is CPU geometric extraction with existing native GPU Standard rendering,
not GPU Compute, a fluid solver, volume raymarching or a new Simulation Runner.
Three0.186.1/MIT classic MarchingCubes lookup tables are reused at the existing
exact registry identity. One reviewed original addon file is archived unchanged;
no new dependency/engine is installed. The adapter uses F64 scalar values, edge
interpolation and physical-coordinate derivatives; the native addon stores its
field/geometry in F32. Output equality is numerical, not a native bit-equality
promise. Tables preserve classic cases, without MC33/asymptotic face deciders:
ambiguous saddle fields can have topology ambiguities/cracks. No universal manifold,
watertightness or exact signed-distance guarantee. Boundaries are not capped.

`cells` are positive XYZ cell counts, default[24,24,24]; samples are the inclusive
grid with dimensions cells+1. bounds default[-1,-1,-1]..[1,1,1], in the selected
right-handed meter space (default isosurface.world). `sample({values,level,context})`
accepts a dense number array or private Float32/64Array with X fastest, then Y,
then Z. No shared/proxy buffer or nonfinite value; these are Stage-local data,
not a new public volume/AOV/IPC contract. Input is read into owned scratch; outputs
do not alias scratch or previous samples. All cells, including the boundary layer,
are covered; there is no native-addon-style cropped outer cell layer.

Level defaults0 and can be a Core Signal with full local FrameContext. Membership
defaults `inside:'above'`; `< level` is the exact classic case classifier, with
no invented epsilon. Above uses native winding and outward minus-gradient normals;
`inside:'below'` reverses winding and normals for SDF-like negative-inside fields.
Each crossing interpolates its edge linearly, not an iterative root of an unknown
continuous function. Gradient directions use physical cell spacing and centered
finite differences (one-sided at outer boundaries), interpolated at crossings.
Zero interpolated gradients fall back to the triangle normal, then[0,1,0] for a
degenerate triangle; gradientFallbacks counts these vertices. No hidden claim of
analytic normals for arbitrary fields. Large-origin station collapse rejects;
use local bounds plus model transforms. Scalar/coordinate F64 representability
and subsequent native F32 GPU uploads remain finite precision.

`sampleMetaballs` evaluates the authored compact scalar field
sum(strength * max(1-(distance/radius)^2,0)^3), default level .125. Radius is a
required positive **support** radius, not the isosurface radius: a single strength1
ball at level.125 has continuous radius supportRadius/sqrt(2). This small polynomial
field builder is authored math, not transplanted SPH code or a physical liquid.
Center, radius, optional strength(default1) and level support Core Signal. Strength
can be negative for explicit subtractive density, with finite accumulation checked.
Empty balls mean an empty zero field (subject to chosen membership/level). Total
field work includes the explicit ball count and is checked against maxWork before
sampling. No state integration, elapsed-time dependence, RNG or history cache;
authors can use Core seededRandom to create their own deterministic input recipes.

Triangle capacity defaults10000, fully configurable within explicit memory/work
budgets (128MiB/100M defaults). A first pass counts **the complete surface** before
emitting vertices. E_ISOSURFACE_CAPACITY includes requiredTriangles and the declared
triangleCapacity; it never publishes a clipped old/native buffer. Capacity, not
active triangles, determines reusable static topology and upload size. Fixed slots
are split at existing Graphics per-mesh limits, with every unused triangle collapsed
to a point and entirely inactive chunks explicitly hidden. This avoids per-frame
Renderer/material recreation, but pays for reserved degenerate slots; it is not an
active-count GPU allocation/streaming claim. `sample.triangleCount` is active;
renderer stats.triangles is reserved topology. Bytes/work plans are estimates,
not measured JS heap or physical GPU peaks. CPU sample is synchronous/budgeted;
it has no mid-sample cancellation or automatic out-of-core execution.

For Standard shading, new explicit `normals:'provided'` requires current nonzero,
finite mesh-local normal directions on every MeshDraw. Data is copied, normalized
and uploaded to the existing native normal buffer; native normal matrices still
handle model transforms. Missing/zero/wrong-shape data rejects before GPU submission.
Normals supplied in flat/smooth/unlit mode reject instead of being ignored.
Existing flat/smooth/default behavior and stats keys remain; only provided mode
adds normalUploads. This optional Stage-local library input does not alter the
shared Graphics MeshData, P4 or Surface ABI. CPU geometry remains usable alone;
GPU renderer probes hardware/float attachments and explicitly refuses software
without CPU pixel/SDR fallback. Existing HDR/color/alpha/cancel/loss rules apply.

Editable isosurface-project.tsx/isosurface-recipe.ts/isosurface-scene.ts demonstrate
three merging/separating lobes via ordinary TS plus a radius keyframe. This is a
visual field deformation, not fluid incompressibility, simulation contacts or mass
conservation. No textures, boolean union repair, remeshing, volumetric material,
caustics, OIT or public normal AOV is added. CPU101-frame and actual49-frame media
projects are separate; no WASM permission is used.
