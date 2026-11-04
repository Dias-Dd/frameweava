# Optional Stage-local GPU effect chain (scheme B)

## Professional float compositor extension

`createProfessionalCompositor` from this same `index.ts` accepts the existing
`compositeMedia` input shape: explicit scene-linear working color, evaluated
LayerSpecs, Surface v2 inputs, logical sizes, target dimensions and frame.
Call it from an existing native Stage lifecycle, then dispose it in that Stage's
dispose method. Inputs must remain stable until the returned promise settles.

```ts
const compositor=await createProfessionalCompositor({
  width:1920,height:1080,backend:'auto',
});
const surface=await compositor.composite(evaluatedComposition);
await compositor.dispose();
```

The read-only, enumerable stats().precisionProfile is compensated-f32-v1 for
this shipped compositor implementation (also on CPU fallback/after disposal).
It is not a GPU availability, execution, data-domain, trust or fallback grant.
Check availableBackend/backend separately and retain every existing precision
admission error. Older copies without this field must be treated as unsupported
by facades that require this implementation; do not infer it from engineVersion
or a CPU canary. The marker does not change stats version 1 or shader behavior.

RGBA16F/32F input is validated/unpacked and color-converted on CPU, then GPU
F32 buffers retain extended RGB through bilinear sampling, four blends, masks
and isolated groups. The result is an owned CPU Surface, not a GPU texture or
SDR Canvas. Auto falls back to the existing CPU compositor for unavailable
WebGPU/device limits/budget; strict webgpu errors. Device loss requires a new
instance. No device/texture crosses a Stage. 4K requires explicit
`maxPixels:3840*2160`; buffer/device limits still apply. Readback and allocation
costs are measured, not hidden as Shader FPS. This extension does not change
the older RGBA8 effect-chain behavior described below.

See [PME performance results and boundaries](../../docs/PME_PERFORMANCE.md) and
the compiled real examples in `validation/professional-stage.ts` and
`validation/professional-benchmark.ts`. Runtime pin review remains Main's
responsibility after integration; do not silently regenerate project locks.

This opt-in helper implements one serial image chain inside one native Web Stage. It is not a new P4 port, GPU Host, cross-Stage texture protocol or general GPU platform. Existing P4 plugins and native React/Three/Pixi/shaders are unchanged. No new npm dependency or SDK fingerprint refresh is required.

## Editable entry

See [`examples/gpu-effects/project.tsx`](../../examples/gpu-effects/project.tsx) and its native [`stage.ts`](../../examples/gpu-effects/stage.ts). Import the helper by ordinary project-relative TypeScript path:

```ts
import {createGpuEffectChain} from '../../modules/gpu-effects/index.ts';
const chain = await createGpuEffectChain({
  width: 640, height: 360, backend: 'auto',
  effects: [
    {kind: 'color', saturation: 1.1, gain: [1.08, .96, 1.02]},
    {kind: 'blur', radius: 1},
    {kind: 'glow', threshold: .35, radius: 1, intensity: .7},
  ],
});
// In the existing Stage renderAt(context), after drawing the source:
const output = await chain.render(inputCanvas, context);
container.append(output); // Append once; style to the Stage's logical dimensions.
// In the existing Stage dispose():
await chain.dispose();
```

`effects` accepts an array or `(context: FrameContext) => array`. Numeric parameters accept the existing engine keyframes, expressions and springs. Evaluation uses the supplied FrameContext, including remapped/fractional Stage time. A callback is native authored code and must obey the same deterministic-time rule as any native Stage. No wall clock drives pixels.

| Effect | Defaults | Accepted range / semantics | Passes |
| --- | --- | --- | ---: |
| color | saturation 1.1; gain [1.08, .96, 1.02] | saturation and each gain 0..4 | 1 |
| blur | radius 1 | integer 0..32 **tap spacing in physical pixels**, not Gaussian sigma; 5 taps at -2r,-r,0,r,2r, weights [1,4,6,4,1]/16; horizontal then vertical | 2 |
| glow | threshold .35, radius 1, intensity .7 | threshold 0..1 (1 extracts nothing); radius as above; intensity 0..4 | 4 |

