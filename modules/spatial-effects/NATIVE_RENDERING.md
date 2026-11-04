# Native rendering and explicit simulation replay

These source-level Native adapters borrow the existing Stage `init.gpu`. They
create no device, browser, renderer service, registry or simulation clock.
Main owns installed SDK/R1 export integration. Existing Web APIs remain present.

## Entries

| Entry | Native use |
| --- | --- |
| `spatial-effects/native.ts` | Feedback/control, image-emitter CPU CDF, full pinned FastNoiseLite point queries; `createNativeNoiseTextureRenderer`, `createNativeParticleRenderer` |
| `spatial-compute/native.ts` | Original 15 explicit-input GPU operators; `createNativeReplay` wraps Core FixedStepRunner and Native managed leases |
| `puppet-effects/native.ts` | Original character controls/assets; `createNativePuppetRenderer` accepts a borrowed texture; character renderer supports explicit `texture:'borrowed'` |
| `skeletal-effects/native.ts` | Original CPU rig, surface sampler, trail/lightning/isosurface geometry; Native mesh, instance and GPU skin renderers |
| `spatial-data-effects/native.ts` | `createNativeSpatialDataRenderer`: actual depth, world normal and object/deformation/camera motion from explicit mesh poses |
| `deformable-effects/native.ts` | Existing CPU rope/cloth/soft-body/rod configuration and rod geometry only; does not enable a solver |

The final migration covers 23 distinct old creative entries: 10 remaining compute
operators; noise-texture, Puppet-texture, mesh, instance, skinned and spatial-data
renderers; five CPU skeleton/geometry factories; point noise and image emitter.
The prior 50 are not counted again. New replay helpers, character enhancements,
the five configuration helpers, aliases and lifecycle methods are not counted.

## Authoring

```ts
// Within defineNativeStage(init => ...): immutable buffers/kernels at init.
const puppet = await createNativePuppetRenderer(init.gpu, mesh, {
  width: init.width, height: init.height
});
// Within renderAt(context): input is an admitted frame-local GPU image.
const image = await puppet.render(posePositions, inputTexture, {
  sampling: 'linear', boundary: 'zero', format: 'rgba32float'
});
// Return image, or release it through the same Scope after its last use.
```

Editable complete TSX: `validation/native-final/visual.tsx`,
`validation/native-final/aov.tsx`, and
`../spatial-compute/examples/native-state/project.tsx`. The last is a declared
64×64 simulation grid rendered at 640×360, 24 frames/24fps; no adaptive reduction.

Puppet and character textures are explicit borrowed overrides. They do not
silently load the texture referenced by an asset. Use existing declared-resource
admission/import externally, with the existing source seal and permissions.
An image emitter accepts an explicit CPU ProfessionalSurface and computes a CPU
sampling CDF; it does not synchronously query a resident GPU image.

`createNativeSpatialDataRenderer(gpu,{width,height,meshes})` exposes
`capture(current,previous,{signal})`, returning independent `depth`, `normal`,
`motion` SpatialField data/validity pairs. `current/previous` both supply context,
camera and every object's model/positions. Motion is current-minus-previous
top-left pixels; previous visibility is not tested. Geometry is opaque nearest,
binary coverage, no MSAA/cutout/transparency. Release each pair with existing
`releaseSpatialField`. AOVs never use Surface RGB as data transport.

`createNativeSkinnedRenderer.publishPositions(pose,localId)` publishes without
waiting. After the completed Renderer ticket, use the existing host
`exportNativeBuffer(ticket,'stage-id/local-id')` and `decodeNativePositionProbe`.
Recording-time blocking `probePositions/readBuffer` is not supported.

## Ownership, time and failure

- Inputs, rig and GPU Scope are borrowed. Immutable geometry is renderer-owned;
  per-frame data/outputs are fresh. Dispose after the active recording resolves.
  Returned image/fields belong to the caller. Logical release is not a GPU fence.
- Existing owner authenticates all handles and retains submitted references.
  Resize affects subsequent calls; no cross-frame image handles are retained.
  Native Session owns completion, backend loss, timeout and recreation.
