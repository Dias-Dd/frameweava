# Native learned video Roto (development adapter)

This module adapts the reviewed Meta SAM2.1 Hiera Base+ weights to the existing
Native inference/compute/pixel API. It is not a new runtime, analysis scheduler,
package manager or automatic upstream Stage sampler. Qualification follows the
machine evidence; model conversion, available CUDA or a successful declaration
alone does not establish runtime verification.

```ts
const effects = await createNativeVideoRotoEffects(init, reviewedBundle);
// Inside renderAt, current and authoredMask are owner-local GPU images.
return effects.processImage(current, async (image, fx) => {
  const result = await fx.trackVideoRoto(image, explicitSourceAt, {
    id: 'actor', seedFrame: 0, frame: requestedSourceFrame,
    totalFrames: sourceFrameCount, seedMask: authoredMask,
    softness: 0.15,
  });
  return result.image;
}, {context});
// Dispose effects in the existing Stage lifecycle.
```

`project.tsx` and `stage.ts` are editable real TSX fixtures. Generate model files
explicitly with `intake.mjs`, `export-model.py`, then `fixture.mjs`; no render-time
network, Python, pickle loading or model code execution is added. Export requires
local reviewed Torch/Transformers/safetensors/ONNX tools. The test photograph is
private QA input with separate inherited provenance; it is not shipped as an
effect/module asset. Main owns immutable R1 identity, public SDK names and locks.

## Image, memory and time

- Source frames are explicit integer indices supplied by the caller. The existing
  Stage frame/time contract stays unchanged. No wall-clock progression, implicit
  source evaluation or interpolation across a missing observation occurs.
- Seven learned spatial context slots and sixteen object pointers are the trained
  model's context capacities. Slot zero permanently retains the authored anchor.
  Six spatial slots and fifteen pointer slots rotate. Spatial temporal embeddings
  use actual source-frame differences; spatial observations older than six frames
  are excluded except for the anchor. Empty slots are masked from Softmax, rather
  than treated as observed zero images. Pointer ages use the model's 16-frame scale.
- An observed occluded frame is processed by the model and receives its learned
  no-object pointer/spatial embedding. A missing observation skips inference and
  does not overwrite memory. These cases are deliberately distinct.
- Every request currently replays from its authored anchor using transient GPU
  storage within that one existing frame transaction. JS retains only loop/slot
  metadata. No GPU state is copied into JS, and this adapter does not claim
  incremental persistent inference checkpoints. `maxReplayFrames` is an explicit,
  adjustable caller work budget. Exceeding it rejects, never truncates output.
- Analysis explicitly converts to clipped SDR sRGB, square-resizes to 1024 and
  applies the original ImageNet normalization. This is model input, not an HDR
  intermediate. Mask application reads the original signed scene-linear image,
  preserves its color identity/PM Alpha and publishes the requested F16/F32.
- This profile retains F32 learned memory; it does not silently reproduce the
  upstream optional BF16 storage compression. Weights and per-step order are
  preserved. Stability selection uses delta 0.05 / threshold 0.98; token zero
  still drives the pointer even when another mask wins the stability fallback.

## Optional output reuse and same-frame segmentation

The frozen Core ba2b2d6 was synchronized by Main under fresh human authorization
at integration commit 8a190daa. This adapter queries the actual owner's
`nativeInference` capability. When exact preallocated outputs are supported, it
allocates one vision-output set and one seed/tracking-output set per recipe and
reuses them for every observed sample. The validated trained profile has equal
seed/tracking output shapes. Inputs and outputs remain distinct, writable,
owner-local F32 buffers under the existing inference contract. Inspection
consumers that need a historical snapshot must clone the supplied buffer before
it is overwritten; the fixture does this explicitly on GPU.

If `imageContinuation:'same-frame-prefix-v1'` is advertised, `segmentFrames`
defaults to eight **observed** frames. Zero disables cuts; a positive value
requests the explicit submission interval. The last observed step is completed
before each cut; a missing sample does not advance the interval or modify a bank.
Each cut awaits the existing `flushState` and checks cancellation before/after.
Source images, transient buffers, exact model identity and original inference
order remain in the same authored-frame transaction. No visible frame is emitted
by a cut. No new state clock, persistent buffer or replay checkpoint is created.
Owners lacking these optional capabilities retain the earlier allocation/no-cut
behavior when the option is omitted; requesting cuts without the matching Core
fails with `E_VIDEO_ROTO_CONTINUATION`.

Temporal/projection constants are immutable initialization buffers, not changing
per-frame seeds. The long photographic QA entry is `project-long.tsx`: run the
explicit offline `prepare-long-fixture.ts` phase to derive a private associated
linear F32 asset with the **exact same** existing ICC/colour/surface admission
math. It imports that declared file once as an initialization read-only raw
buffer, then uses the ordinary Pixel ABI2 to generate the source image on GPU.
The declared source length, build content integrity, lease and budgets are still
enforced. This is an existing supported resource path, not a new import API or
hidden runtime decode/fallback. The photographic derivation is not distributed.

