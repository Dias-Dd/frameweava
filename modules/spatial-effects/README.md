# Spatial Effects 0.2.0 — particles and procedural fields

Feedback particle simulation uses the existing FixedStepRunner, stage-local absolute frame/time,
seededRandom and configurable substeps/checkpoints. Acceleration, drag, softened attraction and
vortex forces; swept planes/sphere obstacles; contact events; bounded per-particle history.
World units: meters, right-handed, +Y up, +Z towards viewer (Graphics Coordinates3D).
No second simulation runner, registry, renderer service or time system is introduced.

`createFeedbackParticles(options).sample(ctx)` returns an owned, editable snapshot.
`createParticleRenderer(options).render(snapshot, ctx, style, format)` draws native GPU
instanced discs and camera-facing capsule trails to RGBA32F, then publishes an owned
RGBA16F/32F scene-linear premultiplied Surface v2. Ink can be negative or >1.
It requires a hardware WebGL2 context with actual EXT_color_buffer_float + EXT_float_blend
and a complete float FBO. Known software renderers (including SwiftShader) and concealed
renderer identity are rejected explicitly. This does not change the Engine's default policy.
No CPU pixel or SDR fallback. Existing native Three Engine is reused inside the Stage;
the closed Gaussian/Glow Pixel Pass is not modified or advertised as a generic shader API.

Ordinary named imports are available from a reviewed local R1 package `spatial-effects`.
The builder emits editable typed sources, ESM, declarations and exact Three provenance.
Install/trust/lock use existing public package commands. The repository example is in
`modules/spatial-effects/examples`; installation/validation commands and measured limits
will be recorded in the batch report. Importing the module creates no GPU or browser.

Particle count, trail history, replay and checkpoint limits are configurable safety budgets;
there is no 4096-particle algorithm ceiling. Numeric-value and render buffer plans are
logical estimates, not measured JS heap or driver peaks. Device and existing Surface limits remain.
Rasterization is GPU; integration/force/CCD calculations are CPU TS in this batch.
Rendering is offline-capable and never changes the simulation timestep based on wall-clock FPS.

Current limits: constant emission/physics configuration, equal per-particle ink/radius at birth,
semi-implicit Euler, primitive obstacle collisions only (no particle-particle/mesh/friction solver),
contacts from the final fixed substep, trails disappear on particle death. Partial lifetimes
and collisions use the configured fixed-step approximation, not an exact continuous force solver.
Fractional frames must align with configured substeps; arbitrary misaligned samples fail.
Renderer is orthographic; stable particle/segment source-over order, no OIT/depth occlusion or
fluid/Puppet/rigid-body claims. Capsule joints may overlap. GPU cross-device bit identity is unverified.

Await render; dispose drains it and is idempotent. Any GPU call failure is terminal for that owner;
context loss requires dispose and Stage reopen. A simulation seek failure requires reset.
Checkpoints contain only cloneable CPU numeric values, never Three/DOM/GPU objects.
Styles can use existing Signal parameters; changing simulation configuration requires a new instance.
The pixel renderer has no animation timer: real GL fences are polled with task yields,
then public Three readback is used. Renderer initialization failures release partial resources.
Native source packaging bundles the exact reviewed Three subset to satisfy existing R1's
no-private-npm rule, with full MIT notice and UPSTREAM hashes. It adds no new root dependency.

## FastNoiseLite point queries and GPU generators

`createNoise(options)` wraps the byte-preserved official FastNoiseLite1.1.1 JS kernels.
2D/3D OpenSimplex2/2S, Perlin, Value/Cubic, Cellular; none/fBm/ridged/ping-pong;
single/progressive/independent Domain Warp; discrete unnormalised Curl2/Curl3.
CPU point queries are for control/physics, never the implementation of a GPU image fallback.
Settings are cloneable, seed is canonical signed32 (unsigned32 also accepted), coordinates
are explicit units and qualified against the algorithm's signed integer lattice.
Octaves use configurable maxOctaves (default32), with no hidden fixed algorithm ceiling.

