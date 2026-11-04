# GPU image effects — checkpoints 1–19

Checkpoint 19 adds `crossfade(first, second, {mix=.5}, ctx?)`: scene-linear interpolation of prepared PM **RGBA**, `first*(1-mix)+second*mix`, with existing keyframes/expressions and native PM/opaque output. It differs from Source-over coverage: partially transparent examples produce Alpha .375 versus .5625. RGB and logical Alpha are calculated by the existing compensated owner in two internal opaque data banks, two draws/one readback per tile; no CPU output blend or unassociation. [BATCH_19.md](../../docs/gpu-image-effects/BATCH_19.md) covers 144 core combinations, signed cancellation, Alpha, 4.2MP and actual Fill→Crossfade→Offset→PNG/EXR/HDR. This two-input primitive is not a general multi-input/temporal accumulation service.

Checkpoint 18 adds `subtractMatte(a, b, options?, ctx?)`: directed coverage difference `A*(1-B)`, canonical black RGB. Both masks' RGB/colour are ignored as data after strict Surface validation; output remains explicit scene-linear float. Existing compensated source-over performs the product/complement in one composite/tile, with no intermediate inverse publication or CPU arithmetic output. [BATCH_18.md](../../docs/gpu-image-effects/BATCH_18.md) records exact coverage/near-one boundaries, 2048 cut-Alpha patterns, 4.2MP GPU and actual feathered-mask/Fill TSX/PNG/EXR/HDR validation. This is distinct from numeric A−B, matte union and image colour compositing.

Checkpoint 17 adds `offsetRGB(image, {offset:[r,g,b]}, ctx?)`: independent scene-linear additive channel offsets with the input's logical Alpha and representation preserved. Straight/opaque RGB adds the resolved Float32 offset; native PM RGB adds offset×Alpha without output unassociation. Offset leaves support existing keyframes/expressions. No `alpha` option, grading Lift/gamma or hidden CPU fallback is added. Compensated source-over performs the actual GPU sum/product; wide fractional-mask precision refusal remains unchanged. [BATCH_17.md](../../docs/gpu-image-effects/BATCH_17.md) records real GPU/4.2MP/TSX/PNG/EXR/HDR verification and formal integration limits.

```ts
const shifted = await offsetRGB(image, {offset:[-.1, .03, .2]}, ctx);
```

Checkpoint 16 adds `multiply(foreground, background, options?, ctx?)`: coverage-aware image Multiply, with existing Signal opacity and native PM/opaque output. It is distinct from raw gain-map `modulate`: partial coverage contributes outside-overlap terms and changes output Alpha. The existing compensated owner performs all RGB/Alpha arithmetic; Screen and Multiply share only a small two-mode layout/admission helper. [BATCH_16.md](../../docs/gpu-image-effects/BATCH_16.md) records 160 numerical rows, real GPU comparison, 4.2MP tests, complete Screen regression and actual Fill→Multiply→Surface Port→Screen→PNG/EXR/HDR. A separate real staged-rounding counterexample supports the [minimal signed RGB operator request](../../docs/gpu-image-effects/SIGNED_RGB_OPERATOR_REQUEST.md); no Unsharp/new shared operator is claimed as implemented.

```ts
const shaded = await multiply(image, plate, {opacity:.7}, ctx);
```

Checkpoint 15 adds `screen(foreground, background, options?, ctx?)`: coverage-aware scene-linear Screen on the existing compensated GPU owner, with Signal opacity and native PM/opaque publication. Positive coverages simplify to S+B−S×B; zero-Alpha emission follows the established coverage formula, not an opaque RGB shortcut. HDR/negative output is not clipped, and explicit Half overflow fails. Old unmarked owners, wide nonlinear inputs and out-of-bound unassociated colours retain explicit rejection. [BATCH_15.md](../../docs/gpu-image-effects/BATCH_15.md) contains the exact-reference 159 numerical rows, original cancellation counterexamples, true 4.2MP GPU/TSX/PNG/EXR/HDR tests, Over regression and integration limits.

```ts
const lit = await screen(lightImage, plate, {opacity:.7}, ctx);
```

Checkpoint 14 adds `over(foreground, background, options?, ctx?)`: standard compensated scene-linear Porter–Duff source-over with existing Signal opacity. Same-size float inputs may be straight/PM/opaque; output is native **PM/opaque only**, defaulting to background precision/working colour. Explicit straight output is rejected, with an actual low-Alpha/HDR cancellation counterexample retained; PM error bounds cannot qualify arbitrary CPU unassociation. The existing owner must expose the shipped `compensated-f32-v1` identity **and** an available qualified GPU; identity never bypasses the data-dependent precision gate or permissions. Old unmarked owners fail before user uploads. [BATCH_14.md](../../docs/gpu-image-effects/BATCH_14.md) records the fixed ae900 source closure, 156 numeric rows, 4.2MP GPU/TSX/PNG/EXR/HDR evidence, publication counterexamples and formal release boundary.

