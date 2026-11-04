# Native image input closure

`createNativeProfessionalEffects(init)` now retains the existing typed
`importImage(surface)` method. All82 original ProfessionalFilters methods have
a Native source contract:81 pixel operations and one explicit input helper.
The helper is **not** counted as a new effect; total image counts remain
117 callable bindings /110 different names across the source facades.

```ts
const effects = createNativeProfessionalEffects(init);
// Explicit small CPU input, with original Surface v2 metadata/ownership:
const image = await effects.generateImage(fx => fx.importImage(surface), {context});
return effects.processImage(image, (input, fx) => fx.channelMix(input, {
  matrix: [[1, .125, 0], [0, 1, 0], [0, 0, .5]]
}), {context});
// dispose(): await effects.dispose();
```

CPU input is an explicit upload, never a CPU image-effect fallback or readback
between GPU operations. The owner checks the original float/scene-linear
Surface contract and its own transport budget. The tested frozen owner allows
65536 channel words (16384 RGBA pixels); excess reports `E_NATIVE_UPLOAD_LIMIT`.
No library image ceiling, device, upload protocol or permission was added.
This is not an unrestricted large inline upload claim. F16/F32 and all three
Alpha representations are preserved on import, including signed/HDR components.
Import/upload handles use the existing recipe/borrowed cleanup and result checks.

Larger/static media uses existing declared `<Resource>` and
`init.gpu.importResource({version:1,id,decode,output})`, then `processImage`.
The host verifies the compiled build seal, allowed resource and exact input
metadata. A file must be inside its project or use an existing explicit package
reference. No arbitrary authored path/network access is granted. The input is
decoded/uploaded at the explicit boundary; subsequent effects stay resident.
The unchanged owner supports `surface-v2` and controlled `icc-sdr`; this check
qualifies float files and ICC-tagged PNG, not every image/codec format.

Editable TSX: `../examples/io-inline.tsx`, `io-borrowed.tsx`, `io-resource.tsx`.
The real project-local float fixture is `../examples/io-assets/input.surface.json`.
`prepare.ts` regenerates that static authoring input, not GPU effect pixels.
The large fixture has20480 pixels, intentionally above inline admission, with
negative/HDR RGB and partial/zero coverage. Static CPU fixture creation is not
advertised as a GPU generator. Preserve existing Frameweave license notices;
no new external algorithm, dependency, Host or shared Core/ABI change exists.

From repository root:

```sh
node modules/native-effects/validate.mjs io-prepare
node modules/native-effects/validate.mjs io-types
node modules/native-effects/validate.mjs io-unit
node modules/native-effects/validate.mjs io-checks
```

All attempts share `artifacts/native-effects/checkpoint-io/campaign.json`, after
the frozen builtin checkpoint e40bfd3. No completed campaign was reset.12 scoped
unit tests and final types pass;33 actual integration rows cover22 inline/borrowed
frames plus declared float input, cancellation/retry, invalid bytes/owner limit,
undeclared resource, compiled-resource tampering, rebuild identity, ICC PNG and
terminal media. Inline/declared float GPU input matches source values exactly.
Effect errors use unchanged3e-6/F32 and6e-4/Half budgets. ICC16 input independently
uses the existing5e-5 media tolerance (actual2.1398e-5); effects on that input
match their reference exactly. No tolerance was enlarged.

Repeated resource frames upload one327680-byte snapshot; source-file changes do
not mutate the sealed live session. Rebuilding the same project after changing
its asset produces a new build hash and changed, correct pixels. Tampering with
the compiled asset fails integrity before GPU acceptance. The two first failed
attempts were test-project scope and wrong error-order assumptions, both fixed
within the existing security rules and retained in raw logs.

Actual source→effects→PNG was decoded/opened, F32 EXR exactly matches the public
GPU result hash, and four-frame H264 fully decodes. Video is lossy SDR. Media is
160x128; this is not4K terminal qualification. Authoring upload counters explicitly
describe recorded CPU input bytes; diagnostic named-buffer exports are counted
separately from production rendering. Tests use the matched frozen executable,
all12 source-input hashes/SHA, worktree-local home/outputs/dependencies and the
already reviewed local media Python. Repeated close/native exit pass; unbounded
session heap, other GPUs/OSes, Servo/SpiderMonkey, full-repo/six-mode/install/Flat
and portable export are not qualified by this campaign.

Main owns the immutable package/public binding successor, including any managed
source-only generator export. Source factory availability does not mean that
an earlier installed package exposes this helper/generator. Remaining temporal
prefix sampling, fixed Native dimension admission, unrestricted callbacks and
complete invalid-intermediate rejection are unchanged owner/host boundaries.
