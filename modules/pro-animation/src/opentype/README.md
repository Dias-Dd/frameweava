# OpenType controls → Native glyph animation

Module-local entry: `src/opentype/index.ts`. Twenty-one operations plus the owned
`createOpenTypeFont` factory. This is one font/selection/animation chain, not21 AE
effects. Main owns public named exports, R1 identity/version, typed binding and L3.
The private `test.pa3-opentype` carrier is not an installed public capability.

```ts
// Main public wiring pending. The editable validation project uses this source entry.
import { createOpenTypeFont, readOpenTypeLayout, planOpenTypeFeatures,
  shapeOpenTypeFeatures, readGlyphDefinitions, selectGlyphClass,
  openTypeSelectionTransform } from './index.ts';
const font = await createOpenTypeFont(reviewedKernelFactory, {
  bytes: authorizedFontBytes, source: declaredResource, coordinates,
});
try {
  const catalog = await readOpenTypeLayout(font);
  const plan = planOpenTypeFeatures(catalog, { liga: 1, kern: 1 });
  const run = await shapeOpenTypeFeatures(font, 'AV ffi', plan,
    { script: 'Latn', fontSize: 48 });
  const defs = await readGlyphDefinitions(font, run.layout.glyphs.map(g => g.glyphId));
  const selection = selectGlyphClass(run, defs, [2]); // original GDEF ligature class
  const transform = openTypeSelectionTransform(selection, weight => ({
    matrix: [1, 0, 0, 1, 0, -12 * weight], opacity: 1,
  }));
  // prepareGlyphMeshes(run, {pathOperations}) once; existing Native renderer draws
  // with transform and signed scene-linear HDR ink. No shaping during draw.
} finally { await font.dispose(); }
```

| Operation | Contract |
| --- | --- |
| readOpenTypeLayout | Original read-fonts GSUB/GPOS base feature/script/LangSys records, with verified immutable font instance |
| openTypeScripts | Exact OpenType script tags for one table |
| openTypeLanguages | Exact language tags; null is actual DefaultLangSys, absence stays absent |
| openTypeFeatures | All indexed feature records or exact script/language scope; duplicate tags retain distinct indexes |
| openTypeRequiredFeatures | Required index from LangSys, not reconstructed from the optional list |
| openTypeLookups | Original lookup indexes for one feature record |
| planOpenTypeFeatures | Validate uint32 settings against font-declared tags; no assertion that every lookup executes |
| shapeOpenTypeFeatures | Original HarfRust shaping with a same-instance plan and explicit ISO15924/BCP47 context |
| compareOpenTypeFeatures | Two real shaped results, observed glyph-count and advance differential |
| readGlyphDefinitions | GDEF presence/class/mark-attachment class/attachment contour indexes; class0 means unspecified |
| readLigatureCarets | GDEF1 coordinate,2 actual contour point,3 Device/ItemVariationStore; statuses preserve unresolved cases |
| placeLigatureCarets | Unhinted design units → actual glyph/style pixel position; signed y-axis conversion |
| mapLigatureCaretBoundaries | Explicit logical UTF16 component boundaries; never equal-spacing inference |
| hitTestLigatureCarets | Closest explicitly mapped interior point and ties; does not replace Paragraph Reader |
| selectGlyphClass | Original unspecified/base/ligature/mark/component classes0..4 |
| selectMarkAttachmentClass | GDEF mark attachment classes; not Unicode guesses or GPOS anchor discovery |
| selectAttachmentPoints | Select glyphs advertising specified GDEF contour attachment indexes |
| selectFontGlyphIds | Exact font glyph-ID selection |
| combineGlyphSelections | Union/max, intersect/min, subtract/max(0,a-b), xor/abs(a-b) on aligned unit weights |
| invertGlyphSelection | Complement unit weights, preserving instance and shaped glyph order |
| openTypeSelectionTransform | Native transform adapter; whole shaped cluster uses maximum selected-glyph weight |

`createOpenTypeFont` uses the existing inspector/shaper and the existing owned Kit
client. `withInspectedFontKernel` is an internal serialized extension seam, not a
new font registry. Queries reject concurrent use. A query signal suppresses late
publication; it does not claim to interrupt synchronous WASM. Dispose closes the
handle, waits pending metadata, then frees the original client. Owner-level abort
continues to use the existing Kit signal/termination policy. No resource download,
OS lookup, untrusted module loading, permission/SDK lock changes or new worker host.

