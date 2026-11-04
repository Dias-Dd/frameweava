# Continuous stroke authoring

`prepareStrokeAt(options, services, context)` returns existing `PreparedStrokeMesh`.
`createNativeStrokeMotion(init, services)` composes the same call with existing
`drawPathMesh`: `draw(options,context)`, `geometry()`, `dispose()`.
Main owns public root/R1/typed source/version routing; this independent entry is
`modules/pro-animation/src/stroke-motion/index.ts`.

```ts
// Existing R1 ModuleLoader creates a reviewed direct kurbo Kit client per curve.
const painter = createNativeStrokeMotion(init, {pathOperations, curveKernelFactory});
// renderAt(c): path, width and paint all use the existing actual Stage clock.
return painter.draw({
  path: c => paths.at(c).roundedRectanglePath({
    center: [200,100], size: [240,120], radius: 16 + c.frame,
  })!,
  width: waveStrokeWidth(constantStrokeWidth(12), {amplitude: 0.3, cycles: 2}),
  spacing: 1, roundTolerance: 0.02,
  draw: {format: 'rgba32float', ink: solidStrokeInk([-0.5,4,1,0.6])},
}, c);
```

- `path` is canonical PathData or a pure callback. The callback receives a frozen
  copy of existing FrameContext; fractional frame/time values are retained.
  Width and paint reuse existing profile functions, Signal/keyframes and seed.
  There is no frame table, trajectory cache, simulation runner or new time model.
- `services` takes exactly one original `curveFactory({signal})` (owned Worker /
  Node factory) or `curveKernelFactory()` (admitted direct WASM client), plus the
  existing reusable `pathOperations` session. The new additive
  `createCurveSamplerFromKernel` transfers an already verified client into the
  same original sampler. It avoids requiring a browser AbortController global in
  SpiderMonkey. Early validation failure also disposes the transferred client.
  It does not relax package integrity, WASM admission or trust policy.
- Each draw performs original kurbo measurement → sampled width/ribs/round joins
  → existing Clipper2 canonical union/fill → unchanged Earcut → existing Native
  stroke palette/mesh GPU recipe. The retained failing face is handled by the
  already existing NonZero fill normalizer; this batch reuses that fix rather
  than claiming a new triangulation algorithm. The 1e-10 area guard is unchanged.
- Input/output geometry is px, top-left/right/down. Width is full physical px;
  spacing is maximum arclength sampling interval. Existing `accuracy` controls
  kurbo length inversion, `roundTolerance` round sagitta and `gridSize` Clipper's
  quantization separately. Arbitrary width callbacks remain sampled, not an
  analytic variable offset or a Hausdorff guarantee for unknown frequencies.
- Closed paths require matching endpoint widths and periodic endpoint ink.
  Caps are round/butt/square; variable ribbons retain existing round joins.
  Original fixed-width miter/bevel/square joins remain `strokePaths` /
  `prepareSolidPathStroke`. Multiple contours require explicit `contour`, exactly
  as the existing sampler; different paint identities can be composed in one
  Stage. This entry does not invent global arclength attribution across contours.
- CPU outlines and Earcut now use local-origin area arithmetic. Original returned
  world coordinates and paint correspondence remain unchanged. The large-origin
  test is a CPU geometry result within canonical coordinate policy, not a GPU
  billion-pixel rendering qualification. No resource/command policy was relaxed.
- Pixels use the admitted Native GPU owner only, RGBA16F/32F, scene-linear color
  and premultiplied Alpha. Straight HDR/signed ink enters through existing profile
  validation. No SDR8 conversion, CPU pixel fallback or second renderer is added.
  Geometry/lowered-buffer hashes and pixels are checked separately.
- Await each draw before the next operation. The wrapper snapshots geometry and
  paint values before async work; callbacks must be pure. The caller owns the
  returned image and the shared path session. Curve sessions and frame-local mesh
  buffers are released every call, including errors. `dispose()` waits for pending
  work and prevents publication; it never disposes the borrowed GPU/session.
  Use one top-level `signal` for preparation and GPU recording; no nested signal.
- Cooperative cancellation, invalid callbacks, concurrent use and close-during-
  prepare are verified. Forced in-flight Native GPU preemption is unqualified.
  Native hardware evidence is Windows/RTX5070 Laptop/Vulkan/linear Rec709; other
  platforms/primaries, 4K/long videos and public portable L3 are not claimed here.

Actual editable installed TSX: `docs/pro-animation/stroke-motion-validation/project/scene.tsx`.
It changes `bend` / `widthGain` without rebuilding the private installed module.
Existing Stage `rate=3/2` supplies actual fractional time; all geometry is rebuilt
on demand, with no eight-frame precomputation. Three motifs + existing GPU Glow
and Layer, 16F/32F random/repeat frames, signed HDR/Alpha reference, PNG/EXR/MP4
are verified by `validation/run-pa4-stroke.mjs types l0 regression media`.

Reuse/attribution: existing kurbo0.13.1 MIT OR Apache-2.0 and Clipper2-rust1.2.0
BSL-1.0 Kits; unchanged Earcut3.2.4 ISC and D3-shape3.2.0 / D3-path3.1.0 ISC.
Exact pins/SHAs/changes remain in the existing original provenance and Kit
licenses. No new third-party algorithm copy or dependency is introduced.
