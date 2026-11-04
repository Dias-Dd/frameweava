# spatial-fields 0.1.7

15 non-color GPU data algorithms on the existing Stage-local PixelScope: `deviceDepthToViewDepth`, `viewDepthToRayDistance`, `reconstructWorldPositions`, `projectWorldPositions`, `reconstructNormals`, `cameraMotionFromDepth`, `reprojectionVisibility`, `distanceToPointField`, `distanceToPlaneField`, `surfaceCurvatureField`, `surfaceGradientField`, `reflectionDirectionField`, `refractionDirectionField`, `reduceDepthBounds`, `surfaceTangentFrame`.

```ts
import {createGpuEffectChain,withGpuResources} from '@frameweave/engine/web';
import {createSpatialDataRenderer,importSpatialCapture,reconstructWorldPositions,
  distanceToPlaneField,validateSpatialFields,releaseSpatialField} from 'spatial-fields';
const capture=createSpatialDataRenderer({width,height,meshes});
const owner=await createGpuEffectChain({width,height,effects:[],backend:'webgpu'});
const gpu=await owner.createPixelScope();
await withGpuResources(gpu,async a=>{
  const raw=await capture.capture(currentSample,previousSample);
  const input=await importSpatialCapture(gpu,raw,{camera:currentSample.camera,previousCamera:previousSample.camera});
  const own=f=>a.adopt(f,x=>releaseSpatialField(gpu,x));
  for(const f of [input.depth,input.normal,input.motion])own(f);
  const xyz=own(await reconstructWorldPositions(gpu,input.depth,ctx,{camera:currentSample.camera}));
  const height=own(await distanceToPlaneField(gpu,xyz,ctx,{normal:[0,1,0]}));
  await validateSpatialFields(gpu,[xyz,height]); // compact status read; real queue completion
  // Feed declared fields directly to your existing same-scope GPU consumer.
});
await capture.dispose();await owner.dispose(); // Stage.dispose, also on exceptions
```

`createSpatialDataRenderer` reexports the existing native Three generator; its renderer/shader/permission behavior is unchanged. `importSpatialCapture`, `uploadSpatialField`, `validateSpatialFields`, `readSpatialField` and `releaseSpatialField` are transport/validation tools, not extra effects. No GPU handle crosses a Stage or JSON port. R1 declares hardware GPU required; adapter/context creation is real and unsupported environments fail, without changing the ordinary software export policy or using CPU pixel fallback.

Each result is a local `{data,validity}` pair of existing capabilities: depth data has1 channel/semantic depth, normals3/normal, motion3/motion (X/Y/temporal validity), positions3/position, other scalar/vector data use1/3 appropriately typed generic channels; independent f32 validity/coverage is1 channel/semantic validity. This conforms to the existing GPU contract; no four-channel fake depth/normal port or Core change. Rows are top-left/pixel-center; complete resident [width,height,1] with profile `frameweave.spatial-field/1`. World axes are right-handed meters, X right/Y up/Z toward viewer. Values are non-color: no gamma, Alpha, premultiplication or HDR color encoding applies. The separate validity is binary; motion's data Z additionally records correspondence validity. Missing samples are zero; corrupt/range candidates use a finite >1e30 marker and fail publication validation. Outputs remain provisional until `validateSpatialFields`/`readSpatialField` or an equally strict caller boundary succeeds. Core also validates finite storage writes; semantic validation checks ranges/unit vectors. Validation scans up to three data/validity pairs per dispatch and reads one u32 status per chunk. Explicit readback packs owned logical XYZW CPU values for inspection; W remains validity, not Alpha.

Inputs are borrowed, outputs caller-owned and same-scope. Adopt the pair with `arena.adopt(field,f=>releaseSpatialField(gpu,f))`, or release explicitly. Tangent/bitangent outputs have independent validity ownership; one extra GPU mask copy satisfies the existing seven-binding contract without reference-count infrastructure. Logical release is not GPU completion; existing owner retirement/fences own in-flight lifetimes. Compiled kernels are cached per scope. Await all operations; no parallel scope operations or second GPU/registry/Renderer/Simulation Runner is introduced. Device loss/post-submit scope failure stops work: dispose and reopen the Stage. Preflight errors submit nothing. Capture cancellation/lifecycle follows the original generator.

All functions use the existing FrameContext and Signals, never render-order history. Camera intrinsics/FPS/time/metadata are explicit and checked. Depth means positive axial -view.Z, not radial distance or device Z. Conventional device Z [0,1] is supported, not reverse/log/infinite-far depth. `inverse:true` explicitly converts back. Orthographic ray distance is measured from its shifted image-plane ray origin. Projection retains offscreen XY but rejects clipping-plane Z. Camera motion assumes static world geometry; actual deforming-object motion must come from the native capture. Reference visibility compares nearest captured opaque depth within declared absolute/relative tolerance; it does not prove object identity, transparent/deep visibility or fully resolve subpixel disocclusion. Actual scene velocity/acceleration is not claimed.

Normals/curvature/gradients use visible centered stencils, invalidate image borders, holes, degenerate metrics and declared discontinuities. Curvature is half trace(dN/dP), signed according to supplied normals; not topology-aware smoothing or a meshing algorithm. Tangents follow screen-X, with T cross B = N; not authored material UV tangents. Reflected/refracted directions use camera rays, no ray tracing/SSR/Fresnel/dispersion. Refraction assumes caller-supplied outward normals to infer entering/exiting; camera-facing source normals only describe a single outside-to-inside interface. Total internal reflection returns invalid zero. Depth hierarchy stores conservative min/max and occupied immediate-child count (0..4), not an unbounded f32 pixel count.

