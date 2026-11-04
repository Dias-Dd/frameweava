# Advanced Native keying and matte controls

Extension round **1/4** after `66de7947`. 21 concrete new methods, plus the
already qualified ProfessionalFilters and source-over in one ordinary Native
recipe. No new host, renderer, registry, TVG type, ABI or animation evaluator.
Main owns formal SDK/R1/catalog/package versions and pins.

```ts
import {createNativeProKeyEffects} from './keying-pro/index.ts';
const fx = createNativeProKeyEffects(init);
// Inside the existing Native Stage renderAt(context, inputs):
const result = await fx.processImage(inputs.image, async (image, f) => {
  return f.keyAdvanced(image, {
    color: [0, 1, 0], alphaBias: [1, 1, 1], gain: 1, balance: .5,
    black: .02, white: .98, rollback: .2,
    grow: -.2, softness: .4, blackRadius: .5, whiteRadius: .5,
    inside: holdoutMask, outside: garbageMask,
    screenReplace: 'soft-color', screenReplaceColor: [.5, .5, .5],
    foreground: {hue: 5, saturation: 1.05},
    edge: {exposure: -.1, saturation: .8}, edgeWidth: 3,
    background: inputs.background, view: 'composite',
  });
}, {context});
// Stage dispose: await fx.dispose()
```

Editable actual TSX: `../examples/keying-pro-chain.tsx`; every-method numeric
fixture: `keying-pro-numeric.tsx`. `types.ts` is the exact closed parameter
contract. Numeric leaves reuse existing Signals and FrameContext. Unknown keys,
wrong enums, nonfinite/range errors and foreign typed-field identities fail
with `E_NATIVE_KEY_PARAMETER`, including effect/path/unit. GPU admission must
be real hardware, never inferred merely from an `auto` choice.

| Method | Defined operation |
| --- | --- |
| screenMatte | Biased balanced color-difference screen selection, gain and optional Gaussian preblur; outputs coverage. |
| matteClipRollback | Black/white clipping, positive gamma, explicit interpolation back toward original edge detail. |
| matteTone | Three Bernstein tonal gains with a declared coverage midpoint. |
| matteGarbage | Inside holdout/outside garbage, alpha or working-luma components and inverses; source-alpha handling. |
| matteDespot | Black-hole closing followed by white-speck opening, with existing fractional square morphology. |
| keyUnmix | Physical associated foreground estimate: source minus declared screen contribution; no RGB clamp. |
| keyReplace | None/source/hard-color/luminance-modulated soft-color recovery when matte coverage changes. |
| keyBias | Luma-normalized diagonal color balance from an explicit positive bias. |
| spillBias | Biased dominant-channel excess removal, optionally conserving working luminance in non-screen channels. |
| foregroundGrade | Reused HDR hue plus signed lift/gamma/gain, saturation, contrast/pivot and exposure. |
| edgeGrade | Same controls blended only through an explicit edge-coverage mask, retaining source Alpha/emission. |
| keyStatus | Opaque black/white/red technical matte classification, explicit epsilon. |
| keyDifference | Signed associated difference diagnostic, coverage=max(input coverages). |
| hairMatte | Regularized RGB foreground/background plate projection; a supplied-color matting equation, not a neural model. |
| refineBand | Existing exact signed EDT, bounded inside/outside edge-band coverage. |
| temporalMatte | Explicit motion-compensated history weight with confidence, bounds and color-consistency rejection. |
| matteVectorBlur | Explicit motion field integration over a declared sample-interval shutter. |
| strokeTrimap | GPU capsule strokes; later strokes win; signed categorical labels -1 unknown/0 background/1 foreground. |
| randomWalkerMatte | Edge-weighted screened Dirichlet/Jacobi solve, hard seed constraints, explicit iterations and diagnostic result. |
| keyCrop | Independent color/clamped-edge/repeated-reflection/wrap per axis and explicit fill RGBA. |
| keyAdvanced | Ordered complete control chain, separate screen/inside replacement, color corrections, twelve technical/final views. |

## Alpha, HDR and data boundaries

All image results are PM, inherit input F16/F32 unless explicitly overridden,
and retain scene-linear color semantics. Multi-image colors are actually
converted by the existing working-color adapter. Negative/HDR RGB is not
clamped by the keyer. Matte coverage is deliberately bounded [0,1]. High-level
chains use declared F32 internal steps and one final inherited publication;
separately authored calls still retain their own Half publications/order.

`keyAdvanced.sourceAlpha` defaults to normal: the final foreground retains
original source coverage. Ignore deliberately normalizes available nonzero-Alpha
source color before keying; inside adds original coverage to the holdout.
PM Alpha0 emission is preserved by color operations. Hidden straight RGB at
Alpha0 is never invented as visible radiance. Final image metadata is PM;
this library does not masquerade unassociated RGB as a PM image. For explicit
non-color channel interchange, reuse the existing typed
`closure-filters.channelCombine({model:'rgb'})` / `channelDecode` route.

