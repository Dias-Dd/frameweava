# Remaining PA image adapters

`createNativePaImageEffects(init)` exposes six image operations: PA-compatible
`blur`, `glow`, `displacement`, `displaceWithMap`, `surfaceFromCoverage`, and
shadow-only `innerShadow`. Blur/Glow are additional parameter contracts for
existing names, not new algorithm counts. Old PA CPU functions, legacy Canvas8
overloads and the pre-existing uncommitted Inner Shadow files are unchanged.

```ts
const pa = createNativePaImageEffects(init); // admitted NativeStageInit
// renderAt(context, inputs):
return pa.processImage(inputs.image, async (image, fx) => {
  image = await fx.displacement(image, {amount: 12, seed: 2147483647});
  return fx.glow(image, {radius: 3, intensity: .7});
}, {context});
// dispose(): await pa.dispose();
```

`generateImage(async fx => fx.surfaceFromCoverage(coverage, options), {context})`
requires no dummy image. Coverage is validated one-channel geometry, transported
as explicitly named high/residual F32 data components, then multiplied by linear
HDR ink on GPU. It is not a CPU RGBA asset import. The result can be processed by
the same processor in the same frame. `images.ts` now tracks data scratch as well
as images, including failed/cancelled recipes; closing never closes the owner.
Recording is not a GPU completion fence. Cross-frame image tokens remain invalid.

Editable full chain: `../examples/pa-chain.tsx`. The same source, parameters,
order and logical publications across five Stages are in `pa-isolated.tsx`.
`pa-numeric`, `pa-precision` and `pa-borrowed` are verification fixtures.

## Original semantics and adaptation

Original code: `modules/pro-animation/src/professional.ts`, `procedural.ts`,
`coverage.ts`, and the existing Inner Shadow draft formula. The existing
Frameweave PA Gaussian WGSL and Pair arithmetic are reused; no third-party
dependency or new GPU host/renderer exists. Preserve the repository's existing
licenses; no external shader intake occurred in this checkpoint.

* PA `blur` retains required sigma/radius, normalized ±ceil(3*sigma) support and
  transparent/clamp boundaries. `glow` retains required intensity, default
  threshold1, working-colour luminance, original coverage saturation and ordering.
* PA preparation canonicalizes RGB at Alpha0 and associates straight input.
  F32 scratch and original logical F16/F32 publication order are retained. No
  artificial +/-65504 RGB cap is imposed on the new F32 PA path; wide signed
  HDR and very small coverage are tested. Half overflow is not silently clipped.
* Sine Displacement retains the original JS F64 field, seed, decimal constants,
  absolute Stage time, offsets, nearest (floor(x+.5)) and bilinear semantics.
  O(width+height) CPU row/column control calculations are permitted auxiliary
  work. Only split control words travel through existing `writeBuffer`; image
  sampling is GPU-only. All control words are overwritten before use each frame.
  Initial data stays empty/stable, so animated controls do not rebuild a program.
* RG-map displacement explicitly reads opaque linear `rg-offset-px` utility
  channels, ignores B, never unassociates/converts map RGB, and applies the
  original scale and bilinear boundary behaviour.
* Inner Shadow returns only tinted shadow. Zero padding precedes F32 complement,
  then Gaussian, fractional sampling/tint publication, then source Alpha and
  opacity. Far outside source the complement is1. Original source RGB is ignored.
  Wide fractional shadow tint keeps the original explicit precision restriction.

The real GPU uncovered erased compensated residuals under driver optimisation.
Control tables were accurate to8.88e-16 while original GPU coordinate error was
1.33e-6; the new local WGSL preserves original f32 rounding points with a
runtime-zero integer barrier. Coordinate error became8.88e-14. Alternating signed
HDR Gaussian also failed its original3e-6 gate before this fix and passes after it.
The algorithm, order and tolerance were retained; no shared shader/owner file was
changed. The reserved internal barrier parameter is always zero. Failure and
before/after precision data remain in the campaign. This is not a qualification
of every other shared shader using the same arithmetic text.

## Boundaries and remaining migration

Inputs must already have the same explicit scene-linear working encoding.
The later [colour successor](../color/README.md) converts explicit workingColor
before the effect. Utility maps must match the target colour metadata and are
never colour-converted; mismatch fails `E_NATIVE_EFFECTS_COLOR`. Opaque output needs
structural full-coverage proof and otherwise fails `E_NATIVE_EFFECTS_ALPHA`.
Production per-publication numeric scans remain disabled by owner policy; parity
for all invalid/nonfinite/subnormal intermediate failures is not claimed.