This QA isolation is deliberate: the retained original `project.tsx` transient
image import reproduces a changing input image on repeated requests in this Core
baseline, before the segmentation effect runs. Its source/feature hash diagnostic
is retained and sent to the Core owner. The adapter does not claim to repair that
general engine defect. The alternate entry's short outputs must exactly match
the old qualified photographic output, as well as repeat correctly, before its
long-model comparison can be accepted. Caller-provided GPU images must themselves
have deterministic source semantics; this library never replaces their content.

This is **not constant-memory video streaming**. The initial same-frame prefix
retains image/data declarations until frame completion; output reuse bounds the
large inference destination set, while source/view and inspection storage still
grow with observed preroll. Caller work and byte budgets must cover that request.
The existing failed-Stage latch and transaction rollback remain authoritative;
reopen a Renderer after an accepted segmented frame fails. An aborted request
does not rewind the stateless provider or resubmit accepted work. Cross-frame
binary Resource seed identity remains a separate Core limitation: this adapter
uses within-frame replay, never claims the prefix repairs cross-frame resources.

All production tensors remain in the existing GPU owner. ORT GPU interop still
uses the existing same-adapter auxiliary-device copies/fences: resident does not
mean zero-copy. Device/provider availability does not qualify this model on that
provider. There is no CPU or software pixel fallback.

`NUMERICS.json` declares gates before GPU checks. `reference.py` is offline QA:
it compares against original, unmodified, **unpadded** Torch memory attention and
decoder with actual learned memory. It is never imported by a Stage. Verification
must distinguish short-chain model correctness, long-sequence/occlusion quality,
media output, cancellation and installed-package coverage.

## Reproduce the qualified private checkpoint

Use new output directories for changed derivations; never overwrite published
models or modify a resource/SDK lock to admit different bytes.

```powershell
node modules/native-effects/video-roto/intake.mjs
# Explicit offline tools: Torch 2.14.1+cu132, Transformers 5.6.2,
# safetensors, NumPy, ONNX 1.20.1 and ml_dtypes 0.5.4 in this checkpoint.
python modules/native-effects/video-roto/export-model.py --source .frameweave/source-intake/sam2-memory --output .frameweave/roto-models/my-raw
python modules/native-effects/video-roto/static-shapes.py --source .frameweave/roto-models/my-raw --output .frameweave/roto-models/my-static
python modules/native-effects/video-roto/collapse-reshapes.py --source .frameweave/roto-models/my-static --output .frameweave/roto-models/my-ready
node modules/native-effects/video-roto/fixture.mjs .frameweave/roto-models/my-ready
```

The two offline standard-ONNX rewrites fold small static shape expressions and
collapse adjacent reshapes with nonzero constant targets. They preserve element
order and learned values. These resolve the reproduced ORT reshape optimizer
failure; no global optimization/security flag is changed. `optimize.mjs` is an
optional CPU preparation diagnostic, not the Stage's execution backend.

Configure the existing worktree-local Native, SpiderMonkey, media Python and
reviewed DirectML runtime paths (see the raw campaign commands/environment), then
use `check.mjs` for the cumulative verification ledger. Never reset its budget to
hide failures. `project-synthetic.tsx` contains no photograph Resource and is the
redistributable visual fixture. Photo-based output files stay local because the
photo license is unconfirmed; their hashes, numeric results and paths are kept.

The original round-4 evidence qualifies short replay, including 21 source frames,
pointer/spatial rotation, occlusion/reacquisition, missing observations and real
media. Its original 50-frame `E_NATIVE_PROCESS: write EOF` failure is retained;
the cause was not diagnosed and is not retroactively relabeled as a particular
guard. The new qualification is recorded separately by `validate-long.mjs` in
one cumulative campaign, including setup and failures, and is frozen under
`docs/native-video-roto-long-evidence`. `verify-long.ts` tests sample50 (51 actual
observations), backward/repeated requests, exact existing short-replay hashes and
segmented/uncut parity. `reference-long.py` removes invalid padded tokens from the
actual long-replay input banks and checks the original unmodified Torch attention,
decoder, score, next memory and pointer at the predeclared gates. The offline QA
reader does not execute in a Stage or count as a production CPU fallback.

`verify-long-failures.ts` requests a real Node-side abort after an accepted prefix
and an authored source exception after eight submitted observations; it records
the original errors, rollback/fail-latch metadata and process closure. These
checks do not promise interrupting an already accepted in-flight provider call.
Synthetic procedural media is redistributable; photographic outputs stay local.
Neither this bounded qualification nor provider availability establishes whole-film
quality, arbitrary subjects, incremental persistent replay, other GPUs/providers,
public SDK/R1/portable integration or total AE parity.
