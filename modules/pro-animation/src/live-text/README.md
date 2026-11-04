# Live professional text (candidate source module)

`index.ts` exports ordinary typed functions. Main owns the final top-level named exports, immutable R1 release identity and SDK Pin. The private integration package is not a public release.

```ts
const text = createNativeTextEffects(init, {font, itemizer, pathOperations});
// Existing Stage renderAt(context); services are authorized, direct-owned Kit sessions.
return text.draw({
  text: 're\u00addo AV ffi',
  paragraph: {fontSize: 36, softBreaks: [3], discretionaryHyphen: '-', wrap: 'none'},
  character: characterOffset(1, 'AVBC'),
  stroke: {width: glyphStrokeWidth(selectAll, 2), ink: [-.1, 1, 4, .7]},
  fill: {ink: [3, -.25, 1, .8]},
  transform: composeGlyph3D(glyphRotateY(selectAll, {degrees: 25}), glyphDepth(selectAll, 30)),
  blur: glyphBlur(selectAll, {x: .5, y: .3}),
  camera: perspectiveTextCamera(init.width, init.height), format: 'rgba16float',
}, context);
// dispose text, then the borrowed shaper/itemizer/path services at Stage teardown.
```

Controls: `glyphIdentity3D`, `glyphTranslate3D`, `glyphRotateX`, `glyphRotateY`, `glyphRotateZ3D`, `glyphScale3D`, `glyphSkew3D`, `composeGlyph3D`, `blendGlyph3D`, `glyphAnchor3D`, `glyphOrientation3D`, `glyphAim3D`, `glyphFaceCamera`, `glyphOrbit3D`, `glyphWave3D`, `glyphNoise3D`, `glyphDepth`, `glyphBlur`, `glyphStrokeWidth`, `characterValue`, `characterOffset`, `characterMap`, `orthographicTextCamera`, `perspectiveTextCamera`, `projectGlyphPoint`. They are combinable controls, not 25 separate AE effects.

- Real original HarfRust shaping, Unicode itemization and Clipper2/Earcut outline geometry run for the evaluated text. Source replacement happens before reshaping: ligature, glyph count and reflow can genuinely change. Selection uses the resulting canonical clusters; a ligature is not falsely split into independently shaped letters. `layout()` returns this actual canonical paragraph, not the temporary atlas drawing layout.
- U+00AD activates a separately shaped visible marker only at a used soft break. Source UTF16 indices remain original; an explicit, validated local replacement record connects the real marker glyph to U+00AD. Arabic body joining forms are preserved. The marker is an explicit caller choice; dictionary hyphenation, language-dependent spelling changes and automatically selected script marks are not implemented.
- Pixel execution is Native wgpu only, borrowed existing owner, scene-linear HDR/signed RGB, premultiplied F32 working images and declared F16/F32 final output. No Canvas/browser/SDR pixel fallback. Original PA Gaussian compensated sum is adapted only for per-tile addressing/weights; original NativeGlyphRenderer and mesh/depth-peel raster execute the ink and final perspective quads.
- Layout/stroke are CPU/WASM geometry. Atlas fill/stroke are grouped, not one GPU command chain per character. Blur sigma is local pre-transform pixel sigma, separable XY with transparent tile edges. Fill-over-stroke is the default; group opacity is applied after painting and blur. 3D means transformed planar glyphs with perspective/clipping/depth compositing, not extruded text or lighting.
- Pose matrices are affine column-major 4x4 in Stage physical pixels; rotation is degrees, angular/orbit speed uses existing Stage-local seconds; Signal/keyframes use the existing evaluator. F32 geometry admission is explicit. Adaptive projection density and complete finite Gaussian support determine the atlas. Allocation/command limits come from the actual admitted device; there is no arbitrary character count cap. This first atlas implementation is not paged and can reject genuinely oversized workloads.
- Each draw records provisional work; normal Renderer ticket completion is the success boundary. Returned image belongs to caller/frame epoch. No retained previous frame, hidden history, clock, new timeline, or simulation runner. Concurrent draw/dispose rejects. Dispose closes only this adapter; caller owns service cleanup. Cancellation before publication propagates without fabricated output.

## Integration qualification

The editable real fixture generator is `../../validation/check-live-text.ts`; it creates a standard TSX + isolated trusted private R1 package carrying the reviewed Kit resources/font license. It uses the own-source SDK snapshot plus Main's decoder-only fix `992fe3408843b25e6cedeef1a82cd3b0a9ee1310` and matching frozen SpiderMonkey binary receipt. This is a prerequisite not yet merged into this branch's Core. No released lock or Core file is edited.

Run through the existing cumulative text campaign: `node modules/pro-animation/validation/run-text-controls.mjs prepareClose liveL0 hyphen types liveText liveDecode`. The ledger includes earlier controls/tabs/failures; it must never be reset to repeat this round. It is already close to its 420-second ceiling. L3 final catalog/root exports/six-mode release qualification belongs to Main.

Known boundaries: existing font API supports horizontal ltr/rtl outlines. Proper vertical shaping requires vertical glyph metrics/substitution in that API and a writing-mode contract; rotating horizontal text is not equivalent. Color/bitmap/SVG font paints are not exposed by the outline-only service. This module does not invent an SDR import or bypass font/WASM permission for them. No all-AE or universal shaping coverage claim.

Wide-blur numerical boundary: projected sigma above 64 uses variance-matched passes of the existing finite 3-sigma kernel, with the full composed support allocated. This is not bit-identical to one arbitrarily wide truncated kernel. Extreme perspective/large-atlas/large-sigma quality and performance are not qualified by the small real fixture; do not infer all AE blur equivalence from it.
