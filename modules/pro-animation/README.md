# pro-animation 0.5.1 — PA-1

Ordinary TypeScript animation, vector and professional pixel functions. This package reuses Frameweave Signal, Graphics Contracts, Surface v2, color transforms, managed bindings, Stage/Layer and R1. It creates no scheduler, timeline, renderer or package system.

## Install / use

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
node --import tsx modules/pro-animation/scripts/build-catalog.ts
# Use the returned catalog path; review/approve these local authorities explicitly.
frameweave packages install pro-animation --catalog <catalog> --trust local:frameweave.pro --trust local:frameweave.foundation --project <project.tsx>
```

The installed SDK's shipped local catalog also supports bare-name installation. A source checkout uses the explicitly built catalog above; there is no remote registry/download service. New version 0.5.1 is immutable; installing must not overwrite a different 0.1.0, 0.2.0 or 0.2.1 snapshot. Review changed SDK pins rather than silently refreshing existing locks. `packages types` supplies editor declarations.

```ts
import {glow, displacement, wiggle} from 'pro-animation';
// Inside a defineMediaStage renderAt; image is an existing ProfessionalSurface.
const moved = displacement(image, {amount: 2, seed: 51}, ctx);
const result = glow(moved, {radius: 2, threshold: 1, intensity: .8}, ctx);
return {surface: result};
```

Use existing `defineMediaStage` and a declared `surface` port. Float results do not belong in a legacy P4 Canvas image port. `examples/pro-animation/professional.tsx` demonstrates installation-backed named calls, multiple effects in one Stage, linear HDR text/vector ink and legal cross-Stage Surface transport. Current Main's multi-factory single-file managed import limitation is a compiler issue, not a PA API rule; the example uses explicit separate entry files as a temporary adaptation.

## Precision and backends

- Professional `glow`, `blur`, `displacement`: CPU reference, RGBA16F/32F only, explicit scene-linear work, premultiplied filtering, no RGB clipping or Canvas color conversion. Output retains negative and >1 RGB. Encoded input requires `workingColor`; output stays in it. PME handles stride, binary16/F32, color and value ownership.
- `surfaceFromCoverage`, `rasterizeText`, `rasterizePath`: linear HDR ink. Browser geometry coverage is A8, optionally 1/2/4 supersampling with area averaging; it is not a float glyph/geometry rasterizer or a new shaping engine.
- Math/vector: original revealText, EffectCraft wiggle, Graphics-based trim/Morph unchanged. Time comes from FrameContext/Signal, never accumulated wall time.
- Legacy managed Canvas overloads and `createImageEffects` retain PA-0 fw.glow/fw.displacement semantics, sRGB/unorm8 only. They are explicitly **Legacy/SDR**, never an HDR fallback.
- No professional GPU or WASM pixel kernel is released in 0.2.1. Existing SDR GPU chains and the professional compositor cannot serve as arbitrary authorized HDR effect hosts. CPU correctness is not a GPU performance claim.

Effect authors reuse `applyFloatKernel` for the same validated Surface/color/Alpha preparation and publication, rather than reimplementing these boundaries.

See PUBLIC_API.md for equations, alpha/units/limits, and docs/pro-animation/PA1_REPORT.md for measured evidence and unresolved core integration items. Full EffectCraft MIT source/commit/notices remain in vendor/effectcraft. No Adobe assets/code, model download, native binary or third-party runtime dependency is added to this package.

PA-2A (0.3.0) adds curve-preserving explicit Trim, bounded arc metrics/sampler and declared contour matching. See PUBLIC_API.md; Legacy SVG Trim and strict Morph remain available. Source/package signatures use public module paths for reproducible identity.

PA-2B (0.4.0) adds MIT-audited range/random/combined selectors, absolute-time stagger and independently drawable LTR text units along a measured curve. Joining/RTL shaping is explicitly unsupported; coverage precision and font/kerning limits are documented.

PA-2C (0.5.0) adds projected noise fields, canonical path control deformation, explicit signed RG-offset float maps/warp, analytic birth-indexed particles and F32 disk coverage. Four editable PA-2 scenes are in examples/pro-animation/pa2. The optional P4 generator is explicitly Legacy/SDR; professional functions use Surface v2. CPU reference first, no new GPU Host or simulation runner.
