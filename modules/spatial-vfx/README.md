# Resident spatial-vfx 0.1.1

15 new named GPU render functions: mandelbulb, mengerSponge, gyroidSurface, voronoiCrystal, terrainRaymarch, metaballVolume, planetAtmosphere, heightFog, volumetricSpotlight, smokePlume, flameVolume, waterCaustics, starfield, orbitalTrails, gravitationalLensing.

```ts
import {createGpuEffectChain} from '@frameweave/engine/web';
import {starfield,gravitationalLensing,heightFog} from 'spatial-vfx';
// Once per native Stage lifecycle, not once per pixel/effect/frame:
const chain=await createGpuEffectChain({width,height,effects:[],backend:'webgpu'});
const gpu=await chain.createPixelScope();
const stars=await starfield(gpu,ctx,{width,height});
const bent=await gravitationalLensing(gpu,stars,ctx);
await gpu.release(stars);
const fogged=await heightFog(gpu,bent,ctx,{density:.1});
await gpu.release(bent);
const surface=await gpu.readback(fogged); // completion, validation, one full readback
await gpu.release(fogged);
// Stage.dispose, also after error: await chain.dispose()
```

Functions borrow a caller-owned Stage-local scope and inputs; output is a provisional owner-local image until complete/readback succeeds. Caller owns/release outputs. Await every operation and release in finally. Ordered workspace reuse is not physical GPU completion. Chain resize disposes the old scope; reacquire after resize. Device loss/publication failure stops that scope; dispose the chain and explicitly rebuild/replay a new Stage instance. No opaque image crosses Stage ports. No CPU pixel replay, SDR8 fallback, general compute/geometry API, new registry or renderer.

Generators default640x360, F32, PM, scene-linear Rec709/D65; image operators preserve layout and require explicitly PM/opaque scene-linear Rec709/D65 input (reject straight/other color spaces). Output F16 is explicit RNE publication, not an SDR conversion. RGB may exceed1; color is linear radiance; emission/absorption uses midpoint quadrature and front-to-back Beer¨CLambert. Final PNG/MP4 is an explicit engine preview conversion to sRGB/H.264, not raw HDR evidence. Smoke/flame/metaballs are artistic procedural volumes, not physical simulation. Atmosphere has scalar extinction and RGB artistic scattering, not spectral transport. Caustics use a regularized Jacobian, not refracted scene geometry. Lensing uses a thin point-mass lens, not general relativity or scene depth. HeightFog uses an explicit distance, not an inferred AOV/depth buffer. No shadows from external scene geometry.

See types.ts for defaults/bounds. Common time/exposure/opacity/color/rotation/density accept existing Signals; time defaults to ctx.time and never advances it. seed defaults to ctx.seed. Kernels are F32 visual math, with coordinate-domain validation for noise, not full-F64 numerical replicas. Same adapter/order replay tested; cross-vendor bit identity not promised. maxWork(default16e9) is configurable numerical work planning, not a particle/time limit; steps are explicit (default48, conservative terrain512), never silently reduced. Scope/device byte/image budgets remain authoritative; no automatic tiling. Increase budgets deliberately for expensive offline images.

Build/install/reproduce: see docs/SPATIAL_VFX_BATCH_16.md and scripts/verify-spatial-vfx.ts. Local code is trusted code; R1 permissions/trust and GPU-required hardware selection remain unchanged. MIT FastNoiseLite1.1.1 value hash/lattice subset is fixed and archived in vendor; other mathematical implementations Apache2, no new npm dependency or external engine.

Main0.1.2: image sampling uses integer pixel centers; lensing approaches identity continuously. Lensing/fog preserve native PM RGB at Alpha0. Zero fog density/distance returns the image under explicit gain/opacity. Other13 generator algorithms unchanged. Version0.1.1 and its original counterexamples remain frozen.
