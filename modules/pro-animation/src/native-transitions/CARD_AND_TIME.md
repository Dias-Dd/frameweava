# Native card and animated-gradient controls

This source checkpoint extends the existing 32 transition functions; it does not
count aliases/private helpers as extra AE effects or claim full AE pixel parity.
Main owns public R1 entry/version/catalog/locks. No TVG/Stage/P4/Renderer changes.

## Card mesh

```ts
const fx = createNativeTransitions(init); // inherits existing Stage dimensions
const image = await fx.cardFlipWipe(front, back, {
  geometry: 'mesh', progress: existingKeyframes, rows: 3, columns: 4,
  cardScale: 1.25, axis: 'random', flipDirection: 'random', seed: 37,
  camera: {rotationDegrees: [8, 20, -3], depth: 960, focalLength: 960},
  positionJitter: {amount: [10, 5, 36], speed: [.4, .6, .3]},
  material: {diffuse: .8, specular: .35, highlightSharpness: 24},
}, context);
```

Mesh mode uses the existing native owner: compute-generated XYZ/UV fields,
padded F32 material atlas, one textured draw and exact per-pixel depth peeling.
Scale above one really overlaps cards. Alpha, negative RGB, HDR and per-output
F16/F32 publication are retained. PM Alpha-zero emission needs the integrated
7d6ea4c fix; it was tested as a separate failing case before the fix, then passes
unchanged. No fake Alpha, threshold relaxation, CPU pixels or SDR fallback.

Existing orthographic calls remain a separate explicit profile. Camera, light,
material, jitter, direction, rows/columns, time, outputSize or backside controls
select mesh. geometry:'orthographic' with 3D-only controls fails explicitly.

- rows/columns: positive counts rounded nearest, ties up; existing Signals work.
  cells is the alternative static tuple. columnsFollowRows uses the row count.
- Camera: position/rotation with 12 transform orders; corner-pins in TL/TR/BR/BL
  normalized coordinates; or caller-supplied homogeneous composition X/Y/W rows.
  Focal length and depth are **pixels**, not AE millimeters. Corner pins use a
  projective transform with deterministic auto-focal estimate; there is no
  hidden composition lookup or neighbor-frame camera interpolation.
- Lighting: distant/point or explicit composition point/distant/ambient data;
  linear HDR color, intensity, depth and ambient. Flat per-card diffuse/Blinn
  specular/highlight controls adapt the reviewed EffectCraft math.
- Jitter: translation pixels / rotation degrees, independent Hz per axis,
  explicit seed and existing local time. CPU Float64 prepares small scalar
  jitter controls; GPU transforms vertices, shades/samples and composites pixels.
  No history, second timeline or simulation runner.
- Backs: explicit second image, stretched into each card; backside:'none' removes
  back-facing geometry. The axis chooses the correct backside mirror.
- outputSize overrides bound Stage dimensions, then source dimensions. Input
  textures may differ in size. Color encodings must match; convert explicitly.

No library triangle constant is imposed. Optional owner limits and actual
storage/command budgets are checked; there is no 256-triangle fallback. Very
large jitter control uploads can still exceed the current command budget and
fail explicitly. Different draws do not share depth; this implementation uses
one draw. No arbitrary-scale realtime performance claim.

Editable actual chain: validation/native-controls-scene/cards.tsx and the
cards-half / cards-pins / cards-composition variants: real sealed PNG/HDR inputs
→ camera/jitter/material cards → installed processPa Glow → existing Layer.

## Animated gradient Auto Softness

```ts
const image = await fx.imageWipe(from, to, currentGradient, {
  progress, autoSoftness: true, temporalSamples: 16,
  gradientAt: sampledContext => makeFreshGpuGradient(sampledContext),
}, context);
```

The callback transfers a fresh same-owner gradient for each existing local
shutter sample. Reusing the input/previous token fails. The library releases
these samples after recording. It reuses shutterSamples, Signal evaluation,
Image Wipe and compensated crossDissolve; no second accumulation runtime.
Sources stay at the requested time; only the gradient/completion are resampled.
The callback can receive times outside the composition and owns source boundary
policy. It does not implicitly seek another Stage or decode/reinfer video.

Gaussian limits come from blurMask.maxSigma (default existing PA64 contract),
not a permanent library radius. The installed PA provider remains sigma0..64;
a reviewed wider shared provider can declare its actual range. A wider provider
is **not** claimed installed/tested by this checkpoint.

The moving-gradient.tsx comparison is editable but was added just before the
user stopped further verification: its Stage/media execution is **unverified**.
The actual 16-GPU-sample numerical fixture passed with zero error; the new card
TSX/media chain is independently verified. See machine evidence for exact scope.

## Source/license and qualification

EffectCraft MIT source ec7ced1f0515f0b6f376dbcc297f1c441f452d6e,
crates/effects/src/card3d.rs, SHA256
7c013a90ed4c0c72dc40d64e32636b16309489fa774980b312ea7aa461275b36.
Verbatim archive and MIT notice remain in provenance/native-transitions.
Only small rotation/projection/flat lighting equations are adapted: importing
EffectCtx/Buf/editor/rendering into a Rust host would be a larger, unnecessary
boundary. Focal units, auto-focal estimation, Native GPU geometry/atlas/visibility
and typed explicit inputs are Frameweave adaptations. Other new code Apache-2.0.

Qualified Windows / RTX5070 Laptop / Vulkan only. No AE proprietary reference
frames, new pro-animation R1 release, portable modes or full repository/compatibility
regression claimed. User requested verification stop and submission; remaining
untested scope is retained rather than reported green.
