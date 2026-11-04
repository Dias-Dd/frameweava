# Spectral ocean + shallow coast (candidate)

```ts
import {oceanScene, shoreScene, oceanShore, oceanWake} from 'spatial-ocean-candidate';
const water = defineNativeStage(init => shoreScene(init, {
  dimensions:[64,64], size:[24,24],
  shore:oceanShore({depth:1, slope:[.15,0]}),
  wakes:[oceanWake({center:[-4,0], acceleration:[.5,0]})],
}));
```

Options at module scope must be plain TS data. Managed helper calls execute inside the initialized Native Stage; they are not build-time functions.

Editable full shot: `examples/ocean.tsx`. Standard Stage/Layer and existing NativeGPU
scope, original Core time, fixed steps/replay and seed functions. No new engine/clock.
`oceanScene` is open ocean; `shoreScene` adds actual nonlinear shallow-water depth,
momentum and topography. Defaults are editable; low-level simulation/renderer expose
borrowed resident typed buffers without transporting them outside the Stage.

Spectrum: Phillips density adapted from WebTide a60d603288a88a7f6091af7aa375a7e0b018f42a,
MIT, original selected files/license/hashes carried in vendor/webtide. Existing Core RNG
produces reproducible Gaussian seeds on CPU (control data only). GPU time evolution
uses Hermitian pairs, finite-depth dispersion and six independent complex channels:
height, X/Z choppy displacement, height derivative and horizontal X/Z velocities.
Two-dimensional radix2 inverse FFT is resident GPU, normalized by 1/(Nx*Nz). Modular
negative indices and real Nyquist derivatives fix adaptation hazards in the reference.
No BabylonJS runtime, texture/sky assets, Shadertoy shader or external FFT host copied.
JONSWAP is an independent scalar angular-frequency PSD helper, not a second built-in
spectrum generator profile. No unsupported spectral cascades are silently inserted.

Shore: first-order hydrostatic-reconstruction Rusanov finite volumes for nonlinear
Saint-Venant depth and X/Z momentum. Mathematical reference: [Audusse et al.2004](https://perso.math.u-pem.fr/bouchut.francois/publications/hydroproj_published.pdf); equations adapted, no paper text or external solver runtime copied. Actual positive bathymetry can be dry. Reflective
walls or explicit spectrum-driven left ghost cells. Gaussian volume/acceleration wakes
and moving elevated bed obstacles use ordinary Signals/keyframes at subframe time.
Moving bed preserves depth (mass) while changing free-surface elevation and doing work;
this is kinematic topography coupling, not a two-way rigid-body solver. Dry momentum
uses explicit dryTolerance. No viscosity/turbulence/3D overturning or splash conversion.

**Numerical stability is an explicit author setting.** `substeps` defaults4 and is
never silently changed. `shallowCfl(depth,[u,v],dt,[dx,dz],g)` returns the 2D signal
Courant number; qualify <=.45 for this first-order profile. The fourth shallow channel
records maximum local conservative neighbor signal Courant observed during replay. Current resident Native scope
has no CPU scalar-feedback readback during a Stage: it does not automatically prove
arbitrary dynamic-source CFL, throw a custom GPU assertion or adapt unknown high-speed
inputs. Production scenes must qualify their actual depth/flow ranges using explicit
Inspection/export diagnostics. Unstable user steps are not claimed correct. Positivity
and dry regularization do not license ignoring water-mass error; acceptance includes
lake-at-rest, conservation and wet/dry propagation on qualified steps.

Foam: historical semi-Lagrangian transport, exponential decay, source from actual
choppy-displacement Jacobian, Froude number and shallow flow near wet edges. Stored
separately as dimensionless [0,1]. This is a visual whitecap/shore-foam model, not bubble
mass conservation. All history resets/replays through Core. Spectrum alone is an
absolute-time function; foam/shore are stateful and replay from initial data for seek.

Rendering reuses **existing native indexed mesh raster-v1**: GPU displaced positions,
GPU normal/Fresnel/sun/sky/foam material texture, then real camera projection and depth
peeling. A finite patch, not an infinite LOD ocean. Linear Rec709 F16/F32 PM; numeric
RGB is signed/HDR, strings use existing sRGB conversion. Transparent dry edge and
opacity are explicit. Analytic sky/direct sun shading is not external HDR IBL, multiple
scattering, ray traced refraction or caustics (existing R4 caustics remains available).

`createOceanSimulation(init,options)` owns managed state and immutable seeds. Await
`record(context)` before reuse; E_OCEAN_BUSY / E_OCEAN_CLOSED enforce ordering. Returned
buffers are borrowed until next record/dispose. `createOceanRenderer(init,dimensions,options)`
owns reusable immutable topology/UVs and returns owned images. `renderOceanSurface` is
one-shot convenience; `oceanScene` automatically reuses/disposes both. Final transient
mesh/material commands are recorded only after all replay continuations in the frame.
Initialization samples local frame/time zero and the matching global offset; subsequent controls sample original Core subframe contexts. No GPU handles in serialized checkpoints. Owner failure/cancel/rollback/reopen follows
original Core; ordinary JS/external side effects are not rewound.

Power-of-two axes are the chosen radix2 algorithm contract, not a quality reduction.
Defaults64x64,24x24meters,4substeps,256MiB grid budget,4e11work. All budgets/substeps
are configurable; u32/device/packet constraints still apply. FFT O(N log N), shore and
foam O(N) per step, dense data O(N). Plan is not physical GPU peak; final image, raster
scratch and native frame checkpoints additionally consume owner memory. Large offline
workloads remain explicit rather than being capped to a nominal realtime FPS.

Current Core direct MP4 continuation/encoder fix is frozen by Agent1 but not integrated
in this checkout. Use existing explicit PME final delivery settings (same GPU simulation
and rendering): `frameweave render ocean.tsx --settings sdr-settings.json
--professional-backend reference --output ocean.mp4`. Settings in validation/coverage-round10.
No implicit CPU pixel/solver fallback. Full distribution/RuntimePin/catalog promotion
belongs to Main; private candidate validation does not assert published installation.

Reproduce: `node modules/spatial-creation/validation/coverage-round10/run.mjs 01`.
This uses private FRAMEWEAVE_HOME, matched existing Native/SpiderMonkey, source/receipt
checks, targeted mathematics and real <=1second media. No new runtime dependency.