Unknown parameters, nonfinite values, out-of-range parameters and fractional blur spacing are errors, not silent clamps. Zero effects is an explicit input-to-output conversion. Maximum 12 effects and 4 megapixels; actual device texture dimension limits also apply. The validation control composes color / blur / glow, repeated, for 1 / 3 / 6 effects.

## Image and ownership contract

- Input: borrowed HTMLCanvasElement or ImageBitmap, exact physical dimensions, origin-clean, valid rendering context, sRGB content. Input must be ready and stable until `render()` resolves. Missing input or a closed bitmap is an error; a deliberately cleared Canvas2D is a valid transparent image. The helper does not close, resize, draw into or take ownership of caller input. Browser upload/readback rounding is still observable.
- ImageBitmap alpha metadata cannot be queried and WebGL ignores normal unpack flags for it. The helper normalizes it at the **input boundary** through an owned sRGB Canvas2D. This extra draw is counted as `bitmapNormalizations`; no bitmap is closed by the helper.
- One chain owns one device/context, pipeline/program caches, uniform buffers and texture pool. Do not share its private objects with other Stages. No texture handles are exposed by `index.ts`.
- Internal RGBA8 UNORM stores encoded sRGB RGB and **straight alpha** after each Pass, with 8-bit quantization. RGB color adjustment, luminance threshold, blur and glow combination operate in linear light. Blur accumulates linear RGB times alpha and alpha, then unpremultiplies and encodes. Zero-alpha RGB is canonicalized when writing. Glow adds energy and extends coverage; it is not HDR or a drop-in pixel replacement for `fw.glow`.
- Integer texel sampling clamps at image edges; no hidden rescale, interpolation or source downsampling. WebGL flips only the final presentation, keeping logical input/FBO rows top-down.
- Presentation multiplies encoded RGB by alpha once into a premultiplied sRGB GPU canvas, then draws **once** to an owned Canvas2D. Return value is that Canvas, borrowed until the next `render`, `resize` or `dispose`. Copy it if retaining a previous frame; do not resize or mutate it. Stage output remains the engine's existing PNG Surface/capture contract.
- No explicit CPU pixel readback occurs in the helper. Canvas imports/bridges may involve browser/driver copies; API counts are not proof of physical zero-copy. PNG/JPEG/compositor output remains unchanged.

## Ordering, completion and recovery

Each awaited `render()` serially encodes all Passes, submits one command buffer/flush and snapshots the final GPU canvas. It does not wait for general GPU idle. WebGPU uniform buffers are distinct for simultaneously encoded Passes; later-frame writes are ordered after prior submission. WebGL commands are ordered in the same context. Reusing a texture after its **last encoded read** is safe under this serial schedule and does not mean the GPU has finished. A Pass may never sample its own output attachment.

`await chain.complete()` waits WebGPU `onSubmittedWorkDone` or WebGL2 `fenceSync` / `clientWaitSync`, yielding MessageChannel tasks. It is an explicit diagnostic/benchmark barrier, not pure GPU busy time and not a barrier for all Canvas/compositor work. No `finish()` or logical timer is used.

`await chain.resize(w,h)` validates first, waits prior queue work, destroys old size-dependent textures/bind groups and resizes the canvases. Programs and uniform buffers remain reusable. `dispose()` is idempotent, waits submitted work when healthy, releases owned resources and removes/zeros the output. A failed/lost device is cleaned up without pretending its old work completed normally. Concurrent render/complete/resize/dispose calls are rejected with `E_GPU_BUSY`; await each operation. Do not mutate the input or output during an operation.

