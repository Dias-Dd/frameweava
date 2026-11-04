# Native image estimation

Extension round 2 of 4. GPU-only on the existing Native owner and recipe
lifecycle. Availability is determined by frozen machine evidence, not this list.

~~~ts
import {createNativeEstimationEffects} from './filters.ts';
const effects = createNativeEstimationEffects(init);
const result = await effects.processImage(source, async (image, fx) => {
  const flow = await fx.opticalFlow(image, explicitReference);
  const camera = await fx.globalSimilarity(flow);
  const stable = await fx.warpByMotion(image, camera, {inverse:true});
  const grain = await fx.grainProfile(explicitGrainPlate, {radius:3});
  return fx.synthesizeGrain(stable, grain, {seed:71, strength:.4});
}, {context});
~~~

Editable TSX: ../examples/image-estimation-chain.tsx. Ordinary JS selects
explicit references. No upstream sampling, wall-clock state, new GPU host,
CPU pixel fallback, hidden inference or silent SDK lock update.

## Coordinates and ownership

MotionField maps current physical centres to matching reference centres: x
right, y down, dx/dy in pixels per explicit image pair, confidence in [0,1].
The f32 field is full origin-zero [width,height,1], semantic motion, space image,
units pixels-per-sample, channels dx,dy,confidence. Pass motion.buffer directly
to keying-pro temporal matte. This is not TrackData or a video-frame time axis.
Forward/backward consistency rejects uncertain and occluded correspondences.

Model matrices use normalized centres 2*(x+.5)/width-1; nine row-major
coefficients are stored as hi/lo pairs in GPU buffers. Inverse warping aligns
the source to the reference. Diagnostics: valid, confidence weight, minimum
unregularized data pivot, previous-IRLS reprojection RMS in pixels (first fit
has no prior residual). Rank loss is rejected before the identity prior.
fitIterations and optical-flow iterations are separate controls.

Rolling models fit six row-polynomial displacement terms per axis, with four
readout directions. Repair uses bounded Newton inversion and retains source
on singularity/non-convergence. This is a paired-image row deformation
estimate, not a recovered physical camera/sensor model.

Fields, kernels and profiles are recipe-local GPU leases. Do not persist them
in JSON/TVG or reuse after the recipe/frame. Only the existing explicit GPU
publication/export boundary can materialize offline data. No method reads
fitted coefficients back to JS. Internal images are F32; public image results
inherit source F16/F32 unless overridden. Stage props use existing Signals.

Sequence sample/query times are exact rational seconds. Ordering/subtraction
uses integer cross-products before numerical weights. Only samples within
the contiguous maximum-gap interval and window contribute. No missing
sample is invented. This is image-domain reference smoothing; moving
foregrounds may ghost. There is no hidden persistent camera-path solver.

## Algorithms and declared limits

* Dense robust pyramidal LK; structure/photometric confidence, confidence-aware
  upsampling and forward/backward rejection. EffectCraft KLT is the algorithm
  reference, adapted from sparse CPU to dense GPU fields. Bounded signed luma
  is used only for analysis; source/rendered HDR RGB is not clipped.
* Weighted normalized normal equations, IRLS, compensated GPU reductions and
  partial pivoting. sampleStep is a deterministic fit grid, not an image cap.
* Camera-shake deblur ports EffectCraft blur3 patch sharpness, translation SSD,
  sharper-neighbour selection and feathering. Samples are explicit. Signed HDR
  output replaces upstream's nonnegative RGB clamp.
* Single-frame blind estimation: edge-prediction prior, normalized nonnegative
  projected PSF gradient updates, regularized Landweber/TV restoration. It is
  approximate and underdetermined. Diagnostics expose edge energy, last
  update L1, pre-normalization mass and informative-edge flag; these do not
  prove the true kernel or convergence. Periodic convolution requires caller
  padding/trimming when wrap-around is inappropriate. This is not neural.
* Grain: high-pass scales, uncentered second moments, finite-lag RGB
  autocorrelation, Bartlett-window positive-projected spectra, colour
  covariance and luminance bins; finite FIR synthesis of seeded Gaussian
  noise. Colour correlation and per-channel spectra are separable, so
  arbitrary cross-spectra, temporal grain characterization and physical
  film-stock models are not implemented. Scene detail in the analysis plate
  can be measured as grain: supply a representative grain plate.
* Upscale reuses qualified Lanczos3 and adds directional detail/noise control
  plus explicit local-range anti-ringing. It is not learned super-resolution.
  The local-range constraint never clips RGB to 0..1.
* Colour stabilization estimates per-channel affine colour from valid
  automatically matched observations; it does not invent absent matches.

PM and Alpha0 emission remain explicit. Automatic crop is unsupported and
rejected. No permanent 4MP/8K/16K limit: actual device storage, dispatch and
engine admission apply. Large searches/reductions are expensive and are not
claimed transparently tileable. Missing qualified GPU fails via existing owner.

## Verification

Run validate.mjs phases types, syntax, unit, gpu, checks, media, performance.
Use this worktree's reviewed Native/SpiderMonkey binaries and local
.frameweave/user-home. The single cumulative campaign includes original
failures and enforces <420 seconds and verification below implementation time.
Full generated WGSL parse is distinct from real GPU execution and media decoding.

reference.ts contains independent F64 acceptance equations, never imported
by production. Unchanged scaled gates: F32 3e-6, F16 6e-4. Public R1/SDK
installation, whole-repository acceptance, other devices and proprietary AE
binary/UI parity remain Main integration or explicitly unverified scope.