The official JS DomainWrap method references private Vector2/Vector3 classes. Our adapter
only exports those exact classes. The raw upstream JS remains byte-preserved, alongside
fixed source hashes, MIT license, GLSL and independent C++ oracle header. No kernel math changed.

`createNoiseTextureRenderer({width,height,workingColor,...}).render(options,ctx,format)`
generates a visual procedural color texture entirely on the actual native hardware GPU.
It shares the internal Three float target/fence/publication implementation with particles;
it is not a second formal Renderer, GPU Host, or generic PixelPass API.
The upstream GLSL uses C-style array initializers and `f` suffixes, mechanically adapted
to GLSL ES3 by `scripts/prepare-noise.ts`. Actual algorithm/dimension/warp/cellular choices
are compile-time selected; only the current material program is retained by this module.
Frequency/seed/octave/ink uniforms remain editable; no sample resolution/algorithm substitution.

Image row0/column0 samples the domain origin. Each pixel advances stepX/stepY; motion is
an explicit coordinate offset per Stage-local second. Pixel shaders write scene-linear
premultiplied RGBA32F and publish16/32F. Negative/HDR ink is preserved. This is a visual
color generator, not an illicit physics/normal/motion buffer encoded as color Surface.
The existing GPU PixelPass Gaussian/Glow and Agent-3 sampling/Matte/filter work are unchanged.

`{kind:'curl',noise,strength,epsilon,motion}` is an additional CPU fixed-step force.
It evaluates the actual finite-difference curl of three scalar potentials at position+motion*time.
It is not a normalized arbitrary vector-noise field. Save/restore still uses the same CPU-value
checkpoints. Constant configuration plus advected domain supports time-varying feedback
without relying on render wall time. Particle history/collision semantics remain as above.

Complete TSX example: `modules/spatial-effects/examples-noise/`. No runtime WASM, native
binary install or C++ compilation is required by authors; C++ is an explicit independent
test oracle only. Raw GLSL/C++ kernels and the JS adapter carry MIT notices.

Reproducibility boundary: CPU simulation checkpoints and the sample's CPU-state hash
are tested exactly. Shader-resolved input data and alpha are tested exactly. GPU F32
image RGB is numerical, not promised byte-identical under all request orders: a real
stress run observed maximum2.3841858e-7 RGB variation with identical alpha. The precise
backend source of that variation remains unproven. Local image fixture acceptance is
3e-6*max(1,abs(reference)) per RGB component; this is not certification for every GPU,
option or platform. Raw before/after values and black/white-over differences are retained;
the renderer never rounds/quantizes output to manufacture repeat equality. CPU-vs-GPU
and native-F32-vs-JS-F64 comparisons have separate explicitly measured error budgets.


## Mesh collision feedback (0.3.0)

```ts
import {createCollisionEnvironment} from 'rigid-body-effects';
import {createFeedbackParticles} from 'spatial-effects';
const environment = await createCollisionEnvironment(fixedWorld);
const simulation = createFeedbackParticles(particleOptions, {collisionEnvironment: environment});
const frame = simulation.sample(ctx); // synchronous fixed-step evaluation
// Stage dispose:
environment.dispose();
```

The collision tool is borrowed within one Stage and never serialized into a
checkpoint or image port. Checkpoint/random-seek behavior stays in Core's unchanged
FixedStepRunner. Each drift picks the earliest primitive or environment hit;
separation, positive radius, contact/query budgets and convergence are explicit.
Primitive friction retains the old tangent damping law. Environment friction is
Coulomb mu with normal restitution impulse; particles have translational velocity,
not rigid-body spin/rolling. New surfacePoint is the actual obstacle witness;
legacy point remains the corrected particle center. IDs must be distinct across
primitive and borrowed obstacles. A Promise-returning service is rejected, never
read as a previous result. Tool disposal, cancellation or identity change invalidates
cached particle samples. Failed steps latch until reset; queries do not mutate the
static environment. No transaction/rollback for arbitrary author callbacks.

