# Basic pixel filter closure — 49 explicit targets

This is the user-confirmed 49-item task, separate from the **paused** long-term
library goal. `coverage.json` is the exact list; it must not be shortened to make
the acceptance pass. The candidate is not a claim that all Adobe effects, every
AE parameter, or all 247 intake entries have been implemented.

The existing Gaussian/Glow, colour/keying/matte/creative/blend APIs remain.
The candidate extends the same `processImage` recipe with ordinary typed methods.
Main owns the next formal package version, identity, catalog and SDK pin. Existing
official manifests/locks are untouched; `test.resident-foundations` is only the
reviewed private R1 acceptance identity in `example.tsx`.

## API and numerical contract

All methods return a new Stage-local `GpuPixelImage`. Inputs/outputs are explicit
scene-linear RGBA16F/32F, final Alpha is premultiplied; encoded colour conversion
and resampling are not implicit. `format` defaults to the first input format.
`signal` uses the existing cancellation path. Numeric leaves reuse FrameContext
Signal evaluation. Unknown options, malformed arrays and unsafe parameters fail.
No GPU texture/device is exposed and no fallback CPU effect path is provided.

* Box Blur averages native PM RGBA in horizontal/vertical passes, with optional
  iterations/axis. Radius is integer and uses finite-frame scans plus analytic
  edge-repeat counts; it does not loop across arbitrarily large empty extents.
* Directional/Radial/Zoom Blur average explicit samples. Length/centres are input
  pixels; radial amount is degrees, zoom amount is a scale span. Compensated
  interpolation/coordinates preserve HDR cancellation. Float32 sample indices
  must be exact; radial range reduction has an explicit numerical domain.
* Channel Blur uses separate RGBA Gaussian sigmas (3-sigma windows). RGB is
  blurred in straight colour and then associated with blurred Alpha. Native
  zero-coverage emission is filtered separately. Compound Blur uses the other
  same-size image's working-space PM luminance clamped to [0,1] as sigma control.
* Convolution/Sharpen/Emboss/Color Emboss preserve the original Alpha; RGB is
  native PM, not a coverage-normalized colour filter. Kernels are row-major,
  divisor nonzero, bias multiplied by coverage. The canonical small presets are
  native; no full upstream emboss/sharpen parameter parity is implied.
* Erode/Dilate apply componentwise PM RGBA min/max, unlike the existing Alpha-only
  morphology. They reuse the proven interval decomposition and release scratch
  images. Radius/axis/boundary are explicit. RGB may exceed coverage or be negative.
* Find Edges uses per-channel Sobel magnitude; optional inversion is `Alpha-edge`.
  Posterize is signed, unbounded quantization with half-away rounding. Thresholds
  compare against coverage-scaled values; low/high colours can be signed/HDR.
* Hue/Saturation uses hue sectors, linear chroma scaling (`1+saturation`), and HSL
  lightness. This signed/HDR extension avoids the singular display-HSL saturation
  denominator at lightness 0/1. Colorize sets hue/chroma around working luminance;
  Vibrance is adaptive chroma scaling. They are not AE's display-clipped curves.
* Photo Filter multiplies colour and optionally restores working luminance.
  Gamma/Pedestal/Gain is signed `gain*sign(c+pedestal)*abs(c+pedestal)^(1/gamma)`.
  Exposure is signed `((c*2^stops)+offset)^(1/gamma)`. Nonlinear operations retain
  undefined zero-coverage emission; linear exposure still scales that emission.
* Leave/Change/Change To Color select by explicit straight-RGB distance with a
  smooth tolerance band. RGB replacements may be signed/HDR. This is not a full
  hue-range qualifier or perceptual colour-distance implementation.
* Channel Arithmetic acts on prepared PM RGB and keeps the first Alpha. Divide
  by zero fails. Set Channels routes raw PM components. Shift Channels routes
  colour components then re-associates with the selected coverage. Illegal output
  Alpha fails publication. Remove Color Matting subtracts the declared backdrop
  contamination; Solid Composite performs native PM over that colour.
