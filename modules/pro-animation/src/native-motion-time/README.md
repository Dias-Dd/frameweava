# Native motion and time effects

`createNativeMotionTimeEffects(init)` uses the existing native GPU owner, Compute
ABI and Pixel ABI2. There is no CPU image fallback, extra Renderer, timeline,
schema or backend selection. CPU code prepares control parameters; every field
and image operation executes on the GPU. Returned capabilities belong to the
current recording epoch, remain provisional until its existing frame ticket
completes, and must be released by their caller.

The development entry is `native-motion-time/index.ts`. Main owns the eventual
public `pro-animation` export/version/SDK pin. Actual private R1 installation and
named import are covered by `validation/check-motion-time-package.ts`; the
`test.pa3-motion-time` identity is a test fixture and must not be published.

```ts
// Inside the existing defineNativeStage initializer:
const fx = createNativeMotionTimeEffects(init);
// In renderAt(context), same-size scene-linear professional images:
const flow = await fx.estimateFlow(first, second, {
  spacing: 8, window: 8, radius: 4,
  fromTime: context.time, toTime: context.time + 1 / 24,
});
try {
  return await fx.interpolateFrames(first, second, flow, {fraction: .5});
} finally {
  await init.gpu.releaseBuffer(flow);
}
```

The editable complete chain is `validation/motion-time-scene/project.tsx` and
`half.tsx`: native procedural footage → optical flow/field controls → compensated
interpolation/blur/time displacement → existing Glow → Layer → PNG/EXR/MP4.

## Operations

All fields below are the existing `GpuDataBuffer`/`GpuFieldDescriptor`, not new
document data. Motion is `(dx,dy)` in **source pixels, first frame to second
frame**, at tile centres `(column+.5,row+.5)*spacing`. Y increases downwards.
Metadata records source dimensions, spacing and optional source times in seconds.
Source times are not inferred from pixels. Fields with different grids or time
identities cannot be combined implicitly.

| Function | Parameters after the inputs | Result/meaning |
| --- | --- | --- |
| `estimateFlow(first,second,options?)` | spacing=8, window=spacing, radius=4; optional levels/median/source times/signal | Actual hierarchical block-matching field |
| `constantFlow([dx,dy],options?)` | spacing=1; optional source times | GPU-generated uniform displacement |
| `scaleFlow(flow,amount)` | finite scalar | Multiply displacement |
| `addFlows(a,b)` | same grid/interval | Pointwise addition |
| `mixFlows(a,b,mix)` | mix in [0,1] | Field interpolation |
| `limitFlow(flow,maximum)` | nonnegative pixels | Limit vector length |
| `rotateFlow(flow,radians)` | finite angle | Rotate displacement |
| `normalizeFlow(flow,length=1)` | nonnegative pixels | Set nonzero vector length; zero stays zero |
| `offsetFlow(flow,[dx,dy])` | source pixels | Add a displacement bias |
| `composeFlows(a,b)` | same grid/interval | `a(p)+b(p+a(p))`, with clamped field sampling |
| `medianFlow(flow)` | — | Original 3×3 component median |
| `smoothFlow(flow)` | — | Clamped 3×3 vector box smoothing |
| `resampleFlow(flow,spacing)` | positive integer pixels | Resample grid at tile centres; source dimensions unchanged |
| `flowMagnitude(flow)` | — | Scalar field, pixels |
| `flowAngle(flow)` | — | Scalar field, radians |
| `flowDivergence(flow)` | — | Central finite differences, dimensionless |
| `flowCurl(flow)` | — | 2D scalar curl, dimensionless |
| `warpFrame(image,flow,options?,context?)` | amount=1, boundary=clamp, format | Inverse sample at `p+amount*flow(p)` |
| `interpolateFrames(a,b,flow,options?,context?)` | fraction=.5, boundary/format/signal | Forward A/backward B warp, compensated PM interpolation |
| `motionVectorBlur(image,flow,options?,context?)` | samples=16, angleDegrees=180, phaseDegrees=-angle/2 | Streamed warped samples through the existing compensated reducer |
| `pixelMotionBlur(sourceAt,options,context)` | blur options plus flow estimator options | Estimate neighbouring half-frame motion and blur the actual central source |
| `timeWarp(sourceAt,options,context)` | time Signal, fps/origin, flow options | Existing frame plan selects neighbours; optical flow builds the intermediate |
| `timeDisplacement(sourceAt,offsets,options,context)` | startOffset, endOffset, step; linear/nearest; transparent/clamp | GPU per-pixel temporal sampling, one source streamed at a time |