Use existing allowWasm authorization explicitly for the rigid package. CPU forces,
noise, integration and WASM collision stay CPU; existing native GPU instanced mesh
rendering handles HDR/alpha/depth/trails. This is not GPU physics, particle-particle
collision or a moving-obstacle solver. Ordinary no-environment behavior is retained;
nonfinite/coerced time is now rejected before seek. Renderer-specific GPU metadata
selects hardware only when the two existing rendering exports are imported; CPU
noise/feedback imports still work on the normal software-export backend.

Editable complete scene: examples/mesh-collision/project.tsx (recipe/instances/scene).

## Image emission and bursts (0.4.0)

`createImageEmitter(surface, options)` prepares a synchronous, borrowed same-Stage
birth source. Existing `createFeedbackParticles(options,{emitter})` uses it only
at birth, alongside the existing collisionEnvironment tool. No GPU handle,
callback, source image or CDF enters a simulation checkpoint. No extra Runner.

```ts
import {createImageEmitter,createFeedbackParticles} from 'spatial-effects';
const emitter=createImageEmitter(sceneLinearSurface,{id:'sprite',
  bounds:{left:-2,right:2,bottom:-1,top:1},weight:'alpha',inherit:'color'});
const simulation=createFeedbackParticles({fps:24,seed:91,rate:30,lifetime:3,
  bursts:[{time:0,count:1000},{time:1.5,count:300}],
  origin:[0,0,0],velocity:[0,1,0],radius:.025},{emitter});
// renderAt: const state=simulation.sample(ctx); await renderer.render(state,ctx);
// Stage dispose: emitter.dispose(); await renderer.dispose();
```

Positions map source top-left pixel coordinates to explicit XY meters, +Y up,
constant z, then add existing origin/positionJitter. Center or uniform pixel-area
sampling is explicit (default pixel-area). Membership is alpha>0 AND alpha>=
threshold (default0); mass is alpha by default, uniform is optional. Zero-alpha
hidden RGB never contributes. F64 compensated CDF and binary selection use the
existing Core RNG with seed+stable birth ordinal, not ambient Math.random.
A positive mass lost to F64 accumulation rejects E_SPATIAL_EMITTER_PRECISION;
choose an explicit threshold/uniform policy instead of silently discarding it.
Empty alpha rejects E_SPATIAL_EMITTER_EMPTY; no arbitrary fallback position.

Inherited color defaults to scene-linear unassociated RGB with opacity1;
`inherit:'color-alpha'` also copies alpha, `none` emits only geometry. Alpha
weighting and inherited opacity are separate choices; using both applies both
probability and visual coverage. Premultiplied source RGB is explicitly
unassociated once when preparing the source. RGB remains signed/HDR, with no
clamp, display transform or hidden SDR conversion. Color inheritance requires
an explicit scene-linear Surface. Mask-only inheritance accepts any declared
Surface encoding. The renderer requires inherited color metadata to match its
working encoding. Its GPU shader still outputs premultiplied 16/32F Surface.
With inherited ink, style.ink is an optional multiplicative tint (identity when
omitted); particles without inherited ink retain the original style/default ink.
Global opacity/age fade multiply each particle's optional birth opacity.

This is CPU geometry/attribute sampling and fixed-step physics, followed by the
existing native GPU instanced particle/trail shader. It is not CPU pixel rendering,
GPU simulation, texture sprites, moving-image emission or GPU sampling. No new
Canvas renderer, GPU Host, public port/ABI, message bus or runtime permission.
Decoded source data is copied once. Returned birth arrays are independently owned.

Bursts use absolute session seconds, independent of continuous startTime/duration;
zero-count bursts are allowed. Continuous and burst births merge by birth time:
continuous first at a tie, then bursts in author array order, then local ordinal.
All use unique safe-integer IDs. Adding a burst can shift later IDs and random
samples; omitting bursts retains 0.3.0 JSON/state bytes. Births between fixed steps
advance only the remaining fraction of that step. Lifetime expiry is age>=lifetime.
Count changes never advance Stage time. Author loops, conditions and Signals remain
ordinary TS; no new time system or effect language.

