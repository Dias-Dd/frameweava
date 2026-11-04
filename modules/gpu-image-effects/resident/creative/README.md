# Creative HDR recipe candidate

Ten new effects extend the existing retained PixelScope recipe: brightnessContrast,
tint, tritone, colorBalance, blackAndWhite, filmGrain, vignette, sobelEdges,
reliefLighting and pixelate. `example.tsx` runs all ten, with nonzero controls,
from a typed Surface port to a single final Surface readback. GPU image handles
remain callback-local; the existing arena, owner and disposal policy are reused.
No GPU Host, Renderer, execution ABI, TVG, permission or engine version is added.

EffectCraft ec7ced1f WGSL supplies the audited pointwise colour branches, hash,
Sobel stencil, vignette and relief core. `sources.json`, `vendor/` and
`vendor/LICENSE-MIT` retain exact originals, hashes and adaptation scope. These
are selected source archives, not runtime dependencies or an external engine.
Pixelate's small native integer sampler is cheaper than importing a raster
framework; it is clipped-block centre sampling, not area-average Mosaic.

The HDR bridge preserves native PM radiance and original Alpha for colour,
grain and lighting operations. Straight input associates first. Pixelate moves
all four sampled channels together. The working-gamut Y coefficients come from
the existing colour matrix; no sRGB/Rec.601 assumption is hidden. Negative RGB
and HDR values are not implicitly clipped. Tint/Tritone optionally clamp their
tonal coordinate only when `clampLuma:true`; default endpoint extrapolation
remains signed. Color Balance clamps its tonal band weights, never radiance.
Relief clamps illumination to nonnegative as its upstream algorithm does.

- Brightness/Contrast is the explicit linear/pivot branch, not the upstream
  display-fitted modern curve. Contrast defaults to 1, brightness to 0.
- Black & White has six cyclic hue weights and a mix amount. It retains signed
  gray output instead of adopting the upstream nonnegative-colour clamp.
- Grain uses the pinned uint32 hash and two uniforms (triangular additive noise),
  not a complete film-stock emulator. Seed is explicit uint32; by default the
  Stage seed's bits and floor(Stage-local frame) are used, modulo 2^32. Without
  context the frame is zero. No clock, stateful RNG, or new animation evaluator.
- Vignette center is normalized, radius relative to the shorter image side;
  inverse-square falloff and optional highlight pin mirror CC Vignette.
- Sobel is continuous PM-luminance magnitude (1/4 scale), coverage-masked colour,
  with overlay/only modes. It is not the upstream binary-threshold Smart Blur.
- Relief reads a same-size, same-working-colour height image (luma or red),
  uses central differences and directional light. It retains image Alpha.
- All imports/filters must be awaited. Flags-only completion barriers may split
  long recipes; no intermediate full pixels are read back.

All parameters are strict, existing Signals resolve through FrameContext, and
logical output remains F16/F32. Nonfinite/overflow publications fail; the shared
normal-F32 arithmetic admission is explicit, not a proof over the full Float32
domain. No arbitrary resolution/radius ceiling is added; current device, 16MP,
byte and iteration budgets remain. Large factory acceptance explicitly opts into
1GiB; default managed recipes retain 512MiB. No generic tiling or cross-vendor
acceptance is claimed. Existing formal 0.1.0 manifest and locks stay unchanged;
Main owns the next immutable version and shared release integration.

One batch verification entry: `node scripts/check-resident-creative.mjs`.
It refuses to start below ten new implemented methods, records implementation
and test wall time, and stores original failures, GPU metadata, hashes and real
PNG/EXR/HDR10 output under `artifacts/gpu-image-effects/chain-creative/`.
