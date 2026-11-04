# Native particle creation — checkpoint 1 of 3

Source entry: `native.ts`. Editable TSX: `examples/native-creation/project.tsx`.
This checkpoint adds creation features; it is **not** a historical-function
migration batch. The later migration batches must each include at least 20
existing functions, with an explicit tested/deferred inventory.

```ts
const simulation = createFeedbackParticles({
  fps: 24, seed: 7, rate: 20, lifetime: 1,
  origin: [0, 2, 0], velocity: [0, -2, 0],
  subEmitters: [{id: 'sparks', on: 'collision', from: ['root'],
    count: 6, lifetime: .4, velocityJitter: [2, 1, 2], normalSpeed: 2}]
});
const draw = createNativeParticleRenderer(init.gpu, {
  width: init.width, height: init.height, camera,
  format: 'rgba32float', sort: 'back-to-front'
});
// Within the existing Native Stage renderAt(context):
const image = await draw.render(simulation.sample(context), context, style, {
  depth: residentAxialDepth, softDistance: .25
});
// The Stage publishes image; dispose draw explicitly. Scope/device belong to Core.
```

`camera` is the existing SpatialCamera definition. `depth` is the existing
spatial-field/1 axial-depth + independent validity pair, positive meters, same
camera/resolution/time. It is not a color image or a new Stage port. Missing
validity means no occluder. Hard depth testing uses softDistance=0; otherwise
coverage fades as clamp((sceneDepth-particleDepth)/softDistance,0,1).

Birth/collision/death sub-emitters use the unchanged force/swept-collision
operators and existing Core FixedStepRunner. Root ordinal still seeds root
appearance; the enhanced mode assigns separate deterministic family IDs.
Child generation, parent/source IDs, birth time, counters and frame emission
events are cloneable checkpoints. No GPU handles enter them. Children inherit
post-impact velocity plus explicit normal speed/jitter. Expiry is integrated to
its exact lifetime endpoint. Even roots born and dead between samples produce
their events. Recursive emission stops at explicit maxGeneration; configured
maxSpawnsPerStep/live/replay/value budgets fail instead of truncating fan-out.
Failure latches until reset. Events cover the current authored frame's fixed
substeps; contacts retain the existing last-substep meaning.

CPU performs existing particle physics, appearance evaluation, camera projection,
stable primitive depth order and tile lists. WGSL performs full-resolution
coverage, depth/soft intersection and scene-linear PM compositing. Tile/storage/
work limits are explicit and configurable; no automatic quality reduction.
Sorting uses billboard/capsule center depth; crossing transparent trails are
not order-independent deep geometry. Orthographic/perspective cameras and
near/far clipping are supported. Background image/depth inputs are borrowed;
the returned image belongs to the caller. Temporary-buffer release is logical;
the existing owner retains submitted data. Compiled kernels are reused per Scope.

Both F16/F32 output preserve scene-linear Rec709/D65, unassociated signed/HDR
ink and premultiplied output Alpha. Native final PNG/video conversion is Core's
existing output path; lossless float EXR was decoded independently. Only valid
numeric spatial fields are qualified here; stable asynchronous diagnostics for
malformed GPU field contents are not a new capability of this module.

## Deferred under the user's Native-interface constraint

- GPU image-driven emitters/statistics: need resident image-to-compute bridging.
- External atlas and textured Puppet assets: need controlled Native resource
  import. spriteFrame requests currently fail explicitly, not draw a substitute.
- GPU feedback state across frames: need writable reset/replay/checkpoint
  ownership. Existing explicit CPU fixed-step physics remains CPU physics.
- Exporting GPU-generated geometry/solver results: needs on-demand data export.

The example's depth is genuinely generated from an explicit sloped geometric
plane in resident compute buffers. It does not smuggle depth through RGBA or
claim an external depth-texture import. External image/mesh workflows above
remain deferred. No new Host, device, renderer service, IPC or simulation runner.

## Reproduce

```powershell
node --import tsx --test tests/native-particle-creation.test.ts tests/spatial-effects.test.ts tests/particle-sprites.test.ts
node node_modules/typescript/bin/tsc --noEmit -p modules/spatial-effects/tsconfig.json
# Until Main integrates the already delivered SpiderMonkey Core hooks:
$env:FRAMEWEAVE_NATIVE_GPU = 'C:/absolute/path/frameweave-native-gpu.exe'
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs modules/spatial-effects/validation/native-creation.ts
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs modules/spatial-effects/validation/native-float.ts
```

Evidence: `validation/native-creation/`. 18 focused Node tests passed; actual
640×360 Native GPU/SpiderMonkey TSX, random/repeat packet data, PNG, 24-frame
1-second MP4 fully decoded, depth/soft/occlusion oracle checks, and signed HDR/
Alpha EXR 16F/32F passed on RTX 5070/Vulkan. First/middle/last raw and decoded
frames were visually inspected. PNG oracle comparisons cover the fully covered
center; source-order permutation and missing-depth comparisons cover full RGBA.
This does not claim arbitrary deep-transparency sorting or all-device precision.

Implementation is independently authored Apache-2.0, reusing Frameweave's
existing simulation/graphics/GPU contracts. Existing FastNoiseLite code remains
fixed MIT upstream. The generic depth-fade technique is described in
[GPU Gems 3, chapter 23](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-23-high-speed-screen-particles);
no NVIDIA SDK code was copied. No new dependencies. This is a source Native
entry, not an installed R1/native-package release; immutable package identity,
SDK pins and final catalog packaging remain for coordinated integration.