Default source budgets: 4194304 pixels and 256MiB numeric/decode value plan,
configurable via maxSourcePixels/maxValueBytes. This plan is not peak JS/driver
memory. Existing simulation live/checkpoint/contact/replay budgets remain separate
and now account for inherited attributes and overlapping burst envelopes. No
implicit downscaling, thinning, caching of simulation results or rate reduction.
A failed fixed step stops the instance until reset, as before. Disposing a borrowed
emitter invalidates even cached frame requests; release it after all consumers.
Arbitrary asynchronous borrowed sources reject; the sync API never returns old data.

Editable full chain: examples/image-emitter/project.tsx, recipe.ts, sprite.svg/png.
A fixed PNG is declared explicitly, decoded/converted with official SDK APIs, then
sampled into image-colored bursts, existing curl/gravity/collisions and GPU trails.
No WASM authorization is needed by this pure TS/Three chain. R1 marks only the two
existing GPU renderer exports required; CPU sampling/numeric imports stay GPU-free.

Reproduce with worktree-private FRAMEWEAVE_HOME:
`node --import tsx --test tests/image-particles.test.ts tests/spatial-effects.test.ts tests/particle-mesh.test.ts tests/spatial-effects-gpu.test.ts`
`node --import tsx scripts/verify-image-particles.ts artifacts/image-particles/media`
Raw output includes actual default Final/preview, cache/reopen, PNG/F32 and fully
decoded MP4; not installed-SDK/cross-device L3 qualification. New emitter/CDF/burst
merge code is Frameweave-authored elementary sampling/control math. Existing fixed
FastNoiseLite1.1.1 MIT, Three0.186.1 MIT, Core Runner/RNG and collision algorithms
are reused unchanged. No new dependency or copied external engine. Frozen 0.3.0
simulation bundle/receipt are compatibility fixtures only, excluded from packages.

## Sprite Atlas and age-driven appearance (0.5.0)

The existing createParticleRenderer accepts optional spriteAtlas at owner creation.
Its source is an explicit scene-linear rgba16float/rgba32float Surface in the SAME
working color encoding. Convert decoded sRGB deliberately with transformSurface.
No Canvas/SDR fallback, implicit color transform, external URL or new GPU owner.

```ts
const renderer=createParticleRenderer({width:640,height:360,spriteAtlas:{
  source:linearAtlas,columns:4,rows:2,count:8,frameBlending:true}});
const surface=await renderer.render(simulation.sample(ctx),ctx,{
  ink:[1,1,1],fadeWithAge:false,
  overLife:{radiusScale:[{age:0,value:.3},{age:.3,value:1},{age:1,value:0}],
    opacity:[{age:0,value:1},{age:1,value:0}],
    ink:[{age:0,value:[.2,2,4]},{age:1,value:[4,.2,1]}],
    rotation:[{age:0,value:0},{age:1,value:6}],
    spriteFrame:[{age:0,value:0},{age:1,value:7}]}});
// Stage dispose: await renderer.dispose(); simulation reset remains explicit.
```

Normalized age is clamp((context.time-birthTime)/lifetime,0,1), never elapsed wall
clock or last rendered frame. Life keys use age in [0,1], strictly increasing,
Core numeric keyframes/easing, endpoint hold. evaluateParticleLife gives the same
CPU attributes for inspection without GPU or a browser. RGB is a signed/HDR linear
multiplier, not CSS/display color. Radius and opacity are multiplicative with
existing style Signals, birth attributes and old age fade. Set fadeWithAge:false
when the authored opacity curve should provide the entire age fade. Existing
Signals still evaluate at the original FrameContext; Stage time is never remapped.
Life applies at current particle age to its head AND existing capsule trails;
along-trail fading remains unchanged. This is not a time-varying physical radius
or a new simulation state field. Interpolation overshoots outside radius/opacity/
frame validity reject explicitly instead of clipping or publishing a partial draw.

