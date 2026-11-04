# Variable-width strokes and Native gradient drawing

This source domain has **23 named creation functions**, not 23 new AE effects.
It completes one path: existing kurbo length sampling → width profile → variable
round-join outline → existing Clipper2 canonical union → unchanged Earcut → Native
linear HDR ink → mesh → existing shutter/Glow/Layer. Shared package exports,
immutable R1 version, loader permissions, locks and L3 remain Main-owned.

## Ordinary TS/TSX usage

Prepare stable geometry with the caller's existing reviewed curve/path sessions:

```ts
const centerline = await sampleStrokePath(curve, {spacing: 1});
const width = taperStrokeWidth(
  waveStrokeWidth(constantStrokeWidth(20), {amplitude: .4, cycles: 3}),
  {start: .12, end: .18},
);
const mesh = await prepareStrokeMesh(centerline, width, {
  pathOperations, context, cap: 'round',
});
// The caller still owns curve/pathOperations and disposes them normally.
```

In a Native Stage initializer:

```ts
const strokes = createNativeStrokeRenderer(init);
const titleLine = await strokes.prepare(mesh);
const ink = gradientStrokeInk([
  {at: 0, color: [-.2, 3, 6, 1]},
  {at: 1, color: [3, .2, 1, .7]},
]);
return {
  renderAt(context) {
    return strokes.at(context).draw(titleLine, {ink});
  },
  dispose() { return strokes.dispose(); },
};
```

Size/device/default scene-linear Rec.709/F32 come from the initializer. The caller
does not manage shaders, GPU buffers, UVs, matrices or temporary images. Lower-level
`draw(handle, options, context)` remains available. There is no global current frame.
Use explicit environment color/format/paletteSize when needed; no implicit gamut
conversion occurs. Static white is the default ink.

## Width profiles (11)

`StrokeWidth = (distanceFraction, existingFrameContext) => nonnegativePixels`.
Fractions are [0,1] of one explicitly selected contour. Existing numeric Signals
are evaluated at **preparation time**. Geometry is not silently rebuilt inside a
draw. Changing width/text/path requires new prepared geometry in a fresh init, or
explicitly precomputing multiple geometry handles before drawing. This checkpoint
does not claim a GPU topology-changing width animation or new simulation system.

| Function | Behavior |
| --- | --- |
| `constantStrokeWidth(value)` | Literal or existing Signal physical width |
| `rampStrokeWidth(start,end)` | Linear endpoint widths |
| `taperStrokeWidth(base,{start?,end?,power?})` | Multiplicative start/end envelope; nonoverlapping normalized spans |
| `bellStrokeWidth(peak,{floor?,power?})` | Positive sine envelope raised to a positive exponent |
| `waveStrokeWidth(base,{amplitude,cycles?,speed?,phase?})` | Nonnegative sinusoidal modulation; phase in cycles, speed cycles/second |
| `noiseStrokeWidth(base,{seed?,amplitude,frequency?,speed?})` | Existing reviewed smooth EffectCraft noise; deterministic seed and local time |
| `knotStrokeWidth(stops)` | Ordered piecewise-linear physical widths; endpoints0/1 |
| `addStrokeWidths(...profiles)` | Add physical-width contributions |
| `multiplyStrokeWidth(base,gain)` | Dimensionless nonnegative gain profile |
| `clampStrokeWidth(base,min,max)` | Explicit nonnegative bounds; no implicit width clipping elsewhere |
| `remapStrokeWidth(base,{start?,end?,mode?})` | Range remapping/reversal with clamp/repeat/mirror boundary |

Noise/amplitude cannot make a valid width negative. Arbitrary custom callbacks must
return finite nonnegative pixels. Signals retain their existing Stage time semantics.

## Linear ink profiles (6)

`StrokeInk = context => orderedStops`. Stops returned by a custom callback are
**scene-linear premultiplied RGBA**, retain signed/HDR RGB, and have Alpha[0,1].
Factories accepting `color` take straight scene-linear numeric/Signal components
and explicitly premultiply; interpolation occurs in PM, avoiding transparent RGB
fringes. No sRGB CSS interpretation or SDR normalization is used.

* `solidStrokeInk(color)`: constant two-endpoint ink.
* `gradientStrokeInk(stops)`: strict ordered 0/1 endpoints; piecewise-linear PM.
* `reverseStrokeInk(ink)`: reflect path-distance color correspondence.
* `repeatStrokeInk(ink,{cycles,mirror?})`: finite repeated normalized ink; mirror
  defaults true. Nonmirrored repetition requires equal endpoint colors; discontinuous
  jump stops are explicitly unsupported rather than blended across a false seam.
* `fadeStrokeInk(ink,opacity)`: multiply **all PM components** by explicit Alpha gain.
* `mixStrokeInks(a,b,weight)`: merge both knot sets and interpolate PM values;
  preserves both inputs' piecewise-linear breakpoints before GPU LUT rasterization.

## Geometry operations (5)

