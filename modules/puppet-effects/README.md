# Puppet Effects 0.2.0

Optional reviewed local R1 library. Real Rust/WASM planar ARAP: hard vertex pins,
per-triangle Starch weights, soft oriented edge-vector Bend targets. A separate
native Three hardware GPU renderer deforms float image textures on that mesh.

```ts
import {createPuppet,createPuppetRenderer} from 'puppet-effects';
// In async native Web Stage initialization, with explicit host allowWasm:true:
const puppet=await createPuppet(mesh); // existing Kit Dedicated Worker by default
const image=createPuppetRenderer(mesh,{width:init.width,height:init.height});
// In renderAt: targets are ordinary TS/Signal/keyframe values at ctx.time.
const pose=await puppet.solve({pins:[{vertexId:'base',position:[0,0]}],refine:2});
const surface=await image.render(pose.positions,inputSurface);
// In Stage dispose: await puppet.dispose(); await image.dispose();
```

`mesh` is existing Graphics MeshData in local meter/right/up/toward-viewer space.
The first solver supports a constant-Z XY plane only. Positions are owned numeric
arrays aligned to mesh.vertexIds; restPositions never becomes mutable pose data.
UVs are per-vertex, top-left. Source/target must be matching scene-linear 16/32F
Surface v2. GPU uses F32, premultiplies straight texture taps before interpolation,
and preserves signed/HDR RGB and soft alpha. Default sampling is GPU bilinear;
nearest and zero/clamp boundaries are explicit. It never falls back to CPU pixels
or Canvas8. SwiftShader/hidden device identity/no float target fails explicitly.

Every solve starts from rest plus current explicit constraints, not the previous
pose. Request order and wall time do not advance simulation or alter targets; no
new Runner. Calls are async and reject overlap. Close drains the active call and
releases C1 buffers/Worker. Abort uses the existing Kit Worker termination path;
direct synchronous WASM cannot be preempted. Host Stage deadline remains the hard
stop. Signal functions are evaluated by author code using existing Stage time.

Every connected component requires a pin. Degenerate/tiny rest edges, duplicate
pins, nonfinite values, work/message budget overruns and nonconverged linear solves
reject. Default maxSolveWork256M is configurable, as is refine (default2); the
estimate is a conservative sparse multiply-add envelope, not measured CPU work.
The existing Graphics vertex/JSON and Kit16MiB call limits remain unchanged. ARAP
can fold triangles: default solve rejects folds/collapse; explicit `foldovers:'allow'`
returns counts, without automatic repair. It is not a collision/self-intersection
solver. GPU overlap follows triangle index order; no 3D occlusion claim.

Sources: EffectCraft861c51f8187bf56efc77cc7b60fc4a513d2b7198, selected MIT;
Rust1.99.1 std notices; Frameweave C1 bytes-v1, Apache2; Three0.186.1, MIT.
Original arithmetic is preserved; adapter adds checked final residual<=1e-8,
iteration counters and error propagation. Original bytes and transformation are
carried. No application, fonts, GPL code or external crate dependency is included.
Build requires reviewed Rust/std/linker, never installs tools or enables permissions.

R1 named imports use the declared initializer and verified loader. Plain library
embedding uses `createPuppetTools(graphics,load)` with an explicit existing R1 loader;
it does not fetch a WASM URL or invent an ambient host. Permission/trust/lock checks
remain mandatory. The package is trusted local code, not a sandbox certification.

Not supported: adaptive remeshing, 3D ARAP, skeleton
skinning/IK, topology changes, GPU solver, collision-aware Puppet, general AOV pose
wire contract or default installed SDK distribution. Validation/report records
separate original-kernel comparison, real WASM/Worker/GPU and public TSX media scope.

## Alpha image to Puppet mesh

`createPuppetProcessor(options)` initializes the existing verified C1 Worker once
in Stage init. It exposes `generateMesh(surface, options)` and `solve(mesh, pins)`;
both are async and share the same owned client. Do not create Workers during
renderAt. `createPuppet(mesh)` and its previous semantics remain available.

```ts
import {createPuppetProcessor,createPuppetRenderer} from 'puppet-effects';
const processor=await createPuppetProcessor(); // Stage init, explicit allowWasm
// In renderAt, after an upstream image Surface arrives:
const made=await processor.generateMesh(input,{id:'sprite',
  world:{left:-1,right:1,bottom:-.75,top:.75},
  edgeLengthPx:16,expansionPx:1,simplifyPx:.5,holes:'preserve'});
if(!made.mesh) return; // all transparent, no fabricated mesh
// Anchor every made.components entry; positions are XY meters.
const pose=await processor.solve(made.mesh,{pins});
// Existing GPU renderer, initialized for this rest mesh:
const surface=await renderer.render(pose.positions,input,{boundary:'zero'});
// dispose(): await processor.dispose(); await renderer.dispose();
```

