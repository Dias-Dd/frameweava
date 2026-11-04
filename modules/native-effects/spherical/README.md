# Native spherical image effects

All twelve source-level functions now pass the recorded Native GPU numerical
and media checks. This remains a source-module delivery: Main owns formal
package/public-export/installed/portable integration. These checks do not claim
full AE preset or control equivalence.

```ts
import {createNativeSphericalEffects} from './index.ts';
// Inside the existing Native Stage init callback:
const effects = createNativeSphericalEffects(init);
// Inside renderAt; release with effects.dispose() in the existing lifecycle:
return effects.processImage(source, async (image, f) =>
  f.vrGlow(await f.vrBlur(image, {radiusDegrees: [2, 1]}), {
    threshold: 1, intensity: 0.4,
  }), {context});
```

The existing admitted Native scope owns all images, fields, pipelines and device
execution. No CPU pixel fallback, private device, browser renderer or new ABI is
introduced. `SphericalBudget.maxWorkPerPixel` is caller-adjustable; storage and
addressing are separately checked against the existing device. There is no
permanent image-resolution cap. Most operations are stateless per frame, using
existing Signal/time and recipe cancellation/resource cleanup.

Angles are degrees; axes are +X right, +Y up, +Z forward. Rotation order is
tilt/pan/roll. Mono, side-by-side and top-bottom use exact integer eye rectangles.
Full 360×180 equirectangular inputs wrap longitude and reflect across poles with
the exact half-eye-width turn, including odd widths. Partial fields use explicit
transparent/clamped boundaries. Stereo-to-mono requires an explicit eye; copying
mono into two eyes does not synthesize binocular scene depth.

Generic projections are equirectangular, rectilinear, equidistant/equisolid
fisheye, sphere-map and three cube atlases. Cube face order is +X,-X,+Y,-Y,+Z,-Z,
with OpenGL face directions and image rows down. `cube-cross` uses tiles
[(2,1),(0,1),(1,0),(1,2),(1,1),(3,1)]. Cross-face taps use integer homogeneous directions and an exact-quotient
boundary decision. They do not select a different pixel because a rational
coordinate rounded just below an integer. Within 2^-44 of a pole, the
indeterminate longitude is canonicalized to zero; this is a geometry convention,
not a relaxed pixel-error gate.
Vendor-specific VR conversion presets have not been qualified.

Images retain signed scene-linear RGB, HDR and associated Alpha. New compound
operations use Float32 internal images and publish once in the requested or
inherited Float16/32 format. These are new contracts and do not change any
preexisting effect's Half-rounding order. Geodesic row/tap coordinates are
computed into a GPU field and consumed by the same owner's Pixel ABI.

Repair evidence: `docs/native-spherical-repair-evidence/2026-11-04`. The prior
partial checkpoint, its numerical failures and timeouts remain unchanged under
`docs/native-spherical-evidence` and `artifacts/native-effects/spherical`.
Compiler WGSL and complete process logs are frozen byte-exact in `.gz` files;
the original uncompressed files stay under the worktree artifacts directory.

- Nine control/reference tests, type checking, 26 Pixel shader variants and two
  Compute kernels pass.
- 78 individual-effect, 84 whole-family/resident-chain and 38 projection
  forward/back numeric comparisons pass on a real NVIDIA RTX 5070 Laptop GPU,
  Vulkan / driver 596.49. F32 scaled error remains <=3e-6; F16 <=6e-4, unchanged
  from `NUMERICS.json`. Independent F64 references and exact BigInt cube-tap
  quotients cover pole/seam, odd dimensions, stereo, partial sphere, signed HDR,
  Alpha, initial/intermediate/final/random and duplicate frames.
- All eight projection types have real forward/back F16/F32 checks; three
  additional F32 partial-strength cases exercise the non-specialized amount path.
- Continuous Blur -> Glow -> Rotate -> Cube -> Sphere runs without CPU pixel
  uploads or image readbacks. Diagnostic buffers are explicitly read only by QA.
  Double dispose/close, pre-cancel rejection and Native process exit are checked.
- Actual PNG decodes at 160x80; Float32 EXR decodes bit-exactly to the captured
  GPU result; a three-frame H264 MP4 decodes through FFmpeg. MP4/PNG previews are
  explicitly SDR, not a claim of HDR video encoding or VR-container metadata.
- The fixed five-call F32 chain has real 1080p and 4K timings, with cache:false,
  one source and no diagnostic readbacks. See raw performance JSON; three warm
  samples per resolution are preliminary, not a cross-device throughput promise.

Reproduce in this worktree using its own admitted Native runtimes:

```powershell
node modules/native-effects/spherical/validate.mjs unit --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs types --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs syntax --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs single --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs gpu --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs projections --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs media --repair-2026-11-04
node modules/native-effects/spherical/validate.mjs performance --repair-2026-11-04
```

The explicitly user-authorized repair ledger is cumulative and must not be reset;
failed checks and setup count too. The original ledger is preserved. To render an
editable example, use `modules/native-effects/examples/spherical-scene.tsx` or
`spherical-projections.tsx` through the existing Native render service/CLI.

Remaining limits: other GPU vendors/OS/drivers, exhaustive parameter combinations,
vendor VR presets, perceptual equivalence to AE, formal package/public export and
portable installation are not qualified here. No shared GPU owner, Pixel ABI,
TVG, permission, lock or trust changes are part of this repair.