```ts
const result = await over(front, plate, {opacity:.7}, ctx);
```

Checkpoint 13 adds `modulate(image, rgbGains, options?, ctx?)`: raw spatial per-channel RGB coefficient multiplication, with image Alpha preserved. Gain RGB is dimensionless data in the exact declared working-colour basis, never colour-converted or Alpha-unassociated; gain Alpha is ignored but strictly validated. Same-size RGBA16F/32F inputs required. Negative gains/HDR are preserved; input/product numerical admission and Main's unchanged wide Multiply refusal remain explicit. The existing opaque GPU Multiply computes the RGB, with CPU layout/PME preparation and logical Alpha publication only. This is a two-input data operation, neither a constant exposure alias nor ordinary coverage-based Multiply blend. See [BATCH_13.md](../../docs/gpu-image-effects/BATCH_13.md) for 36 core combinations, real hardware/both-owner/4.2MP tests, TSX Surface Ports and EXR/HDR evidence.

```ts
const graded = await modulate(image, perPixelRGBGains, {}, ctx);
```

Checkpoint 12 adds `replaceMatte(image, mask, options?, ctx?)`. It recovers source straight working colour `C`, then **replaces** coverage with mask Alpha: default PM output is `RGB=F32(C*A_mask)`, `A=A_mask`; explicit straight output retains `C`, including hidden colour when new Alpha is zero. Same-size float Surfaces required. Source PM at zero Alpha with nonzero emission cannot provide a defined straight colour and fails explicitly; PM zero/zero recovers canonical black. Straight input may reveal previously hidden RGB. Source Alpha is not an extra mask factor.

```ts
const cutout = await replaceMatte(image, mask, {}, ctx);
const straight = await replaceMatte(image, mask, {alpha:'straight'}, ctx);
```

Standard CPU Alpha association/PME colour preparation precedes GPU work. PM/opaque output uses existing GPU mask multiplication; straight output uses a private emission-colour copy plus black-Alpha Lighter to assemble **all output channels on GPU**. The temporary data is not colour-converted or exposed as a public PM image. There is no CPU channel merge or matte product used as output. Source RGB and mask Alpha are strictly validated; prepared colour and new nonzero coverage must be normal F32. Nonzero subnormal F32 products fail; correctly rounded F32-zero products are valid. Explicit Half overflow fails. Mask RGB/encoding is data-independent, while source colour uses explicit scene-linear working metadata. Default format is source and default Alpha is PM; existing `applyMatte` keeps its original defaults and multiplication behaviour.

The fixed Main owner accepts verified wide straight assembly and binary-matte PM cases; wide fractional PM multiplication still returns its unchanged precision diagnostic. See [BATCH_12.md](../../docs/gpu-image-effects/BATCH_12.md), `tests/gpu-image-replace-matte{,-gpu}.test.ts`, and `scripts/verify-gpu-image-effects.ts --replace-matte` for both-owner proof, actual Surface-port roundtrips, comparison PNG and EXR/HDR. It remains a Surface/readback implementation, not resident.

Checkpoint 11 adds `invertMatte(mask, options?, ctx?)`: **coverage complement**, `Alpha=Float32(1-sourceAlpha)`, canonical RGB zero. Source RGB, colour and association are not interpreted as coverage. This is distinct from colour `invert()`, whose Alpha stays unchanged. Output defaults to source format and premultiplied Alpha; straight output is also canonical black. Opaque output requires all source coverage zero.

```ts
const outside = await invertMatte(mask, {}, ctx);
const soft = await feather(outside, {radius:1.25, boundary:'clamp'}, ctx);
const cutout = await applyMatte(image, soft, {}, ctx);
```

The GPU composites black with source Alpha over an explicit opaque white plane, producing RGB `1-A`. CPU only copies that returned data channel into final Alpha. No CPU inversion, source colour transform, clipping or new Shader/Host. **All legal Float32 Alpha, including subnormal and -0, is admitted**: F32(1-A) is zero or at least 2^-24; flushing subnormal A still rounds the result to exactly one. This operation does not weaken RGB/Alpha numerical floors in other effects. Input RGB still passes the existing finite Surface validator, even though it is ignored. Output colour metadata must be scene-linear; supply explicit `workingColor` for encoded mask metadata without interpreting its RGB as coverage. Existing buffer budgets/tiling/gate/cleanup apply, with two draws/one readback per tile. It is not resident.

