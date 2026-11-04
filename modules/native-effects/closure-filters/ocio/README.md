# Prepared Native OCIO data v2

Stage-safe entry: `createNativeClosureEffects` from `../index.ts`. Offline Node
entry: `prepareOcio` from `./prepare.ts`. Python OCIO/Naga are preparation and
reference tools; production frames execute through the existing Native owner.
No process, filesystem or model permission is acquired by the Stage adapter.

```ts
// Explicit offline preparation with project-confined files and reviewed tools.
const processor = await prepareOcio({
  operation: 'look', config: 'assets/grade.ocio',
  source: 'linear-709', destination: 'linear-709', look: 'grade',
  inputColor: linear709, outputColor: linear709,
  dynamicProperties: ['exposure-contrast'],
  uniformAliases: {
    exposure: 'ocio_exposure_contrast_exposureVal',
    contrast: 'ocio_exposure_contrast_contrastVal',
    gamma: 'ocio_exposure_contrast_gammaVal',
  },
}, {projectRoot, outputDirectory, python, compiler});

// Prepare once during Native Stage init; ordinary signals use existing time.
const effects = await createNativeClosureEffects(init, {ocioProcessors:[processor]});
// renderAt(context): all images remain owner-local GPU references.
return effects.processImage(image, (input, f) => f.ocioLookTransform(input,
  processor, {uniforms:{exposure:keyframes([
    {frame:0,value:0}, {frame:48,value:1.25},
  ])}}), {context});
// dispose(): await effects.dispose();
```

Editable complete fixtures: `../../examples/ocio-dynamic.tsx`,
`ocio-dynamic-half.tsx` and `ocio-dynamic-checks.tsx`. They cover exposure,
primary grading, dynamic RGB B-spline tables, defaults, a display-data terminal
and an unchanged static v1 look. These are private fixtures, not published R1
package identities or proof of portable installation.

## Data and compatibility

This is **prepared processor data** `schemaVersion:2`, separate from TVG,
parameter Schema v2, P4 ABI and engine release numbers. There is no engine/pin
bump here. Main owns public/package compatibility and immutable distribution.
Static v1 preparation remains v1; the existing v1 runtime and sealed fixture
files are unchanged. Unknown versions and fields fail. v1 options still reject
new `uniforms`; no v1 shader/definition is patched at load time.

v2 adds a required dense `uniforms` layout and
`provenance.uniformSha256`. Each entry contains unique `name`, exact OCIO
`symbol`, `type`, `length`, contiguous word `offset`, and `defaultWords` (UInt32
bit encodings). Supported types are `float`, `bool`, `float3`, `float-array`,
`int-array`. Scalars have one slot; float3 has three; arrays match the official
GLSL declared capacity. Unused official array tail slots are zero-initialized.
The existing Pixel2/Compute1 ABI already supports the fourth, read-only `u32`
data input. No new GPU host, binding ABI, Stage or port is introduced.

Preparation hashes the complete layout/default words, WGSL, LUT, config,
compiler and resource identities. Init rechecks executable WGSL, LUT and layout
bytes before buffer creation, freezes definitions, and creates immutable LUT
and default-word buffers for that owner. Overrides create temporary typed
control buffers; omitted values use sealed defaults. All resources use existing
leases and actual device budgets. No arbitrary image-size limit or CPU pixel
fallback is added. Runtime config files are not reopened: executable source and
tables were sealed offline. Installing/trusting a package remains a separate
existing review boundary.

Override names must exist. Types, dense exact lengths, finite F32-representable
numbers, Boolean values and full Int32 ranges are validated before recording
the processor. RGB-curve offset/count pairs must lie inside the sealed tables;
active curves have consistent strictly increasing knots and coefficient ranges.
The official `-1/zero-length` identity sentinel is allowed. Invalid counts cannot
create an unbounded curve-search loop. Diagnostics use existing EngineError and
`E_NATIVE_FILTER_PARAMETER` with effect/path details.

