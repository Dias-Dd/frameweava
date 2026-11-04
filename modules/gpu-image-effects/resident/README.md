# Resident colour and keying chain

Seven real pixel algorithms on the existing public PixelScope: Levels, PCHIP
RGB Curves, Channel Mix, coverage-normalized Unsharp Mask, Chroma Key, Luma Key
and Despill. `example.tsx` is the complete editable R1/TSX scene. This directory
is an independent source candidate; Main owns formal package/version/exports.

The [Matte extension](MATTE.md) adds a separate complete cleanup chain and a
second explicit Surface input in the same owner. Its status/evidence is kept in
the `chain-matte` batch, separately from the frozen seven-effect colour batch.

```ts
const processor = createImageProcessor(init); // once in Stage create
const surface = await processor.process(input, async (image, fx) => {
  const keyed = await fx.chromaKey(image, {color:[0,1,0]});
  const clean = await fx.despill(keyed, {amount:.5});
  const graded = await fx.levels(clean, {gamma:[1.1,1,1]});
  return fx.unsharpMask(graded, {radius:2, amount:.6});
}, {context:ctx});
// During Stage dispose: await processor.dispose().
```

The callback's opaque handles are local to that invocation and are automatically
released. Do not retain or serialize them. One existing owner/scope is reused,
with one upload and one final readback per single-input recipe. Additional
declared inputs each require one `importImage` upload. Internal blur preparation
and axis work remain resident. Await each filter and each process invocation;
concurrent process requests reject with `E_GPU_IMAGE_BUSY`. Failed publications latch as
specified by the public scope. No CPU replay or software-adapter fallback.

Input must be explicit scene-linear RGBA16F/32F Surface v2. Parameters resolve
existing Signals in FrameContext, then quantize to finite normal F32 or zero.
Every filter publishes the chosen F16/F32 format on GPU; the following filter
sees that value. Default is input precision and native PM output. No RGB clipping
is implicit. Half overflow is an error. Working-space luma uses the existing
colour matrix. The scope's finite publication checks do not certify all F32
arithmetic; each kernel has targeted numerical tests and normal-value admission.

- Levels: per-channel input/output endpoints and positive gamma; signed power
  outside the endpoints preserves negative/HDR extension. `clampInput` is an
  explicit creative clipping option, default false.
- Curves: 2..32 sorted F32 knots/channel, shape-preserving PCHIP slopes, linear
  endpoint extrapolation. This is a static colour curve, not a new time system.
- Channel Mix: F32 3x3 matrix plus offset*Alpha in PM, compensated dot products.
- Unsharp: normalized covered-colour Gaussian, then compensated difference-add;
  original Alpha retained. Uncovered emission passes unchanged and does not guide
  the covered-colour blur. Radius is physical-pixel sigma 0..64. Gaussian helpers
  publish F32; the final result uses requested precision.
- Chroma Key: working-linear Cb/Cr distance from the key colour, smooth inner/outer
  thresholds; Luma Key retains above low/high thresholds. `invert` is explicit.
  Keys multiply PM RGB and Alpha together. Narrow ramps use compensated metrics;
  no hidden display-gamma/8-bit conversion is applied.
- Despill: subtract excess in the selected channel relative to max/average of the
  other two, with amount 0..1. Alpha unchanged, negative RGB retained.

Nonlinear covered-colour operations preserve zero-coverage emission rather than
inventing a straight colour there. Nonzero subnormal RGB, unrepresentable curve
tables or unsafe normalization fail explicitly. Output is native PM, with no
general straight-unassociation guarantee. Kernel overflow/NaN invalidates the
batch even if a later operation would mask it.

Current resource boundary is the public scope's device, per-buffer, 16MP and byte
budgets. There is no added whole-image 4MP/8K limit, implicit resize or CPU fallback.
Arbitrary recipe tiling is not claimed; neighborhood chains need declared halos.
The example demonstrates a complete chain, not a cross-platform or speed claim.

Source: Frameweave's compensated Pair/Gaussian arithmetic is reused; curve_exact
and basic spill math adapt EffectCraft ec7ced1f (MIT, included notice/license).
No external engine, GPU owner, Renderer or P4/TVG change is introduced.

Integration: R1 bindings must declare `gpu:"required"`, as the isolated fixture
does. Without that declaration, accurate rendering deliberately uses its
ordinary software policy and this GPU-only module fails. Do not change that
policy, force a browser flag or refresh an existing project lock to bypass it.
Formal module identity, immutable version and shared exports belong to Main.

Targeted reproduction (own worktree, Python/FFmpeg media tools configured):
`node scripts/check-resident-colour.mjs types unit gpu media`.
The runner appends raw command/exit/wall logs under
`artifacts/gpu-image-effects/chain-colour/commands.json`, enforcing the 600-second
cumulative check budget. `latest-l2.json` locates actual PNG, float EXR, HDR10 MP4
and all decoded clip frames. The independent F64 reference is acceptance-only.
One hardware environment is verified; other vendors/software, arbitrary image
tiling, advanced screen/key-cleaning and an all-F32-domain proof are not claimed.

## Formal R1 use

Install the reviewed `gpu-resident-effects@0.1.0` from the SDK local catalog with
`packages install gpu-resident-effects@0.1.0 --project <entry> --trust local:frameweave.gpu-images`.
Inside a Web Stage, import `processImage` and `imageStats` from `gpu-resident-effects`.
The existing `gpu-image-effects@0.5.0` Surface API remains a separate unchanged package.
Both are optional. A recipe uses one retained public PixelScope and invocation-local handles.

Managed recipes retain the existing default 512 MiB GPU byte budget. The 4,199,425-pixel
functional fixture explicitly creates a processor with a 1 GiB budget; it is not evidence
that the default managed recipe can execute the same workload. No budget or resolution
is silently raised or reduced. Other GPU vendors and generic recipe tiling remain unverified.
