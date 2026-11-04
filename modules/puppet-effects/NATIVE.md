# Native character/Puppet creation — checkpoint 2 of 3

Editable entry: `native.ts`. Complete example: `examples/native-character/`.
This is a source candidate, not an installed Native R1 release or a migration
claim for the old ARAP/WASM image renderer.

```ts
const asset = parseCharacterAsset(json); // existing MeshData + SkeletonData
const rig = createCharacterRig(asset, {
  chains: [{id: 'hand', effector: 'hand.r', links: ['forearm.r', 'arm.r'],
    iterations: 32}],
  limits: {'forearm.r': {min: [0,0,-2.5], max: [0,0,2.5], axis: [0,0,1]}}
});
const draw = await createNativeCharacterRenderer(init.gpu, asset, {
  width: init.width, height: init.height, camera, color: [.15,2.4,1,.8]
});
// Existing Native Stage renderAt(context):
const pose = rig.sample(context, {
  bones: {head: {rotation: [0,0,Math.sin(context.time)*.1]}},
  targets: {hand: {position: [.8,.7,0], weight: 1}}
});
return draw.render(pose);
```

## Binding and authoring

- `characterBones(joints)` creates explicit global mesh-space affine bind and
  inverse-bind matrices from named joint positions/parents.
- `bindCharacterMesh(mesh,bones,{id,influences,power,softening,bones,maxWork})`
  provides conventional nearest-segment distance weights. It is not heat-diffusion
  binding or an automatic quality guarantee. Weights remain ordinary editable
  SkeletonData: authors can explicitly replace/paint them. No render-time rebind.
- `validateCharacterAsset`, `serializeCharacterAsset`, `parseCharacterAsset`
  validate and carry the existing two Graphics payloads together. The pair is
  optional author data, not a new mandatory scene/asset document. Standard JSON
  normalizes signed zero; it is not an arbitrary JS object checkpoint format.
- `characterPuppetConstraints(asset,pose,{pins,edges,triangleWeights,refine})`
  converts explicit named mesh landmarks into the old planar ARAP pin/edge API.
  Every connected component needs a pin. Nonplanar targets reject. This is a CPU
  mathematical target adapter; it never reads back a GPU result or starts WASM.

The example's `prepare.ts` is an **explicit trusted local authoring command**.
It saves JSON rest geometry, bones and weights; TSX imports that file as sealed
source data through the existing compiler. No runtime filesystem/image importer
is introduced. GLTF/FBX, Alpha-to-mesh ingestion and external textures are not
qualified here. Texture references are preserved by the asset validator and
explicitly rejected by the Native solid renderer, not silently ignored.

Existing SkeletonData limits (256 bones/four influences, Graphics JSON/vertex
budgets) remain unchanged. The new code does not relax or invent those limits.
Configuration and returned assets/poses are copied. Vertex and bone IDs, mesh
identity, parent hierarchy, inverse bind and normalized weights are validated.

## Constraints, time and ownership

Real pinned **Three.js 0.186.1 CCDIKSolver** performs IK. Real Bone/Skeleton and
Matrix4/Quaternion operations perform FK/control math; no Three renderer or GPU
context is created. Every sample resets owned bones to bind before evaluating
the current controls, so random/repeated frames and fresh rigs reproduce poses.
No simulation Runner, independent clock, implicit next frame or GPU checkpoint.
Use existing scalar keyframes/evaluate for vector components (the SDK's keyframes
function accepts scalars); the example demonstrates the actual supported API.

FK translations/rotations/scales offset the local bind transform. Rotations are
Euler XYZ radians. Joint limits are absolute local Euler bounds in [-pi,pi];
an optional normalized hinge axis restricts rotation. IK links list the immediate
effector parent outward. Multiple chains run in their declared array order.
Final limits are reapplied after IK blending (including Euler wrap); conflicting
hinge/Euler restrictions reject. Bounds are Euler limits, not a swing/twist
physical joint solver. Targets are mesh-space, blend weights are explicit, iteration/work budgets are
fixed, and residual distances are reported. Unreachable targets return their
actual residual, not a fabricated convergence claim. Pinned CCD is qualified
for uniform world scales; nonuniform IK scale, invalid chains and degenerate
non-unit/nonfinite results reject. No self-collision, tissue or ARAP replacement.

CPU controls bones and binding. GPU Compute applies linear blend skinning to
resident vertices; existing Native drawMesh consumes that same buffer. Immutable
rest/weights/indices are created in Stage init; per-frame matrices and output
positions are fresh. No image-to-compute bridge or persistent writable GPU state.
`draw.deform(pose)` transfers a same-Scope frame-local position capability to the
caller for custom GPU drawing; it is **not CPU geometry export**. Release it with
the existing Scope. `draw.render` releases its temporary positions after recording.
Disposal releases owned seeds, never the borrowed Scope/device. Calls reject
overlap; logical resource release is not a GPU completion fence.

Solid color is explicit scene-linear unassociated RGBA; Native output is PM
16F/32F and preserves signed/HDR RGB. The existing native output path performs
final media conversion. No CPU pixel rasterizer, Canvas8, browser rendering or
quiet fallback. Physical GPU peak memory and cross-device precision are unknown.

## Verified and deferred

12 new grouped checks plus five existing actual Rust/WASM solver regressions
passed; the latter qualify compatibility only, **not Native WASM migration**.
Actual sealed JSON + real Three CCD ran in SpiderMonkey. Repeated/乱序 command
data matched. The Native GPU generated first/middle/last/repeated PNGs and a
fully decoded **1-second, 24-frame MP4**. Those raw/decoded frames were inspected.
Independent authored triangles matched full RGBA for affine transforms and 50/50
weight blending; float EXR decoded exact signed HDR/Alpha for 16F and 32F sources.
Raw errors and successful evidence are in `validation/native-character/`.

Deferred under the user's interface constraint: old ARAP/mesher Worker/WASM
loading in the Native host; image-to-buffer Alpha meshing; external Puppet
textures and runtime asset import; cross-frame writable GPU simulation; GPU
geometry export. No replacement solver/importer was invented for those gaps.

```powershell
node --import tsx modules/puppet-effects/examples/native-character/prepare.ts
node --import tsx --test tests/native-character.test.ts tests/puppet-effects.test.ts
node node_modules/typescript/bin/tsc --noEmit -p modules/puppet-effects/tsconfig.json
# Until Main integrates the previously delivered SpiderMonkey Core hooks:
$env:FRAMEWEAVE_NATIVE_GPU = 'C:/absolute/path/frameweave-native-gpu.exe'
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs modules/puppet-effects/validation/native-character.ts
```

Fixed sources, npm integrity, file hashes and licenses: `NATIVE_UPSTREAM.json`.
Three is MIT; Frameweave adapters/LBS shader are Apache-2.0. Existing EffectCraft
ARAP remains at its reviewed commit/selected MIT, without numerical edits. The
existing mesh validator was extracted into a pure file to avoid importing the
Worker/WASM client into Native helpers. Root dependencies, Core, P4, native GPU
owner/mesh protocol, permission grants and installed content/SDK locks are unchanged.
