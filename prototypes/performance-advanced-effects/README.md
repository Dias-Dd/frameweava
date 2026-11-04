# Advanced effects performance workload /1

Uses actual spatial-vfx 0.1.2, spatial-compute 0.1.2 and the integrated
gpu-resident-effects functions. No copied/reimplemented effect algorithms.
The supplied Stage entries import reviewed workspace source directly; this is
an engine/source performance suite, not an installed P4-R1 acceptance test.

Two workloads:

- 12-function image chain: smokePlume (32 ray steps, 3 octaves), waterCaustics,
  float over, heightFog, gravitationalLensing, brightnessContrast, colorBalance,
  tint, animated filmGrain, vignette, pixelate, sobelEdges.
- Typed 3D cellular field + vortex + advection + 64-step volume rendering.
  Grid 32³. This uses actual compute/data resources, not RGBA pretending to be
  physical fields. Native pixel-v1 cannot execute this workload yet.

All intermediates are F32 scene-linear Rec.709 with PM Alpha. No automatic
resolution/quality reduction. Browser PNG is an explicit SDR/clipped projection.
540p, 1080p and 4K are separate workloads, never compared as equal quality.

Preparation creates real TSX and compiles it, with no browser/GPU:

    node --import tsx prototypes/performance-advanced-effects/bench.ts --prepare
    node node_modules/typescript/bin/tsc -p prototypes/performance-advanced-effects/tsconfig.json --noEmit

After reserving an uncontended GPU window:

    powershell -NoProfile -ExecutionPolicy Bypass -File prototypes/performance-advanced-effects/supervise.ps1 -WindowId THE_COORDINATED_WINDOW

The supervisor assigns suspended Node to a Windows kill-on-close Job Object
before resuming it. It covers the owned process tree, uses a 165-second deadline,
drains remaining children and records active process counts. It does not kill
unrelated browser processes. A GPU-free descendant/timeout self-test is available:

    powershell -NoProfile -ExecutionPolicy Bypass -File prototypes/performance-advanced-effects/supervise.ps1 -SelfTest

Windows API source: https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects

Optional --case=reference/mix-540p/mix-1080p/mix-4k/field-540p/field-1080p
selects a single case. All output stays in artifacts/performance-advanced-effects/v1;
test FRAMEWEAVE_HOME is worktree-local .frameweave/ap.

The Web column measures the real TSX/Renderer path through final PNG. The
separate Web compute column includes JS recording and existing publication
validation/completion, with final full-pixel readback measured separately.
GPU queries are disabled.

RecipeRecorder is ONLY a compiler adapter to collect the same effect functions'
actual WGSL and uniforms. It never simulates pixels or reports a GPU time.
Its tape executes on the actual Rust/wgpu backend. Native timings include Node
recipe recording, pipe/parameter submission, GPU execution and completion
delivery, but NOT UI presentation, file encoding or the Renderer evaluator.
Do not present native GPU-done latency as full visible-preview latency or divide
the Web PNG time by it to claim an end-to-end speedup.

Native sequential and default-two-slot pipelined runs use the same uncached
frame sequence. Pipeline throughput is measured from first call to all
completions, not 1000/median and not from a repeated-frame cache. Initialization
is separate; compare init+first call for cold cost. Median is conventional;
P95 is nearest rank, with small-tail-sample warning below 20 samples.

The small reference case explicitly reads native diagnostic output and compares
it against actual Web GPU output, outside performance cohorts, with fixed
absolute 1e-4 + relative 2e-4 tolerance per component. Production native runs use
the non-diagnostics executable and do no pixel/hash/numerical readback.
Numerical checking and file/source identity checks in this harness are outside
timed frame regions. Existing Web integrity/permissions remain unchanged.
Prepared data pins actual compiled Web bundle bytes and the native plan/WGSL.
Both native executables are verified against their source/features/build receipt
once before their cohort, outside frame timing. A window ID is mandatory.

Native currently retains every logical image in both frame slots; that memory
cost is disclosed. The Web recipe releases dead intermediates through the
existing owner's pool. Neither path changes algorithm quality to fit budgets.
Physical VRAM peak is unknown. Correctness, missing features, failures and
ineligible compute/native cases are explicit in JSON rather than skipped.

This is not a claim that all effects, stateful physics/Puppet, native video
decode/encode or a 120 Hz display have been validated.

First measured cohort: driver 7d0fc007. The prototype's inner performance.now
timers followed the engine's deterministic clock and returned invalid zero
durations. Do not use those timers or webWarmComputeAndValidation from the raw
report as measured GPU work. summarize.mjs explicitly excludes them; real Node
request clocks and engine wallNow spans remain valid. No GPU rerun was made to
repair this reporting limitation. The generic preview-ocio-and-png span contains
plain color conversion/PNG here: this workload does not invoke OCIO.