GDEF format2 uses original Skrifa `with_scaled_glyf_outline` direct contour points,
including composite/gvar handling. No guessed Bezier-control index conversion.
Unhinted F26Dot6 coordinates have1/64 font-unit quantization; CFF/VARC format2 is
reported outline-unavailable. Invalid indexes remain invalid-point. Hinting and
full variable-glyph point precision are not certified by this checkpoint.
Format3 original IVS delta is in design units; Device delta is separate physical
pixels at an explicitly supplied positive integer ppem. Omitted ppem with Device
is ppem-required, never silently discarded. Caller supplies actual raster ppem;
no hidden DPR or font-size rounding. Unresolved values have null placed position.

Horizontal logical mapping requires explicit component boundaries inside the
original shaped cluster, one point per caret, scalar-safe UTF16, and one glyph in
that cluster. Multiple-glyph clusters, absent components, unresolved coordinates
and vertical logical layout remain unresolved. RTL logical assignment reverses
visual x order. `axis:y` observes/places font metadata; vertical shaping is not
implemented. Existing Paragraph Reader edge/range queries remain unchanged.
Selections operate on exact shaped glyph indexes; default Native cluster units
keep attached marks together. Choose the original explicit glyph-unit mode when
intentional separation is required. No fake glyph coverage or .notdef fallback.

Catalog eligibility is an observation, not runtime execution proof. Feature
variations/actual lookup selection remain original HarfRust work. The catalog does
not flatten contextual lookup rules, interpret feature-parameter UI/name tables,
implement JSTF/MATH/color fonts, ranged feature spans or a vertical layout engine.
No general editor selection/undo/document model is introduced.

Editable TSX: `validation/opentype-scene/project.tsx` / `half.tsx`. Original real
Noto Sans liga/kern on/off, Arabic RTL/marks, and Japanese no-carets are prepared
once using the existing WASM parser/shaper and Clipper2/Earcut. Live semantic
controls + Core keyframes → existing Native glyph renderer + caret mesh + Glow +
Layer. All image work uses the admitted Native owner, linear709 PM RGBA16F/32F,
negative RGB/HDR, automatic device selection. No browser, CPU raster, SDR fallback,
new GPU kernel/device, timeline, Graph, Stage or TVG changes. No Native-host WASM
execution claim: this example intentionally performs font preparation in Node.

Reproduce with existing worktree-local toolchains:
```
node modules/pro-animation/validation/build-opentype.mjs
.frameweave/pa3-shaping/python/Scripts/python.exe modules/pro-animation/validation/prepare-opentype-fixtures.py
node --import tsx modules/pro-animation/validation/prepare-opentype.ts
node node_modules/typescript/bin/tsc -p modules/pro-animation/validation/opentype-tsconfig.json
node --import tsx --test tests/pro-animation-opentype.test.ts tests/pro-animation-opentype-stage.test.ts tests/pro-animation-typography-fonts.test.ts
node --import tsx modules/pro-animation/validation/check-opentype-media.ts
node --import tsx modules/pro-animation/validation/check-opentype-png.ts
```
No fetching/building Main binaries is required or authorized. Existing frozen
Native/SpiderMonkey binaries and own isolated caches are reused. Tests prove this
Windows/RTX5070/Vulkan configuration only; platform/R1/export-strategy L3 is Main's
scope. Actual transparent PNG and separately named black composite are preserved;
viewer handling of near-zero-alpha HDR glow RGB differs. PNG/video are explicit
SDR delivery conversions, not numerical float references; EXR is the float proof.

Fixed upstream/code hashes and all27 unchanged dependency licenses are in
`provenance/opentype/sources.json`, `dependencies.json`, and `rust/opentype/NOTICE.md`.
Official format reference: [OpenType GDEF](https://learn.microsoft.com/en-us/typography/opentype/spec/gdef).
No Adobe code/assets or new EffectCraft imports were added. Original Rust font
algorithms are a lower-cost, compatible reuse than another editor/font runtime.
