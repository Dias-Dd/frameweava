# Native path finishing and stereo images

Completion round 1/8. Two effect APIs, with explicit modes; mode names are not
counted as separate functions. The module uses the existing Native scope,
recipe processor, pixel ABI, colour conversion and geometry sampler. It owns
no device, renderer, shared state, registry or inference runtime.

```ts
const effects = createNativeFinishingEffects(init);
const result = await effects.processImage(left, async (image, fx) => {
  const drawn = await fx.scribble(image, [{path: sharedPathData}], {
    angle: 30, spacing: 8, width: 2, curviness: .3,
    start: 0, end: expr.progress, applyTo: 'scribble',
    color: [2, .2, -.1], composite: 'over',
  });
  return fx.stereo(drawn, right, {mode: 'balanced-color-red-blue', balance: .3});
}, {context});
```

Editable TSX: examples/finishing-chain.tsx (relative to native-effects).
Public SDK exports/immutable package identity are Main integration work; this
private source entry does not claim an installed package has been upgraded.

## Scribble

`scribble(image, masks, options)` accepts strictly validated shared PathData.
Coordinates use physical centres, top-left origin and y down; normalized paths
are explicitly converted by the existing geometry adapter. `transform` is an
optional six-number affine map. It also permits a small existing PathData to be
placed in a larger admitted output, without changing the shared schema limits.

* selection: single (zero-based maskIndex), all, or modes. Modes composes add,
  subtract, intersect and xor, honoring path winding/evenodd and inversion.
  The first subtract starts with the canvas complement; other first modes start
  with that path. All treats paths independently. Modes forms one region.
* fill: inside, centered-edge, inside-edge, outside-edge, left-edge, right-edge.
  Left/right follow path direction in the declared y-down coordinates.
* cap: round, butt, projecting. join: round, limited miter, bevel. The pinned
  upstream 16-sided round control geometry and 4x4 coverage samples are retained.
* A scanline plan joins nearby runs into continuous alternating strokes;
  curviness/variation, spacing/variation and signed overlap/variation control
  its geometry. Static, hold and smooth wiggle use explicit seed and Stage time.
* start/end are fractions. Scribble mode trims the actual generated arclength.
  Sequential uses the combined length in input-mask order; otherwise each mask
  uses its own length. Mask-path mode follows nearest original boundary
  arclength, with a declared stable first-edge tie rule. It does not merely
  shift a hatch phase. Mask-path sequential uses combined mask perimeters.
* composite: over, transparent, reveal. Color is signed linear working RGB;
  opacity and amount default to 1. Width defaults to 1px, spacing 8px, angle45deg,
  edgeWidth8px, no variation, round caps/joins, miterLimit4, static wiggle.
* Inside coverage with nonpositive overlap and no overlap variation clips each
  subpixel sample to the selected boolean region. Positive overlap deliberately
  allows endpoints outside it. No source pixels are read on CPU.

Geometry preparation is CPU control work adapted from pinned EffectCraft
paths/raster algorithms. Polygons are indexed into 16px tiles; pixels test
only intersecting geometry on the existing GPU. This is exact conservative
binning, not an image-resolution ceiling or a discarded-geometry shortcut.
Actual buffer/session/device admission applies and excess work fails explicitly.

## Stereo

`stereo(left, right, options)` combines explicit equal-sized GPU images:
side-by-side, over-under, interlaced, red-green, red-blue, balanced-color-red-blue,
balanced-red-green, balanced-red-blue, difference, red-cyan (default).

Convergence offsets left/right by +/-half; verticalAlignment moves the right
image. Units are pixels (default) or percent of source width. Swap is applied
before alignment. Pair layouts disable alignment by default; alignmentInPairs
can explicitly enable it. The existing transparent-boundary offset publishes
each shifted image in F32 before final resampling. Balance is a fraction,
default .5. Default output format follows the original left source.

Channel modes use working-colour luminance and max input coverage. Alpha0 PM
emission is transformed separately and added; hidden straight RGB is not made
visible. Difference takes absolute differences of unassociated colors plus
separate emission. Amount mixes against the original left image even after
swap/alignment. HDR and negative RGB are not clamped. No implicit RGBA8 buffer,
CPU pixel fallback, extra GPU host or opaque handle in persistent JSON is used.

## Reproduce and ownership

Use the reviewed Native/SpiderMonkey environment, worktree-local FRAMEWEAVE_HOME
and explicit FRAMEWEAVE_MEDIA_PYTHON. `node .../finishing/validate.mjs <phase>`:
upstream, types, unit, syntax, gpu, media, performance, freeze. All attempts,
including the standalone upstream control-oracle build and failures, share
one cumulative <420s ledger. `NUMERICS.json` fixes the unchanged F32/F16 gates
and geometric boundary rules before GPU comparison. Original Rust functions
and their MIT notice remain in vendor; sources.json fixes commit and hashes.

Actual hardware, cases, source hashes, clean exits, media and timings are in
docs/native-finishing-evidence. GPU residency ends only at explicit inspection
or final media export. F16 is a logical publication format; physical storage
remains the engine's existing policy. These buffers expire with the recipe;
returned images follow the processor lifecycle. Await recipes and dispose.

Other effect families in COMPLETION.json remain pending. This module's
qualification is not a claim of complete AE coverage, all GPU hardware or a
newly published SDK. Physical water, scene illumination, Puppet and simulation
remain Agent-4's domain.