See [BATCH_11.md](../../docs/gpu-image-effects/BATCH_11.md) for the analytic domain, 8192 sampled Alpha patterns, both-owner hardware results, EXR F64 oracle and an actual Invert→Feather→Apply Matte scene. `node --import tsx --test tests/gpu-image-invert-matte.test.ts tests/gpu-image-invert-matte-gpu.test.ts`; L2: `node --import tsx scripts/verify-gpu-image-effects.ts --invert-matte`. The same explicit Main overlay selector from B10 is supported, with the same non-release boundary.

Main package: gpu-image-effects@0.5.0, installed through the existing R1 catalog with explicit local:frameweave.gpu-images trust. Import the twenty-two creative functions from gpu-image-effects using normal TypeScript named imports. The initializer and disposal remain Stage-local. The diagnostic gpuImageStats function is additional infrastructure, not a creative effect.

Main uses the qualified compositor directly, without a source overlay. Its conservative range proof is part of the executable contract: some finite wide Exposure/Invert inputs and correlated wide Add inputs fail E_GPU_FLOAT_PRECISION before upload. A finite mathematical answer alone does not establish GPU support. Numerical tests separate exact successful results from explicit zero-allocation rejection; no tolerance, shared GPU shader, permission or CPU fallback policy is loosened. Earlier branch reports below retain their original owner/version scope.

Checkpoint 10 adds `add(first, second, options?, ctx?)`, standard Plus/Lighter compositing: prepare both inputs as working-space premultiplied Float32, **sum RGB without clipping**, saturate coverage to `min(1,A+B)`. Same dimensions required, output format defaults to first, Alpha to premultiplied. Straight hidden RGB contributes through its coverage; PM zero-coverage emission contributes directly. No implicit transforms, weights, opacity, Screen or generic blend switch.

```ts
const sum = await add(warmImage, coolImage, {}, ctx);
```

Two Lighter passes/one readback per tile use the existing professional compositor. CPU performs existing PME preparation, layout/range validation and publication only; actual RGB/Alpha addition comes from GPU. Both prepared PM RGB and arithmetic coverage require zero or normal finite F32, as must nonzero RGB sums. Overflow and unrepresentable Half/straight/opaque publication fail explicitly. No CPU/SDR/software replay. See [BATCH_10.md](../../docs/gpu-image-effects/BATCH_10.md) for both-owner tests, actual two-input Stage scene, EXR/HDR and resource evidence.

**New Main owner compatibility:** B10 independently runs the immutable `083a1d02976a9bafd5289e378c19a32d46a90ade` compositor and all 15 closed static source dependencies in an acceptance-only source overlay. It also verifies bounded Exposure/Invert cases. That owner rejects **wide opaque Multiply** (`E_GPU_FLOAT_PRECISION`, before buffers) even when its F32 product is finite; B8/B9's older-owner wide successes do not establish current Main support. Plus accepts verified wide scalar cases, but conservative cross-pixel range bounds can reject correlated wide images whose exact per-pixel sums are finite. These rejections are preserved as runnable cases, never bypassed. The overlay is not an installed Main SDK, default Final or formal R1 release test; no shared source/pin/permission changes are made.

