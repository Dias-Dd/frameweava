# Experimental primary-ray adapter v1

This experimental API is integrated in Main from the frozen Agent-1 checkpoint
`a3bb09fdbee711bcab06fd0f0692acdc67c2b829`. It is opt-in with
`NativePathTraceOptions.experimentalPrimaryRays`; it is not a stable general
refraction API. Omitting it preserves the prior recording path.
It adds no P4/TVG/native protocol or permissions. Normal SDK content identity
and explicit project Runtime Pin review apply; it is not a stable P4 ABI revision.

Trusted modules implement `{version:1, apply(input, arena)}`. Ordinary authors
use a high-level module or shot configuration, not raw buffer handling.
`input` contains the current logical/shutter context, camera sample seed,
sample index (`-1` for the center guide), extent, far distance, origins,
directions and a prequery's `nearest` NativeRayTargets. Only directions may
be modified. Origins and incoming nearest data are inputs, not scratch storage.
The module must produce finite nonzero unit directions using the existing GPU
compute interface. This is the same trusted-shader responsibility as other
Native compute modules, not a new security boundary or per-frame readback check.

The prequery uses the actual scene Alpha mask/stochastic blend coverage and
the same coverage seed as the corresponding first Beauty query. Its result is
the first geometric boundary after coverage, not recursively visible radiance:
dielectric/transmissive glass and emitters remain boundaries. Heat behind glass
is therefore not recursively traced by the example. `input.retrace()` queries
the same authorized scene/origins with the updated directions and overwrites
`nearest`. A module can reject a direction that newly crosses nearer foreground.
No GPU device, native pointer or cross-Stage resource escapes this owner.

Center guides and every jitter/lens/shutter Beauty sample run the same adapter.
The subsequent actual hit supplies Beauty, lighting AOVs and AA denoise features.
Depth/Normal describe the resulting center ray; Motion remains the existing
geometric projection and does not claim thermal/refraction flow. Secondary
reflection/refraction rays are not modified by this camera-only interface.

All buffers and scratch storage belong to the current frame arena. Reuse one
scratch allocation inside that arena; do not allocate one full-frame buffer per
sample or retain its handle across frames. Recording failures preserve
their original error identity; normal Renderer cancellation and owner disposal
remain. `E_NATIVE_PATH_PRIMARY` denotes an unsupported adapter declaration,
not a replacement for permission, budget or cancellation failures.
Unknown adapter versions are rejected. A future incompatible experimental
contract needs a new explicit version and SDK identity; there is no silent
migration or relaxation of source/resource seals.

The landing shot uses a bounded, advected gradient phase-screen approximation,
with first-boundary shielding and a second query to reject foreground crossings.
It is not a CFD calculation or a general curved-ray refractive-volume solver.
Default/no-op exact bytes, Alpha masks/blends, glass/emission boundaries,
foreground protection, finite unit directions, independent coverage-to-feature
agreement, lens/shutter, repeat/random access, failure recovery and pre-cancel
rejection are exercised by `tests/native-path-primary-rays.test.ts` on the
reviewed Windows/Vulkan device. Other platforms remain unqualified.
