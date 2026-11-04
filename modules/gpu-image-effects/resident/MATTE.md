# Resident Matte cleanup

`matte-example.tsx` carries two declared Surface inputs through one GPU owner:
extract coverage → open → close → feather → coverage ramp → apply to HDR colour.
The five pixel functions extend the same `processImage` callback API; the
`importImage(surface)` utility uploads an additional declared value-owned input
into that callback's arena. It grants no file, network or device-handle access.
All imported/produced handles are released with the callback. No intermediate
full pixels are read back. Large recipes may submit validation-only barriers
through the existing public `complete()` operation.

- `extractMatte`: ignore RGB and return canonical black RGB / original Alpha.
- `morphology`: gray-scale square-window erode/dilate/open/close; nonnegative
  fractional pixel radius, horizontal/vertical/both axes, transparent/clamp
  boundary. Integer results remain F32, then two complete 2D integer windows are
  blended for a fractional radius. Only the final result takes requested F16/F32.
  Open/close compose two primitives **on the finite canvas**, re-applying the
  selected boundary each primitive. Transparent closing therefore can trim the
  canvas edge. This is not a padded infinite-plane closing or automatic bounds
  growth. Explicitly pad input when that different domain is required.
- `featherMatte`: canonical Alpha plane through the shipped resident Gaussian;
  pixel sigma 0..64 and its existing qualified Alpha admission (nonzero input
  Alpha >=2^-24). This adapter does not replace or widen that precision contract.
- `matteLevels`: explicit black/white in [0,1], positive gamma and optional invert.
  Alpha clamps are creative mask operations; no RGB/HDR clipping is performed.
- `applyMatte`: multiply image PM radiance and coverage by matte Alpha. Straight
  input is associated first; native PM zero-coverage emission is multiplied too.
  It is not coverage replacement, colour extrapolation, despill or edge recovery.

Image/matte dimensions and working colour metadata must agree. Mask results are
canonical PM Surface images; original image colour/precision remains explicit.
Subnormal input coverage, or fractional/gamma normalization that cannot produce
a supported nonzero F32 value, fails. Half quantization follows the public scope.
No all-F32-domain numerical proof, advanced key cleaner, temporal decontamination
or cross-vendor acceptance is implied.

The min/max/axis selection and 2D fractional-radius semantics adapt EffectCraft
`fx_color.wgsl` / `util.rs` at ec7ced1f (MIT, see NOTICE, LICENSE.effectcraft and
sources.json). The host expands contiguous intervals with three samples per
pass, O(log radius), without a new hard neighborhood cap. Very large radii
saturate only at the finite image extent. Existing device, image-size, pending
publication and byte budgets remain enforced. Arbitrary recipe tiling is not
implemented, and device limits are not silently bypassed.

Targeted checks:
`node scripts/check-resident-colour.mjs --matte types unit gpu media`.
Use the worktree's media Python and FFprobe configuration for media acceptance.
Raw commands/results and actual media are under
`artifacts/gpu-image-effects/chain-matte/`; no output is marked verified merely
because the source, manifest or shader compiles.
