# GPU Pixel Pass v1

The public `@frameweave/engine/web` export `createGpuEffectChain` now has
`tryProcessSurface`. It uses the **same** ChainCore device, exclusive execution
gate and disposal as the existing Canvas effects. Importing the API creates no
Canvas, browser, GPU adapter or device; calling the existing factory does.
No new Host, Stage DAG, GPU port, package registry or permission is introduced.

```ts
import {createGpuEffectChain, type ProfessionalSurface} from '@frameweave/engine/web';

const chain = await createGpuEffectChain({
  width: 1920, height: 1080, effects: [], backend: 'auto',
});
const result = await chain.tryProcessSurface(input, {
  kind: 'gaussian', radius: 1, boundary: 'transparent',
});
if (result.status === 'rendered') {
  output = result.surface;
} else {
  // The effect library calls its existing synchronous CPU reference here.
  // This branch guarantees commitState === 'none'. Do not catch arbitrary
  // exceptions and replay a submitted operation on CPU.
  output = cpuBlur(input, {radius: 1, boundary: 'transparent'});
}
await chain.dispose();
```

`input`, `output`, and `cpuBlur` above belong to the caller's Stage/library.
The helper itself never imports an optional effect library or invokes a caller
callback. Only an explicit `unsupported` result permits the adapter's fallback.
An existing WebGL2 owner returns unsupported instead of creating a second device.

## Closed resolved operators

- `gaussian`: physical-pixel sigma `radius` in [0,64], optional `boundary`
  `transparent` (default) or `clamp`. Two ordered axes; radius0 is identity after
  canonical input preparation. No edge renormalization or hidden RGB/alpha clamp.
- `glow`: same radius/boundary; `threshold` in [0,1e6], default1, `intensity`
  in [0,100], required. Original PA-1 luminance extraction, Gaussian, signed RGB
  energy addition and defined coverage saturation. Intensity0 is identity.

These parameters are already-resolved numbers. Use the existing animation/time
evaluator before the call; the helper creates no second animation system.
Displacement, arbitrary shaders and custom host callbacks are not v1 operators.

## Surface, numerical domain and publication

RGBA16F/32F Surface v2, any supported padded input stride, dimensions matching
the chain. `workingColor` defaults to the input encoding, and must explicitly be
scene-linear. Encoded inputs require an explicit linear workingColor. Existing
PME validates/unpacks and color-converts, premultiplies, and canonicalizes RGB
at alpha0. GPU storage is F32; f64 CPU-normalized weights/constants are split
into hi/lo and accumulated with compensated f32 arithmetic. No Canvas8 bridge.

Initial qualified GPU domain: canonical premultiplied RGB magnitude <=65504,
nonzero alpha >=2^-24, no nonzero RGB magnitude <2^-100. Outside this domain is
explicit unsupported **before any GPU write**, retaining full-domain CPU fallback.
Do not infer arbitrary F32-max/subnormal GPU support from the F32 storage format.
Straight/opaque output additionally requires `abs(pmRGB) <= 65504 * alpha` in
the prepared input. This bounds unassociated RGB: very low alpha combined with
unscaled large PM RGB can amplify a tiny valid PM error beyond the straight
error budget. Such inputs return unsupported; they are never clipped or changed.
Premultiplied output retains its original qualification range.

Output format defaults to input; alpha defaults to input (opaque -> premultiplied).
Options may request `format`, `alpha`, `workingColor`, `maxBufferBytes`. Output
is a fresh, tightly packed, validated value-owned Surface. Straight publication
unpremultiplies with the original zero-alpha rule. Requested Half overflow or
illegal opaque alpha remains an error, never silently clipped. Every logical
call publishes/quantizes independently; calls are not fused across Half or
straight-alpha boundaries.

## Ownership, limits and failure

`maxBufferBytes` defaults to512MiB, range1KiB..1GiB: a logical owner budget,
including all job buffers and a conservative existing-owner allocation estimate.
Device storage/buffer limits are checked before writes. Physical driver memory
is unknown. Each job frees all its buffers after queue completion/unmap; the
same device and compiled pipeline are reused. No borrowed GPU object is returned.

Rendered results include version1 stats: accepted calls, submissions, cumulative
created/destroyed buffers, current live bytes/buffers, logical peak and complete
accepted-call wall time (including input validation/preparation). This is not
a GPU timestamp, whole Renderer latency or final video FPS.

Concurrent render/resize/complete/dispose/float calls use the existing busy error.
Await the operation before disposal. Repeated dispose shares the existing gate.
After the first GPU write, errors are terminal for the float owner. Their original
code/message are retained; `details.floatPass` includes version1,
`commitState:'committed'`, and cleanup-complete stats. Recreate the owner after
failure; never replay the failed job on CPU. Existing Stage timeout, CSP, WASM,
P4-R1 resource and Session trust boundaries remain in force.

## Validation scope

Fixed PA-1 CPU source:496b875fa05445e69382f3e57637ade94ed3e27e. The isolated
Gaussian shader matches CPU32 within3e-6 for132 supported cases, including the
previous alpha/cancellation failures, without Gaussian clamping. Glow raw passes
96 CPU comparisons; expected Half overflow is an error on both paths. Two stress
direct-F64 gates also fail on the CPU baseline itself; no global F64-exact claim.
Comparisons are numerical, not bitwise: signed-zero normalization and tiny F32
tails can differ from CPU, including the arithmetic identity-kernel path.
Public Stage, lifecycle, performance and installed-consumer logs are delivered
with the checkpoint. These results do not certify every GPU/OS or a100ms complete
professional preview. CPU is retained solely as reference and necessary fallback.