* `sampleStrokePath(curve,{contour?,spacing?,signal?})`: uses the existing original
  kurbo metric session; default physical distance spacing1px. Multi-contour paths
  require a contour selection. Caller owns the session. Positive length is required.
* `createStrokeLocator(centerline)`: immutable sampled-segment BVH with closest
  distance/fraction, signed lateral distance and geometric separation. At equal
  distance/self-crossings the earlier sampled segment wins. This is not analytic
  closest-point solving on a cubic and does not assign a unique crossing identity.
* `prepareStrokeMesh(centerline,width,{pathOperations,context,cap?,roundTolerance?,gridSize?,signal?})`:
  trapezoid ribs + exterior circular join fans, with round/butt/square caps. The
  union is delegated to existing Clipper2, including holes/self-overlap removal;
  unchanged Earcut triangulates each solid face. Relative area disagreement must
  be <=1e-10. Defaults .02px round sagitta and .0025px grid. This is a sampled
  variable-width round-join ribbon, **not analytic variable curve offset**. Discrete
  centerline spacing, sampled width, quantization and sagitta are distinct errors;
  no aggregate Hausdorff guarantee is claimed for arbitrary user profiles/cusps.
  Closed paths require matching endpoint geometry and widths. Closed seam triangles
  unwrap their local distance coordinates into [0,2] before interpolation. For fixed width and
  other join styles reuse existing `pathOperations.strokePaths` instead.
* `strokeMeshBounds(mesh)`: geometric triangle bounds, or null for empty geometry.
* `hitTestStrokeMesh(mesh,[x,y])`: sampled filled-triangle inclusion; boundary inside.

`PreparedStrokeMesh` is local prepared drawing data, not a Graphics/TVG wire schema.
Canonical PathData/coordinates remain authoritative. External/persisted data must
be authenticated by existing Resource/Artifact/build seals; metadata is not a hash
check. One geometry result is bounded by existing Graphics/owner resource policies;
no new artistic path/sample/triangle cap is imposed. Operands and curve samples
are streamed, then the actual mesh is materialized for the existing mesh ABI.

## Native renderer (1), precision and lifetime

`createNativeStrokeRenderer(init)` borrows the admitted existing Native GPU owner.
`prepare(mesh)` belongs to initialization before the first draw, snapshots geometry
to owned F32 XYZ/UV buffers, and verifies matching Stage pixel dimensions. Draws
evaluate ink/opacity and position/rotation/scale/anchor controls at the explicit
context. Rotation is radians in y-down coordinates; scale is factors; coordinates
and translation are pixels. Pure mathematical helpers do not initialize a GPU.

Gradient stops are split high/residual control coefficients. The GPU generates a
one-row F32 PM palette using the **unchanged shared guarded Pair arithmetic**, then
the existing mesh pipeline draws the canonical triangles with exact depth peeling.
No CPU pixel image, upload of a rasterized bitmap, browser, new device, renderer,
Graph or historical state exists. Only control coefficients and geometry are sent.

Default paletteSize1024 is an explicit interpolation-quality setting, overridable
within the existing device budget. Open shader samples are uniform u=i/(N-1).
Closed samples use u=i/N with native periodic texture addressing and require equal
endpoint PM colors (`E_PA_STROKE_SEAM` otherwise); even mirrored gradients are an
easy continuous choice. Mesh UVs target the corresponding texel centers, including
unwrapped closed seam triangles. Between texels the existing native linear
sampler is used. A stop kink between texels therefore has LUT approximation error;
increasing N reduces that error. CPU unit tests validate exact profile equations;
the GPU reference validates LUT samples, **not every final screen-space pixel**.
Path coordinates/UVs and the mesh projection matrix lower explicitly to F32.
Gradient distance interpolates across triangles from closest-centerline values at
their vertices; it is not per-pixel closest-path solving. Crossing/seam behavior is
deterministic but may need more geometry for a desired artistic gradient.

Output is scene-linear PM RGBA16F/32F. No RGB/Alpha rescale or SDR clipping is hidden.
F32-pair coefficients must be finite/normal or explicitly fail; direct Half PM
ink outside65504 fails with `E_GPU_FLOAT_PRECISION`. Native spatial edge sampling
is retained; analytic spatial-area AA is not certified by this source checkpoint.

Returned GPU images are caller-owned under the existing frame epoch. The adapter
does not retire them on subsequent draws or release them in dispose. Stable mesh
buffers belong to the adapter; transient gradient coefficients and palette are
released through the existing resource arena. Concurrent preparation/draw, foreign
handles and post-dispose access fail. `dispose()` waits for pending operations and
releases only its buffers, never the Stage/device. Cancellation recording tests
do not certify a new in-flight hardware cancellation feature.

See `validation/native-stroke-scene/{scene,animation}.tsx/ts` for the real example,
`docs/pro-animation/native-stroke-validation` for commands/raw results, and
`provenance/native-stroke` for fixed sources and retained licenses. Reviewed private
Kit fixtures are not advertised as formally installed package capabilities.