- Every `createNativeReplay.record(context,step)` resets managed leases with a
  fresh epoch, then plans the full replay with Core FixedStepRunner. `substeps`
  affects explicit callback contexts/Signals; enclosing global clocks do not
  change. GPU checkpoints are not claimed. No GPU handles enter CPU snapshots.
  One controller per lease set; concurrent entry rejects. On exception/cancel,
  restart by reset/replay. Arbitrary JS/external effects do not roll back.
- Work/storage budgets are configurable and fail before truncation. Mesh/AOV
  visibility is O(pixels×triangles), not BVH-accelerated. GPU physical peak and
  GPU timestamps were not measured. No performance speedup claim is made.

## Color and algorithm profiles

Output is explicit scene-linear float16/32 with PM Alpha. Noise supports signed
HDR RGB, 2D/3D and the complete pinned FNL noise/fractal/domain-warp choices.
Only enum dispatch is specialized; selected arithmetic/tables are unchanged.
FNL1.1.1/MIT is translated with Naga30.0.1 (MIT/Apache2), pp-rs0.2.1 (BSD3).
Receipts/licenses are under `vendor/fastnoise-lite` and `tools/glsl-library-to-wgsl`.
The Three0.186.1/MIT ray port is archived under `../skeletal-effects/vendor/three`.

Mesh `standard` is an explicit authored single-scatter GGX/Lambert profile,
**not pixel equivalence with Three MeshStandardMaterial**. Unlit visibility and
analytic GGX fixtures have independent numerical references. No tone mapping is
performed in the algorithms. PNG/MP4 presentation is separate from raw float
verification and may clip/gamut-map/quantize as the existing output path defines.

Atlas sampling converts straight Alpha to PM per tap before interpolation,
clamps/zeros within each tile, supports frame blending and preserves F16/32.
Its legacy profile canonicalizes RGB when Alpha is zero; generic PM images may
retain zero-Alpha emission. Atlas positive rotation follows view-XY CCW as the
old sprite shader. The existing untextured Native ellipse convention is retained.
Puppet coplanar triangle ties follow index overwrite via native LessEqual; mesh
and AOV ray ties use strict nearest/first-wins as the old LessDepth path.

## Reproduction and evidence

From the worktree root, after the existing Native and SpiderMonkey builds:

```powershell
$env:FRAMEWEAVE_HOME = "$PWD/.frameweave/native-final-home"
node --import tsx modules/spatial-effects/validation/native-final/prepare.ts
node node_modules/typescript/bin/tsc --noEmit -p modules/spatial-effects/validation/native-final/tsconfig.json
node --import tsx --test tests/native-library-final.test.ts tests/native-particle-creation.test.ts tests/skeletal-rig.test.ts tests/instance-prepare.test.ts tests/skeletal-numeric.test.ts
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs modules/spatial-effects/validation/native-final/verify.ts
```

The verifier generates raw compressed F32, PNG, storyboard, actual 1-second MP4
and full decode. `evidence/campaign.json` combines latest checks and retains
failed attempts in separate logs/results. GPU: RTX5070 Laptop/Vulkan,
NVIDIA596.49; same frozen Native binary SHA recorded there. Only source Renderer
with default SpiderMonkey **reference hooks** is verified here, not an installed
SDK/portable package. Main performs final public wiring and release acceptance.
Recorded command time is a lower bound: three early translation invocations
were not separately timed; no missing duration is invented.

The five remaining solver entries now have Native adapters and real
SpiderMonkey/WASM host tests: `createPuppet`, `createPuppetProcessor`,
`createRigidBodies`, `createCollisionEnvironment`, `createDeformables`.
See [module bytes contract](../spidermonkey-host/MODULE_RESOURCES.md).
Their formal existing-ModuleLoader Core hookup and installed qualification are
still pending Main; the source fixture validates the proposed callback and
Native recording, without claiming complete Renderer/GPU execution for this
solver chain. No automatic WASM grant, private loader or fetch shim is introduced.
