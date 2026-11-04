# Spatial Data Effects — Stage-local prototype

This source module is not a released R1 package or a public AOV/Graphics ABI.
Main has allowed the independent native Three prototype and will coordinate the
formal cross-Stage data contract. Do not serialize large raw arrays through JSON,
invent color/alpha metadata for AOVs, or share a GPU handle across Stages.

```ts
import {createSpatialDataRenderer} from './src/index.ts';
const pass=createSpatialDataRenderer({width:640,height:360,meshes:[meshData]});
const result=await pass.capture(currentSample,explicitPreviousSample,{
  preview:{kind:'normal'}
});
// Owned Stage-local Float32Arrays, interleaved 4 channels, row 0 at top:
// depth:  positive axial view depth in meters, 0, 0, binary coverage
// normal: camera-facing geometric world unit XYZ, binary coverage
// motion: current - explicitPrevious top-left pixel XY displacement, valid, coverage
await pass.dispose();
```

Uses existing Graphics MeshData validation and native Three0.186.1/MIT already
pinned in this workspace. Current/previous model and optional deformed positions
share mesh topology. Explicit camera+FrameContext time uses existing rational FPS;
there is no previous-render history, Simulation Runner or time advancement.
At frame0 the example author explicitly supplies frame0 as its reference.

Actual opaque geometry rasterization, three nearest RGBA32F attachments and an
explicit DEPTH_COMPONENT32F texture. Actual attachment component types/bits are
queried on creation/resize and incompatible hardware rejects. This is conventional
Z, not reverse/logarithmic Z; extreme near/far precision is not qualified. No CPU
pixel solver, Canvas8 conversion, SDR fallback or alpha blend.
Depth is -view.z, not Euclidean distance or nonlinear depth-buffer Z. Normals are
face-forward geometric normals from world-position derivatives, not smooth shading
or a material normal map. Both triangle sides are visible. Original mesh material
opacity/cutout/texture is intentionally outside this geometry-only API.

Motion projects the same material point at both explicitly supplied times,
including camera/model/deformation. Validity means previous clip W positive and
Z in the previous near/far range. Off-screen XY motion is retained. Previous
occlusion/visibility, disocclusion, transparency, skinned/skeletal evaluation,
topology changes, MSAA coverage and full optical flow are not implemented.

No color transfer/OCIO/Alpha/premultiplication applies to raw values. Fourth channel
is binary coverage, not opacity. The optional diagnostic alone is a proper
scene-linear premultiplied color Surface; it maps depth/normal/motion explicitly.
It must not be used to recover raw spatial data. Metadata records spaces, units,
near/far, direction, time interval, invalids and ownership.
Both samples project into the current output dimensions/aspect; an independently
changing previous viewport is not represented by this prototype.

Local mesh bounds are rebased in f64 before f32 upload, with the model adjusted
algebraically. Geometric normal derivatives omit the irrelevant world translation.
This preserves small faces at large world/local origins without scaling the scene,
changing units/time, or reducing resolution. Sparse independent f64 ray/triangle
validation covers perspective/orthographic, deformation, mirror/nonuniform scale
and 1e7-scale origin offsets. Its stated interior/raster tolerances are not a
universal f64/cross-GPU guarantee. The oracle is test-only, never a render fallback.

One native Web Stage owns all textures/programs/geometry. Calls/resize reject when
busy; invalid preflight neither draws nor poisons the owner. Successful capture
uses a real GL fence, then reads owned CPU copies; no `finish()` timing barrier.
Cancellation after submission discards the result and stops the owner until it is
disposed/recreated. Disposal drains active work and releases resources/context;
GL itself defers deletion of in-flight resources. Context loss stops execution,
with explicit Stage reopening rather than silent restoration or stale publication.
Dimensions/plan budgets are explicit and device checked; physical peak is unknown.
The buffer plan covers prepared poses, CPU/GPU attributes/indices, attachments,
readback and current owned results. JS object/driver overhead and callers retaining
many old results are outside this logical plan. Actual 640x360,1280x720,1920x1080
full-size captures, repeated requests and release are qualified in the report.
No automatic quality/substep reduction is based on wall-clock frame rate.

The editable TSX example uses reviewed local code, actual 3D Box/Icosahedron
geometry and explicit camera motion. It needs hardware preview mode, while the
default SwiftShader policy correctly rejects; no global export policy changes.
It returns only color visualization and small metrics across the Stage boundary.
Independent package installation, portable export and cross-Stage AOV consumption
remain unverified/unimplemented here.
