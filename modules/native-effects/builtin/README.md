# Core and legacy builtin Native counterparts

`createNativeBuiltinEffects(init)` adds seven source contracts: `blur`,
`brightness`, `transform`, `mix`, `glow`, `displacement`, `cinematicGlow`.
Four names are new to the image facade; overlapping contracts are not counted
as new algorithms. Defaults match `src/core/effects.ts` and the actual
`plugins/builtin/*/effect.json` files. Existing P4/Canvas plugins are unchanged.
This source entry requires a Main-owned immutable package successor; it is not
an automatic remapping of old `plugin()`/Layer effects or an installed release.

```ts
const effects = createNativeBuiltinEffects(init);
// renderAt(context, inputs):
return effects.processImage(inputs.image, async (image, fx) => {
  const transformed = await fx.transform(image, {rotation: 12, scale: .85});
  const bright = await fx.brightness(transformed, {amount: 1.1});
  return fx.mix(image, bright, {mode: 'screen', opacity: .4});
}, {context});
// dispose(): await effects.dispose();
```

The counterpart is explicit **scene-linear Float16/32**, with PM outputs,
signed/HDR RGB and the original option ranges/defaults/time. Old Canvas8's byte
rounding, sRGB nonlinear filter/compositing behaviour, clipping and browser
Gaussian implementation are not claimed bit-equivalent. Radius/amount are
physical image pixels in this Native image API; old PluginInit pixelRatio
scaling is not inferred from an unavailable logical-size field. WorkingColor
conversion uses the existing owner before the operation. Old callers retain
their original APIs, not a silent precision/color-space replacement.

* Blur uses sigma0..200, the old Core declared range. Its exact normalized
  ±ceil(3*sigma) Gaussian reuses the frozen PA kernel and per-axis F32 stores.
  Split F64 weights use existing typed-data v1, not a larger Uniform, repeated
  small blurs or an approximation. Fixed control storage keeps layout stable;
  no image pixels are generated on CPU. PA's older sigma0..64 contract is unchanged.
* Transform rotates/scales about image centre, samples PM bilinearly with a
  transparent boundary, then applies opacity. Existing affine preparation and
  compensated sampler are reused. No hardware raster-edge snapping is introduced.
* Mix retains only the four original modes and treats its second image as the
  foreground: screen (default), source-over, multiply, lighter. Both original
  F64 opacity and its complement are split before GPU submission. This avoids
  near-one subtraction losing the small uncovered fraction. Original compositor
  equations and the PA rounding protection remain on the same owner.
* Old Glow's threshold-mask → Gaussian → fractional/repeated Screen algorithm
  is preserved as a linear float extension, distinct from PA's additive Glow.
  Threshold clamps mask coverage only, never HDR/negative RGB. Its radius0 or
  intensity0 is an identity. Intermediates are F32, final publication F16/F32.
* Displacement keeps the original default7, F64 sine controls, Stage-local
  time and nearest/clamp sampling. Preset Displacement(amount3) → Glow(radius14)
  preserves the original separate logical publications. The old preset's
  `color` parameter is unused in its source pipeline and remains unused here;
  it is not advertised as a new color control.

Editable complete chain: `../examples/builtin-chain.tsx`. Numerical and borrowed
fixtures are `builtin-numeric.tsx` / `builtin-borrowed.tsx`. One Native Stage
records all effects; no new Host, device, renderer, shader intake, trust or ABI.
Existing Frameweave source/license notices apply. The only shader adaptation
is the existing Pixel/Compute ABI and local arithmetic guard. R1/version/pin,
catalog, standard named package exports and portable closure belong to Main.

From repository root run `node modules/native-effects/validate.mjs builtin-PHASE`
for `types`, `unit`, `gpu`, `contracts`, `media`, `performance`, `time`,
`inventory`, `evidence`. All attempts and failures share
`artifacts/native-effects/checkpoint-builtin/campaign.json`; no budget reset.
The user explicitly allowed this final existing-library batch below50 names.

14 scoped unit tests, final types and118 real GPU rows pass. These include all7
contracts, F16/F32, three Alpha modes, full declared sigma64/80/200, original
defaults, wide signed HDR, all4 blend modes, entire chain and random/repeats.
The original3e-6/F32 and6e-4/Half gates are unchanged. Two independent dyadic
Screen/near-one-opacity counterexamples are additionally **zero error**; the
initial1-ULP opacity failure is retained and fixed, not given a larger tolerance.
The 30000/1001fps start60 Stage has true local frames0/119/239/6/0, with zero
pixel error. A mixed709/ACEScg operation also matches its reference exactly.
The time fixture's initial invalid top-level Stage.start attempt remains in raw
logs; it was corrected to existing Stage.time, without changing TVG or Core.

Failure after Gaussian/control recording accepts no GPU work; invalid parameters,
pre-abort, retry, borrowed scope, scratch release and repeated close/process exit
pass. PNG was decoded/opened; F32 EXR exactly matches the explicit public buffer
reference including negative/HDR RGB, and four-frame H264 fully decodes. Media
is320x180; numerical chain reference is32x18, not full4K pixel qualification.

RTX5070 Laptop / Vulkan596.49 / Performance power scheme, n10 new frames:
1080p median42.95/P95 54.36ms;4K94.05/222.19ms (outlier retained). Cold init,
first/repeat/random samples and release evidence are recorded. These are whole
JS/control IPC→GPU-complete frame times, excluding display/encoding, not a same
load before/after speedup. One device/program; zero production pixel transfer,
image readback or public buffer export. Control data is33,608/57,608 bytes;
logical allocated image buffers99.5/398.1MB are not physical VRAM peaks. Thermal
state/concurrent load were not controlled. Binary/receipt match all12 frozen
inputs and SHA; no private cache or dependencies are shared.

Explicit remaining boundaries:

* `fw.motion-blur` needs upstream `resample-prefix` temporal image sampling;
  Native FrameContext/inputs do not offer it. No spatial blur alias, private
  renderer, forged cross-frame handles or changes to DAG were introduced.
* Current shared pixelInfo rejects4097x4097 via a fixed16MP gate before resource
  admission. The actual failure is recorded in the time probe. No effect-level
  ceiling was added; owner must assess Native-only device/session-budget
  admission. This module does not bypass that limit or claim general tiling.
* Ordinary seeded noise/control and Graphics Contracts stay pure libraries;
  vector/text/glyph drawing belongs to Agent-2. Particle/spatial/Puppet work is
  deferred by the user. Root plugin examples are now visible in inventory.json,
  with source hashes and boundaries, rather than omitted by modules-only audit.
* Unrestricted CPU Surface import, arbitrary JS pixel/vector callbacks and full
  invalid-intermediate/IEEE rejection parity remain outside delivered Native
  interfaces. Production numeric scans follow owner policy.
* R1 install/export, six delivery modes,4K terminal media, other GPU/OS/software
  adapters, Servo/SpiderMonkey and whole-repository regression are not qualified
  by this campaign. None are implied by source function availability.