Replacement modes are defined equations, not a claim to reproduce a proprietary
Keylight binary. Hard/soft replacement adds selected color for increased
coverage and scales the previous foreground for decreased coverage. Soft color
matches source working luminance where the replacement luminance is nonzero.
None intentionally retains the supplied despilled RGB as coverage changes.
Color-difference alpha estimation assumes the selected screen/bias model;
ambiguous foreground/background colors require additional masks or segmentation.

Every image/field is owner-local. No raw handles enter JSON or persistent TVG.
`strokeTrimap` and solver outputs expire with their creating recipe. A previous
recipe result can feed another recipe in the same frame; do not keep image
handles across frames or arbitrarily dispose the engine scope. Errors,
cancellation and repeated dispose use existing processor/owner cleanup.

## Solver and temporal confidence

```ts
const result = await fx.processImage(image, async (image, f) => {
  const trimap = await f.strokeTrimap(image, [
    {points: [[10, 10], [10, 80]], radius: 2, label: 'background'},
    {points: [[60, 20], [60, 70]], radius: 2, label: 'foreground'},
  ]);
  const solve = await f.randomWalkerMatte(image, trimap, {
    iterations: 128, beta: 20, priorWeight: .05, prior: .5,
  });
  // Explicit GPU diagnostic output, available to existing Renderer data export.
  await init.gpu.publishBuffer('matte-quality', solve.diagnostics, {version: 1});
  return solve.image;
}, {context});
```

The result is **not just an image**: `MatteSolve` also contains a four-component
GPU field `[residual, valid-seeds, fixed-label, settled]`. Residual is the local
next-iteration update; it is not a proof of global alpha error. The solver uses
bounded working RGB `c/(1+abs(c))`, positive edge weights and explicit screened
prior. It performs the requested number of iterations, with one extra update
for diagnostics, without CPU convergence polling/readback. Both foreground and
background seed pixels must exist; otherwise the result is conservative zero
coverage and valid-seeds=0. Off-canvas/overwritten strokes can cause that state.
Consumers must inspect diagnostics rather than call any finite image converged.
Large images/weak graph connectivity may need more iterations or a useful prior.
This spatial solver is **not** the pending neural Roto Brush implementation.

Motion data must be full origin-zero `f32`, dimensions [w,h,1], semantic=motion,
space=image, units=pixels-per-sample, channels `[dx,dy,confidence]`. Offsets map
current centres to previous centres; supplied images must correspond to that
relationship. Confidence=0, invalid numeric motion, out-of-bounds predictions,
or inconsistent guide color retain current coverage. There is no automatic
upstream time sampling or interpolation across missing observations. Vector
blur shutter values are multiples of the supplied sample interval, not implicit
video frames. Independent controlled moving-footage/model propagation acceptance
remains with the following rounds.

## Qualification and limits

One cumulative campaign `validate.mjs`: syntax/types/unit/gpu/media/performance/
freeze. All failures/debug attempts are retained; <420s and below implementation
time, never reset. Offline parsing reuses the existing Naga helper; runtime
execution uses the admitted Native owner and SpiderMonkey. Numeric gates stay
3e-6 scaled F32 / 6e-4 Half. Real tests cover signed HDR, all three input Alpha
representations, nested Signals, first/middle/final/random/repeated frames,
twelve views (two final-extension views have separate targeted evidence), exact trimap labels, solver diagnostics and cleanup/cancellation.
Real PNGs are decoded and visually opened; F32 EXRs equal named GPU readbacks;
transparent/partial coverage, HDR and negative RGB are checked before SDR
clipping. Four-frame rational-FPS H.264 is independently decoded and remains
lossy SDR.

No permanent resolution cap is added. Existing device storage, command and
session budgets admit actual allocations. Global EDT and iterative graph solves
are not declared transparently tiled. Other GPUs/OSes, arbitrary parameter/color
combinations, neural inference/model quality, automatic temporal analysis,
public SDK/R1/portable installation and whole-repository acceptance are not
qualified by this checkpoint. Normal Stage abort is tested from Renderer;
SpiderMonkey does not provide a Stage-side AbortController constructor.

Sources are in `sources.json`: pinned MIT EffectCraft-derived keying/qualified
Native math, existing Gaussian/morphology/EDT and HDR hue operators; the new
control compositions and graph equations are local. Foundry's
[control reference](https://learn.foundry.com/nuke/15.1v7/content/reference_guide/keyer_nodes/keylight.html)
is a functional checklist, not imported proprietary implementation. Adobe's
[Roto documentation](https://helpx.adobe.com/after-effects/using/roto-brush-refine-matte.html)
is not evidence that this checkpoint supplies its neural model or UI.

Final extension adds corrected-source and colour-correction-edges to keyAdvanced.
Corrected source neutralizes the chosen despill bias, subtracts positive screen
difference using explicit screen-channel ordering and balance, and applies the
existing foreground grade. Diagnostic output is opaque; hidden Alpha0 color
is defined as black. Colour-correction-edges shows the actual inner edge band
used by edgeGrade, or zero when edge grading is disabled. Existing view names
and final/composite behavior remain unchanged. These professional linear/HDR
contracts do not assert proprietary Keylight parameter/binary equivalence.
Raw targeted F16/F32, graded/ungraded and random/repeat-frame results:
docs/native-final-extension-evidence/56-finalKey/result.json.
