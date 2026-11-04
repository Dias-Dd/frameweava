# Coupled gas / fire (candidate)

```ts
import {firePlumeScene, flameSource} from 'spatial-gas-candidate';
const fire = defineNativeStage(init => firePlumeScene(init, {
  sources: [flameSource({fuel:2, heat:2500})],
  reaction: {burnRate:3, ignition:600, fullBurn:900},
}));
```

Editable shot: `examples/gas.tsx`. The normal admitted Native Stage supplies `init`;
no author GPU buffer management is needed. `smokePlumeScene`, `firePlumeScene`
are presets over `gasScene`; `createGasSimulation` + `renderGasVolume` retain low-level control.
All Signals/keyframes use existing FrameContext time. Same seed/time/order is replayable.

Thermo is an f32 3D **data field**, channels soot kg/m3, temperature excess K,
fuel kg/m3, last-step burned fuel kg/m3/s. Absolute temperature = ambient + excess.
Velocity is right-handed Y-up m/s. Source heat is K/s, fuel/density kg/m3/s,
`acceleration` m/s2, source extent is half-size (ellipsoid/box); shape fades from .6 to1.
Sources integrate exact overlap of [start,end] with each fixed interval. Initial pockets
carry absolute Kelvin and velocity. Superposed initial excess is floored at absolute zero Kelvin. Multiple pockets add excess temperatures, not absolutes.

Algorithm: reuse existing spatial-compute semi-Lagrangian trilinear advection,
compatible periodic backward divergence/forward gradient, weighted Jacobi pressure.
New operator-split reaction burns `fuel*(1-exp(-burnRate*temperatureGate*dt))`,
adds heat and soot yields then exponentially cools/decays; buoyancy, wind acceleration
and vorticity confinement update velocity. Gate frozen within each substep. This is
visual first-order chemistry, no oxygen species, detailed chemistry, thermal expansion,
solid/no-slip obstacle solve or engineering CFD. Zero outside advection and edge sponge
are approximate absorbing boundaries; pressure is periodic. Numerical diffusion and
pressure residual depend on explicit grid, iterations and substeps. No automatic quality reduction.

Volume rendering trilinearly samples the real 3D field. Linear Rec709 F16/F32,
premultiplied alpha, Beer extinction and per-segment emission integration. `firePalette`
is an **authored HDR RGB ramp**, not calibrated blackbody/spectral radiometry.
Fuel + .1 * last burn rate is the flame carrier; extinction m2/kg and authored emission
are artistic controls. Smoke color can be signed/HDR. No SDR intermediate or CPU pixels.
No shadow/scene occlusion or multiple scattering in this profile.

Fields and scratch are managed state owned by this simulation and its borrowed admitted
GPU scope. `record` returns borrowed fields valid until next record/dispose; serialize
calls (E_GAS_BUSY on overlap). Do not release these borrowed fields. The renderer returns
an owned image, released by the usual Stage lifecycle. Dispose is idempotent, drains pending
recording and releases fields; it never closes the owner. Cancellation, failure rollback,
backend disconnect and frame latch follow existing Core NativeReplay/Renderer. On failure
close/reopen the Renderer; ordinary JS/external effects are not rolled back. No GPU handle
is serialized into JS checkpoints. >1024 commands use same-owner `flushState` at whole-step
boundaries (a whole step must fit the remaining protocol packet headroom); final images/publications must follow all state recordings in a frame.

Defaults: grid32x48x32, 2 substeps/frame, 32 Jacobi iterations, 256MiB planned allocation,
2e11 replay work, 1e9 ray samples. All are configurable; actual device/protocol limits remain.
Dense-grid compute O(cells * steps * pressureIterations), memory O(cells); no sparse solver.
Physical peak GPU memory unknown. Large offline works can raise budgets explicitly.

Reuse: existing Frameweave spatial-compute kernels (Apache-2.0 AND MIT header; noise subset
not selected), original Core replay and camera math from fixed installed Three.js (MIT).
New reaction/source/render glue Apache-2.0. No copied external gas runtime/new dependency.
External cybrdelic/firesim a2e4b60d71f8be54a48a7574c0a4a50ae1d30e2b (MIT) reviewed
for first-order artist combustion conventions only; no source copied. olliep24/firesim
has no identified license and was not reused. Do not confuse our authored formulas with
an independently validated physical combustion package.

Build and public validation: `node modules/spatial-creation/validation/coverage-round9/run.mjs 01`.
This uses a private FRAMEWEAVE_HOME, exact immutable candidate, actual SpiderMonkey/GPU,
PNG/storyboard and <=1second MP4. Final catalog/SDK Runtime Pin promotion belongs to Main.

Current direct MP4 route has a reproducible Core encoder/continuation failure
(E_NATIVE_ENCODE: plan update cannot remove an active encoder), reported to owner.
Until fixed, use the **existing explicit PME reference delivery**:
`frameweave render gas.tsx --settings sdr-settings.json --professional-backend reference --output gas.mp4`.
Use `validation/coverage-round9/sdr-settings.json`. Simulation and volume rendering remain
GPU F32; final-delivery Surface readback/color conversion is explicit. This is not a
CPU solver/pixel-effect fallback and does not alter default export settings. The direct
route failure is retained as evidence, never described as passing.