Input is existing Surface v2; RGBA8/10/16F/32F alpha is decoded without RGB/luma
thresholding, color conversion or alpha unassociation. Selected pixels have
`alpha>0 && alpha>=threshold` (default threshold0). Hidden RGB is not mask data.
GPU texturing still requires matching scene-linear float Surface, never implicit
SDR8 conversion. The editable example explicitly decodes a declared SDR PNG and
converts it with the official SDK before any mesh/GPU operation.

Geometry uses pixel-crack boundaries, fixed EffectCraft exact discrete Euclidean
mask expansion/erosion, Douglas-Peucker (default0) and constrained Delaunay with
jittered interior seeds. This is deterministic CPU/WASM geometry, not GPU compute.
No polygon is selected by a click and no region is silently discarded. Positive
expansion can merge components/close holes; negative expansion can remove them.
The hole policy is applied AFTER discrete morphology. Preserve is default; fill
is explicit and reject reports E_PUPPET_HOLES. Nested islands remain independent
components; fill can make such components geometrically overlap (no union).
Simplification changes boundaries; invalid/unrecovered topology fails explicitly,
without partial mesh publication or hidden resolution/count reduction. Touching
or self-intersecting boundaries may reject E_PUPPET_TOPOLOGY.

`world` is required and maps source [0,width]x[0,height] pixels to local XY meters,
with Y flipped, triangle winding corrected, and top-left UV. Source dimensions
are never rescaled. Expansion may produce UV outside [0,1]; select zero/clamp in
the existing renderer. Every returned vertex belongs to a triangle. Components
include an anchorVertexId and one MeshData control each. Results are owned, no
implicit author-state/cache: explicitly cache the rest mesh if its source/mask and
options are immutable, regenerate it if they change, and recreate its renderer.

Defaults: edgeLengthPx16, simplifyPx0, expansionPx0, threshold0, maxVertices4096,
maxTriangles8192, maxContours1024, maxProcessedPixels4194304 (including padding),
maxWorkingBytes256MiB, maxWork256M, maxReplyBytes4MiB. Each budget is configurable;
existing Graphics limits (16384 vertices/100000 indices), Surface and C1 16MiB
message limits remain. Budget checks reject before large topology allocations.
Working-byte and work plans are conservative estimates, not peak-memory or time
measurements. Huge or ill-conditioned inputs can be rejected. No silent cap,
quality adjustment, retry, fallback or automatic time progression.

Calls reject overlap (E_PUPPET_BUSY), close drains the active call and prevents
new calls, failed topology/budget calls can be corrected and retried. Worker Abort
terminates pending work with E_PUPPET_CANCELLED; cancelled outputs are not
published. Direct synchronous WASM cannot preempt. No GPU handles enter geometry
or checkpoint data; no new Runner, shared ABI, permissions or message bus.

Editable full chain: examples/image-rig/project.tsx, sprite.svg/png, rig.ts.
The source asset has two connected regions and two holes. FrameContext.time
controls normal TypeScript pin targets; every pose still solves from rest.
`createPuppetRenderer` alone is GPU-required/WebGL2 in the R1 binding metadata;
CPU-only meshing/ARAP imports retain default software-browser eligibility.

Reproduce in this worktree (use a private FRAMEWEAVE_HOME):
`node --import tsx --test tests/puppet-mesh.test.ts tests/puppet-effects.test.ts tests/puppet-effects-gpu.test.ts`
`node --import tsx scripts/verify-puppet-mesh.ts artifacts/puppet-mesh/media`
The latter explicitly builds/installs reviewed local R1 packages, writes a fresh
lock, renders default Final and preview, checks reopening/cache/cleanup, and
fully decodes an MP4. This is source-SDK integration evidence, not independent
installed-SDK or cross-device qualification. See raw artifacts/puppet-mesh logs.

Additional preserved MIT source: EffectCraft mesh.rs and mesh-tests.rs at the
same fixed commit, hashes in vendor/effectcraft/SOURCE.json. prepare-mesher.mjs
makes explicit adaptations (all contours, budgets, checked edge recovery) while
retaining EDT/Delaunay arithmetic. No new Cargo/npm dependency. Frozen 0.1.1
WASM fixture and build receipt are solely for numerical compatibility tests.

## 0.3.0 source candidate: Native character workflow

See [NATIVE.md](NATIVE.md) for real Three CCD/FK controls, validated MeshData/SkeletonData binding and JSON authoring, and Native GPU resident skinning/drawMesh. This new source entry does not migrate the old Worker/WASM/image renderer. External Native textures, image-driven meshing and GPU result export remain deferred. Installed Native packaging and fresh SDK pins are pending coordinated integration; no installed locks were refreshed.