* Noise reuses the fixed upstream hash, never global randomness. Ordered Dither
  uses Bayer 4x4 ranks and explicit levels; it is signed and never silently clamps
  RGB. Checkerboard/gradients replace image colour under its coverage. Coordinates
  are pixel centres. Gradient Map uses 2..64 strictly ordered stops and explicit
  linear/clamp extension; this bound comes from its sealed uniform layout.
* Auto Levels uses per-channel extrema; Auto Contrast uses working-luma extrema;
  Auto Color uses grey-world channel ratios. Undefined zero-coverage colour is
  ignored and zero-mean channels retain unity gain. Equalize uses a stated bin
  count, per-channel observed range, normalized CDF and no temporal statistics.
  Auto Color exposes amount only; output-range controls belong to Levels,
  Contrast and Equalize and are rejected on Auto Color.
* Shadow/Highlight uses explicit tonal widths. Selective Color uses the pinned
  nine-group CMYK masks (R,Y,G,C,B,M,W,N,K); only those selection masks clamp to
  display coordinates, not output RGB. Broadcast Colors reduces chroma into the
  **explicit** black/white gamut; Video Limiter clips to that explicit range.
* Median uses exact continuous F32 radix selection, not an 8-bit/512-level lookup.
  Dust & Scratches chooses that median beyond its RGB threshold. Neighborhood
  sample counts must fit uint32 rank arithmetic. This exact path becomes costly
  at large radii. Bilateral uses spatial/range Gaussian weights; Smart Blur uses
  a hard working-luma range threshold and a circular window. No automatic stride
  approximation or resolution cap is introduced.

Straight association is an explicit F32 boundary. Half publication is F32→binary16
RNE. Inputs/association reject unsupported subnormal F32 values rather than
silently flushing meaningful radiance. Extreme finite F32 products/powers can
still overflow and fail; this candidate is not a proof over the entire F32 domain.
The acceptance keeps scaled F64 error bounds 3e-6/F32 and 6e-4/Half. Alpha/colour,
every logical publication, byte/device budgets and failure latching remain owned
by the existing public scope. No new permanent image-resolution limit is added.

## Observable statistics transfer boundary

The current public GPU ABI has typed compute and read-only typed inputs to pixel
kernels, but no image→typed-buffer copy on the GPU. The four statistics methods
therefore explicitly read a value Surface, decode its unchanged Float32 bytes,
and upload a typed four-component field. CPU code does not calculate extrema,
means, histograms, CDF or correction pixels. Those run on the same GPU scope.
The extra readback/upload is recorded in owner counters. No statistics are
disguised as an RGBA image and no second device or Renderer is created. A future
owner copyImageToField/read-only image compute binding can remove this boundary.

## Acceptance and editable example

`node scripts/check-resident-creative.mjs --foundations` is the single persistent
flow: types → unit → real GPU → private R1 TSX/PNG/F32 EXR/HDR10. The gate requires
all **49** implementations, not merely ten names. Failed phases alone may resume
in that same flow, retaining original logs/hashes. Source/test time is recorded.
Pre-freeze audit corrections invalidate only the affected phase within this
same flow; the reason, old attempts and old real media remain in the ledger.

`cases.ts` calls every real typed method with nontrivial parameters. `reference.ts`
contains separate F64 equations (sorting for Median, scalar sampling, CPU histogram
as an oracle only). GPU checks use both formats, zero/partial coverage, negative
RGB, HDR, Signal, cancellation and disposal. The full 49-method scene uses random
and repeated frames. The large-image check is explicitly only Box Blur→Sharpen;
it cannot establish all 49 at that size. Default 512MiB and direct 1GiB budgets
are distinct. Cross-vendor/platform qualification remains separate.

Upstream originals/commit/hash/MIT are pinned in `sources.json`; archives remain
under `../creative/vendor`. The original reference categories are Adobe's
[Blur & Sharpen directory](https://helpx.adobe.com/ca/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/blur-sharpen-effects.html),
[Color Correction directory](https://helpx-origin-uw2.aws116.adobeitc.com/after-effects/desktop/adjust-colors/work-with-color-correction-effects/color-correction-effects.html)
and [Channel directory](https://helpx-origin-uw2.aws116.adobeitc.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/channel-effects.html).
These are taxonomy references, not evidence of numerical AE compatibility.
