# Native two-dimensional procedural textures

Twenty actual generator algorithms, one admitted Native device and the existing
recipe lifecycle. No new GPU owner, renderer, Stage DAG, JS host or CPU image
fallback. This is a source checkpoint; Main owns public SDK/R1 identity, catalog,
immutable package version, pins, installation and portable integration.

```ts
import {createNativeTextureEffects} from './textures/index.ts';
const effects = createNativeTextureEffects(init); // Native Stage init
const image = await effects.generateImage(async fx => {
  const stone = await fx.graniteTexture({scale: [48,48], seed: 71});
  const wood = await fx.woodTexture({scale: [72,72], opacity: .7,
    low: [-.02,.01,.02], high: [3,.6,.1]});
  return fx.over(wood, stone); // existing source-over, not a new effect
}, {context});
// Stage dispose: await effects.dispose()
```

Complete TSX: `../examples/textures-chain.tsx`, factory `stage.ts::textureScene`.
It mixes real Granite/Wood/Marble GPU outputs in the same Stage. Numerical and
genuine1x1 projects are `textures-numeric.tsx` and `textures-boundary.tsx`.

| Generator | Actual algorithm |
| --- | --- |
| fractalNoise | Normalized octave sum of 3D quintic value-noise (x,y,evolution) |
| turbulentNoise | Octave sum of absolute signed noise |
| ridgedNoise | Squared inverted absolute noise, feedback-weighted multifractal |
| curlTexture | Finite-difference curl of scalar potential; RG direction and B magnitude |
| domainWarpTexture | Two independent offset fBm guides warp the final fBm domain |
| gaborTexture | Sparse seeded Gaussian-windowed oriented sinusoidal impulses |
| cellularTexture | Color identity of the nearest jittered cell feature |
| voronoiEdges | Hermite edge band from nearest/second-nearest distances |
| crackleTexture | Sharp exponential crack response from F2-F1, distinct from Hermite edges |
| marbleTexture | Sinusoidal strata with multi-octave warped phase |
| woodTexture | Radial rings plus octave grain, repeated fractional phase |
| graniteTexture | Three distinct mineral responses mixing coarse noise and cell specks |
| cloudsTexture | Thresholded octave density with exponential transmission |
| causticsTexture | Multiplicative distance gaps of two phase-shifted moving cellular fields |
| bricksTexture | Staggered brick cells, stable per-cell variation, mortar and bevel coverage |
| hexagonTexture | Nearest triangular-lattice hexagonal cell and three-plane edge distance |
| truchetTexture | Seed-oriented paired quarter-circle arcs with explicit stroke softness |
| weaveTexture | Alternating over/under warp and weft strips with cross-thread shading |
| juliaTexture | Escape-time complex orbit at a fixed editable complex constant |
| mandelbrotTexture | Parameter-plane escape-time orbit starting at zero |

Existing Noise, filmGrain, checkerboard and gradients are reused elsewhere and
not renamed/counted here. Shader mode branches implement these distinct equations;
the named functions provide strict typed parameters, not aliases to one look.
There is no implicit 3D field, particle/physics API or time-history simulation.

## Coordinates, time and output

Width/height inherit init; format defaultsRGBA32F. `workingColor` defaults
scene-linear Rec709 and is validated by existing Native image admission.
Colors are authored directly in the declared working RGB space; no existing
image is relabelled. `scale:[64,64]` is pixels per lattice cell. Offset defaults
[0,0] pixels, rotation0 degrees, origin top-left, x right/y down. Pixel centers
are transformed before evaluating the texture. Lattice coordinates are bounded
by real int32 precision/addressing requirements, including octave/warp support.

`low:[0,0,0]` and `high:[1,1,1]` may contain signed HDR RGB. Scalar/vector pattern
weights have an explicit [0,1] palette domain; RGB is never clipped. Contrast1
and brightness0 act on weights before palette mapping. Opacity1 is coverage;
associated RGB is multiplied once and Alpha0 produces canonical zero. F32
publication precedes the owner's Half RNE for F16. No RGBA8 intermediate.

`evolution` is a dimensionless authored noise phase, default0. It is not wall
time or an automatically advancing video frame. Numeric options accept the
existing Signal evaluator with explicit FrameContext. Evolution affects the
noise/warp/Gabor/material families and caustics. Cell IDs, bricks, hexes, Truchet,
weave and orbit families remain static unless their spatial/shape options change.
Random seek/repeat never depends on previous frames. Seed is exact uint32 and
defaults to Stage init seed; it is not narrowed through a Float32 parameter.