These are 23 substantive operations, not 23 AE effects or a coverage percentage.
`options.format` selects RGBA16F/32F, defaults to the source format, and is the
final logical publication. Images stay scene-linear in their actual shared colour
encoding. Negative/HDR RGB is retained; no SDR clipping is introduced. Straight
inputs are explicitly associated. PM zero-Alpha emission is retained; hidden
Straight RGB at zero Alpha becomes zero. The actual Half source quantization is
preserved before estimation/sampling. EXR outputs use the existing F32 compositor
and FLOAT channels; they are not advertised as HALF-channel encoded files.

`sourceAt` has the existing `NativeTimeSource` signature. It transfers a fresh,
same-owner image per call; these high-level functions release it. `timeWarp` and
time displacement reuse local retiming; pixel-motion blur uses the existing
shutter affine subframe context. `motionVectorBlur` integrates displacement over
the **provided motion-field interval**, so 360 degrees means one such interval.
It is not a claim of actual source recomputation at every warped point. For real
source shutter recomputation use the existing managed/native time interface.

The displacement map is an existing same-size F32 scalar field, space
`image/pixel-centres`, units `seconds`; values are offsets relative to the
enclosing local time. Explicit start/end offsets bound the requested source
window. The last gathered source is the first grid sample covering endOffset.
GPU fields remain F32; source requests use the existing Float64 clock. Clamp or
transparent behavior is explicit, including Float32 map values just outside the
declared range. No CPU scan/readback or guessed min/max is used to pick the window.
Hi/lo buffers retain the sum until a single final F16/F32 publication.

## Boundaries and verification

EffectCraft `861c51f8187bf56efc77cc7b60fc4a513d2b7198` supplies the
audited block matcher and flow warp algorithms (MIT option). Exact original Rust
and WGSL, full licenses, source hashes and adaptations are recorded in
`provenance/native-motion-time` and `vendor/effectcraft/time-motion`. The Rust
reference is only a test oracle; production flow estimation is native GPU Compute.
Existing Frameweave guarded Pair arithmetic/sampler and temporal reducer are reused.

This is classical brightness/Alpha-based block matching, with subpixel fitting;
it does not infer semantic objects, depth or reliable disoccluded content. Scene
cuts, repeated/flat texture and occlusions can produce incorrect vectors. It is
not a proprietary AE algorithm/parameter/pixel-equivalence certificate. The data
space is F32, not an all-representable-F32 error proof for SAD overflow. Input
window/spacing must fit actual image dimensions. Pyramid depth follows the image;
there is no inherited four-level or permanent sample-count cap. Existing device
storage/addressing and owner command budgets remain in force, with explicit
admission failure; automatic cross-submission tiling/reduction is not added.

Cancellation uses an actual host AbortSignal where available; errors propagate.
In SpiderMonkey, Core opaque cancellation belongs to the enclosing Core window,
not these legacy signal options. Basic parameter errors reuse `E_PA_NATIVE_TIME`;
motion-space errors use `E_PA_MOTION_TIME`; device/budget errors have their own
EngineError codes. No source, field or image becomes persisted Analysis data
without the existing explicit exporter/Artifact flow.

Reproduction, within this worktree and its own local dependencies/cache:

```powershell
node modules/pro-animation/validation/run-motion-time.mjs types l0 oracle stage package alpha
```

The runner appends failures, compilation, installation and execution to one
strictly <420s campaign; do not erase its log to reset the budget. Original failed
attempts are retained. L3 formal package release/six exports are Main-owned;
macOS/Linux/other GPUs/4K/long-video operation is not qualified by this checkpoint.
