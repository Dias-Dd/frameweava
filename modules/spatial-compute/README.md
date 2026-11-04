# spatial-compute0.1.1

15 named functions using the existing Stage-local hardware WebGPU compute/field scope. No CPU pixel fallback or new device, renderer, runner, resource registry or P4 port. Public exports: cellularVolume, vortexField, curlNoiseField, advectField, diffuseField, projectVelocity, vorticityConfinement, reactionDiffusion, waveStep, thermalErosion, approximateDistance, advectParticles, flockParticles, splatParticles, renderVolume.

```ts
import {createGpuEffectChain} from '@frameweave/engine/web';
import {vortexField,cellularVolume,advectField,renderVolume} from 'spatial-compute';
const chain=await createGpuEffectChain({width,height,effects:[],backend:'webgpu'});
const gpu=await chain.createPixelScope(); // once per Stage
const flow=await vortexField(gpu,ctx);
const density=await cellularVolume(gpu,ctx);
const moved=await advectField(gpu,density,flow,ctx);
await gpu.releaseBuffer(flow);await gpu.releaseBuffer(density);
const image=await renderVolume(gpu,moved,ctx,{width,height});
const surface=await gpu.readback(image); // queue completion/validation/publication
await gpu.release(image);await gpu.releaseBuffer(moved);
// Stage.dispose: await chain.dispose(); also release on exceptions.
```

Outputs are caller-owned provisional same-scope handles until complete/readBuffer/readback succeeds; input handles are borrowed and never mutated. Internals use the official withGpuResources arena, fixed ping-pong buffers and command-order retirement. Every operation must be awaited; same-owner concurrent calls are not supported. Cancellation cannot preempt a running shader. Post-submit failure stops the scope; close/recreate explicitly. No automatic V-SHARED rollback of native state. Returned buffers cannot cross Stage ports or enter serialized simulation checkpoints.

Fields are f32 non-color data, with integer cell centers, world-rh-y-up space, explicit origin/spacing in metadata.grid, and units. First release supports full resident grids; it rejects tile ROIs instead of silently missing halo. The SDK's streaming APIs remain available directly. Vector flow is XYZ meter/second; position data is XYZ meter. Density for renderVolume is extinction in1/meter. No ColorEncoding/Alpha is assigned to data. renderVolume creates a genuine PM scene-linear Rec709/D65 F32/F16 image using ABI2; output default640x360/96 quadrature steps, explicit conversion only at PNG/MP4 presentation. Exposure/color accept existing Signals; no automatic SDR clipping or precision downgrade.

Step functions perform one explicit call using dt(default ctx.dt), not the next video frame. Use existing FixedStepRunner for simulations; examples retain reset-only cloneable checkpoints and reset/replay GPU state for backward seek. Same-frame repeated calls are actual repeated steps. Fixed dt is necessary for wave time levels. Diffusion/project use explicit finite iteration counts; projection uses matching backward divergence/forward gradient with periodic boundaries and damped Jacobi. This is a reusable operator library, not a complete production fluid/solid solver. Gray-Scott is explicit Euler with a conservative qualified-step check; concentration range/stiffness and convergence remain the author's responsibility. No hidden substeps, clamps or adaptive quality. Thermal erosion is periodic four-neighbor talus redistribution, not hydraulic erosion. JFA is approximate, not exact EDT; output channels distance/valid, empty seeds give0/0. Boids gather is deterministic O(N^2); CIC deposition is deterministic O(voxels*N), without float atomics. maxWork(default2e9) is configurable operation planning, not an arbitrary particle/time count. Scope/device byte/dispatch limits still apply. Physical GPU memory unknown.

FastNoiseLite1.1.1 fixed MIT value/hash subset is archived; no additional npm/native/WASM dependency. Other algorithms use authored mathematical implementations under Apache2. See docs/SPATIAL_COMPUTE_BATCH_17.md for actual numerical/media evidence, commands, known limits and Main integration scope.

renderVolume integrates optical depth with midpoint quadrature and a stable small-depth1-exp(-tau) series; uniform source color allows RGB=ink*Alpha. Thin Alpha is not obtained by repeatedly subtracting rounded transmittance. No Alpha-zero RGB clearing is used. The original0.1.0 thin-volume failure is preserved in validation evidence;0.1.1 is a new immutable package.
