# Native COLRv1 paint

`createNativeColorText(init, {font, pathOperations})` now dispatches original COLRv1
callbacks to the existing admitted Native owner. The older COLRv0 path remains compatible;
`prepareColorGlyphLayers` is explicitly a COLRv0 geometry API.

Use a reviewed font-color profile1 kernel when creating the existing inspected font.
`assertColrPaintProfile` checks the additive actual WASM query. An old raw-parser kernel
is still valid for observations and v0, and fails Native v1 with
`E_PA_FONT_COLOR_PROFILE`; a parsed callback is not treated as execution proof.
The profile1 data artifacts are built by `validation/build-font-color.mjs`. Actual
installation/execution uses standard R1 modules, not a standalone retired Web carrier.

```ts
const paint = createNativeColorText(init, {font, pathOperations});
const image = await paint.draw({
  text: 'ABCD', script: 'Latn', fontSize: 78, x: 8, baseline: 112,
  paletteIndex: 0, foreground: [3, -1.5, 1, .6], format: 'rgba32float'
}, context);
```

Original Skrifa normalization/variation resolution/traversal supplies solid, normalized
linear, two-circle radial and clockwise sweep callbacks, transforms, glyph/box clips
and isolated layers. Multi-stop values use typed data and binary search rather than
an artistic stop-count ceiling. Existing Clipper2 intersects clip geometry; existing
Native glyph mesh and A3 matte execute coverage. Original qualified compensated
coordinate/atan/sqrt/PM arithmetic is reused. No new GPU owner, renderer, stored graph,
timebase or CPU pixel fallback is introduced.

All28 COLR composite IDs map explicitly. Bounded colors follow the font blend rules,
including HSL clipping and exact dodge/burn endpoints. Outside that color domain,
the existing signed/HDR extension is explicit: no global RGB clipping, Plus can exceed
one, Alpha remains physical [0,1], and dodge/burn use the existing2^-20 denominator
profile near poles. CPAL is decoded to linear before PM interpolation; foreground is
already scene-linear. F32 intermediates publish explicit F16/F32, with the existing
qualified arithmetic/representation limits rather than an unrestricted FP64 claim.

The original library's degenerate-linear first-stop fallback is corrected to no paint.
A normalized zero-span clockwise sweep includes its first reversed stop at the exact
angle. The unchanged source, fixed upstream commit, original licenses and small patch
are recorded under `provenance/font-execution/colr-paint` and the separate Rust source.
Only import/private-access adaptation and the documented behavior correction are made.
Existing registry sources, old immutable artifacts and import policies are untouched.

Source setup/build failures are retained. The retired browser template was not restored;
source builds use existing registry/license/import-audit utilities, pinned tools and the
same direct data client. The data descriptor is not an installable package or capability.
Runtime imports remain subject to unchanged R1 trust, hash, module-resource and WASM checks.

Validation distinguishes scalar references, actual GPU numeric fixtures, authentic authored
OpenType font graphs and actual encoded media. Synthetic original test artwork is not
claimed to cover all production typefaces. Windows/NVIDIA Vulkan is the measured platform;
other devices and the complete upstream Rust suite are not qualified here. Public package
assets/version/pins and portable L3 remain Main integration work. Shared vertical fields
are integrated, but this checkpoint does not claim full vertical paragraph authoring.