These are f32 geometry calculations. Camera parameters/original geometry preparation remain CPU F64, then uniforms/data quantize to f32. Large absolute world coordinates can lose subunit XYZ precision; no general large-world/rebased reconstruction guarantee is claimed. Existing capture's rebased raster precision remains unchanged. No sample-count/resolution reduction or CPU fallback is hidden; maxWork is configurable, with existing actual storage/dispatch budgets. No tiled/streaming spatial reconstruction yet. Native WebGL capture -> owned CPU float arrays -> WebGPU field upload is an explicit copy (`zeroCopy:false`), while subsequent passes stay resident.

Editable TSX: `examples/project.tsx` and `scene.ts`. The six diagnostic panels explicitly visualize depth/normal/motion/distance/curvature/visibility as color; they are not AOV transport or a Depth Matte production filter. The additional depth-matte.tsx example consumes typed depth in this package, with Main-coordinated scope. Generic image/Matte filters remain Agent-3 owned; any future public cross-Stage AOV contract remains Main owned. No such ABI is added here.

Focused reproduction: `node --import tsx scripts/verify-spatial-data-fields-batch.ts`; raw results in `docs/spatial-fields-validation`. One batch validation campaign covers typechecked R1 package, numerical fixtures, actual existing geometry capture, random/repeat/reopened Session, float diagnostic PNG, F16, resource cleanup and a <=1s fully decoded MP4. Full installed SDK/portable/cross-vendor/context-loss integration remains Main's L3 responsibility. Mathematical kernels are authored Apache-2.0; native Three0.186.1 is fixed MIT. The existing seven-storage-binding limit is observed: the six-panel diagnostic uses three resident two-field passes then one three-image stack pass; the existing four-data-input Pixel ABI limit remains unchanged. [WGSL reflection/refraction specification](https://www.w3.org/TR/WGSL/#refract-builtin).

Consumer contract: depth.data = f32 depth1, space camera-positive-axial-depth/meter; normal.data = f32 normal3, world-rh-y-up/dimensionless; motion.data = f32 motion3, image-top-left-pixel-center/pixel with Z correspondence validity. Every pair has f32 validity1 in image-top-left-pixel-center/dimensionless. Metadata pins explicit camera and sample time; captured motion also records reference camera/time/interval. These owner-local capabilities are consumed only in the same Stage/scope. They are not Surface images or public cross-Stage ports.

## Depth range matte (0.1.5)

```ts
import {depthRangeMatte} from 'spatial-fields';
const mask = arena.image(await depthRangeMatte(gpu, fields.depth, ctx, {
  camera: currentSample.camera,
  near: keyframes([{frame:0,value:6},{frame:23,value:8}]),
  far: 12, softness: .65, format: 'rgba32float'
}));
const matteSurface = await gpu.readback(mask); // validates publication and waits
```

`near`, `far`, `softness` use existing numeric Signals evaluated at the supplied FrameContext. Values are positive axial camera-depth meters, not normalized/device/radial depth. Defaults are camera.near/camera.far/zero softness. Hard mode selects the closed interval [near,far]. With softness s>0, coverage is smoothstep(near,near+s,z) * (1-smoothstep(far-s,far,z)); feathering lies INSIDE each edge and s must not exceed half the interval. Evaluated parameters quantize to f32; collapsed intervals/feathers reject.

Only full resident depth1 + independent binary validity1 in the declared profiles, matching dimensions, camera and local frame/time/fps, are accepted. Both opaque handles are authenticated by the existing scope before output allocation; foreign, forged and released handles reject. Missing samples (validity=0) produce zero coverage, regardless of the requested range. A malformed nonbinary validity or nonpositive/nonfinite valid depth rejects at the existing publication boundary, never publishing its candidate as a valid image.

The input pair is borrowed and unchanged. The returned GpuPixelImage is caller-owned; use arena.image or await gpu.release. It is a genuine white scene-linear Rec.709 PM coverage image (RGB=Alpha), rgba16float or rgba32float; depth itself stays non-color. Await complete/readback before external publication. Device/context failure follows the existing stop/dispose/reopen policy. No CPU/SDR fallback, resampling, new time system, shared AOV port or second owner is added. maxWork/signal follow existing options and actual owner limits.

Editable `examples/depth-matte.tsx` uses the existing Layer.mask Surface contract: an independent image Stage supplies ink, and the depth Stage exports exactly one matte Surface. The existing one-Surface-per-Web-Stage rule is preserved. Its 120 authored frames permit 100->0->100 seeks; reproduction exports only frames [0,24), exactly1 second at24fps. The geometry source is still nearest opaque coverage, without material cutout/transparency or MSAA; distance feathering does not add spatial antialiasing/deep samples. The example explicitly sets a black Composition background: the current public PNG-to-H264 path discards PNG Alpha without an explicit flatten. Opaque linear composition preserves visible soft coverage; the Stage matte itself remains transparent PM float data. This is an example-level presentation choice, not an Encoder/Core fix or an Alpha-preserving video claim. Range matte only: no new holdout/depth merge/soft intersection/DOF filter. Native capture->CPU->WebGPU remains an explicit copy.

Focused closeout reproduction: `node --import tsx scripts/verify-depth-range-matte.ts`. Raw results/media are saved separately in `docs/depth-range-matte-validation`, preserving the frozen0.1.4 carriers/locks and prior evidence. Existing15 data algorithms are unchanged; full installed SDK/portable/cross-vendor/context-loss integration is Main's L3 scope. The new range/smoothstep glue is authored Apache-2.0 with no new dependency.
