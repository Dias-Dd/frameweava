# Compute, fields and feedback

# Resident image example

`resident-stage.ts` creates a moving HDR/negative-RGB pattern, Gaussian Blur,
Glow and Over on the existing chain device. Input generation and a static
background also stay on GPU; there are no image uploads and only the final
Surface is read back. It uses no undeclared network/resource access or separate
time system. CPU control data is one explicit existing frame number.

`resident.tsx` is an editable native example. Select the existing hardware
**preview** policy explicitly through `Renderer.create(build,{preview:true,
cache:false,media:{workingColor:acescg,transport:'buffer-v1',preview:{color:srgb,
clip:true}}})`. Native unbound Final projects retain the old software policy;
production module authors must declare hardware GPU via their normal R1 binding.
This example does not override that policy or claim installed Final acceptance.
Its final Surface retains scene-linear HDR; the separately requested sRGB PNG
preview is explicitly clipped, never used as a professional intermediate.

The matching frozen A/B workload is `gpu-resident-v1`:

```
node --import tsx scripts/performance/gpu-resident.ts --width 1920 --height 1080 --frames 6 --modes legacy,resident,resident-generated --output artifacts/gpu-resident/my-run
```

All three modes generate exactly the same inputs/effects/publication formats.
The generated mode changes the execution backend of source generation, not its
image content or resolution. Reports retain source hashes, hardware evidence,
power policy, cold/warm samples and full-component comparisons. These measure
Stage port evaluation including output transfer, **not** final Layer composition,
OCIO, PNG/display or media encoding latency. New-frame timing is not repeated-frame
cache timing. The raw sample image is a deliberate stress/reference pattern,
not a new released artistic effect.

## Compute, fields and feedback

`compute.tsx` / `compute-stage.ts` demonstrate the additive compute extension:
real GPU feedback particles, typed buffers, atomic bin counts and data-driven
pixel output. The example uses explicit hardware preview policy for an unbound native example. Its QA
stats deliberately read back a small state and histogram for numerical tests;
production effects can omit those QA readbacks. This is not a new particle API
or time system. See `../COMPUTE_SCOPE.md` for buffer/field/tiling/Three contracts.

To verify the editable example, render real PNG/F32 EXR and encode/decode a
four-frame ACES2 HDR10 clip using the existing professional output path:

```
node --import tsx scripts/performance/verify-gpu-compute-example.ts
```

It requires the existing reviewed `FRAMEWEAVE_MEDIA_PYTHON` environment and
Chromium/FFmpeg dependencies. It performs no downloads or lock/trust changes.

## Explicit fast display

`resident-preview.tsx` / `resident-preview-stage.ts` use the same HDR F32 source,
Blur, Glow and Over as `resident-accurate.tsx`, then explicitly request the fixed GPU
ACES2 SDR100 display. They return a Canvas preview instead of a professional
Surface; accurate/HDR delivery continues to use `resident-accurate.tsx`. See
`../PIXEL_DISPLAY.md` for its approximation, domain, ownership and validation.
This does not silently enable fast display in existing projects.
