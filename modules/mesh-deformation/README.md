# mesh-deformation 0.1.4

15 GPU position deformations, each a named TypeScript function: `transformPositions`, `twistPositions`, `bendPositions`, `taperPositions`, `shearPositions`, `stretchPositions`, `bulgePositions`, `spherifyPositions`, `cylindrifyPositions`, `wavePositions`, `ripplePositions`, `noiseDisplacePositions`, `morphPositions`, `cageDeformPositions`, `attractPositions`. `readDeformedPositions` is a publication/transport utility, not a sixteenth effect.

```ts
import {createGpuEffectChain,withGpuResources} from '@frameweave/engine/web';
import {twistPositions,bendPositions,readDeformedPositions} from 'mesh-deformation';
// Once inside Stage initialization/render, not during module evaluation:
const chain=await createGpuEffectChain({width,height,effects:[],backend:'webgpu'});
const gpu=await chain.createPixelScope();
const positions=await gpu.createField({type:'f32',dimensions:[xyz.length/3,1,1],components:3,
  semantic:'position',space:'myMesh.local',units:'meter'},xyz);
const final=await withGpuResources(gpu,async arena=>{
  const twisted=arena.buffer(await twistPositions(gpu,positions,ctx,{rate:0.8}));
  const bent=arena.buffer(await bendPositions(gpu,twisted,ctx,{curvature:0.4}));
  return await readDeformedPositions(gpu,bent); // one explicit completion + CPU XYZ copy
});
// Pass final to the existing createMeshRenderer, preserving MeshData vertex order/topology.
await gpu.releaseBuffer(positions);
await chain.dispose(); // in Stage.dispose, including error paths
```

Inputs are borrowed and never changed. Every deformation allocates a caller-owned, provisional output with the same f32/XYZ layout, space, meter units, channels and metadata. Register outputs with `withGpuResources` or explicitly release them. Its logical release is NOT a GPU completion fence; the existing scope owns submission/resource retirement. Pipelines are cached per borrowed scope; no device/renderer/registry is created by this module. Serial use of one scope is required. `readDeformedPositions` waits via the existing readBuffer path and rejects poisoned nonfinite/overflow data before image publication. Raw outputs consumed without this utility remain subject to the caller's explicit data-validation boundary. Resize concerns the existing output renderer, not these resolution-independent vertex fields. Device loss/post-submit cancellation uses the existing terminal scope semantics: stop, dispose and create a new Stage/scope; there is no hidden replay or CPU fallback.

All 15 maps are stateless absolute evaluations. Scalar/vector Signals use the existing FrameContext/keyframes; the functions do not advance time. Angles are radians; wave/ripple frequency is radians/meter, bend curvature and twist rate inverse meters. Default axis Y, center zero; axes/toward must differ. Transform order: scale, X then Y then Z rotation, translation. Bend maps axial `u` and toward `v` to `(u*sinc(k*u)-v*sin(k*u), u*cosc(k*u)+v*cos(k*u))`. Bulge is compact cosine on axial length/2. Stretch optionally compensates transverse axes by `1/sqrt(factor)`. Sphere/cylinder leave their degenerate center/axis vertices in place. Cage order is x+2y+4z; `extend` extrapolates the trilinear map, `preserve` keeps outside vertices. Morph requires explicitly corresponding vertices, equal count and space; buffers cannot prove semantic topology correspondence. No automatic correspondence, topology repair, normal transport or self-intersection handling. Recompute normals from final positions using the existing renderer, or provide your own compatible normal pipeline.

Qualified input magnitudes default to 1e4 meters and can be configured up to 1e8; maxWork defaults to 1e9 and is configurable. Device storage/dispatch budgets still apply; no automatic decimation, tiling, CPU geometry fallback or quality drop. Nonfinite/out-of-range GPU positions or normals poison the candidate; final read rejects it. Noise uses bounded f32 lattice coordinates and the fixed MIT Hermite value subset, not a full FastNoiseLite backend or fBm. Arithmetic/trigonometry is f32, with device-dependent rounding; random-order replay is validated on the recorded device, not promised bit-identical across vendors. Source elementary maps are authored; this is not ARAP, FEM, cloth, CFD or a new Simulation Runner.

Vertex fields are non-color data. Existing Three MeshRenderer supplies scene-linear Rec.709 premultiplied RGBA32F/16F output and normal recomputation. WebGPU compute -> CPU XYZ -> existing Three WebGL renderer is an explicit copy, NOT zero-copy GPU interop. No GPU port or cross-Stage handle is exposed. The R1 package requests hardware GPU; unsupported adapters fail instead of silently changing backend or SDR precision. Transparency remains the existing renderer's contract, not order-independent transparency.

Editable gallery: `examples/project.tsx`, `scene.ts`, `geometry.ts`. The 15 maps are visible in a 5x3 gallery; the twist tile also chains bulge and bend without intermediate readback. Once reviewed packages are installed/locked, public commands are `frameweave frame project.tsx --frame 12 --output frame.png`, `frameweave render project.tsx --output gallery.mp4`, and direct project preview through the current CLI. Exact source-CLI invocations and a single <=1s media validation are retained with the batch evidence. No installation or trust change happens on import; local candidate setup is explicit in the verifier.

Run this batch's single focused validation flow from the worktree: `node --import tsx scripts/verify-mesh-deformation.ts`. It creates fresh immutable packages and a worktree-private library, checks numerical fixtures and invalid parameters, runs actual R1/Stage GPU execution, random/repeated frames/reopen/preview, F16 output and resource cleanup, then produces PNG/storyboard and a fully decoded 24-frame/24fps MP4. Full cross-module/portable/Linux/macOS validation remains Main's integration responsibility.
