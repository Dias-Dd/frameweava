# Native optical image effects

Twenty concrete image methods extend the existing Native recipe. They borrow
the admitted GPU and retain intermediate images/data in the same Stage. No new
Host, renderer, ABI, device, CPU pixel fallback, browser drawing or wall-clock
state is added. Main owns official public exports/R1 identity/catalog/pins.

```ts
import {createNativeOpticalEffects} from './optics/index.ts';
const effects = createNativeOpticalEffects(init); // Native Stage initialization
const output = await effects.processImage(source, async (image, fx) => {
  image = await fx.opticalVignette(image); // physical cosine-fourth falloff
  image = await fx.bloomPyramid(image, {levels: 3, intensity: .7});
  return fx.halation(image, {radius: 1, spread: 2, intensity: .35});
}, {context});
// Stage dispose: await effects.dispose()
```

Complete editable TSX: `../examples/optics-chain.tsx`, factory `stage.ts`.
Numerical and genuine 1x1 fixtures are `optics-numeric.tsx`/`optics-boundary.tsx`.
All methods return owner-local `GpuPixelImage`, not persistent JSON handles.

| API | Actual operation and principal defaults |
| --- | --- |
| bloomPyramid | Soft-knee highlights, normalized 13-tap reduction, 3x3 tent reconstruction; levels4/radius1/scatter.7 |
| anamorphicBloom | Highlights with separable Gaussian PSF, radius4/squeeze4 horizontal stretch |
| streakGlare | Symmetric normalized exponential line scatter, length24/angle0/decay3/samples33 |
| diffractionGlare | Rotated multi-line star-filter approximation; 3 lines produce 6 rays, length18/decay2; not full wave optics |
| lensGhosts | Reflected/scaled highlight images along optical-center axis; count4/spacing.45/falloff2/dispersion.01 |
| lensHalo | Radial reflected highlight image through Gaussian annular envelope; radius.2*width/width.2*radius |
| lensDirt | Explicit same-size dirt image modulates blurred highlights; radius3/dirtGain1; negative dirt transmission is zero |
| lensFlare | Distinct composed ghost/halo/horizontal streak response, weights.5/.3/.2; no hidden source detection or ray-traced lens claim |
| lightRays | Highlight ray integration toward center, density1/decay.96/samples32, normalized decay weights |
| occludedLightRays | Explicit Alpha occlusion plus cumulative Beer-Lambert attenuation, opticalDensity4; no depth/shadow-map inference |
| chromaticAberration | Independent radial RGB scales [.01,0,-.01] plus optional signed pixel offset; maximum sampled Alpha |
| axialChromaticAberration | Independent wavelength defocus PSFs, RGB radii [2,0,1], maximum source/filtered Alpha |
| spectralDispersion | Inverse-wavelength-squared radial scale, 13 samples420..680nm; normalized triangular RGB sensitivities, not CIE spectral rendering |
| halation | Film-like highlight backscatter: broad red + narrower green luma response, radius2/spread3/red1/green.15 |
| softFocus | Highlight-biased Gaussian diffusion, radius3/strength.5/highlightBias.25; preserves original coverage |
| diffusionFilter | Energy-normalized core+two Gaussian PSFs, radius2/spread4/strength.35/haloFraction.2; all associated RGBA redistributed |
| airyDiffraction | Circular aperture [2*J1(x)/x]^2 PSF; finite radius6/firstZero2 pixels, explicitly normalized finite support |
| lightLeak | Deterministic sensor-space Gaussian band with sinusoidal ripple, width.12*width/angle0/intensity.5/warm RGB; editable center |
| opticalVignette | cos^4(theta) = 1/(1+r²/f²)^2, focalLength35mm/sensorWidth36mm/squeeze1 |
| veilingGlare | Uniform finite-canvas stray-light PSF: GPU row/column radiance reduction, strength.05; mean-energy conserving |

## Precision, color and coverage

Source dimensions, working scene-linear color and F16/F32 output inherit by
default. `workingColor` uses the existing actual F32 color conversion; never a
metadata relabel. Signed HDR RGB is preserved. Explicit F32 intermediates and
compensated arithmetic retain cancellation; final F16 publication follows owner
Half RNE behavior. No RGBA8 intermediate, tone mapping, automatic GPU downgrade
or CPU fallback. Original F32 scaled3e-6 / Half6e-4 gates are unchanged.