Sprite frames are zero-based row-major from TOP LEFT, integer pixel tile sizes,
count<=columns*rows. spriteFrame is a global Signal plus the overLife.spriteFrame
value. Default0 is static. No implicit wrap/clamp/loop: values must remain in
[0,count-1]. Integer IDs use a separate uint32 GPU attribute; the fractional
blend weight uses F32, so rounding cannot cross an integer selection boundary. Fractional
indices select floor by default; frameBlending:true blends adjacent frames in
premultiplied linear light, with the final frame held. Nearest/linear sampling and
zero/clamp tile borders are explicit; no taps leak into neighboring tiles. Add
transparent tile padding in the authored asset for soft outer edges. Mipmaps are
disabled, so this is not an anisotropic/minification filtering platform.

Each straight-alpha tap is premultiplied BEFORE bilinear/frame interpolation;
premultiplied sources are not multiplied twice. Alpha0 hidden RGB contributes0.
Atlas radiance is multiplied by particle/style/life ink and all opacity factors;
output is premultiplied. The legacy warm default ink remains: set ink:[1,1,1] for
untinted texture radiance. There is no blending in sRGB or silent SDR8 conversion.
The input is copied once into an owned F32 DataTexture; no per-frame source import.
Upload counters use Three's actual onUpdate callback (submission, not GPU timing).
The caller owns its source. Replace an atlas/layout by disposing and creating an
owner; no mutation/revision cache or moving-video atlas support is implied.

radius is sprite HALF HEIGHT in meters. aspectRatio defaults to tileWidth/tileHeight;
rotation is radians counterclockwise in the orthographic camera plane. Optional
rotation/aspectRatio/spriteFrame Signals require an atlas, rather than silently
having no effect on circles. Billboards remain camera-facing, draw order follows
particle/trail order, depth is disabled as before: no sorting, OIT, perspective
mesh particles, soft depth intersections or collision-aware visual cross sections.

Native buffers/material/pipelines/chunks and GPU fence completion are reused.
The value/texture plan adds three F32 atlas copies and 20 bytes per chunk attribute
per existing CPU/GPU planning factor; this is NOT peak process/device memory.
Actual device texture limits and configurable maxBufferBytes reject excessive
sizes, without downscaling. Context loss/failure stops the owner; dispose/reopen is
the reconstruction path. Busy/close/drain semantics are unchanged, no global cache.

Unselected atlas/life functionality keeps the original capsule shaders and physical
snapshot schema. Frozen0.4.0 renderer comparisons are test-only, never packaged.
New age mapping and sprite shaders are authored integration math; Core interpolation,
fixed-step physics/RNG, and exact Three0.186.1 MIT renderer/DataTexture are reused.
No new dependency, external application, copied GPL algorithm or second Runner.

Editable complete scene: examples/sprites/project.tsx, particles.ts, recipe.ts,
atlas.svg/png. The PNG is generated from that authored SVG with the existing Sharp.
Reproduce with a private FRAMEWEAVE_HOME:
`node --import tsx --test tests/particle-sprites.test.ts tests/particle-sprites-gpu.test.ts`
`node --import tsx scripts/verify-sprite-particles.ts artifacts/particle-sprites/media`
F32 GPU data uses the existing qualified RGB/Alpha budget, with raw errors retained.
F16 output is also compared EXACTLY with F16 conversion of the actual same-context
F32 target; independently rounding a CPU F64 reference can differ by one half ULP
at a quantization boundary. The initial strict CPU-half failure is preserved, not
reported as F32 correctness or a change to the old Alpha/precision contract.
PNG/H264 comparisons are display/lossy checks, separate from raw RGBA comparison.
Installed-SDK/portable/cross-device L3 remains Main's responsibility.

The first full clip exposed a fractional-frame F32 boundary at frame22. Its
failed candidate is preserved separately; integer IDs and fractional blends now
travel separately rather than rejecting valid authored fractional indices.

## 0.6.0 source candidate: Native creation checkpoint

See [NATIVE.md](NATIVE.md) for the explicit Native GPU entry, sub-emitter family checkpoints, depth sorting and soft intersections. The old Three/Web entry remains explicit. Native installed/R1 packaging is not yet qualified; external image ingress and GPU cross-frame state remain deferred under the current Native interface limits. This version bump reserves a fresh identity; no installed lock or SDK pin was refreshed.
