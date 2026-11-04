# Managed upstream time sampling

`createNativeManagedTimeEffects(environment, binding)` connects the existing PA
time effects to a real Core `NativeTemporalBinding`. This entry adds one factory,
not twenty new effects. It connects the ten existing image operations and reuses
the existing twelve time/context/plan functions unchanged.

The frozen Core consumer is `c7685c25a0d843a65566388ea8e055853fac8cfc`
(owner evidence `7ad93fd90836da47cb3fd41fa9194bffb6a5a62c`). It is a
candidate owned by Main/Agent-1, not a released Main SDK. This branch does not
change Core, a public entry, Manifest, version, SDK pin or package lock. Main owns
that integration. The structural binding projection in `managed.ts` deliberately
preserves the supplied Core window option and opaque cancellation types; it does
not copy Core's token, resource reader, lease registry or replay implementation.

```ts
// Consumer/module initializer: bind once through the admitted Core facade.
// Import from native-time/managed.ts in development; Main wires the public name.
const source = await init.temporal.bind({
  version: 1, packageRef: 'your.reviewed-source@1.0.0', module: 'source',
});
const time = createNativeManagedTimeEffects(init, source);
return {
  async renderAt(context) {
    return time.shutterBlur({count: 16, angleDegrees: 180}, context);
  },
  async dispose() { await source.dispose(); },
};
```

The example assumes the reviewed package/resource is already installed, trusted,
locked and admitted for this Stage. A name or `sourceInfo` object alone is not
authentication. Core authenticates the source resource and every recording
window. All native image arithmetic stays in the original compensated GPU
reducer and original blend kernels, on the same device/owner. Source output and
effect output remain scene-linear PM RGBA16F/32F, signed/HDR; there is no CPU
pixel, browser, SDR fallback or frozen-surface substitution.

The methods are `retime`, `frameBlend`, `echo`, `trails`, `shutterBlur`, `wideTime`,
`posterize`, `strobe`, `timeCrossfade`, `timeDifference`. Each takes the existing
effect options, the **enclosing actual FrameContext**, and optional **Core window
options**. The latter are inferred from the real supplied binding:

```ts
const cancellation = init.temporal.cancellation();
const image = await time.echo({echoes: 8, interval: -1 / 24}, context, {
  signal: cancellation.signal,
  // parameters: exact numeric Core Signal rows for all source prefix steps,
});
// The owner can call cancellation.abort() while its recording is pending.
```

In SpiderMonkey this is Core's opaque cancellation token, not a DOM AbortSignal.
Do not inspect it, forge it, or put it in the effect's legacy `options.signal`.
The latter remains a host AbortSignal where that host supports it. Core owns
snapshotting parameter rows, subframe re-evaluation, source ownership, rollback,
frame epoch and cancellation authentication. This factory forwards these options
unchanged and propagates errors. It borrows the binding; await pending work before
the caller disposes it. `stats()` is the existing **recorded-only** PA counter,
not GPU completion or the complete Core-window failure count. Await the existing
Renderer frame ticket for actual execution completion.

`timeCrossfade` and `timeDifference` here sample **the same bound prefix at two
times**, within one window. Two independently bound sources/nested windows are
not supported by Core v1. Use the existing explicit two-source API for separately
authored sources; this adapter does not silently nest or flatten their windows.

Supported Core profile: Stage-local, stateless, sealed R1
`native-pixel-prefix-v1`; zero-input pixel ABI1 generator followed by zero or more
single-previous-image pixel ABI1 steps, with numeric Core Signals. Every sample
gets the complete supplied fractional local/global context. Local retiming keeps
the output clock; shutter sampling updates the affine global subframe/progress.

Not supported: arbitrary JS/TS factories, compute/mesh source replay, external
image/video import, history/fixed-step replay, cross-Stage sources, V-SHARED or
inference during rendering. Core rejects unsupported sources. No duration is
inferred from changing pixels. Existing owner command/resource budgets still
apply; there is no extra permanent effect-level sample cap, automatic tiling or
multi-submission reduction.

## Reproduction

Run in the Agent-2 worktree (its own dependencies/binaries only):

```powershell
node modules/pro-animation/validation/run-upstream.mjs snapshot types l0 coretypes consumer
```

The preparer extracts exact Git blobs into `.frameweave/pa3-upstream/core-c7685`;
existing changed files fail rather than being overwritten. It is not a worktree
sync or merge. `consumer` builds a private, explicitly trusted local R1 fixture
using the actual installer, pins its resources, and runs the actual Renderer/SM
and native GPU. Fixture identities must not be published as production modules.
Every runtime input is hashed; the Core snapshot is checked again after testing.
`run-upstream.mjs` appends all timings/failures to one cumulative <420s campaign.
It never resets the budget. A fresh reproduction uses a clean independent worktree with its own campaign
directory; do not erase or rename existing timing evidence to reset the budget.

Actual checkpoint: 34 L0 tests; consumer type checks against the real Core opaque
types; 80 managed/explicit image comparisons (10 operations × 2 formats × 4
random/repeated frames); twelve plan traces; an independent analytic two-step
shutter oracle; cancellation/parameter/consumer failure rollback and reuse;
three resident frames without exports; transparent PNG, EXRs from F32/F16 Stages and an
8-frame decoded MP4. Both EXR files use FLOAT channels after the existing F32 compositor; F16 here
qualifies source/Stage precision, not a HALF-channel EXR encoding claim.
No claim of L3 package release, six-mode export acceptance,
cross-platform GPU parity or complete AE parameter compatibility.

No new third-party code or dependency is introduced. The existing Frameweave
Core, PA plans/reducer and native kernels retain their existing licenses.