Each effect first publishes its associated F32 working input. Straight Alpha0
hidden color contributes zero; premultiplied Alpha0 emission is retained.
Additive optical light changes RGB while preserving source Alpha; PM emission
outside coverage is valid and not clipped to Alpha. Blur/diffusion redistributes
coverage; spectral sampling uses maximum participating coverage. None silently
fills hidden backgrounds. Composite known imagery with existing `over` when needed.

Finite canvas sampling is transparent for flare/spectral/PSF sampling. Existing
qualified Gaussian helper retains clamp boundaries for Gaussian diffusion and
halation. Pyramid border energy can leave the frame; no implicit renormalization
that would change the PSF. RGB dirt is associated radiance used as nonnegative
transmission; occlusion uses Alpha only. Both extra inputs must match dimensions
and are explicitly converted to the working color, without filesystem access.

`amount` interpolates original/target associated RGBA once at final publication.
Numeric controls accept existing Signals with explicit FrameContext. Counts
(levels, samples, arms, ghosts) are integers. No new animation evaluator or
cross-frame GPU history exists. Repeated/random frames use identical parameters.
`dispose` and failure/cancellation use the shared recipe leases; kernels and
device stay owned by the engine. Pre-cancelled work is not accepted by Native.

Errors use `E_NATIVE_OPTICS_PARAMETER` with effect/path/expected. Unknown fields,
invalid counts, malformed points, nonfinite and unsupported numeric values fail.
Meaningful pyramid levels are derived from image dimensions. Storage/coordinates
are checked against real device limits and uint32/int32 addressing, not a fixed
MP/8K ceiling. Resource admission and in-flight safety remain with the owner.
Full-frame PSFs/reductions are implemented; automatic tiling/halo/reduction
coordination is not qualified. Very wide apertures and many samples cost real
work. Airy control uses bounded periodic Bessel integration for |x|<=32 and the
standard J1 asymptotic expansion above32; no image pixels are processed on CPU.
Gaussian halo tails beyond32 sigma are zero where even maximal F32 RGB cannot
produce representable F32 radiance. Arbitrary IEEE extremes are not qualified.

## Reuse and qualification

Fixed originals, hashes and notices: `sources.json` and `vendor/`. The
[pmndrs postprocessing](https://github.com/pmndrs/postprocessing) sources use the
**Zlib** license. Altered implementation: `kernels.ts` adapts its 13-tap/tent
topology, chromatic offsets/max-Alpha and ray decay integration to Native Pixel
ABI2, paired arithmetic, normalized weights and unclipped scene-linear HDR.
EffectCraft MIT light-family sources are retained for algorithm comparison;
there is no full upstream UI/parameter/bit parity claim. Ghost/halo, Airy,
Beer-Lambert and other explicit equations are local implementations, not copies
of an entire third-party renderer. Bessel expansion reference:
[NIST DLMF10.17](https://dlmf.nist.gov/10.17).

One cumulative validation campaign: `node modules/native-effects/optics/validate.mjs`
with syntax, types, unit, gpu, media, performance, freeze phases; all failed
attempts count toward <420s and remain below implementation time before tests.
Independent F64 direct sampling/convolution/integrals compare all20 APIs, F16/F32,
straight/PM/opaque Alpha, signed HDR,1x1, wide values and out-of-order/repeated frames.
The media example checks a full three-effect chain, decoded PNG, Float32 EXR and
externally decoded lossy SDR MP4. Performance separately records init/cold/new/
repeat/random submit-to-completion with cache disabled,1080p/4K, n7 median/P95,
actual adapter/driver/power scheme and transfer/allocation counters. These are
not physical VRAM peak or a cross-algorithm speedup. No aesthetic quality score.

Other GPU vendors/OS/software adapters, natural photographic datasets, arbitrary
parameter/working-primary combinations, huge-domain overflow, automatic tiling,
4K terminal encoding and full-repository/public R1/portable integration remain
unverified. Optical approximations do not imply 3D volumetric scattering,
wavefront tracing, temporal motion sampling or hidden-image reconstruction.
