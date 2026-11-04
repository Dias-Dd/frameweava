# Native spatial recipes — checkpoint 3

Editable source entry `native.ts`; orbital shot `examples/native/project.tsx`;
four recipe cards `examples/native/gallery.tsx`. These are ordinary TS functions
inside an existing Native Stage, with a borrowed Stage-local GPU Scope:

```ts
import {orbitalWorld} from './modules/spatial-vfx/native.ts';
// In defineNativeStage(init => ({renderAt(context) { ... }})):
return orbitalWorld(init.gpu, context, {
  width: init.width, height: init.height, steps: 64,
  planet: {planetRadius: .7, thickness: .18},
  trails: {orbits: 12, color: [2, .55, .1]},
  stars: {starDensity: .65}
});
```

- `orbitalWorld`: atmosphere/opaque planet disc over stars, then Kepler trails
  clipped by the same analytic sphere; optional `lens` applies after composition.
- `crystalSanctum`: shaded Voronoi solid, optional existing HDR Glow, then stars.
  Default Glow applies to the opaque crystal only, never the tiny-Alpha stars.
  Set `glow:false` for translucent crystal; generic Glow's shipped canonical
  numeric profile remains in force (including tiny nonzero component limits).
- `emberPlume`: beam -> smoke -> fire, an explicit stylized plate recipe.
  Each volume uses the existing Beer-Lambert ray marcher and pinned FNL noise;
  this is not a coupled fluid, fire simulation or deep volume integration.
- `causticLagoon`: procedural caustics, authored optical-distance height fog,
  then volume beam. It is not geometry-depth fog, a water mesh or an external
  depth/image importer. `fog:false` / `beam:false` disable those passes.

Common width/height are explicit; camera/time/seed/steps/format/maxWork/signal
are shared. Each layer has typed algorithm and appearance overrides, but cannot
silently change resolution, camera, frame or backend. time and appearance use
existing FrameContext/Signal evaluation. The default cameras are perspective.
Time never advances implicitly. maxWork is the existing **per-effect** full-work
budget, not an aggregate cost estimate. No quality/resolution reduction occurs.

All passes use existing GPU-only PixelScope APIs, linear scene Rec709/D65,
premultiplied Alpha, F16 or F32 logical publication. Shared compensated source-
over and Glow are reused; no second compositor or GPU owner was introduced.
The recipe returns one caller-owned image. Intermediates are released on success
and failure through the existing arena. Release is logical, not a completion
fence. Core retains submitted resources. There are no persistent writable GPU
states, owned devices, imported resources or new lifecycle services. Compiled
kernels reuse the Scope cache. Dispose the Stage's Core-owned Scope normally.

`orbitalTrails(..., {occluderRadius})` adds an optional opaque sphere at world
origin. Default 0 retains the previous arithmetic path. This occludes the
finite trail segments before evaluating screen-ray coverage; it is not general
scene depth, mesh collision or order-independent deep transparency. The preset
derives this radius from its opaque planet disc. Stars are a background plate;
layered volumes do not share shadows/occlusion or a general world scene.

Source candidate version is now 0.2.0. Only the changed orbital kernel identity
advances; the other 14 shaders retain 0.1.2. Existing immutable installed packages
and locks are untouched. R1 native identity, catalog, root named exports and
installed/portable acceptance remain Main integration work. The existing Web
candidate builder still packages its existing 15-function entry, not this Native
source recipe entry. No claim of formal installed Native publication is made.

## Reproduce

```powershell
node --import tsx --test tests/native-spatial-recipes.test.ts tests/spatial-vfx.test.ts
node node_modules/typescript/bin/tsc --noEmit -p modules/spatial-vfx/tsconfig.native.json
# Until Main wires the delivered SpiderMonkey Core hooks, verification uses
# the explicit reference loader. It does not patch source files on disk.
$env:FRAMEWEAVE_NATIVE_GPU='C:/absolute/path/frameweave-native-gpu.exe'
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs modules/spatial-vfx/validation/native-recipes.ts
# Public Native CLI after those hooks are integrated (not installed acceptance):
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs src/cli.ts frame modules/spatial-vfx/examples/native/project.tsx --frame 12 --output .frameweave/space.png
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs src/cli.ts modules/spatial-vfx/examples/native/project.tsx --no-open
node --import tsx --import ./modules/spidermonkey-host/integration/register-reference.mjs src/cli.ts render modules/spatial-vfx/examples/native/project.tsx --output .frameweave/space.mp4
```

Validation artifacts and raw failures are retained in `validation/native-recipes/`.
The verifier covers enclosing-sphere holdout, default-zero identity, disabled-
layer full-RGBA identities, float EXR Alpha/HDR and F16 precision, four actual
recipes, random/repeat/fresh host recording, 640x360 PNG/storyboard and a fully
decoded 24-frame 1-second MP4. H.264 differences are recorded separately from
lossless comparisons. Host wall time is not GPU execution time. Interactive
window/scanout, general mesh occlusion and all-device performance are unverified.

Deferred under the user's current Native interface limits: resident image-to-
compute statistics and image-driven emitters; controlled external image/atlas/
Puppet texture imports; writable cross-frame GPU reset/replay/checkpoints; CPU
export of GPU-generated geometry. None is implemented by these recipes.

The new recipe and sphere-clipping code is independently authored Apache-2.0.
Existing FNL subset remains MIT, fixed upstream and file hashes in
`vendor/SOURCE.json`; existing owner/compositor code and contracts are reused.
No new dependencies or external binaries were added by this checkpoint.

Actual checkpoint verification: 12/12 Node tests and focused typecheck passed;
all 3 actual-source media groups passed on RTX 5070/Vulkan/driver 596.49.
The final media command took 39.898s wall time; cumulative commands including
the initial type/path and missing factory-export failures and public CLI check
took 77.447s. Failures remain in types-01/media-01 and initial-results.json.
The public source CLI frame matched the independent service PNG exactly.
Enclosing-sphere trails were transparent; disabled-layer identities were exact.
Crystal F32 recipe matched its direct shader float bytes; F16 max component
error was 0.000975132. Four cards and raw/decoded first/middle/last frames were
visually inspected. NVENC MP4 decoded all 24 frames. This measures command wall
time, not GPU timestamps, and does not qualify numeric-invalid GPU publications.
