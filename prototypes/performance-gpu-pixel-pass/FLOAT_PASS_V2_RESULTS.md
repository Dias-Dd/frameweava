# Closed float shader v2: Gaussian and Glow numeric handoff

2026-10-30. Production scope is only
`modules/gpu-effects/float-pass-shaders.ts`; owner/helper/publication/preflight
integration belongs to Root. No index/core/float-passes edit, Git or Goal action
was performed by this shader task.

Module SHA-256:
`929e2c17817220e8b3f758b8e66a0aab86cec6d4cd00ee4c67276d2dd20892ee`.
Exported WGSL string SHA-256:
`a7502e8c7c36980b1b321d5dd0d97829ac66a8446375b10eafa93e5df18ba2dd`.
Export: `floatPassShader`; entry: `main`.

Bindings are source vec4f storage0, secondary vec4f storage1, destination vec4f
storage2, F64-weight hi/lo vec2f storage3,128-byte Params uniform4. Params byte
offsets: dims0, mode16, valuesHi32, valuesLo48, lumaHi64, lumaLo80, padding96/112.
mode.y0=Gaussian,1=Glow extraction,2=Glow combine. Gaussian border0 is transparent,
1 is clamp. Unused secondary/weight bindings still need valid minimum buffer
sizes (vec4f16 / vec2f8). No native handle or arbitrary source is exported.

The arithmetic is compensated double-float using FP32 high/low pairs, explicit
fma product residuals, compensated sums and split f64 CPU constants. It is not
native hardware F64 or a promise of global bitwise equality. Each logical shader
pass stores one F32 vec4, preserving CPU extraction/axis/combine storage points.
Gaussian has no coverage/RGB clamp, residual-weight adjustment or border tap
renormalization. Glow only clamps its explicitly defined bloom coverage factor.

## Gaussian

`compile-41USU6/result.json` under
`artifacts/performance-gpu-pixel-pass/gaussian-v2/` records actual strict WebGPU
compilation/pipeline success, no messages, ordinary opaque Stage origin null,
existing ChainCore owner, NVIDIA/Blackwell non-fallback adapter.

`gaussian-v2/numeric-miagBm/results.json` uses the original156 frozen dataset
manifest unchanged (`de131961…ff96f`) and original496b875 CPU reference arrays.
New v2/current-SDK execution is labelled separately from the old936 run; no v1
guard, source, protocol or threshold was modified.

- 132 supported cases: all normal108 and signed65504 stress24.
- 24 original subnormal/above65504-domain cases are explicitly preflight unsupported,
  committed:false, and were not dispatched. This is not a precision pass claim.
- 132/132 pass actual CPU32 component error3e-6*max(1,abs(expected)). Worst scaled
  error9.9194e-12. No nonfinite readback, invalid alpha or publication exception.
- The v1 opaque/clamp/sigma3 alpha overshoot is gone; negative65504 cancellation
  meets CPU parity without clipping or relaxed thresholds.
- Original direct-F64/publication gates pass130/132. The two failures are
  case122/126, exactly the original CPU F32-axis-vs-direct2D stress discrepancy:
  GPU raw vs CPU32 maxAbs0 for both; direct error5.19876e-6. The frozen stress
  criterion remains failed, not silently redefined as a GPU-specific error.

Sigma0 identity optimization and any supported-domain expansion remain Root's
preflight/owner decisions. CPU Glow intensity0 has an early prepare/publish return;
owner identity handling should retain that behavior rather than advertise
bit-exact identity from an arithmetic threshold/blur/combine roundtrip.
Radius64 here retains the original1x1 fixture coverage;
this small run is not an arbitrary-size/radius64 stress certification.

## Glow

`artifacts/performance-gpu-pixel-pass/glow-v2/numeric-p7rfKs/` contains fixed CPU
reference cases frozen before browser execution,96 actual GPU results and
`bit-diagnostics.json`. Each executes threshold, horizontal Gaussian, vertical
Gaussian, combine with the same shader and owner. Inputs come from the original
normal/65504 fixtures, three linear work spaces, three alpha modes and two formats.
Configurations cover radius0/.7/3, threshold0/1/1024, intensity.5/2/100 and both
borders. CPU oracle is the unmodified frozen PA `glow`; luma coefficients use
its same PME matrix expression and are split into high/low uniforms.

- 96/96 pass CPU32 error3e-6*max(1,abs(expected)); worst error5.54246e-12.
- Zero alpha-range or finite failures. Gaussian/extraction boundaries stay F32.
- 12 original-format publications fail Half range in both CPU and GPU, preserving
  `E_MEDIA_RANGE` rather than clipping/falling back.
- 84 successful publications:81 have identical hashes. The other three are
  glow28 Half negative-zero sign, glow45 F32 residual1.30951e-16 and glow93 F32
  residual5.54246e-12. These are within the numeric gate, not bit-exact results.

All maps are copied then unmapped, operation buffers destroyed after queue
completion, and the existing owner/Renderer closed twice. Only small correctness
probes were run; no throughput,4K or performance claim is made. Parent owns final
public metadata, output errors, runtime capability/domain gate and integration
tests. Unsupported huge/subnormal input must not silently reach these shaders.
