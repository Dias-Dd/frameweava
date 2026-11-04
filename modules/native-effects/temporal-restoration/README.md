# Native temporal restoration

Completion round 2/8. Shared Native owner, GPU-only production pixels, recipe-local
Pixel/Compute/Field leases. No new renderer, inference host, timeline or public
package identity. Frozen evidence determines qualification, not export counts.

```ts
import {createNativeTemporalEffects} from './temporal-restoration/index.ts';
const effects = createNativeTemporalEffects(init);
const output = await effects.processImage(current, async (image, fx) => {
  const restored = await fx.temporalDenoise(image, neighbours, {
    time, maximumGapSeconds: .05, windowSeconds: .1,
    timeSigmaSeconds: .06, noiseSigma: .02, rangeSigma: .15
  });
  const profile = await fx.temporalGrainProfile(grainPlates, {
    samplePeriod: {num: 1001, den: 30000}, radius: 1, temporalRadius: 1
  });
  return fx.synthesizeTemporalGrain(restored, profile, {time, seed: 71});
}, {context});
// await effects.dispose();
```

`neighbours` and `grainPlates` are explicit timestamped observations:
`{time:{num,den}, image, motion?}` or `{time:{num,den}, observed:false}`.
Times are rational **seconds**, not ordinary integer animation frame indices.
The caller declares project/local/material mapping; no automatic upstream Stage
sampler is added. `../examples/temporal-restoration-chain.tsx` is editable TSX.

## Denoise

`temporalDenoise` uses supplied typed current-to-neighbour motion or the existing
robust forward/backward pyramidal LK estimator. Coordinates are physical image
pixel centres, x right, y down. Each direction stops at the first missing
observation, maximum gap or time window. Duplicate timestamps, including the
current image time, fail. Low-confidence/nonfinite motion, out-of-image mappings
and absent source/reference coverage do not contribute. Normalized signed-HDR
colour distance, declared noise sigma, temporal Gaussian and confidence determine
weights. Incremental convex means avoid an unbounded HDR weighted-sum intermediate.

The source coverage and PM Alpha-zero emission remain unchanged. Source colour
may blend with a mean using `strength`, three `channelStrength` controls and
existing image `amount`. These controls and scalar sigmas use existing Signals;
there is no replacement animation evaluator. No motion estimator guarantees
correct correspondence on every real shot; range rejection is a control, not
proof that an arbitrary occlusion is identified. No interpolation bridges a
declared hole. Defaults and strict option types are in `types.ts`/`filters.ts`.

## Joint RGB spatiotemporal grain

`temporalGrainProfile` needs complete, uniformly spaced observed windows of
`2*temporalRadius+1` frames; off-grid times fail and gaps are not interpolated.
Known Gaussian F32 per-axis publication creates high-pass residuals. Alpha-weighted
local box/Hann-window periodograms are averaged into full complex 3x3 RGB cross-
spectra over spatial **and temporal** frequencies. Channel correlation can vary
with frequency/phase. This replaces the previous estimator's separable spectral
model for this new API; it does not silently change the older functions.

`analysisStride` is explicit statistical spatial sampling. `batchPatches` and
`maxWorkingBytes` bound temporary Gram rows; all selected patches are processed,
never truncated to fit a guessed resolution ceiling. Spectrum, complex factor,
real centred dense matrix FIR, normalization scale and pivot diagnostics are
typed GPU buffers. A profile's kind/version and colour basis are explicit; it
belongs to this recipe only and cannot be serialized or reused on another owner.
Relative diagonal regularization defaults to zero. Zero/negative numerical pivots
are exposed in diagnostics; their projection is not a claim of inferred film stock.

`synthesizeTemporalGrain` applies the real matrix FIR to deterministic Gaussian
white noise from an exact 64-bit time-lattice identity. Between sample times,
the default is floor/hold; no continuous temporal interpolation is inferred.
Negative and long timelines include the high word of the index. Spatial and
temporal FIR footprints overlap continuously across frame requests; order and
retries do not mutate random history. The synthesis colour basis must match the
profile; ordinary input conversion uses the existing real GPU colour converter.

`matchTemporalGrain` composes motion-aware cleaning, target profile analysis and
synthesis with explicit per-step F32 publication, then applies final amount and
source F16/F32 output. `temporalSpectrumView` provides an explicit signed-log
power/real/imaginary frequency-slice diagnostic; it is a visualization, not a
scene-linear photograph or an aesthetic quality score.

## Precision, ownership and scale

Scene-linear signed HDR RGB, PM Alpha, F16/F32 and source format inheritance are
retained. There are no RGBA8 intermediates or CPU pixel fallback. Word 7 remains
reserved by existing guarded compensated math. No fusion/reordering bypasses
logical Half/F32 publication. Profiles report the actual working colour basis.
CPU work prepares only tiny control/window/trig tables and rational timestamps.

Actual owner/session/storage/dispatch limits apply; no fixed megapixel ceiling
is added. The normalized residual stack and synthesis white field must currently
fit a storage binding. Dense inverse DFT is quadratic in spectral-bin count and
FIR application is proportional to image pixels times full spectral volume.
These operations are not claimed to tile transparently or run in real time.
Use explicit support/stride/batch controls; inadequate budget fails clearly.
No silent spectrum/radius/format reduction is permitted.

Cancellation is checked before new work and between patch batches; already
accepted GPU commands follow existing owner semantics. Exceptions retire scratch
and recipe leases. Double disposal uses the shared lifecycle. No mutable hidden
video state or CPU readback/upload round trip is introduced. Inspection is an
optional explicit GPU-publication callback, never Stage filesystem/network access.

## Verification and remaining scope

`validate.mjs` records one cumulative campaign below 420 seconds, including all
failures, types, unit, full WGSL, real GPU, quality, media and performance phases.
`NUMERICS.json` declares the unchanged F32 `3e-6` and F16 `6e-4` scaled gates
before validation. `reference.ts` is independent F64 test-only mathematics.
Raw commands, device receipts, PNG/EXR/MP4 and failures are frozen with evidence.

Public SDK/R1/portable integration is Main-owned and remains separately qualified.
Other GPUs, OSes, arbitrary film-stock/perceptual matching, unseen live footage,
every parameter combination and full repository release acceptance are outside
this checkpoint's evidence. The remaining rounds in `../COMPLETION.json` remain
open; no complete AE equivalence or total coverage follows from these functions.