Auto initialization actually requests an adapter, device and context, and compiles pipelines. Null/failed WebGPU initialization falls back to a **fresh WebGL2 canvas/context**, including SwiftShader under the engine's existing default export policy. `stats().fallbackReasons` explains why. `backend:'webgpu'` is strict and errors when unavailable; `'webgl2'` explicitly chooses the fallback implementation. Neither available => `E_GPU_UNAVAILABLE`.

Runtime execution errors, GPU uncaptured errors and real device/context loss stop that instance. There is no silent mid-frame backend swap or time advancement. Dispose it and create a new chain, then replay the desired FrameContext. Parameter/input validation errors before encoding leave the instance usable. Lost WebGL contexts are not automatically restored.

## Commands (worktree root, PowerShell)

```powershell
$env:FRAMEWEAVE_HOME=Join-Path (Get-Location) '.frameweave/agent-4-home'
npm run typecheck
node node_modules/typescript/bin/tsc --noEmit -p modules/gpu-effects/tsconfig.json
node --import tsx --test tests/gpu-effects.test.ts
node --import tsx src/cli.ts frame examples/gpu-effects/project.tsx --frame 12 --output artifacts/gpu-effects/frame-12.png
node --import tsx src/cli.ts storyboard examples/gpu-effects/project.tsx --frames 0,12,23 --output artifacts/gpu-effects/example-storyboard.png
node --import tsx src/cli.ts examples/gpu-effects/project.tsx --no-open --width 640
# Existing accurate/software preview policy, also exercises the WebGL2 fallback:
node --import tsx src/cli.ts examples/gpu-effects/project.tsx --no-open --width 640 --accurate
node --import tsx src/cli.ts render examples/gpu-effects/project.tsx --output artifacts/gpu-effects/example.mp4
node --import tsx scripts/verify-gpu-effects.mjs smoke
node --import tsx scripts/verify-gpu-effects.mjs correctness
node --import tsx scripts/verify-gpu-effects.mjs matrix
node --import tsx scripts/verify-gpu-effects.mjs media
```

The matrix requires an actual WebGPU adapter for its hardware-policy rows and a real WebGL2 context for default-policy rows. Hardware browser automated tests explicitly skip (with reason) on a machine without an adapter; never count that as a hardware pass. This worktree's verification records must be consulted for actual results. Do not run other GPU work concurrently with performance measurement.

`validation/comparison-stage.ts` is a test-only public P4 control: the same kernels/parameters/device cache, but Canvas ports and actual `createEffectRuntime` snapshots between every effect. It is not the built-in Glow performance. The single-Stage path uses `createGpuEffectChain` itself. `validation/reference.ts` is an independent scalar oracle. Browser tests separately probe actual input-upload bytes, so Canvas unpremultiplication is not confused with the algorithm. Probe/readback work is excluded from timings.

Raw results, plan, cold/warm samples, full PNG samples, counters, cleanup evidence and images go to `artifacts/gpu-effects/`. P95 is nearest rank; 8/12-sample P95 is the maximum and should not support broad tail-latency claims. The real browser wall clock uses `Performance.prototype.now.call(performance)`; render time still comes only from FrameContext. Zero measured submission time can mean clock quantization. Pure GPU execution time, CPU thread busy time, actual peak GPU memory and physical copy counts are **unknown**. No timestamp query numbers are presented as precise execution costs.

## Current limits

Only serial color/blur/glow chains are supported. No public custom-Pass ABI, HDR, float intermediates, Display-P3 validation, arbitrary DAG, temporal history, cross-device or cross-Stage GPU textures, automatic device recovery, worker OffscreenCanvas or universal pixel equivalence to existing P4 pipelines. Native custom shaders remain available through existing native programming. Transparent edges can differ from chains with repeated Canvas premultiplication; inspect RGBA, alpha and composites on black/white separately. H.264 and opaque JPEG previews are lossy and are compared separately from lossless PNG.