Fractal/material defaults: octaves4/lacunarity2/gain.5; warp2 for domain warp,
marble frequency2/warp2, wood frequency4/warp.5. Gabor defaults frequency3,
bandwidth3/impulses2 per neighboring cell. Cellular jitter1 (within-cell features),
edge/crackle/caustics edgeWidth.1. Brick mortar.05/stagger.5/bevel.03. Hex groutWidth.03 and
softness.03. Truchet/weave lineWidth.12/softness.03. Julia constant[-.8,.156]; both
orbit algorithms iterations64/bailout4 (squared radius). Orbit colors are discrete
escape count/iterations, not a smooth/log-potential or arbitrary-precision claim.
Chaotic boundaries can be sensitive to floating-point orbit rounding; all
iteration/coordinate combinations are not parity-qualified.

## Resource, precision and reuse boundaries

No image pixels are computed on CPU. CPU creates small paired frequency/amplitude
control tables. Pixel ABI2 executes all textures; existing source-over composes
their retained GPU images. Actual device limits and int32/uint32 addressing bound
admission; there is no new permanent image/megapixel ceiling. Very high octave/
impulse/iteration populations still cost work and use the owner's timeout and
admission policy. Automatic tiles/global origins and filtered/derivative-based
anti-aliasing are not implemented. These are point-sampled textures, not promises
of alias-free detail at every scale. Downsample deliberately through qualified
resampling when needed.

Parameters reject unknown fields, malformed points, illegal counts, invalid
seeds and nonfinite/unnormal numeric values with `E_NATIVE_TEXTURE_PARAMETER`
and effect/path/expected. Existing image admission errors retain their engine
codes. GPU device/permission/provenance/expiry/cancellation stay with the owner.
SpiderMonkey currently has no global AbortSignal constructor: malformed explicit
signals fail with a located texture diagnostic; Renderer cancellation remains
the verified path. Recipe scratch is released on success/failure; repeated dispose is safe without
disposing the shared device. Missing qualified GPU fails; no CPU/Web fallback.

Fixed EffectCraft MIT originals and hashes are in `sources.json` and `vendor/`.
Altered implementation retains the exact lattice integer hash and Float32
lattice values, quintic interpolation, octave sums and turbulent folds. Paired
coordinates/interpolation replace raw Float32 where needed. Fractal controls are
a deliberately smaller explicit contract, not full upstream/AE UI or bit parity.
Gabor/cellular/material/tile/orbit equations are local implementations; no
third-party rendering framework or license-unknown shader collection is bundled.

## Validation and limitations

Run `node modules/native-effects/textures/validate.mjs <phase>` with syntax,
types, unit, gpu, media, performance, contracts, freeze. The contracts phase
isolates the final SpiderMonkey invalid-signal/cancel/retry check; it does not
repeat the unchanged20-algorithm numerical/media/performance campaign.
All attempts and failures share one
cumulative <420s ledger, below implementation time before tests. Independent
F64 equations use broader nearest-cell searches, direct convolution-free image
evaluation and original uint32 reference hashing. Gates remain scaled3e-6/F32,
6e-4/Half. F16 values must actually be Half-representable. Qualification includes
20 generators, Alpha0/.375/1, signed HDR palettes, frame0/2/4/119/239/3/2,
visible wide-range palettes and genuine1x1, failure/retry/cancel and disposal.

Media: independent full Granite→Wood over→Marble over chain, actual decoded PNG,
Float32 EXR and external decoded lossy SDR MP4. EXR preserves signed HDR values;
MP4 does not claim HDR or PNG-byte parity. Performance reports init/cold/new/
repeat/random frames, cache disabled, complete submit-to-completed, n7 median/P95,
actual adapter/driver/power scheme, pixel transfer and allocation counters.
Control-table uploads are not pixel uploads; counters are not physical VRAM peak.

Other GPU vendors/OS/software adapters, natural-material quality, all working
primaries/parameter/orbit combinations, extreme IEEE domains, antialiasing,
automatic tiling, 4K terminal encoding, full-repository/six-mode regression and
official R1/portable distribution are not qualified by this source checkpoint.
Upstream Stage temporal resampling remains separate Agent-2/Agent-1 work.