Checkpoint 9 adds `invert(image, options?, ctx?)`: a scene-linear RGB negative about working white **1** (in the encoding's reference-white units). Straight/opaque `RGB'=1-RGB`; premultiplied `RGB'=Alpha-RGB`. Alpha is unchanged. HDR above white becomes negative, negative RGB becomes above-white; nothing is clipped. Zero-coverage PM emission changes sign. This is neither Alpha inversion, display-gamma inversion nor an exposure alias.

```ts
const negative = await invert(image, {}, ctx);
```

The existing compositor executes opaque Multiply(-1), then Lighter(+coverage), in three GPU passes/one readback per tile. CPU copies Alpha into an RGB data plane for PM inputs, or prepares white=1 for straight/opaque; subtraction results come only from GPU. This operates on actual numeric colours, never B7 bit payloads. Original logical Alpha is restored unchanged, including -0. Source RGB and subtraction result require zero or normal finite F32. PM coverage used as RGB must also be zero or normal F32; tiny nonzero PM coverage fails explicitly. Straight coverage can be subnormal because it never enters arithmetic. Output format/Alpha conversion and existing zero-coverage colour-conversion limits follow B8. No promise that twice inverting is bitwise identity after floating-point publication. See [BATCH_9.md](../../docs/gpu-image-effects/BATCH_9.md); run `tests/gpu-image-invert{,-gpu}.test.ts` and `scripts/verify-gpu-image-effects.ts --invert` for the real Tile→Exposure→Invert→EXR/HDR scene.

Checkpoint 8 adds `exposure(image, {stops=0}, ctx?)`: **scene-linear RGB gain** `Float32(2**stops)`, keeping original logical coverage. No gamma, display tone mapping, offset or clipping. Input/output format and Alpha mode default to input. Negative RGB, HDR, hidden straight RGB and PM zero-coverage emission are retained in the same working encoding. Original Alpha is copied unchanged (including subnormal/-0), rather than run through gain or compositor opacity.

```ts
const bright = await exposure(image, {stops:1.5}, ctx);
```

RGB gain executes on the existing professional compositor's opaque **Multiply**; CPU only prepares colour/constant planes and publishes GPU RGB plus original Alpha. This is actual floating-point colour arithmetic, unlike B7's closed bit transport. All internal image/gain planes have Alpha 1 so signed HDR multiplication avoids the older owner's source-over/Screen cancellation problem. No new Shader, Host or private device access. Prepared RGB and its product must be zero or normal finite F32; subnormal RGB flushing/overflow explicitly fails, never clips or falls back. Gain must be positive normal finite F32, with no arbitrary artistic stops limit. Requested Half overflow is preflighted; explicit output Alpha conversion uses the existing publication rule. Cross-encoding PM zero-coverage emission still rejects because existing PME cannot retain it safely. Same-format Alpha is bit-preserved; no bitwise sign-of-zero promise for RGB arithmetic.

See [BATCH_8.md](../../docs/gpu-image-effects/BATCH_8.md). L0/L1: `node --import tsx --test tests/gpu-image-exposure.test.ts tests/gpu-image-exposure-gpu.test.ts`; real multi-Stage TSX/HDR: `node --import tsx scripts/verify-gpu-image-effects.ts --exposure`. The example passes tile/reframe output through a typed Surface Port to exposure with -1→+1 stop keyframes.

Checkpoint 7 adds `tile(image, options?, ctx?)`: integer point-sampled repeat or mirrored repeat. Output dimensions default to **Stage dimensions**, offsets to `[0,0]`, mode to `repeat`. Offsets/dimensions accept existing Signal leaves, whose evaluated values must be safe integers. Coordinates are physical pixels, top-left/y-down. Mirror duplicates edge texels (`0,1,2,2,1,0`); no resampling, subpixel phase, arbitrary scale/rotation or complete EffectCraft Motion Tile parity is implied.

```ts
const pattern = await tile(texture, {mode:'mirror', offset:[16, -8]}, ctx);
```

The existing GPU compositor assembles a periodic seed then doubles it along each axis. CPU only packs contiguous input regions and decodes actual GPU output, never repeats/reflections output pixels or runs a reference fallback. A **private Stage-local RGB24 bit representation** preserves finite Float32 data exactly, including signed zero, subnormal RGB/Alpha, negative HDR, hidden straight RGB and zero-coverage PM emission. It is not a colour Surface/AOV/TVG contract: never exported, colour-converted, filtered at fractional coordinates or Alpha-mixed. Its physical Alpha is binary rectangle coverage; every intermediate readback validates payload integers and filled coverage. Only decoded legitimate image Surfaces leave `tile`. Same-encoding, same-format/mode output is bit-exact; explicit colour/Alpha/format conversion retains normal PME publication semantics. As with B6, cross-encoding zero-coverage PM emission fails rather than being silently removed.

Budget-driven tiles and logarithmic copy passes avoid one layer per repeat. This implementation has two data-plane uploads/readbacks per copy step; it is **not GPU resident**. It shares the existing owner/gate/failure latch and adds no device, Host or Shader. See [BATCH_7.md](../../docs/gpu-image-effects/BATCH_7.md) for hardware, tests, costs and the still-unresolved low-Alpha `tile → Gaussian → Glow` qualification failure. Acceptance: `node --import tsx --test tests/gpu-image-tile.test.ts tests/gpu-image-tile-gpu.test.ts`, then `node --import tsx scripts/verify-gpu-image-effects.ts --tile`. The real TSX example uses `tile → reframe` with transparent regions and EXR/HDR delivery.

Checkpoint 6 adds `flattenBlack(image, options?, ctx?)`: composite onto scene-linear black and output coverage **one**. Prepared premultiplied RGB is retained, rather than discarding straight Alpha or unpremultiplying. Default format is inherited and Alpha metadata is opaque; explicit straight/PM still has all coverage=1. No arbitrary backdrop colour, opacity, blend mode, inpainting or unmatting is implied.

```ts
const opaque = await flattenBlack(image, {}, ctx);
```

This shares the existing compositor owner, with one source upload/pass/readback per tile and no unused mask upload. CPU only performs existing PME colour preparation and standard F32 premultiplication; GPU source-over onto opaque zero RGB performs Alpha removal. All source Alpha values, including subnormal Float32, are valid for this operation. Qualified prepared RGB is zero or normal finite F32 (>=2^-126 in magnitude); GPU subnormal RGB flushing is explicitly rejected. Wide F32 radiance and additive PM RGB at zero coverage are retained in the same encoding. The existing PME colour transform canonicalizes zero-coverage RGB during an encoding change, so that case fails explicitly: first flatten in the source encoding, then explicitly convert the opaque result (verified). Half representability is preflighted; an explicit Float32 retry is allowed, without clipping/replay. See [BATCH_6.md](../../docs/gpu-image-effects/BATCH_6.md).

L0/L1: `node --import tsx --test tests/gpu-image-flatten.test.ts tests/gpu-image-flatten-gpu.test.ts`; real R1/TSX/EXR/HDR10: `node --import tsx scripts/verify-gpu-image-effects.ts --flatten-black`. The side-by-side example compares the original on black with the flattened output, while separately validating the typed Port's changed Alpha.

Checkpoint 5 adds **one** channel operation, `alphaToRGB(mask, options?, ctx?)`. By default it copies Alpha into all three scene-linear RGB channels and makes every output Alpha **one**: an opaque grayscale view, rather than white Fill with retained transparency. Optional `color:[r,g,b]` multiplies the extracted Alpha by a working RGB vector (default `[1,1,1]`), including signed/HDR values; its Signal leaves reuse FrameContext. Input RGB is ignored. This is not arbitrary RGB routing, Luma extraction, gamma, inversion or general channel mixing.

```ts
const view = await alphaToRGB(mask, {}, ctx); // opaque grayscale
const signedView = await alphaToRGB(mask, {color:[3, -.5, 1]}, ctx);
```

Input/output stay RGBA16F/32F, output format defaults to input, output Alpha metadata defaults to opaque. Explicit straight/PM still has coverage 1. Working color must be explicit scene-linear or inherited from compatible input metadata; encoded input requires `workingColor`. Input Alpha is data, not color-converted or unpremultiplied, and nonzero values must be >=2^-100. RGB vector values use the existing ±65504/no-tiny-below-2^-100 qualification and are prepared as Float32 constants; the GPU computes color×Alpha over an opaque zero background using existing F32 buffers. No RGBA8 pixel intermediate or CPU channel-to-RGB loop is used. Final Half is ties-to-even from F32 storage, not a promise of direct Float64→Half equivalence near rounding ties. Gates remain F32 `3e-6` / Half `6e-4`.

L0/L1: `node --import tsx --test tests/gpu-image-alpha-rgb.test.ts tests/gpu-image-alpha-rgb-gpu.test.ts`; real R1/TSX/EXR/HDR10: `node --import tsx scripts/verify-gpu-image-effects.ts --alpha-rgb`. See [BATCH_5.md](../../docs/gpu-image-effects/BATCH_5.md). `scripts/probe-gpu-image-blend.ts --orientation` preserves the separate 90° straight-alpha counterexample; rotation is not published.

Checkpoint 4 adds `mergeMatte(first, second, options?, ctx?)`, a binary **coverage union**. It returns canonical black RGB and Alpha `b + a*(1-b)` (first is the base, second is over). This is not geometric/fuzzy max, clipping, subtraction, inversion, or generic colour Blend. A soft .5 mask merged with itself gives .75; binary masks give Boolean union. Alpha is data: both masks' RGB, encoded transfer and premultiplication interpretation do not affect coverage. Output working color defaults to the first mask's metadata and must be scene-linear; supply explicit `workingColor` if that metadata is encoded. Format defaults to the first mask; Alpha defaults to PM. Both masks require identical dimensions and RGBA16F/32F; nonzero Alpha >=2^-100. Canonical RGB=0 makes straight publication safe even for such tiny coverage. Opaque publication requires full resulting coverage, otherwise fails explicitly. No opacity/backend/mode shortcuts are exposed.

```ts
const coverage = await mergeMatte(leftMask, rightMask, {}, ctx);
const cutout = await applyMatte(image, coverage, {}, ctx);
```

This uses two source-over passes in one existing compositor call/readback per tile, reusing the same B2/B3 owner; CPU only packs Alpha planes. It does not certify the B3 generic high-HDR RGB Blend counterexample. Repeated calls retain existing F32 publication boundaries and fixed input order; no bitwise associativity/commutativity across reordered multi-mask trees is promised. See [BATCH_4.md](../../docs/gpu-image-effects/BATCH_4.md); L0/L1: `node --import tsx --test tests/gpu-image-merge-matte.test.ts tests/gpu-image-merge-matte-gpu.test.ts`; L2: `node --import tsx scripts/verify-gpu-image-effects.ts --merge-matte`.

Checkpoint 3 adds one raster operation, `reframe()`: integer crop/transparent padding plus optional whole-rectangle horizontal/vertical reflection. See [BATCH_3.md](../../docs/gpu-image-effects/BATCH_3.md). It is not resize, arbitrary affine/perspective, or a claim that all compositor blends are qualified.

```ts
const mirroredCrop = await reframe(image, {
  x: -16, y: 8, width: 1920, height: 1080, flipX: true,
}, ctx);
```

Coordinates are physical source pixels, top-left origin, y down. Output size is exact; missing source pixels are transparent. Flips act **inside the rectangle after cropping/padding**. Sizes default to input dimensions, x/y to zero, flips to false. Existing Signal evaluation is reused, but evaluated coordinates/sizes must be safe integers: fractional values fail, with no hidden rounding. Opaque input defaults to premultiplied output for transparent padding. Existing PME prepares working color/premultiplication; Alpha=0 becomes canonical RGB=0, qualified nonzero Alpha is >=2^-24. Integer sampling accepts extended F32 RGB beyond Half range; requesting Half overflow explicitly fails. No subpixel interpolation, periodic/clamped edge or time transformation is implied.

The CPU packs increasing-order source ROIs plus a pixel border; the existing GPU compositor applies translation/reflection. This shares the B2 owner, gate, counters, abort/close and failure latch, with one readback per tile and no additional owner. Pixel Pass need not initialize for pure `reframe`. Run `node --import tsx --test tests/gpu-image-reframe.test.ts tests/gpu-image-reframe-gpu.test.ts` for L0/L1 and `node --import tsx scripts/verify-gpu-image-effects.ts --reframe` for R1/TSX/EXR/HDR10 with the local media environment below.

**Blend qualification gap:** `node --import tsx scripts/probe-gpu-image-blend.ts` reports B3's Screen HDR cancellation and near-one opacity counterexamples on the baseline owner. Probe execution success is not blend acceptance; inspect its actual/expected/error and `passes` fields. General `blend()` remains unshipped while Agent-1 qualifies the shared owner; the `3e-6` gate is unchanged.

Implemented operations: **Gaussian blur**, **threshold/Gaussian/additive Glow**, **Alpha Feather**, **Alpha-preserving Fill**, **Apply Alpha Matte**, **Drop Shadow (shadow-only)**, **integer Reframe**, **coverage Merge Matte**, **Alpha-to-RGB**, **Black-matte Flatten**, **integer Repeat/Mirror Tile**, **scene-linear Exposure**, **RGB Invert**, **Plus/Additive**, **Coverage Complement**, and **Replace Alpha Matte**. Gaussian/Glow use existing Pixel Pass; subsequent functions reuse the supported Stage-local professional compositor. These are sixteen function contracts, not sixteen new Shaders. No new GPU owner implementation, Renderer, registry or animation system is created. Old PA-1/PA-2 synchronous CPU APIs are unchanged. Checkpoint reports give exact contracts and verified scope.

Main confirmed that shared `modules/gpu-effects` remains Agent-1-owned. This module changes none of it. General RG-map Displacement, Curves/Levels/LUT/Channel Mix, morphology/keyers, weighted accumulation and resident batch remain explicitly **unimplemented here**. Exposure reuses opaque Multiply and does not imply a new generic pointwise interface exists.

## Using the independent module now

```ts
import {defineMediaStage} from '@frameweave/engine/web';
import {createGpuImageEffects} from './modules/gpu-image-effects/index.ts';

export const filter = defineMediaStage(init => {
  const effects = createGpuImageEffects(init);
  const {blur, glow} = effects;
  return {
    async renderAt(ctx, inputs: {image: ProfessionalSurface}) {
      const soft = await blur(inputs.image, {radius: 1.25}, ctx);
      return {surface: await glow(soft, {radius: 8, threshold: 1, intensity: 1}, ctx)};
    },
    dispose: effects.dispose,
  };
});
```

Use the relative path appropriate to your project and import `ProfessionalSurface` as a type from the SDK. No GPUTexture, Shader pipeline or vendor selection is exposed to the consumer. Input dimensions, format, Alpha and scene color are inferred from the existing Surface. `FrameContext` is only needed for Signal options; it is the existing animation evaluator, not another clock.

The existing R1 initializer in `bindings.ts` exports all sixteen effect functions and `gpuImageStats` per Stage. Real named-import examples are the twelve `validation/managed*.tsx` scenes; their `test.gpu-images` import is installed **only by the acceptance verifier**. Main owns the final package ID/version/manifest and unified SDK export. No official installable package or root export is claimed in this branch. Direct unbound imports of `public.ts` functions fail `E_GPU_IMAGE_BINDING`; they never create an ambient singleton.

## Options and precision

### Checkpoint 2 functions

```ts
const tint = await fill(image, {color:[3, -.5, 1], opacity:.8}, ctx);
const softMask = await feather(mask, {radius:2}, ctx);
const cut = await applyMatte(tint, softMask, {alpha:'premultiplied'}, ctx);
const shadow = await dropShadow(cut, {
  radius:3, offset:[8.5, 5.25], color:[.1, .3, 3], opacity:.8,
}, ctx);
// shadow is a standalone surface: place the original above it with normal Layer.
```

`fill` replaces RGB in explicit working-space units and preserves/scales input Alpha. `applyMatte` multiplies source premultiplied RGBA by same-size matte Alpha/opacity; RGB and encoding of a matte are not interpreted as image colour. It is not replace-matte, Luma key or inverted matte. `feather` returns canonical black RGB with Gaussian-blurred Alpha. `dropShadow` returns only a coloured shadow, with transparent sampling outside the source and original output bounds; it does not silently include the original, grow the canvas or use an arbitrary 8-bit shadow implementation. Fractional offsets use the existing compensated affine sampler.

Mask blur uses per-tile source neighborhoods including out-of-frame padding **before** translation, so blur energy is not cut off at the source frame and incorrectly lost after an offset. HDR colourization and mask multiplication run on GPU; the host only prepares scalar parameters, constant colour planes, canonical Surface data and tile/Alpha channel packing.

Fill/Matte use one existing compositor owner per active tile shape; Feather/Shadow also use the existing Gaussian owner. These are two instances of the **same existing library owner implementation**, not a new device system, and there are explicit readback/transfer boundaries. Replaced owners are closed and checked for zero live buffers/textures. Current public SDK/web lacks the compositor re-export, so the acceptance fixture normally bundles the unchanged Stage-local compositor/Core source; Main can expose the already-existing factory to remove duplicate bundle bytes. No private GPU handle is accessed.

The B2 colour-producing compositor profile bounds unassociated source/constant RGB to ±65504 and rejects invalid/subnormal-risk inputs. Gaussian Alpha keeps its existing >=2^-24 floor; compositor-only Alpha data may be >=2^-100. Nonzero opacity must be >=2^-24. B2 straight output requires safe normal-coverage bounds and every nonzero published Alpha >=2^-24; otherwise it fails explicitly and callers can request PM. These are numerical qualification errors, never clipping or CPU fallback, and do not change Gaussian/Glow domains. B3/B4's separate qualification is stated above. F32 `3e-6` / Half `6e-4` gates are unchanged.

For GPU diagnostics, inspect `stats().compositing` as well as the original Pixel Pass counters: a pure Fill/Matte call need not initialize the Gaussian owner (`core` may be null). The compositor's `availableBackend` becomes `cpu` after its device is disposed; its last executed `backend:'webgpu'` and `closed`/zero-live-resource fields distinguish this from CPU execution.

### Checkpoint 1 functions

- `blur(input, {radius=1, boundary='transparent', ...output}, ctx?)`: sigma in physical pixels, existing qualified interval 0..64, normalized finite ±ceil(3σ) Gaussian. `clamp` is explicit; transparent edges do not renormalize.
- `glow(input, {radius=8, threshold=1, intensity=1, boundary='transparent', ...output}, ctx?)`: existing PA luminance threshold in working-white units and signed HDR energy addition. Intensity 0 is identity; saturation of **coverage** follows the existing Glow definition and is not RGB clipping.
- `output`: `workingColor`, `format`, `alpha`, `maxBufferBytes`, `signal`. Output stays RGBA16F/32F, defaulting to input precision. Opaque input defaults to premultiplied output, as in the existing CPU/Pixel Pass contract. Encoded/display input needs explicit scene-linear `workingColor`.
- CPU work consists of existing validation, color preparation, value transfer, tile copying and publication. **No CPU blur/Glow algorithm is imported into runtime.ts.** CPU and independent F64 algorithms exist only in validation code.
- WebGPU is chosen by the existing owner's automatic mechanism. WebGL2/Canvas8 or known software/fallback adapters fail `E_GPU_IMAGE_BACKEND`. Out-of-domain/limit `unsupported` fails `E_GPU_IMAGE_UNSUPPORTED`; there is no CPU replay. Post-commit exceptions retain their original code and owner's failure latch.
- Existing Pixel Pass qualification still applies: bounded signed PM RGB, nonzero alpha floor, tiny-RGB restrictions, and additional unassociated-value bound for straight publication. This checkpoint does not widen the proven F32 numerical domain, loosen epsilons or clip values to make qualification pass.

## Tiling and ownership

The facade has no 4MP/8K/16K whole-effect limit of its own. It plans tiles from configurable CPU/GPU budgets; the existing owner's 16MP allocation ceiling is applied **per tile**, never to total work. Gaussian/Glow read a `ceil(3σ)` neighborhood on both axes. Only interiors publish; image edges use the chosen global boundary. A forced-tile test checks exact equivalence to whole-image GPU processing. The planner handles narrow images without requesting a tall unnecessary Canvas.

`createGpuImageEffects(init, {maxWorkingBytes, maxBufferBytes, maxTilePixels})` accepts explicit resource budgets. Defaults are 512MiB estimated owned CPU work and 512MiB logical GPU budget. CPU estimate excludes caller-owned input; physical driver/GC peak memory is unknown. `maxTilePixels` is an optional tile-work budget, not an image-size limit. Insufficient neighborhood memory fails clearly. Device binding/allocation limits still apply; an unsupported job currently fails rather than automatically retrying with smaller tiles. Choose a smaller explicit tile budget if needed.

The existing Surface v2 currently limits dimensions to16384 and total storage to512MiB. These are **pre-existing shared-contract limits**, not new algorithm limits; Main must review any future larger/file-backed Surface contract. This module does not alter them or pretend all algorithms can tile.

Each Stage-local Pixel Pass/compositor owner persists across applicable operations. The compositor uses a fixed tile shape, padding border tiles; shape/budget changes retire its previous owner before replacement. Calls serialize through one facade gate; overlapping calls fail `E_GPU_IMAGE_BUSY`. `dispose()` rejects new calls, waits a pending operation's cleanup and shares completion among callers. Abort is checked before work, between tiles and after GPU completion; it does not destroy a shared device mid-command. Cancelled/failed calls do not publish a partial output. GPU work that already completed is not rolled back.

As with the existing owner, keep input metadata and nested output options stable until an invocation settles. The facade does not mutate its input and decodes pixel values into independent storage; it does not promise concurrent mutation of borrowed metadata is transactional.

Stats `calls`/`failedCalls` count invocations that passed option resolution and entered processing. Parameter/busy/closed rejections before processing are not counted. `tiles`/`readbacks` count successful tile results; post-commit failures retain the owner's submission count and cleanup stats in the structured error.

**Current residency boundary:** the public Pixel Pass reads each tile back to a value Surface. Adjacent ordinary calls therefore have a Surface boundary/readback; this is not a resident chain or zero-copy implementation. The pending Main/Agent-1 batch interface must preserve every Half/straight publication boundary. No private raw GPU handle is smuggled through TVG/P4.

## Validation and reproduction

```powershell
node --import tsx --test tests/gpu-image-effects.test.ts tests/gpu-image-effects-gpu.test.ts
npm run typecheck
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
$env:FRAMEWEAVE_MEDIA_PYTHON = Join-Path (Get-Location) '.frameweave/pme-python/Scripts/python.exe'
$env:FRAMEWEAVE_FFPROBE = (Get-Command ffprobe).Source
node --import tsx scripts/verify-gpu-image-effects.ts
node --import tsx --test tests/gpu-image-matte.test.ts tests/gpu-image-matte-gpu.test.ts
node --import tsx scripts/verify-gpu-image-effects.ts --matte
```

The Python environment is explicitly provisioned with the existing `tools/professional-media/setup.ps1`, not installed by runtime. `verify-gpu-image-effects` creates a temporary reviewed R1 fixture package and new project locks, leaves existing tracked locks unchanged, executes real TSX, and writes actual PNG/EXR/HDR10 artifacts. It hashes the implementation and shared protected sources before/after.

Important shared integration boundary: current default non-preview Renderer policy forces SwiftShader. The verifier selects existing `mode:'preview'` hardware policy with explicit full160×90 dimensions, `previewCompute` disabled, and obtains full-precision `mediaFrame` data for EXR/HDR. No default CLI final-render hardware-selection claim is made. Main must review GPU-required project policy along with public package wiring; no Renderer flags or security policy are changed here.

Raw evidence, backend/device identity, exact commands, numerical tolerances and unverified scope are in [batch 1](../../docs/gpu-image-effects/BATCH_1.md) and [batch 2](../../docs/gpu-image-effects/BATCH_2.md). [INVENTORY.md](INVENTORY.md) lists247 concrete upstream catalog entries; it is not a list of247 implemented Frameweave effects. [sources.json](../../docs/gpu-image-effects/sources.json) pins the upstream commit, source hashes/licenses and existing local kernels. No upstream code or third-party binary was newly copied into runtime in this batch.
