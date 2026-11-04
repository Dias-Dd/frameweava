# Shaped text animation and Native drawing

23 public functions form one creation chain: existing real shaping/geometry →
cluster-aware selectors → affine/opacity animation → existing native GPU mesh →
Glow/shutter/Layer. New mathematical functions do not require a GPU initializer.
Only the draw adapter requires the existing admitted Native Stage owner.
Shared exports, R1 version/manifest, permissions, locks and distribution remain
Main-owned. These sources are a candidate API, not a claim of installed package availability.

## Normal frame usage

```ts
// In an existing defineNativeStage initializer:
const text = createNativeGlyphRenderer(init); // Stage dimensions, linear709/F32 defaults
const title = await text.prepare(preparedTitle); // stable, verified prepared glyph geometry
const progress = staggerGlyphSelector(
  (_unit, c) => Math.max(0, Math.min(1, c.time / .6)),
  {delaySeconds: .04},
);
const hidden = selectorInvert(selectorEase(progress, 'easeOut'));
const animate = composeGlyphTransforms(
  glyphTranslate(hidden, {y: 28}),
  glyphOpacity(hidden, {opacity: 0}),
);
return {
  renderAt(context) { return text.at(context).draw(title, {transform: animate}); },
  dispose() { return text.dispose(); },
};
```

The default draw is usable static white text in scene-linear F32; `transform`,
HDR `ink` (including existing numeric Signals), output `format` and environment `color` are optional. No GPU brand,
texture, shader, matrix or temporary buffer is required in that normal call.
`draw(handle, options, context)` is the explicit lower-level equivalent.
There is no module-global current frame or automatic sampler/inference.

## Prepare once, animate many frames

`prepareGlyphMeshes(shapedRun,{pathOperations,tolerance?,gridSize?,unit?,order?,signal?})`
borrows the **existing** reviewed path-operations session. It uses original
createGlyphAnimator units, existing Clipper2 union/curve flattening and unchanged
Earcut3.2.4 (ISC) to triangulate each canonical solid face with holes. Defaults:
0.02px curve tolerance, 0.0025px grid, cluster units, logical order. Triangle/face
relative area disagreement above1e-10 fails; it never substitutes a rectangle,
bitmap or missing glyph. Caller retains ownership of the path session.

The input is an existing ShapedRun from createFontShaper. Kerning, ligatures,
Arabic/CJK run shaping, outline and font resource validation stay in the existing
HarfRust/Skrifa adapter. This function does not fetch fonts, shape again, detect
scripts or invent a new professional geometry schema. Its result is local
prepared drawing data; canonical TextLayoutData/PathData remain the authority.
If persisted, authenticate the result through existing Resource/Artifact/build
seals. Font identity metadata alone is not byte authentication.

`renderer.prepare(data)` belongs to Stage initialization, before first draw. It
snapshots and validates complete glyph/cluster mappings, freezes callback units,
and owns immutable owner-local XYZ/UV/unit buffers. Layout dimensions must match
the Stage; reprepare after changing text/fonts/layout dimensions. Heavy preparation
can run outside rendering with the existing analysis/precompute mechanisms.

The actual example prepares three real fonts once in Node using existing reviewed
Kit fixtures, then carries the actual results as sealed typed data into the Native
Stage. Its word ranges are captured from Node22/ICU77.1/Unicode16, not recomputed
in SpiderMonkey. Private fixture factory paths are not public package capabilities.
Production factory installation/permissions are a separate Main integration gate.

## Selectors (15)

Selectors are ordinary `(unit, context) => weight` callbacks with weights[0,1].
`unit` retains original logical UTF16 clusters, glyph membership, line id, logical/
visual order and physical baseline anchor. Optional paragraph direction is supplied
by prepared units. Selection transforms a whole cluster by default, preserving
ligatures and attached marks. Glyph-unit mode explicitly permits separating marks.

* `clusterRangeSelector(text,{start,end,match?})`: UTF16 overlap/contained range;
  Unicode scalar boundaries required, no partial ligature geometry.
* `indexSetSelector(indices,{order?})`: explicit logical/visual unit indices.
* `wordRangeSelector(text,words,{start?,end?})`: explicit nonoverlapping original
  UTF16 word ranges from a reviewed segmenter, never glyph-id word guesses.
* `lineSelector(lineIds)`: canonical line identities.
* `textMatchSelector(text,query,{occurrence?})`: exact substring, nonoverlapping
  occurrences; all by default. No implicit locale/casefold or regex engine.
* `distanceSelector({center,radius,softness?})`: anchor distance in pixels;
  softness is a linear edge band centred on radius, not Gaussian sigma.
