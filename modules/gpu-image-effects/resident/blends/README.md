# Resident two-input blend candidate

Ten named operations reuse EffectCraft's pinned `common.wgsl` separable blend
equations: darken, lighten, difference, exclusion, overlay, hardLight, linearBurn,
subtractBlend, linearLight and pinLight. See `sources.json`. One sealed two-input
kernel selects the equation by uniform; no additional GPU owner or dependency.

All calls are `await fx.overlay(foreground, backdrop, {opacity, format, signal})`
inside the existing `processImage` recipe. Defaults: opacity=1, foreground format.
Opacity supports the existing Signal and requires FrameContext for evaluation.
Both images must have equal dimensions and identical explicit working colour;
the public owner enforces colour, permission, device, byte and lifetime limits.
There is no implicit resampling or colour conversion. Unknown options fail.

## Alpha and HDR contract

Inputs may be PM, straight or opaque; outputs are always PM. Straight association
and source opacity are explicitly rounded to Float32 before compositing. With
both coverages positive, `Cs*(1-Ab)+Cb*(1-As)+As*Ab*B(Cb/Ab,Cs/As)` defines the
result. The shader evaluates a compensated native-PM equivalent without division.
Coverage is `As+Ab*(1-As)`. If either coverage is zero, native PM emission follows
SourceOver (`Cs+Cb*(1-As)`); zero-coverage radiance is never silently discarded.

Linear Burn, Subtract and Linear Light deliberately omit upstream display-range
clamps. Negative/HDR values remain signed scene-linear; Overlay/Hard/Pin Light's
0.5 split is relative to coverage, not display encoding. These choices are not a
claim of AE/display-clipped parity. Blend order is foreground first, backdrop second.
Opacity=0 recovers the backdrop. RGB can exceed Alpha/one. No RGBA8 intermediates.

Output quantization is logical RGBA16F/RGBA32F with existing publication checks;
the scope currently stores logical Half in F32 buffers. Input/subsequent prepared
nonzero subnormal F32 channels or association/opacity underflow fail explicitly.
This is not a proof for every possible finite F32 combination: extreme product
overflow may be rejected even when an algebraic cancellation would be finite.
No epsilon clamp is used to erase residuals. Tiny/zero Alpha and branch boundaries
are covered by the focused tests; cross-vendor denormal behaviour remains unqualified.
The reference models F32 rounding followed by Half RNE, matching the public
publication path. Each individual output is additionally compared against the
unquantized independent F64 equation (scaled bounds 3e-6/F32, 6e-4/Half). The
first GPU attempt exposed this double-rounding distinction in Linear Light;
its original raw failure is retained, without widening either error bound.

## Execution and example

`example.tsx` is an editable two-source TSX chain using all ten modes, a Signal
opacity, random frame access and left/right preview. Its `test.resident-blends`
name is an isolated R1 test fixture, not an installed official release. Main owns
the next formal package version/identity; existing 0.1.0 manifest/pins are untouched.

The recipe has two uploads, ten resident passes, one final readback and one
compiled kernel per scope. Ordinary R1 bindings retain the existing 512MiB
budget. The large-image qualification uses a direct 1GiB processor budget;
it does not claim the default budget fits that chain. Generic tiling is not added.
Only physical WebGPU is accepted; software/no GPU has no CPU fallback. The
F64 reference is test-only and is never included in the production effect path.

Run the single gated acceptance with `node scripts/check-resident-creative.mjs --blend`
(types, unit, real GPU, R1 TSX/PNG/F32 EXR/HDR10). All ten functions must
exist before it starts; the raw flow records time, hashes, formats and actual device.
