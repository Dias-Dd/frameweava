# Native colour successor

The source facade now exposes the four existing `autoLevels`, `autoContrast`,
`autoColor` and `equalize` algorithms through `createNativeProfessionalEffects`.
Its 81 image methods use the original options, defaults, WGSL/compute equations
and logical F16/F32 publications. No new shader, third-party dependency or GPU
owner is introduced. Original source/provenance remains in
`modules/gpu-image-effects/resident/foundations/statistics.ts` and the existing
foundation `sources.json`. Preserve its repository license notices.

```ts
const raster = createNativeRasterEffects(init);
const effects = createNativeProfessionalEffects(init);
// Inside renderAt; ACEScg input is a Stage-local GPU image:
const working = await raster.processImage(input,
  (image, fx) => fx.exposure(image, {workingColor: linear709, stops: .2}),
  {context});
return effects.processImage(working, async (image, fx) => {
  image = await fx.autoColor(image, {amount: .3});
  return fx.equalize(image, {bins: 17, amount: .2,
    outputBlack: -.2, outputWhite: 2});
}, {context});
// dispose(): await effects.dispose(); await raster.dispose();
```

The existing `workingColor` option is restored across the 23 Raster and six PA
contracts. It requests owner `convertColor` **before** the effect, into F32
scratch; an explicit Half output is still rounded only at the old publication
boundary. There is no clipping, SDR intermediate, CPU pixel loop, fusion or
reordering of effects. Same-color inputs do not add a conversion. Straight,
premultiplied and opaque input metadata remain explicit. Conversion/view handles
participate in the same recipe cleanup, failure, cancellation and borrowed lease.

Numerical RG-offset maps and raw gain maps must already declare the **target**
working encoding. Their RGB is never colour-converted. Mask Alpha is preserved;
ordinary native pixel passes still require identical input/output colour metadata.
Encoded/non-scene working colors are rejected. Opaque publication still needs
the original structural proof. The old Surface APIs and immutable package
snapshots do not change. Main must publish a successor package before claiming
these source additions as installable/portable APIs; no manifest/lock/pin changed.

Statistics use the readonly image-data v1 view, GPU reductions, GPU histogram/CDF
and a GPU pixel application. No CPU image readback/re-upload is performed.
Missing native image-data capability fails `E_NATIVE_EFFECTS_CAPABILITY`.
At the frozen colour checkpoint `importImage` was absent. The later
[input closure](../io/README.md) restores the existing bounded CPU helper;
unrestricted CPU import is not this view or the declared file path. Arbitrary JS pixel/vector
callbacks still have no general GPU compiler. Production invalid-intermediate
scanning follows the existing owner policy; full IEEE-domain rejection parity
is not claimed. No new image-size ceiling or permission is introduced.

Editable TSX: `../examples/color-chain.tsx`; numerical and actual borrowed-scope
fixtures: `color-numeric.tsx`, `color-borrowed.tsx` in that examples directory.
Run from repository root:

```sh
node modules/native-effects/validate.mjs color-runtime
node modules/native-effects/validate.mjs color-types
node modules/native-effects/validate.mjs color-unit
node modules/native-effects/validate.mjs color-gpu
node modules/native-effects/validate.mjs color-contracts
node modules/native-effects/validate.mjs color-media
node modules/native-effects/validate.mjs color-performance
```

All attempts share `artifacts/native-effects/checkpoint-color/campaign.json`.
This is one colour-category campaign after frozen PA22370b1, not a reset of it.
15 unit tests and 246 real GPU rows pass unchanged scaled3e-6/F32 and6e-4/Half
budgets. All29 colour-boundary contracts, four statistics methods, three Alpha
modes, missing coverage, constant colours, signed wide HDR, and the six-operation
chain are included. Repeat/random frames match exactly. Public named buffer
exports are explicit test readbacks; they are disabled in performance runs.
The first failed run omitted the Stage prefix on a named-buffer query; its raw
failure remains. No production shader or tolerance was changed to repair it.

PNG was decoded and opened. Float32 EXR exactly matches the public GPU buffer
reference and contains negative/HDR RGB. Four-frame H.264 is fully decoded and
is lossy SDR. Media qualification is 320x180. RTX5070 Laptop/Vulkan596.49, n10
new frames: 1080p median18.82/P95 20.39ms; 4K31.09/36.93ms. This includes JS,
control IPC, statistics and pixel GPU completion, excludes display/encoding;
there is no same-load pre-migration baseline or speedup ratio. Both use one
device/program, zero production pixel transfer/image readback/buffer export.
Data scratch is16.1/64.2MB; image allocations66.4/265.4MB are logical counters,
not physical VRAM peak. Cold init/first/repeat/random samples remain in raw data.
Power scheme was Performance; thermal/concurrent load was not controlled.

The production executable is a frozen Main delivery copied with its receipt
after all12 current source inputs and executable SHA matched. No build cache,
dependency or output directory is shared. Other GPUs/OSes, software adapters,
Servo/SpiderMonkey, full-repo, R1 install, six-mode/portable export and 4K final
encoding are not qualified by this campaign. Main owns those integration gates.