* `axisSelector({axis?,start,end,reverse?})`: anchor X/Y ramp in physical pixels.
* `noiseSelector({seed?,frequency?,speed?})`: existing audited smooth noise by
  logical unit index/local seconds. Not the original Boolean random selector.
* `selectorUnion`, `selectorIntersection`, `selectorSubtract`: lazy adapters to
  existing scalar selector equations (max, product, nonnegative subtraction).
* `selectorInvert`: 1-weight; `selectorThreshold`: hard or linear soft threshold;
  `selectorEase`: existing Core easing, clamped to valid selector weights.
* `staggerGlyphSelector(selector,{delaySeconds,order?,clock?})`: retime any selector
  per unit, default logical order/affine Stage clock; local-only clock is explicit.
  There is no inherited4096-unit selector-array cap or second timer.

## Transforms (6)

All take a selector and return ordinary pure callbacks. Existing Signals/keyframes
drive numeric options. Positions are px, rotations clockwise degrees, scales and
Alpha dimensionless. Matrix/opacity results remain available for advanced callers.

* `glyphTranslate(selector,{x?,y?})`: weighted displacement.
* `glyphRotate(selector,{rotationDegrees,anchor?})`: weighted rotation around the
  original unit baseline anchor or explicit pixel Signals.
* `glyphScale(selector,{scaleX,scaleY?,anchor?})`: interpolate identity to target
  scale; scaleY defaults scaleX. Zero/negative geometric scales are explicit.
* `glyphOpacity(selector,{opacity})`: interpolate full opacity to target[0,1].
* `glyphTracking(selector,{amount,order?,direction?,originIndex?})`: extra px per
  shaped unit. Logical RTL expands in negative X; visual order expands positive X.
  Direction=auto requires prepared paragraph direction, otherwise supply it.
  This is post-shaping spacing, not rerunning kerning/OpenType substitutions.
* `composeGlyphTransforms(...controls)`: apply in author order via existing true
  affine multiplication; multiply opacity. It does not incorrectly add rotations
  and nonuniform scales as independent parameters.

## GPU precision, cost and lifetime

`createNativeGlyphRenderer(init)` borrows the Stage's owner. Prepared geometry is
Float64 until an **explicit F32 XYZ lowering**; CPU does not rasterize text pixels.
Per draw, GPU Compute transforms XYZ with the unchanged shared guarded Pair math;
the existing PA coverage-ink shader creates a small per-unit opacity/ink palette;
existing textured drawMesh draws the actual triangles with exact depth peeling.
All pixels are scene-linear PM F16/F32. Straight linear `ink` defaults[1,1,1,1];
negative RGB/HDR are supported. Legacy TextLayoutData sRGB style fill is not
silently relabelled; this draw uses its explicit linear ink. No CPU/Canvas8 fallback.
Direct Half ink has |RGB|<=65504; choose F32 for larger straight ink values.

Each draw owns/releases its controls, transformed positions and palette. The returned
GpuPixelImage is caller-owned, provisional until the existing frame ticket completes,
and expires under the existing frame epoch. This adapter does not auto-retire it on
the next call and does not release it at dispose. When chaining a managed recipe,
release this input after the recipe; that recipe's retained output still follows its
own contract. Do not release arbitrary managed outputs through unrelated chains.

`dispose()` rejects future work, waits for pending prepare/draw, releases only owned
stable buffers, and never disposes the Stage/device. Foreign handles, concurrent
draws, cancellation, malformed mappings and precision/resource failures are explicit.
Actual owner/device buffer and command admission remain in force. No artistic path/
glyph/pixel count cap, second renderer, graph or historical state store is added.

## Verified subset and remaining scope

Editable `validation/native-text-scene/project.tsx`/`half.tsx` demonstrate Latin ffi,
Arabic attached marks and Japanese, real selectors/transforms, eight actual shutter
subframes, Glow and Layer. First/middle/final and random/repeated frames, native XYZ/
palette references, signed HDR/Alpha, PNG/F32EXR/Half-sourceEXR and48-frame MP4 are
verified. PNG is a display/export representation, not the signed linear reference.

This entry takes one explicitly shaped font run per handle; compose handles for
mixed fonts. Full paragraph bidi/itemization, line breaking, text-on-path and variable
font policy stay in their existing modules; new vertical/color/bitmap/SVG glyph support
is not claimed. Native spatial edge sampling is the existing rasterizer policy, not
an analytic vector-area coverage certificate. AE parameter/pixel parity, full font
distribution, R1/export/L3, other GPU/OS and4K/long-video qualification remain outside
this source checkpoint. 23 API functions do not mean23 newly invented AE effects.