Numeric scalar/vector/array leaves accept existing keyframes and expressions
with explicit FrameContext. Boolean controls are direct booleans (ordinary JS
conditions may select them); this does not add Boolean/object interpolation or
another animation engine. Changing curve topology is explicit replacement of a
valid full control layout, not implicit array-index matching or knot morphing.

The official NoClamp +/-DBL_MAX control defaults are canonicalized offline to
+/-FLT_MAX, equivalent over finite F32 values. No pixel or HDR radiance is
truncated by this normalization; other nonrepresentable defaults/overrides fail.
Default words retain signed zero and exact integer bits.

## OCIO semantics and qualification

Explicit `dynamicProperties` supports ExposureContrast, GradingPrimary and
GradingRGBCurve. They are enabled **before** Processor creation because static
identity grading may otherwise be removed. Some dynamic flags/default values do
not survive OCIO config serialization; persist intended defaults statically and
declare the dynamic transforms when preparing. Names/aliases are the extracted
uniform contract, not a second implementation of OCIO's high-level grading
property setter/curve construction API.

Frozen OCIO 2.5.2 linear grading uses its official CPU SSE2 polynomials and
operation ordering consistently on every GPU. This preserves CPU grading parity,
including the upstream approximately 15-bit transcendental approximation; it is
an algorithm choice, not a Float16/Canvas downgrade or host CPU fallback.
Unrelated transforms keep the existing compensated math. The Naga adapter only
collapses OCIO's identity nested writable swizzles (`.rgb.r` -> `.r`). Original
sources, license and hashes are retained. Other grading styles, future OCIO
versions and every arbitrary configuration have **not** been qualified here.

Input/output are explicit linear colors. Alpha is unassociated/reassociated as
before and never graded; zero-alpha source behavior is preserved. Scene outputs
remain GPU images. Display-linear outputs remain typed `NativeDisplayData`
buffers, selected explicitly by the existing Node terminal adapter; they are
never relabeled as scene-linear. F16 is rounded at the logical publication.
Its `6e-4` error budget compares the actual representable half result against
the independent full-precision CPU reference and separately checks half
representability. Quantizing both sides can manufacture a one-ULP disagreement
at a rounding boundary; that initial failed comparison is retained in evidence.
F32 uses the unchanged `3e-6` budget.

**ACES2 is still unqualified at `3e-6`.** The current source-confirmed forward
CPU-order adapter (offline opt-in `experimentalAces2CpuOrder:true`, never enabled
by default) and original 320x180 HDR ramp still fail (five frames, about
`3.4e-6`). The trace tools retain intermediate GPU fields and independent CPU
values; public decomposed FixedFunctions are not identical to the combined
transform (parameter initialization and A/J ordering differ), so they cannot
prove combined-transform correctness. These experiments do not count as a fix.
Use the retained result in `docs/native-ocio-v2-evidence`. No all-effects/AE-100%
claim follows from this checkpoint.

On 2026-11-03, after the measured `3.3974647521972656e-6` discrepancy and its
expected small visual magnitude were explained, the user asked to stop further
pursuit of this item. It is an accepted known deviation for the frozen measured
cases, rather than a numerical fix or a passing original strict check. Original
failures remain unchanged. This acceptance does not waive arbitrary future color
errors or enable the experimental preparation adapter by default.

Run one bounded campaign with `node .../ocio/validate-dynamic.mjs <phase>`:
`build` only if compiler changed, then `prepare`, `acesPrepare`, `types`, `unit`,
`gpu`, `failures`, `media`; `aces`, `trace`, `traceCpu` are retained diagnostics.
All attempts share one <420s ledger including failures and setup. Preparation is
explicit and rewrites only the unpublished `fixtures-v2` set. Other GPU vendors,
OS, large-domain performance, public SDK/R1/portable installation and full
repository acceptance remain Main's integration work, not completed tests.

Upstream: [OCIO c52966a](https://github.com/AcademySoftwareFoundation/OpenColorIO/tree/c52966a6677723d5bd2dbef0ccec3fed9cbc3790),
BSD-3-Clause; see `../vendor/OpenColorIO-LICENSE`, `../vendor/ocio252-grading/`.
Naga remains locked at 30.0.1, MIT/Apache-2.0, in the existing offline compiler.
