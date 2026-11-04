# Sealed font images

`@frameweave/engine/native` exports `fontGlyphResource` and
`NativeFontGlyphResource`. Pass the request to the existing
`gpu.importResource()`. It returns an ordinary owner-managed `GpuPixelImage`;
existing effects, Layers, release and Stage disposal apply.

The parent is a declared `Resource kind="font"` or `kind="file"`. A managed R1
initializer can instead use `init.moduleResources.font.resourceId` for its own
manifest module `font: {format:"resource",path:"font.ttf"}`. This frozen view
contains only that package's non-JS module identities and grants no filesystem
or module-loading permission. Parent bytes are checked against the compiled
build seal. Caller offsets, extracted pixels, URLs and private paths are rejected.

The Core-owned parser re-derives face, glyph ID, table format and exact strike
from those bytes. `sbix`, `cbdt` and `ebdt` bitmap output dimensions must match
the selected strike. Bitmap placement/bearings remain the text module's job.
SVG requires an explicit y-down font-unit crop, e.g.
`svg:{viewBox:[0,0,1000,1000]}`. The original SVG viewport transform is preserved;
`glyph<N>` selects the correct artwork in a shared document.

The decoder uses the existing explicit WASM authorization (`--allow-wasm` or
`Renderer.create(...,{allowWasm:true})`). This authorizes this fixed SDK parser;
it does not grant arbitrary module WASM, filesystem or network access.

Input artwork is SDR/sRGB. It is converted to the requested scene-linear color,
Alpha convention and RGBA16F/32F precision, then uploaded through the existing
native resource lease. Rasterization is CPU asset decoding, not a GPU shader or
an HDR artwork claim. Downstream processing remains native GPU. Font snapshots,
parser sessions and decoded images are reused for exact requests and released
with the Renderer. No CPU pixel arrays enter the JSON frame protocol.

## Supported profile and limits

- PNG strikes, premultiplied BGRA, packed/row-aligned 1/2/4/8-bit masks.
- Raw or gzip static SVG; shared glyph documents, gradients and local references.
- `foreground` is explicit straight SDR sRGB RGBA for masks/currentColor.
- No SVG script, animation, HTML, system-font text, external images/references,
  CSS variables/CPAL variables or external stylesheets. Unsupported content errors.
- This is image extraction, not shaping, layout, variable-axis bearing adjustment,
  COLRv1 rendering or vertical typography.
- The real-font fixtures qualify sbix PNG and SVG/gzip. BGRA/mask conversions have
  numeric tests; complete production CBDT/EBDT font coverage remains unqualified.
- `Renderer` native GPU `maxBytes` and `resourceLimits` configure admission.
  Defaults are adjustable (source bytes, SVG nodes/depth and cache bytes).
  These are admission budgets, not measurements or promises of peak RSS/VRAM.

## Editable example

```powershell
npm run frameweave -- frame examples/font-images/project.tsx --frame 0 --output artifacts/font-images/example.png --allow-wasm
npm run frameweave -- render examples/font-images/project.tsx --output artifacts/font-images/example.mp4 --allow-wasm --encoder libx264
node --import tsx --test tests/font-images.test.ts tests/font-images-native.test.ts
```

Build the production native owner explicitly if absent:
`node modules/native-gpu/build.mjs --release`. No compiler is downloaded during
package installation or rendering.

## Original parser and distribution

The frozen Agent-2 source is
`6dd8c4bb63d3c3dbe371476b731be2254a435ee3`; it uses original HarfRust 0.15.0,
Skrifa 0.49.0/read-fonts 0.46.0 and wasm-bindgen 0.2.129. `source/` contains the
unchanged Rust/Cargo inputs; `runtime/` includes the checked JS/WASM and original
build receipts. `licenses/` preserves upstream license files and inventories.
The SDK checks all five source hashes and JS/WASM hashes before executing the
verified bytes. Its normal Runtime Pin and installed distribution seal include
the codec. Historical project locks must be reviewed/re-exported explicitly;
this feature does not refresh them silently.

For this integration the already-built frozen artifact was reused, not rebuilt
or taken from a mutable worktree cache. To re-import that reviewed delivery:
`node modules/font-images/provision.mjs <font-execution-6dd8c4bb-directory>`.
This build-time tool verifies the delivery and source Git object before copying.
The normal distribution builder ships these runtime/source/license files with
their relative paths; no Agent directory is referenced by rendering.