Native explicit `maxWorkingBytes` is a resident-operation preflight plus owner
budgets, not the old CPU4MP/512MiB/work-count ceiling. Device limits and existing
owner budgets remain authoritative. There is no transparent general tiling claim.
Coverage ink coefficients must fit finite F32; arbitrary F64 coefficients whose
huge magnitude cancels with tiny coverage are not qualified. Dense coverage
arrays still incur validation/control upload; no speedup is claimed for that IO.

Unmigrated special contracts remain explicit:

* Arbitrary JS `FloatKernel` callbacks in `applyFloatKernel`, and arbitrary JS
  `VectorField` callbacks in `createDisplacementMap`, have no general GPU compiler.
  Keep them as original CPU/reference/control APIs. Do not execute dense pixels
  on CPU and label it GPU, or replace a callback silently with a different shader.
* Canvas8/sRGB legacy overloads and browser font/path coverage keep their original
  execution contracts. Professional Native replacements are not SDR byte-parity
  claims. Text/path rendering belongs to Agent-2; particles/spatial/Puppet are
  currently deferred by the user.
* Main synchronized four owner interfaces at2e06ccc during validation. Readonly
  image views and declared resources are now locally present; the original four
  statistics algorithms use that bridge. The separate colour category now
  qualifies their exposure; it is not silently included in the old PA evidence.
  The subsequent user-authorized synchronization at bcd509b adds owner-level
  `convertColor`. Colour-boundary adaptation has its own subsequent campaign
  and requires a successor package, preserving the old immutable contract.
* Main owns R1 immutable version, public bindings, typed source closure, pins,
  catalog, installation and portable export. Source-level Native execution and
  an actual borrowed scope are tested; a published/installed PA package is not.

## Verification

`node modules/native-effects/validate.mjs pa-<phase>`: `types`, `unit`, `gpu`,
`precision`, `bipolar`, `contracts`, `borrowed`, `ab`, `media`, `performance`,
`inventory`, `evidence`. All attempts share `checkpoint-pa/campaign.json`, a new
six-operation campaign after frozen0c4111f; prior campaigns are not reset. User
explicitly approved this final batch below20 functions. Home, binaries, outputs
and dependencies are worktree-local; no lock/trust or SDK pin changed.
Main's authorized synchronization is recorded in the same campaign ledger and
does not reset its budget. A frozen Main production executable/receipt was copied
as a delivery artifact after all12 source hashes and executable SHA matched;
no target cache was linked. Diagnostics were rebuilt in this worktree. Post-sync
runs verify both receipts against current source before execution.

Actual TSX→TVG→Native F16/F32, three input Alpha representations, wide/bipolar
HDR, tiny coverage, large seed/time, negative nearest coordinates, Signals,
initial/middle/final/random/repeated frames are compared to independent original
CPU/F64 references. Original scaled3e-6/F32 and6e-4/Half gates are unchanged.
Contracts cover authored failure after control writes (no GPU acceptance), scratch
release, retry, pre-abort, invalid generator result and native process exit.
The borrowed-scope test exercises generator→processor reuse and repeated close.

The same four-effect chain in one/five Stages has exact small-frame pixel parity.
1080p/4K single/combined/isolated runs record full Node request→JS/control→GPU-done
time, cold init/first frame, raw new/repeated/random samples and counters. Both
layouts use one device/program with no image upload/readback; control parameter
writes are real work. Allocation bytes are logical, not physical VRAM peak.
Outliers and sequential ordering remain in the logs; no universal or CPU/GPU
speedup ratio is claimed. Actual hardware is RTX5070 Laptop/Vulkan/driver596.49;
other GPU vendors/OSes/software adapters are not qualified.

The final PA execution evidence was produced on 2e06ccc, before Main's second
authorized synchronization to bcd509b. That synchronization preserved this WIP;
it did not rerun this campaign or reset its 412.937-second cumulative budget.
The newer owner/runtime is not qualified by these PA results. Receipt checks
intentionally reject the older binary against newer source inputs. Reproduction
on the successor requires a matching newly verified binary and targeted review.

Production PNGs were decoded and visually opened; Float32 EXR decoded pixels
exactly match diagnostics; four-frame libx264 MP4 was independently decoded.
MP4 is lossy SDR. Small media does not prove4K final-media encoding; that path,
Servo/SpiderMonkey, full IEEE bit-domain exceptions, R1 install, portable export
and whole-repo regression remain unverified here and are not declared complete.
