# Spatial Creation (candidate)

Describe a shot, rather than allocate its graphics resources. These ordinary
TypeScript helpers assemble the existing Frameweave algorithms on the **same
Native Stage owner**. Low-level modules remain available and unchanged.

## Image-driven particle properties (0.18.1 candidate)

```ts
import {mappedParticleField,particleColorMap,particleSizeMap} from 'spatial-creation-candidate';
const field = await mappedParticleField({
  count: 220,
  ephemeral: [{source: {input: 'paint'}, rules: [
    ...particleColorMap(), particleSizeMap({range: [.01, .06]}),
  ]}],
});
```

Maps support position, velocity, radius, RGB and opacity; replace/add/multiply,
strength Signals, current or birth attachment, XY/XZ/YZ projection, nearest/linear
sampling, ignore/clamp/repeat/zero boundaries, and optional Alpha weighting.
Color helpers retain signed/HDR RGB. Map images are explicitly scene-linear
Rec709 and PM/opaque; PM taps are filtered before unassociation. Alpha-zero map
RGB is defined as zero. Radius is nonnegative and opacity is clamped to [0,1].
Generic rule inputs are normalized by default; `clampInput:false` keeps their
signed/HDR range. There is no CPU pixel implementation or SDR fallback.

Persistent layers update managed state at each logical step; values survive when
particles leave an ignored map region. Ephemeral layers start from current state
and never commit their appearance edits. Ordinary current-frame Stage inputs are
accepted for ephemeral layers. Persistent layers require a resamplable gradient,
immutable declared resource, or explicit `sample(context)` evaluator returning
`{image, ownership:'owned'|'borrowed'}`. Current-only inputs reject instead of
being substituted for historical frames. Evaluators receive the existing logical
context, including subframes, and must supply that time's image. No upstream Stage
is automatically re-executed; no second temporal service or message bus exists.

Existing Native managed leases + Core FixedStepRunner reset/replay every seek.
The creator owns seeds/scratch and drains them on disposal; input images are
borrowed. A low-level candidate is caller-owned unless a destination was supplied.
`copyParticleProperties` records a managed copy, not an external/JS transaction.
GPU publication is provisional until the existing Native frame completes; failed
recordings/cancellation restart by reset/replay. Buffers never enter serialized
checkpoints, and the borrowed Scope/device is never disposed.

The exact-order first profile performs N-squared stable GPU depth ranking and
pixels-times-N coverage. `maxWork`, `maxStateBytes` and `maxReplaySteps` are
configurable safety budgets; hardware buffer/dispatch limits remain authoritative.
No cache shortcut, resolution/quality reduction or speedup claim is made. Full GPU
checkpoints and an accelerated large-population renderer are separate optimizations.

Editable one-second TSX: `examples/mapped-particles.tsx`. Reproduce the focused
qualification with `node modules/spatial-creation/validation/coverage-round2/run.mjs uniqueTag`.
Evidence: `validation/coverage-round2/evidence` (all attempts share a 420s ledger).

## Regional Puppet controls (0.17 candidate)

```ts
import {puppetImage,puppetOverlapPin,puppetStarchPin,puppetAdvancedPin} from 'spatial-creation-candidate';
const actor = await puppetImage({
  image: 'image', pins: {base: {at: [.5, .95]}},
  controls: [
    puppetOverlapPin({at: [.25, .5], extent: .35, inFront: 2}),
    puppetStarchPin({at: [.5, .85], extent: .25, amount: 8}),
    puppetAdvancedPin({at: [.5, .2], to: [.6, .2], rotation: 12, scale: 1}),
  ],
});
```

Control attachments and extents use the original source's top-left normalized UV;
placement stays fixed while targets, extent and weights accept existing scalar
Core Signals. In Front is signed and additive; uninfluenced regions are zero.
Position/Advanced vertices are inserted exactly. Starch adds positive triangle
stiffness; Bend/Advanced use the original planar ARAP oriented-edge constraints.
These controls add no solver, clock, GPU Owner, permissions or Stage data port.

Overlap scores are interpolated from rest vertices after deformation. Positive
values come forward. The Native adapter maps the common field into clip-safe Z
and uses the existing exact depth-peel raster mode for premultiplied transparent
layers. F16/F32 scene-linear signed/HDR color is preserved. The actual native
mesh capabilities and session budgets apply; unrepresentable scores reject.
Without overlap controls the existing triangle-overwrite path stays selected.
Existing ARAP may fold: authored `constraints: {foldovers: 'allow'}` is required
when a pose intentionally folds. This does not add collision-aware deformation.
Disposed/aborted calls, queue completion and backend recovery keep existing rules.

Editable example: `examples/puppet-controls.tsx`. Raw checks and one-second media:
`validation/coverage-round1/evidence`. Reproduce from this worktree with
`node modules/spatial-creation/validation/coverage-round1/run.mjs uniqueTag`.
All attempts share one cumulative 420-second validation budget. Native hardware
and explicit `--allow-wasm` are required for the image-Puppet example.

## Choose a view, material and light mood

```tsx
export const object=defineNativeStage(()=>torus3D({
 material:'gold',camera:'front',lighting:'neon',
}));
export const shot=defineNativeStage(()=>sculptureScene({
 camera:cameraView('orbit',{speed:12,viewHeight:3.2}),
 lighting:sunsetLighting({rotation:20,intensity:.85}),
}));
const gold=materialPreset('gold',{roughness:.3}); // Plain data; no GPU init.
```

`examples/studio-scene.tsx` is a complete animated sculpture shot. It uses named
materials, an orbit camera and a rotating light rig. `studio-gallery.tsx` compares
ten rigs on the same object/material/view, then shows gold/rubber and camera views.

Sculpture/primitive/mesh and clone creators accept lighting names studio, soft,
dramatic, rim, sunset, moonlight, daylight, neon, warm and cool. They are authored
three-directional-light plus ambient recipes over the original Native GGX shader.
Soft means lower contrast, not area-light penumbrae. No shadow, area light,
environment map, bounce light, volumetric light or new rendering backend is added.
The old raw MeshLighting object and omitted lighting keep their original path.

Use `studioLighting`, `softLighting`, `dramaticLighting`, `rimLighting`,
`sunsetLighting`, `moonlightLighting`, `daylightLighting`, `neonLighting`,
`warmLighting`, `coolLighting` or `lightingRig(name, controls)` for typed controls.
`lightingDefaults(name)` returns independent raw MeshLighting data for inspection
or advanced edits. Global intensity defaults1 and multiplies directional powers;
it does not scale ambient. rotation defaults0, world-Y yaw in degrees. Ambient,
key/fill/rim colors and their individual intensities may override the preset.
Colors accept existing CreationColor; numeric colors remain scene-linear HDR,
string swatches use the original Core sRGB conversion. Other numeric controls
accept Core Signals at the unchanged FrameContext. Raw light arrays remain the
advanced route for custom counts/directions; original maxLights budgets apply.

Camera names: front/back/left/right/top/bottom/isometric/hero/perspective/orbit.
The pole views provide nonparallel up axes. cameraView(name, controls) returns
the existing ObjectCamera data, with target/up/near/far and viewHeight controls;
perspective uses verticalFov instead. Orbit additionally accepts radius, azimuth,
elevation and speed. Defaults inherit the old camera sampler: viewHeight3.5,
near0.01/far100; perspective35degrees; orbit radius7/azimuth24/elevation16/speed8
degrees per logical second. Target, view dimensions and orbit controls accept
existing scalar/vector Signals. Fixed preset positions are world coordinates,
not automatic subject-bounds fitting. The original raw ObjectCamera type and
numeric configuration remain available; CreationCamera adds the named shorthand.

The original ceramic/copper/chrome/matte material defaults are unchanged. Added
gold/silver/porcelain/plastic/rubber/emissive are ordinary isotropic GGX parameter
recipes. Gold/silver retain a small diffuse component (metalness0.85/0.9) to keep
their bodies readable under the directional-only renderer; use explicit
metalness1 for a purely metallic profile. materialPreset(name, overrides) returns the existing MaterialOptions;
explicit fields still win, optional undefined keeps the recipe default. There
is no glass/transmission/anisotropy simulation. Emissive changes the object's own
pixels; it does not illuminate neighbors or automatically add a Glow pass.

All helpers above return plain configuration, not Stages or GPU handles. They
are available outside Native init and do not launch a device/browser or grant
WASM permission. Consuming creators still require the original Native GPU path.
Ribbons/Puppet/physics/other low-level camera/light contracts stay unchanged.
Recipe defaults are generated from source into creation-guide.json at build time.
Reproduce with `validation/studio/run.ps1`; formal SDK/catalog identity remains
Main-owned. Exact old PNG compatibility and raw F16/F32/Alpha comparisons are
separate from decoded lossy H.264 comparisons.

## Arrange objects and make cards

```tsx
export const shot=defineNativeStage(()=>creationGallery([
 ribbonScene(),sculptureScene(),cloneScene(),energyScene(),
],{layout:{kind:'grid',columns:2}}));
export const row=defineNativeStage(()=>rowCreations([ribbonScene(),sculptureScene()]));
export const card=defineNativeStage(()=>cardCreation(sculptureScene(),{
 color:'#f8f3e9',padding:10,shadow:{radius:4,offset:[0,5]},
}));
```

`examples/layout-scene.tsx` is a complete moving four-card shot; edit its scenes,
columns, gap or paper color. `layout-gallery.tsx` shows rowCreations,
columnCreations, gridCreations, radialCreations, arcCreations, spiralCreations,
scatterCreations, cascadeCreations, fanCreations, arrangeCreations, frameCreation,
cardCreation and creationGallery. No manual per-child placement or GPU cleanup.

Arrangements fit the **whole source canvas**, preserving aspect by default.
Transparent margins remain part of that canvas: this is not automatic subject
framing, Alpha-bounds detection or content-aware cropping. `fit:'stretch'`
explicitly fills a cell; `cover` is not supported. Use source framing/camera or
itemSize/scale to control content size. A source may have different image
dimensions, while its same-owner Native float/PM/linear709 contract still applies.
Owner means the allocation scope, not merely the same device/Stage. An R1 module
cannot release a root/other-module allocation returned by a custom child. Use
existing declared image inputs through imageCreation to acquire that module's
owned image. Source-level createSpatialCreation(init) can also compose children
created on that exact scope; mixed dimensions are exercised on this path.

Row/column divide the available rectangle; grid defaults to ceil(sqrt(count))
columns and centers the final partial row (`align:'start'|'end'` overrides it).
Padding defaults min(16px,5% smaller dimension), gap min(12px,dimension/30).
Gap consuming all available cells rejects clearly. The other arrangements use
authored overlapping image cells: polar/scatter default to a square26% of the
padded smaller dimension; cascade65% of the available rectangle; fan60% width
and70% height. Override `itemSize:[width,height]` for any layout. Scale multiplies
cell size; opacity scales PM RGBA; rotation is per-image degrees. Center is an
absolute pixel point, default Stage center. Layout positions are not Alpha bounds.

Radial starts at-90 degrees, radius32% of the padded smaller dimension. Arc spans
-150 to-30 degrees. Spiral has innerRadius0/turns1.25 and linear radial growth.
Polar images stay upright unless orient:'radial'|'tangent'. Scatter uses existing
Core seededRandom, Stage seed by default and stable item indices; angleSpread12
degrees. It does not solve overlaps. Cascade uses centered diagonal steps and
angleStep-4 degrees; fan rotates-25 to25 degrees about a common implied pivot,
radius50% of the padded smaller dimension. +Y is down; positive angles clockwise.
Static grid columns/seed define topology; positions/sizes/angles/gaps and other
declared numeric fields accept Core Signals at the unchanged FrameContext.

Frame is rectangular, default90% Stage dimensions, warm-white color, opacity1;
padding min(12px,3.5% smaller dimension). It fits the image into that interior;
transparency reveals the frame color. Card defaults82% dimensions/padding
min(10px,3% smaller dimension) and the existing shadow radius4/offset[0,5]/opacity0.35.
`shadow:false` removes the shadow. These are image-space pixels: subsequent layout
scales frame/shadow along with the image. There is no rounded-corner/Alpha-contour
claim. Source/outer canvas bounds remain fixed, so oversized content/halos clip.

creationGallery defaults to a centered grid, cards and dark gradient backdrop,
with gap min(16px,4.5% smaller dimension), padding min(20px,6% smaller dimension)
and vignette0.12. `cards:false` and `background:false` are explicit options.
Finish/post applies once to the finished group. Original source ownership can be
borrowed; all internally created wrappers are owned. Every source still runs in
authored order at identical context/input/props, even at opacity0. Array order is
layer order. No clocks, cached results, simulator, image bus or GPU owner is added.

One reusable quad serves an arrangement; source images and previous composites
release after their last recorded use. This is logical release, not a GPU fence;
the existing Session owns completion/recycling. Empty arrangements are transparent.
The CPU coordinate plan has configurable maxLayoutBytes (64MiB default,128bytes
per planned item), an admission estimate rather than physical peak memory.
Native device/session budgets still apply; no fixed source-count cap or automatic
resolution/precision reduction. F16/F32 HDR/PM stays intact, GPU required.
The current Native program protocol admits at most256 data-buffer descriptors,
including logically released entries. This is not a256-creator limit: complex
mesh sources can hit E_NATIVE_DATA earlier. The layout example gallery uses
lightweight colored image panels; the complete four-scene shot uses real meshes
and particles. This batch does not alter the shared protocol/owner limit.
Reproduce with `validation/layout/run.ps1`; Main owns formal SDK/catalog integration.

## Apply a motion preset

```tsx
export const object=defineNativeStage(()=>springInCreation(torus3D({material:'copper'})));
export const shot=defineNativeStage(()=>animateCreation(torus3D(),{
 enter:{kind:'spring',duration:12},
 exit:{kind:'fade'},
 idle:{kind:'float',offset:[0,8]},
}));
export const sequence=defineNativeStage(()=>staggerCreations(
 [-80,0,80].map(x=>placeCreation(characterWave(),{x,scale:.6})),
 {interval:3}));
```

The complete `examples/motion-scene.tsx` arranges three lit sculptures, staggers
their spring entrances and adds a floating group/exit over a star backdrop.
`motion-gallery.tsx` shows every preset. Direct calls are `fadeInCreation`,
`fadeOutCreation`, `slideInCreation`, `slideOutCreation`, `popInCreation`,
`popOutCreation`, `spinInCreation`, `spinOutCreation`, `springInCreation`,
`floatCreation`, `pulseCreation`, `swingCreation` and `staggerCreations`.
`animateCreation` combines entrance, exit and idle with one image-resampling
boundary. These are authored recipes over existing Core easing/spring/expression
and original Native placement kernels; no new animation engine or pixel shader.

`at` and `duration` are finite static **local Stage frames**; duration must be
positive (default12), at defaults0 for entrances. Exit's omitted at is
`context.durationInFrames - 1 - duration`, so it finishes on the last frame.
For a shorter shot it starts before frame0, retaining the authored duration.
Explicit at is nonnegative. Default entrance easing is Core easeOut, exit is
easeIn; existing Core cubic Bezier is accepted. Geometry may overshoot a Bezier;
opacity is clamped to valid coverage. The optional fade checkbox defaults true.

Slide direction names the hidden side (bottom by default, +Y down), distance
defaults to15% of the smaller Stage dimension. Explicit offset is two pixel
Signals and replaces direction/distance. Pop/spin/spring hidden scale is0.65;
spin angle is-45 degrees. Spring uses the original analytic Core spring at the
actual rational FPS (stiffness170/damping18/mass1/velocity0). Its scale continues
settling after the fade duration; duration is not a forced spring endpoint.

Idle defaults: frequency0.6Hz, phase0 radians; float offset[0,12]px, pulse
amount0.04, swing angle4 degrees. Amounts, scale, offsets, angles, frequency and
phase accept Core scalar Signals. Animated frequency means instantaneous
`sin(2*pi*time*frequency(time)+phase(time))`, not integrated velocity; animate
phase for an authored phase curve. Large pulse amounts may deliberately cross
zero scale. Generic animateCreation defaults to a slide entrance; set
enter:false for only exit/idle. The idle convenience calls do this automatically.

Entrance/exit translations and angles add; scales and Alpha multiply. Idle
adds its offset/angle or multiplies scale. This applies to the rendered image
around the Stage center, including any already-authored placement; it does not
move the original 3D camera or mesh. Canvas bounds stay unchanged. Nested motion
wrappers keep their authored resampling boundaries; combine controls in one
animateCreation when one boundary is desired.

Every child receives the **same exact FrameContext, inputs and props**, including
when opacity/scale is zero. Motion controls are evaluated before the child;
invalid controls do not run it. Presets and stagger never delay/reset/replay the
child's simulation or audio time. Stagger interval defaults3frames, enter is pop;
reverse changes delay assignment, while draw order and source evaluation remain
authored. Timing/configuration is immutable; reopening creates fresh objects.

Ownership, failure cleanup, cancellation, finish/post and F16/F32 HDR/PM Alpha
follow the existing creator contract below. There is no CPU pixel fallback,
cross-owner handle sharing, timeline/queue, automatic permission or caching.
Reproduce with `validation/motion/run.ps1` and your admitted Native/SpiderMonkey
binaries. Raw float/Alpha/black/white parity and decoded H.264 errors are recorded
separately; Main retains formal SDK/catalog integration ownership.

## Add effects directly to a creator

```tsx
export const shot=defineNativeStage(()=>stackCreations([
 gradientBackground({center:'#304b63',edge:'#081222'}),
 shadowCreation(outlineCreation(characterWave(),
  {width:3,color:'#ffedbf'}),{radius:5,offset:[8,12]}),
]));
export const softRibbon=defineNativeStage(()=>
 blurCreation(silkRibbon(),{radius:3}));
export const silhouette=defineNativeStage(()=>
 maskCreation(solidBackground({color:'#18bad3'}),characterWave()));
```

The complete shot is `examples/effected-scene.tsx`. Its character has a warm
outline/soft shadow and an independently glowing ring. `creator-effects-gallery.tsx`
shows eleven direct wrappers: blurCreation, glowCreation, shadowCreation,
innerShadowCreation, outlineCreation, sharpenCreation, pixelateCreation,
chromaKeyCreation, lumaKeyCreation, wobbleCreation and maskCreation. These call
existing qualified Native PA/raster/professional GPU factories; they add no
new pixel algorithms, renderer, graph, module registry or public image port.

Write ordinary function nesting in the intended order: outline first, then
shadow in the example. A wrapper accepts a creator or its construction promise;
there is no per-child await, recipe context, retained-output copy or cleanup in
authored code. All children run on the SAME admitted module owner at the exact
FrameContext/inputs/props. Child finish/post stays in place; wrapper effect runs
next, followed by its own optional finish/post. Set a neon child's finish:false
when choosing the outer glow yourself; the wrapper never silently disables
an authored child effect.

Defaults: Gaussian blur sigma3px; Glow sigma4px/intensity0.6/threshold0.7 working
white; outer shadow sigma4px/offset[6,8]/black/opacity0.5; inner shadow
sigma4px/offset[4,4]/black/opacity0.5; Alpha outline width2px/white/opacity1;
unsharp radius1.5/amount0.5; pixelate block[6,6]; green chroma key inner0.1/outer0.3;
luma key low0.15/high0.6 working-linear; wobble amount8px/frequency3/speed0.8/seed3.
The original PA wobble is an analytic separable sine warp, not a fluid/noise
simulation; CPU prepares O(width+height) control values, GPU samples pixels.
Radii/offsets/amounts/colors and other declared animated fields use Core Signals.
No history, velocity integration or time advance is introduced.

Shadow includes the source by default; includeSource:false returns only its
shadow. Outline includes the source by default; includeSource:false returns
only the outline ink. Original fractional square-neighborhood Alpha dilation
forms coverage `expandedAlpha * (1 - sourceAlpha)`, then fill/over. Soft or
partly transparent interiors can contribute; this is coverage subtraction,
not arithmetic subtraction, a round vector stroke or signed-distance contour.
Mask uses the second creator's **Alpha only**, optionally
inverted; opacity scales that coverage before multiplying source PM RGBA. Both
children execute even at opacity0, and using the same child twice executes it
twice. No color/luma/utility-map interpretation is guessed. Keying uses original
working-linear distance/threshold algorithms; these are not AI segmentation.

Output remains in the same canvas dimensions: halos, outlines and displaced
content clip at its boundary. Float32 PM linear709 is the default, explicit
`format:'rgba16float'` stays float16; no SDR/CPU pixel fallback is added. Per-operation
maxWorkingBytes/maxBufferBytes are forwarded where the original algorithm
supports them, and the owner/Session still enforce actual allocation and queue
limits. These are not physical-peak measurements or one whole-chain byte cap.

Owned child lifetime is automatic; ownership:'borrowed' keeps an explicitly
shared child instance open. One caller-owned image comes back per frame;
intermediates release after recording, with actual GPU completion/recycling
still owned by the existing Session. The original PA sine field is adopted by
the existing resource arena, including write/failure cleanup. Factory temporaries use the original recipe processor's idempotent-release
rule only for images created in this call; caller/child ownership is unchanged.
No image result or GPU handle is retained across frames, and no defensive result-copy pass is
needed. Close/busy/cancel follows the existing creator guard. Failed effects
clean candidates; a child already ran and its ordinary JS/external side effects
are not rolled back. Invalid options rejected before adoption leave a supplied
child with its caller. Custom children must follow the existing same-owner,
fresh-owned-image contract; use imageCreation for borrowed image inputs.

Shadow assembles the existing Alpha padding, PA Gaussian, bilinear offset/tint
and publication kernels. It intentionally uses Native PA blur rather than the
old raster blur canonicalizer: that canonicalizer emits NaN for positive Alpha
below 2^-24, which ordinary blurred outlines can produce. The new recipe keeps
those tails, never clips Alpha or converts to SDR. Original failure captures
and the old/new comparison remain in the focused evidence. Other operators
retain their original numerical domains; this is not blanket qualification of
every possible effect combination.

Reproduce with `validation/creator-effects/run.ps1` and the same frozen
release/SpiderMonkey/diagnostics binaries. The campaign separates actual raw
float/Alpha/black/white comparisons, old numeric PNG compatibility, public
SDK/CLI acceptance and a fully decoded one-second video. Main owns formal
SDK/catalog identity integration.

## Pick colors directly

```tsx
export const shot=defineNativeStage(()=>ribbonScene({
 ribbon:{ink:keyframes([{frame:0,value:'#ff8b4a'},{frame:23,value:'#48cef0'}])},
 background:{center:'#112a3c',edge:'#020812'},
}));
cloneScene({palette:['#18bad3','#ff9155','#ffe08a']});
characterWave({palette:{shirt:'#18bad3',pants:'#16314c'}});
```

Color fields in the creator material, solid/gradient/ribbon backgrounds,
particles, character paint, clone palettes and tint/tritone finish accept
Core-supported sRGB strings: #rgb, #rrggbb, rgb(r,g,b), and the existing Core
names black/white/red/green/blue/cyan/magenta/yellow. Hex #rgba/#rrggbbaa and
rgba(...) are accepted only when Alpha is exactly1; use the separate opacity
control for transparency. Unsupported CSS forms such as hsl()/display-p3(),
unknown names, malformed/out-of-range values and embedded transparency fail
explicitly with E_CREATION_COLOR. This is the existing Core parser, not a new
browser/CSS parser or implicit resource/profile loader.

Numeric RGB triples retain their original **scene-linear Rec709** meaning,
precision, Core scalar Signals and allowed signed/HDR ranges. They are never
guessed as 0..255 sRGB, clamped or converted. Encoded strings convert through
the original Core color transform to linear709 control values before the
existing GPU computation. This converts a control swatch, not image pixels;
there is no CPU image processing/readback or SDR intermediate. Existing image
ICC/Alpha policies are unchanged.

Dynamic colors may use ordinary Core string keyframes. Core interpolates
encoded RGB and rounds to byte values before this adapter converts to linear;
that existing interpolation behavior is preserved. For light-linear/HDR curves,
use three numeric scalar Signals. No second timeline or color-keyframe engine
is introduced. Particle birth palettes and clone palettes are static (numeric
triples or strings); character paints/material/background/finish colors may
animate. Layout coordinates, normals, fields and other numeric vectors never
accept color strings. Advanced low-level spatial-vfx/noise option contracts
remain unchanged; `linearColor('#ff9155')` is an optional pure helper when
feeding a numeric-only original API. No GPU, browser, WASM or trust is needed
to call that helper.

`examples/color-scene.tsx` is the editable gold-to-cyan ribbon shot;
`color-gallery.tsx` demonstrates the existing creator families with color
strings. Reproduce the focused numeric-compatibility/real-GPU/public-CLI campaign
with `validation/colors/run.ps1` and the existing frozen binaries. Original
numeric PNGs and raw float comparisons remain separate from H.264 encoding.

## Compose a shot with ordinary functions

```tsx
export const shot=defineNativeStage(()=>stackCreations([
  gradientBackground(),
  starField({opacity:.3}),
  placeCreation(silkRibbon({strands:2}),{scale:.86,rotation:-7}),
  fadeCreation(dustField(),.2),
],{finish:'cinema'}));
```

No per-child `await`, GPU buffers, matrices or temporary-resource cleanup is
needed. `examples/composed-ribbon.tsx` is the complete one-second project;
`creation-scenes.tsx` offers ready-made `starlitRibbonScene`, `celebrationScene`
and `energyScene`. Their nested options change objects, materials, density,
motion, background and finish. `image-card.tsx` composes declared artwork.

| Function | Meaning and defaults |
| --- | --- |
| `stackCreations([a,b,...], options?)` | Sequential source-over, first at bottom; empty means transparent. |
| `fadeCreation(a, opacity, options?)` | Scale premultiplied RGB and Alpha together; opacity0..1 accepts a Core Signal. |
| `crossfadeCreations(a,b,amount,options?)` | Whole premultiplied RGBA interpolation, amount0..1. |
| `placeCreation(a, options?)` | Existing Core Transform; x/y in pixels (+right/+down), clockwise degrees, scale1, center anchor; opacity1, linear sampling. |
| `imageCreation({image,fit?,...transform})` | Borrow an input name or import a declared resource; contain default, also cover/stretch; always publish owned output. |
| `solidBackground({color?,opacity?})` | Linear Rec709 RGB, default dark blue, opacity1. |
| `gradientBackground({center?,edge?,kind?,start?,end?})` | Original GPU radial gradient by default; linear optional, opaque, endpoints in pixels. |

Placement acts on the rendered object image, including its camera framing;
it does not change object-space geometry or combine 3D depth. Negative scale
mirrors; zero scale yields transparent output. Image fit happens before the
Stage-space transform. Straight Alpha input is explicitly premultiplied **before**
linear sampling. Borrowed inputs retain their ownership. Resource import uses
the existing declared-resource/ICC policy described below. No CPU pixel path,
SDR intermediate or permission grant is added.

These are creators inside **one admitted Native Stage**, not calls into other
Stage engines. They add no Scene/Layer DSL, scheduler or Session queue. Every
child receives the exact same FrameContext, inputs and props in authored order.
Zero opacity and crossfade endpoints still execute their children: visibility
does not pause state, time or side effects. Constructors accept creators or
their promises; construction waits for all children and cleans successful owned
children if a sibling constructor fails. `ownership:'owned'` is the default;
the parent closes unique children. `ownership:'borrowed'` leaves their lifetime
with the caller. Await one recording before reusing a shared child. A creator
must return a fresh caller-owned frame image, not an arbitrary borrowed input.
Children must use the same admitted module GPU owner. A custom child using a
different module's scope cannot transfer allocation ownership merely by
returning a JS image object. Use `imageCreation({image:'inputName'})` for borrowed
image inputs; existing module/Stage isolation remains enforced.

Stacking logically releases intermediate images after last recorded use;
actual GPU completion and recycling remain controlled by the existing owner.
This is not a fence or a claim about peak physical memory. Child failure keeps
its original code and adds child index/local frame; previously recorded GPU
commands and ordinary JS side effects are not rolled back. Close waits for an
active recording; existing cancellation and device-loss semantics still apply.

Reproduce this focused chain with `validation/composition/run.ps1` using the
same explicit binaries/ICC arguments as the particle campaign below. Source
unit checks, raw Native GPU comparisons and carried public-SDK/CLI acceptance
are recorded separately. Formal SDK identity/catalog integration remains Main's
responsibility; the candidate is not a released package.

```tsx
import {defineNativeStage} from '@frameweave/engine/native';
import {ribbonScene} from 'spatial-creation-candidate';
export const shot = defineNativeStage(() => ribbonScene({
  ribbon: {width: .5, speed: .7, ink: [.95, .2, .065]},
}));
```

The complete editable Composition is in `examples/ribbon.tsx`. It includes a
copper/teal/gold ribbons, warm key/cool rim lighting, tapered edges, a dark gradient
and subtle floating particles. `silkRibbon` returns only the transparent fabric
object. This is procedural authored motion, **not a cloth physics claim**.

## Repeated objects without per-object setup

```tsx
export const shot=defineNativeStage(()=>cloneScene({
 shape:'box',size:.29,
 layout:{kind:'wave',grid:[7,5,1],spacing:[.42,.42,.42],amplitude:.24},
}));
// Transparent objects work with the existing composition helpers.
radialClones({count:20,radius:1.2,material:'copper',orientation:'outward'});
scatterClones({count:32,bounds:[3,2,1],sizeVariation:.4,seed:7});
```

`examples/clone-scene.tsx` is an editable one-second kinetic sculpture with
warm/cool tiles, existing three-point lighting, gradient background and an
orbiting camera. `clone-gallery.tsx` shows all eleven entries. `lineClones`,
`gridClones`, `radialClones`, `sphereClones`, `scatterClones`, `helixClones`,
`spiralClones`, `honeycombClones` and `waveClones` supply common layouts.
`clones3D({layout,...})` exposes the same typed layout union and
`cloneScene` supplies a ready-to-shoot arrangement and background. These are
ordinary creator functions, not a second scene document or simulation system.

The original NativeInstancedMeshRenderer shares ONE source topology, expands
its triangles with the original GPU compute shader, then resolves mutual opaque
depth and GGX shading in the original Native renderer. CPU work is layout/TRS
control attributes, not duplicated per-clone MeshData or pixel rendering. The
renderer still costs O(pixels*triangles*instances); this is not a claim of
hardware raster instancing, constant pixel cost or unlimited performance.

Default source is a small icosahedron; use a typed primitive `shape/geometry`
or an existing Graphics `asset`. CloneScene defaults to a box. Geometry is
immutable meters. `size`0.24 scales each source (scene0.29); `sizeVariation`
0..1 exclusive supplies stable seeded variation. Zero size or zero population
produces transparency. Group `position/rotation/spin/scale` and camera use the
previous section's existing controls; rotations/spin are degrees/second as
appropriate. `cloneRotation/cloneSpin` act on each clone. Per-clone scales
stay positive under the original instance contract; group scale can mirror.

Counts/grid dimensions are immutable setup; reopen to change topology. Count0
is valid, grid dimensions are positive integers. Grid/wave index order is X,
then Y, then Z. Grid spacing is a three-component Core Signal vector in meters.
Line step is a centered vector. Radial layout lies in XY, sphere uses a fixed
Fibonacci distribution on a surface, scatter uses Core RNG in centered box
bounds, helix uses +Y height and XZ radius, spiral lies in XY, and honeycomb
uses staggered XY rows. The honeycomb bounding box is centered. Align local +Y
with `orientation:'outward'` or `'tangent'`; line/ring/sphere/helix/spiral
have authored tangents, other layouts use +X. This is procedural arrangement,
without collision, dynamics, packing or automatic anatomy/asset analysis.

Layout distance/radius/spacing, wave amplitude/phase/speed/spread and clone
motion evaluate existing scalar Core Signals at the exact FrameContext.
Wave phase is phase(time)+time*speed(time), with radians and radians/second;
spread is radians per grid station on each axis. This is analytic motion, not
velocity integration. Animate phase/rotation for authored absolute curves.
All seeded choices use existing Core RNG indexed by seed and clone ordinal;
frame order, rendering duration and prior samples do not alter the result.

Palette entries are linear709 base-reflectance multipliers0..1. Cycle mode
uses ordinal order; random mode makes a stable seeded choice. Physical material
controls and HDR emissive remain the existing sculpture controls. Input assets
are copied/validated; declared textures reject and sRGB baseColor needs an
explicit scene-linear ink override. Nothing auto-loads, grants trust or enables
WASM. Output stays owned PM float16/32 scene-linear Rec709; no CPU/SDR fallback.

A complete population/attribute/geometry plan precedes template allocation.
maxValueBytes budgets CPU values, maxBytes/maxRayTests/maxLights retain the
original configurable Native limits, and the Session owns actual GPU limits.
There is no new fixed population cap beyond the existing instance domain and
explicit budgets, no truncation or hidden detail/precision reduction. Increase
budgets deliberately for expensive offline work. Static template releases at
close; frame attributes/expanded buffers release after recording, with actual
GPU completion/recycling still owned by the Session. Stage close/busy/cancel,
constructor failure and failed dispatch/retry use the existing lifetime guards.

Reproduce with `validation/clones/run.ps1` and the same existing release,
SpiderMonkey and diagnostics binaries as the sculpture campaign. It checks
layout math, real Native GPU output, original renderer parity, unordered and
repeated frames/reopen, carried public declarations/CLI and a fully decoded
one-second video. Main still owns formal SDK/catalog identity integration.

## Solid objects, animation and a camera without graphics setup

```tsx
export const shot=defineNativeStage(()=>sculptureScene({
 camera:{orbit:{speed:12}},
 objects:[
  {shape:'torus',material:'copper',rotation:[25,15,0],spin:[0,30,0]},
  {shape:'sphere',geometry:{radius:.4},position:[.8,.5,0]},
 ],
}));
// A single transparent object can use all existing image composition helpers.
box3D({material:'ceramic',rotation:[20,30,12],spin:[0,20,0]});
```

The complete editable shot is `examples/sculpture-scene.tsx`. Defaults include
warm key, cool fill/rim lighting, a composed background and a slowly orbiting
camera. The eight one-call shapes are `box3D`, `sphere3D`, `torus3D`,
`cylinder3D`, `cone3D`, `capsule3D`, `knot3D` and `icosahedron3D`.
`mesh3D({asset})` accepts existing Graphics-v1 MeshData. No Three object, GPU
buffer, normal matrix or cleanup is required in creator code. The example
gallery shows all ten entries. Reused Three geometry and the original Native
GGX renderer supply the algorithms; these are creator adapters and defaults.

Static geometry uses meters. `radius`, `height`, `tube`, box `size` and
positive integer `detail` are immutable setup. Capsule height is the middle
section, excluding its two rounded ends. Animate `position`, `rotation`,
`spin` and `scale` instead: vector components accept existing scalar Core
Signals/keyframes. Rotations are Euler XYZ **degrees**, spin is degrees/second,
and evaluation is rotation(time)+time*spin(time), not velocity integration.
Animate rotation for an authored absolute curve. Negative scales mirror; any
zero scale hides geometry for that sample while still executing the Stage.
No logical time advances and random/repeated frame requests need no prewarm.

`material` selects ceramic/copper/chrome/matte defaults. `ink` (linear709
base reflectance0..1), `emissive` (HDR), `roughness`, `metalness` and
`opacity` override it with Core Signals. Existing finish/post composition
continues to manage intermediate images. Custom Graphics texture references
require an explicit original texture adapter and are rejected here; authored
sRGB baseColor needs an explicit scene-linear ink override. The caller's asset
is preserved; the adapter strips only an explicitly superseded baseColor.

Camera position/target, orthographic viewHeight, perspective verticalFov and
orbit parameters accept Core Signals. Position and orbit are exclusive. Orbit
uses azimuth/elevation degrees and radius meters around target; speed is
absolute degrees/second. Near/far/up and projection are immutable. The original
camera validator rejects degeneracy and invalid clipping ranges. Scene-level
TRS moves its whole group; object TRS applies locally first. Several objects
in one sculptureScene share one original renderer and correct mutual opaque
depth. Stacking independent object images retains image-layer semantics.

This is the original opaque-nearest/single-scatter GGX profile: opacity scales
the nearest result after visibility, without translucent layer sorting,
shadows, environment maps or MSAA. No new renderer, owner, graph or permissions
are added. Only float16/32 scene-linear Rec709 PM output is supported. CPU
prepares original Three geometry/TRS/normals; actual pixel visibility/material
work runs on the existing Native GPU. Configurable maxValueBytes, maxBytes,
maxRayTests and maxLights preflight the entire scene; the original renderer and
Session still enforce actual device limits. Logical release is not completion.
The current renderer is O(pixels*triangles); larger detail can be expensive.
No resolution, detail or float precision is silently reduced.

Reproduce with `validation/sculpture/run.ps1`, providing the existing release,
diagnostics and SpiderMonkey executables. Evidence separates original manual
renderer parity, actual random-frame GPU output, public CLI/declarations and a
fully decoded one-second clip. Main owns formal SDK/catalog integration.

## Ready-to-shoot neon and electricity

```tsx
export const shot=defineNativeStage(()=>electricScene({
  bolt:{end:[1.3,-.7,0],ink:[.22,1.8,4],amplitude:.16,speed:4},
}));
// Transparent objects compose with the existing same-owner creators.
stackCreations([gradientBackground(),neonRing(),plasmaOrb()],{finish:'cinema'});
neonStroke({points:[[-1,0,0],[0,1,0],[1,0,0]],thickness:.025});
```

`electric-scene.tsx` is a complete one-second shot. `neon-objects.tsx` shows
all ten new entries: `stroke3D`, `neonStroke`, `neonRing`, `neonSpiral`,
`orbitRibbons`, `lightningBolt`, `electricArc`, `lightningStrike`,
`plasmaOrb` and `electricScene`. No geometry buffers, shaders, matrix setup
or disposal code is needed in these projects. This is creator configuration
over the existing sweep/lightning/mesh/Glow implementations, not ten new
algorithms. No npm dependencies or WASM permission are needed.

Positions use existing right-handed meters/+Y-up/+Z-toward-viewer. Points,
centers and Euler XYZ rotations accept three Core scalar Signals; rotations,
twist and phase are radians. Thickness is tube **radius**, or ribbon **half
width**; a custom stroke can give one thickness Signal per station. Points
are exact polyline stations, not automatically fitted splines. Closed paths
omit a repeated final point. `firstNormal` optionally controls the original
transport frame. The three analytic shapes use ordinary authored control points
then the original sweep; ring/orbit seams and topology chunks are unchanged.
Ring's default tilt and orbital plane rotation change analytically with phase.

All motion uses actual local `FrameContext`: `phase(context)+time*speed(context)`.
Speed is radians/second for shape phases, and original coherent-noise address
units/second for lightning. Animating speed does not integrate a velocity
history; animate phase for an authored absolute phase curve. There is no
playback warmup or state history. Identical seed/time/options replay directly.
Endpoints are animated and have no implicit connection to other objects.

Unlit HDR ink and original PA Glow are the neon defaults. Plain `stroke3D`
omits Glow. `finish:false` removes it; normal finishing remains composable.
Select `shading:'standard'` for the existing lit GGX material, with base
reflectance0..1 and `emissive` for HDR. Unlit ink is nonnegative working-linear
RGB; opacity0..1, PM output. Standard-only material fields on unlit objects
reject rather than being ignored. No SDR intermediate is added.

Lightning topology/seed, point count and orbit count are immutable setup.
The original source generator uses midpoint displacement and Core RNG;
it is not a copy of Three LightningStrike or a plasma/air-discharge simulator.
Plasma Orb seeds fixed sphere directions and rotates their endpoints; it does
not add charged-particle physics. Default topology is4 subdivisions,
one branch generation/two children, three radial sections. `topology` exposes
the original safe options. Complete aggregate geometry/value and CPU work
plans precede multi-object allocation. Existing Native `maxRayTests`,
`maxBytes`, Graphics-v1 chunking and device budgets remain authoritative;
no count cap or hidden quality reduction is introduced.

The camera default fits a four-meter horizontal region with a minimum
viewHeight3.4; change `camera` for larger authored objects. Shapes do not
automatically rescale animated geometry. Original mesh visibility is nearest
surface, without translucent depth sorting, shadows, AA/MSAA or cast light;
Glow softens the image but does not replace those rendering features.
CPU computes geometry; actual Native GPU shades/rasters and runs Glow.

Reproduce with `validation/electric/run.ps1 -NativeGpu <release.exe>
-SpiderMonkey <host.exe> -NativeDiagnostics <debug.exe>`. It uses no image
resource/ICC dependency, tests the original manual recipes separately from
public creator defaults, then renders PNG/storyboards and a fully decoded
one-second MP4. Main still owns formal SDK/catalog identity integration.

## Characters without mesh and bone setup

```tsx
export const shot=defineNativeStage(()=>characterScene({
  action:'wave',actor:{palette:{shirt:[.055,.4,.54]}},
}));
characterWave({frequency:1.1});
characterReach({target:[.9,.65,0]});
puppetCharacter({pose:{head:{rotate:[0,0,.15]}},
  targets:{rightHand:{at:[1,.5,0]}}});
```

`examples/character-scene.tsx` is a complete one-second paper-character shot.
`character-gallery.tsx` shows bind, idle, wave, walk, run, jump, dance, point,
reach and the composed scene. The original artwork has face, hair, clothes,
hands and shoes. Edit `palette` (skin/shirt/pants/shoes/hair/face), `ink`,
`opacity`, motion parameters or existing finish controls. It is an authored
flat paper puppet with rigid overlapping pieces, not a volumetric human model.

The same original Three Bone/Skeleton/CCDIKSolver and Native compute LBS/drawMesh
are used. The default artwork/poses are new author configuration, not a new
rig/IK/animation engine. A tiny float palette is generated on GPU from six
constant control colors; all vertex deformation and image pixels remain on the
Native GPU path. There is no CPU image upload, browser, external asset or WASM
requirement. Colors are scene-linear Rec709, with PM F16/F32 images.

`puppetCharacter` starts in bind pose. The eight action creators supply
procedural poses; `amount`0..1 scales motion, `frequency` is Hz,
`phase` radians. Actions evaluate `2*pi*time*frequency+phase` at the exact
Stage FrameContext. They reset to bind through the existing rig on every
sample. There is no integration, prewarm, wall clock or automatic time advance.
Walk/run are in-place authored cycles, jump is a periodic posed hop, and point
is a stationary default target. These are not mocap, dynamics or foot-plant
constraints. Animate `phase` for an authored phase curve. `frequency:0`
freezes the phase. Point/reach accept an animated `target`; other actions
use explicit `targets` and reject a meaningless singular `target`.

`pose` exposes named joint `move`/Euler XYZ `rotate`/`scale`; three Core
scalar Signals each. Moves and IK targets use mesh-local meters, rotations
radians. Friendly pose fields override the matching preset component. Named
hand/foot `targets` create the original parent-chain IK, with explicit weight
and iteration budget. The builtin calls +X “right” and -X “left”; this is not
an anatomical tracking convention. Advanced `controls`/`rig` retain the
original exact bone/chain APIs; raw per-bone entries override friendly entries.
Original positive/uniform-scale and CCD numerical limits still apply.

Custom `asset` is the existing MeshData/SkeletonData pair. Supply `joints`
to map friendly names to actual bone IDs; anatomy is never guessed. Missing
joints reject explicitly. Geometry, weights and skeleton are preserved.
Solid material uses the authored UVs or a constant UV when absent. Texture
references require the existing explicit low-level texture adapter; this API
does not silently omit or load them. An sRGB baseColor requires an explicit
working-linear `ink` override. `custom-character.tsx` and the original editable
`paper-figure.json` demonstrate the public Graphics validators. Existing
`characterMotion({asset,controls})` and all low-level APIs remain available.

`detail` is immutable artwork tessellation; `maxValueBytes` and
`maxBufferBytes` retain explicit Graphics and Native budget checks. No fixed
animation-length cap is added. The camera is immutable setup; use existing
`placeCreation` to animate image-space placement. Original nearest-surface
rendering has no MSAA, volumetric body, garment simulation or shadow casting.
Pose/CPU rig controls and palette generation use their existing ownership
boundaries; frame textures/positions are released after recording, immutable
skin buffers at close. Logical release is not GPU completion.

Reproduce with `validation/character/run.ps1 -NativeGpu <release.exe>
-SpiderMonkey <host.exe> -NativeDiagnostics <debug.exe>`. It checks complete
pose cycles, actual Native HDR/Alpha/skin results, random/repeated frames/new
sessions, original renderer parity and a fully decoded one-second video. The
candidate remains subject to Main's formal SDK/catalog integration.

## Use your own image as a character

```tsx
export const shot=defineNativeStage(()=>imageCharacterScene({
  actor:{image:{resource:'actor',size:[400,600]},joints},
  action:'wave',
}));
// joints is ordinary static UV data, not a model or detector:
// {hips:[.5,.54],chest:[.5,.34],head:[.5,.27], ...}
imageCharacterReach({image:'art',imageSize:[400,600],joints,target:[.85,.3]});
```

`image-character-scene.tsx` includes an original editable SVG, tagged PNG and
`image-character-joints.ts`. Replace the declared Resource and edit the joint
positions for your artwork. The ten entries mirror the paper character actions:
`imageCharacter` (bind), Idle, Wave, Walk, Run, Jump, Dance, Point, Reach, Scene.
The API creates the rectangular UV mesh, original distance-to-bone weights,
rig, camera and Native GPU skin/render resources. It never detects anatomy,
reads image pixels into JS or infers missing joints.

Joint coordinates are immutable source-image fractions: top-left0/0,
right/down positive. The hips/root is required. Every declared joint needs its
explicit parent; each selected action rejects missing required joints. A
partial hierarchy is valid for bind/custom poses. Runtime targets can extend
outside the image. Unlike3D figure controls, image `pose.move` uses UV offsets,
`rotate` uses clockwise degrees, `scale` uses two scalar Signals, and
`targets.*.at` uses source UV. Conversion to the original meter/+Y-up/radian
rig is explicit. Equal XY scale is extended uniformly to Z for the original
CCD contract; nonuniform IK ancestry still rejects. Advanced raw
`controls`/`rig` retain their original3D units and exact names.

The original action recipes are reused with translation scaled to the authored
image height. Default point/reach targets use the declared arm lengths, not a
fixed foreign skeleton. Time, phase and amount follow the paper character
semantics above; there is no extra runner or history. `height` defaults2.5m,
`segments`16×24, margin12%. Binding defaults to four influences with power4 and softening.02;
`binding` exposes the original controls and work
budget. Source aspect is part of immutable setup. Source size changes reject
with `E_CREATION_INPUT_SIZE` and require reopening, never silent reweighting.

A string `image` borrows that input (default name `image`); `imageSize`
defaults to Stage dimensions. A resource descriptor uses its explicit `size`
and existing ICC/surface-v2 import policy. The complete image/skin value plan
is checked before initialization/import; extra color/Alpha preparation images
are checked before allocation. No source input is released by the creator.
Wide-gamut **scene-linear** input is converted by the existing Native color
owner; straight Alpha is associated before linear texture sampling. Encoded
borrowed images reject: use the existing declared ICC resource importer.
PM input is consumed as declared, without an additional hidden-RGB clear.
F16/F32 and signed/HDR RGB remain floats; output is PM linear Rec709.

This is rectangular distance-weighted image skinning, not alpha-contour meshing,
semantic body segmentation or ARAP. Transparent areas remain connected and a
single image may stretch across overlapping body parts. Author separate parts
or use existing low-level custom assets for more elaborate cutouts. Transparent meshes use the existing Native raster-v1 depth peeling by default,
so a folded fully transparent triangle cannot hide the face or body. `raster`
can explicitly select the other existing owner modes. This Stage-local adapter
records original GPU `deform` then public `drawMesh`; it adds no Renderer,
owner or shader. Raster scratch admission belongs to the existing Session;
`maxBufferBytes` separately covers skin/input/preparation values. MSAA and
semantic part layering remain absent. No arbitrary
texture handle crosses a Stage: `image-character-input.tsx` verifies two real
Native Stages through the existing surface port.

PNG resources keep the explicit Python/PyVips ICC host requirement described
in Image Puppet; missing support fails rather than installing dependencies or
assuming a profile. The SVG/PNG preparer is offline authoring, not runtime
pixel processing. Reproduce with `validation/image-character/run.ps1`, supplying
the same explicit binaries/ICC arguments as the Image Puppet campaign.

## One-choice finishing

```tsx
// A finished shot, without GPU buffers, matrices, effect factories or cleanup.
export const shot = defineNativeStage(() => ribbonScene({finish: 'cinema'}));
// Override a preset, animate legal scalar parameters, or combine in order.
finish: {preset: 'neon', glow: {intensity: .35}, vignette: .2}
finish: [{exposure: .3}, {glow: {radius: 3, intensity: .4}}, {vignette: .2}]
```

`clean`, `cinema`, `dream`, `neon`, `noir`, `warm`, `cool`, `pastel`, `poster`
and `sepia` are ten deliberate sets of defaults over the existing Native
operators. `finish` is available on all creation functions. See the complete
one-second `examples/finished-ribbon.tsx`; changing a look is one field edit.
The carried Agent guide is enriched with actual preset defaults at build time.

`finish:false` switches off the chain. Each controls object also accepts
`enabled: boolean | Signal<number>` (numeric values >=.5 enable it). Existing
Core keyframe helpers accept numbers/strings, so use0/1 keys with `easing:'step'`
for an animated checkbox. No Boolean-keyframe extension or new timing exists.
Disabling finishing never pauses the underlying particle/physics simulation.

Exposure is in stops; contrast is a multiplier (1 unchanged); `contrastPivot`
is the existing working-linear contrast anchor. Cinema uses.08 to retain the
designed dark backdrop. Saturation uses
the existing offset (0 unchanged, -1 grayscale). Glow radius is Gaussian sigma
in output pixels, threshold is scene-linear working-white units, and intensity
is additive. Radius0 still performs the original unblurred highlight combine;
`glow:false` or intensity0 skips Glow entirely. Vignette is0..1, grain is a
nonnegative amplitude. RGB tint/tritone vectors use scalar Signals per channel.
Preset Glow overrides merge with that preset's radius/threshold. Controls have
a fixed documented order in `FinishControls`; an array allows another order.

This layer calls the original professional/creative/PA filter factories with
explicit allocation tracking on the same owner. Intermediate images are
released automatically; one caller-owned result remains. It adds no image
readback/upload and needs no defensive GPU copy. `clean`/omitted finish returns
the original image without recording a GPU pass. Ordinary `post` callbacks
remain available **after** finishing and retain their explicit ownership rules.

Enabled Glow retains the original PA profile: it canonicalizes associated Alpha
(including clearing hidden RGB at Alpha0), thresholds luminance, blurs and adds
radiance/coverage. This is an explicitly selected effect, not a change to clean
creation or a claim that glow preserves input Alpha. No SDR/display conversion
is inserted; per-pass F16 quantization follows the chosen format. Grain is
deterministic from the actual local frame and seed. No new time system exists.
Parameter/recording failures retain a finish plan index, original error code
and local frame. Deferred GPU/device errors remain with Session diagnostics.

The complete finish campaign has an actual one-command entry:
`validation/finish/run.ps1 -NativeGpu <release.exe> -SpiderMonkey <host.exe> -NativeDiagnostics <debug.exe>`.
It compares original manual GPU recipes, public R1 creators, old clean output,
and real one-second media. The old-package comparison requires the retained
private0.1 test project; missing prerequisites fail explicitly.

## Ready-to-shoot physics

```tsx
import {windFlag} from 'spatial-creation-candidate';
export const flag = defineNativeStage(() => windFlag({wind: [.4, .1, 1.8]}));
```

`hangingCloth()`, `windFlag()`, `drapedCloth()`, `bouncingBalls()` and
`dominoes()` generate the mesh/body configuration, pins/colliders, camera,
material, lighting and visible supports. No manual mesh, collider or matrix
setup is needed. `examples/wind-flag.tsx` is a complete one-second project;
`examples/physics-gallery.tsx` shows all five. Both are carried as declared R1
resources (`physicsExample`, `physicsGallery`). Render with explicit
`--allow-wasm`; these functions never authorize WASM themselves.

Size, grid segments, body count and seed are immutable simulation setup.
`wind` uses three existing Core scalar Signals, evaluated at **each fixed
substep** by the existing solver. This is not a current-frame shortcut: earlier
forces remain part of replay. Material/finish values use current-frame Signals.
Use `simulation` to override the original physical controls, constraints,
substeps, solver and checkpoint budgets. Direct named options win over the
matching advanced defaults. `pin` chooses top/left/corners/none; explicit
`simulation.fixedVertices` or `simulation.pins` retain the original semantics.

`clothSheet` returns ordinary Graphics MeshData (shared vertices, top-left UV,
meters). `ballBody`, `boxBody`, `groundBody` and `springJoint` return the existing
RigidBody/Joint types. Full box size is used, floor height means its **top**
surface, spring units are meters/N-per-meter/N-seconds-per-meter. These five
are data helpers, not five extra visual effects. In the managed R1 candidate,
call them inside the initialized Native Stage factory, like other named
bindings. Direct source users may call the pure helpers without a device.

Geometry limits come from existing Graphics-v1 MeshData (16384 vertices and
100000 index entries). A complete value-budget check happens before allocation;
larger topology requires an explicit existing-contract extension, not silent
decimation. Body budgets/work limits remain configurable. Native mesh rendering
is still O(pixels × triangles); no automatic quality reduction or new renderer
is introduced. Supports are visual, not implicit cloth colliders. Drape alone
declares its matching sphere/plane point colliders. No cloth self-collision,
triangle CCD, shadow casting or continuum fabric-material claim is added.

The three cloth presets explicitly round display positions to float32 before
GPU upload, including solver roundoff that underflows to zero. Simulation
positions and checkpoints remain doubles. `clothScene` keeps its previous
strict behavior by default; `renderPrecision:'float32'` opts into this display
conversion. Overflow/nonfinite positions still fail; no physical state is reset.

Reproduce this batch with
`validation/physics/run.ps1 -NativeGpu <release.exe> -SpiderMonkey <host.exe> -NativeDiagnostics <debug.exe>`.
It creates a private install, tests all five presets plus a real spring,
random/repeated frames and fresh sessions, then renders the carried examples
to PNG and one-second MP4 and fully decodes the video. Supply the existing
executables; no browser, daemon or dependency installation is started for you.

## Image Puppet without mesh setup

```tsx
import {puppetSway} from 'spatial-creation-candidate';
export const flower=defineNativeStage(()=>puppetSway({
  image:{resource:'plant',size:[320,400]},amount:.13,frequency:.65,
}));
// Declare Resource({id:'plant',src:'./plant.png',kind:'image'}) in Composition.
```

`puppetImage` accepts named source-image pins; no vertex IDs, mesh or camera.
`puppetSway`, `puppetBend`, `puppetStretch`, `puppetBreathe`, `puppetWave`,
`puppetJelly`, `puppetFlutter`, `puppetReach` and `puppetSquash` are nine designed
pin-motion recipes over the **same original EffectCraft-derived ARAP solver**.
They are authored 2D image motions, not new physics or solver implementations.
Use `amount`, `frequency` (Hz), `phase` (radians) and `finish`; each accepts the
same legal scalar Signals as other creators. Amount is a normalized displacement
or factor (0..35%); Bend uses radians (0..1). Time is actual Stage-local seconds;
animated frequency multiplies time, not an integrated frequency history.

```ts
puppetImage({image:'art',pins:{
  base:{at:[.5,.95]},
  tip:{at:[.5,.1],offset:[keyframes([{frame:0,value:0},{frame:23,value:.12}]),0]},
}})
```

Coordinates are source-image fractions, top-left0/0, bottom-right1/1; positive
offsets move right/down. `at` is immutable rest position; `to` is an animated
absolute target, and `offset` adds to it (or to `at`). Every authored pin is
inserted **exactly** into a rectangular shared-vertex UV grid. There is no hidden
nearest-vertex snapping, silhouette detection or Alpha-contour meshing. Empty
transparent areas still connect the rectangular card; use existing `puppetCard`
with an authored contour mesh for silhouette topology.

`image:'art'` borrows that declared image input. A resource object imports only
an existing declared Resource ID, via the ordinary Native resource scope, once
per frame; imported images are released automatically, borrowed inputs remain
borrowed. Resource `size` is explicit output width/height, so choose the original
aspect ratio. Default `decode:'icc-sdr'` requires an embedded profile; opt into
`missingProfile:'assume-srgb'` explicitly for an untagged SDR asset. `surface-v2`
remains available for declared float resources. No new asset resolver, trust
grant, file access or readback is introduced.

ICC decoding retains the existing host requirement for explicitly provisioned
`FRAMEWEAVE_MEDIA_PYTHON` with PyVips/CFFI and reviewed libvips. Missing support
fails with the existing `E_MEDIA_ICC_UNAVAILABLE`; this module does not install
it or substitute an unprofiled image decoder. The focused campaign uses the
existing reviewed PyVips3.2.0/CFFI2.0.0 profile in a worktree-local test directory.
Borrowed Native float inputs and `surface-v2` resources need no ICC dependency.

Aspect is preserved and centered with12% margin by default. Layout is initialized
from the first actual admitted image; a later source-size change rejects with
`E_CREATION_INPUT_SIZE` and requires reopening. Grid segments default6×8; use
explicit `segments`, `maxValueBytes`, `maxBufferBytes` and `solver.maxSolveWork`
for reviewed scale. Original Graphics and solver budgets still apply. Foldovers
reject by default; opt into the original `constraints.foldovers:'allow'` only
when overlap is deliberate. Sampling is linear/clamp by default. Display
positions explicitly round to float32; solver outputs remain doubles. F16/F32,
scene-linear color and premultiplied Alpha remain on the Native GPU path.

`examples/puppet-plant.tsx` and `puppet-gallery.tsx` carry original editable SVG
artwork plus a tagged PNG. They require explicit `--allow-wasm`. Defaults,
requirements and intent examples are in the carried `creation-guide.json`.
`examples/puppet-input.tsx` composes two real Native Stages through the existing
public surface input port, with no handle exchange in authored code. Use margin0
when the input already has the desired full-canvas framing.

Reproduce with `validation/puppet/run.ps1 -NativeGpu <release.exe> -SpiderMonkey
<host.exe> -NativeDiagnostics <debug.exe> -MediaPython <python.exe>`; optionally
add `-PythonModulePath <private-site-packages>`. No dependency installation is
performed by that script. It checks original-WASM complete cycles separately
from real Native/SpiderMonkey image results, then the public carried TSX recipe,
gallery and one-second MP4. Original-recipe lossless float/Alpha/black/white
comparisons are distinct from the lossy H.264 comparison.

## Particle fields without graphics setup

```tsx
import {confettiField,snowField,energyField} from 'spatial-creation-candidate';
export const confetti=defineNativeStage(()=>confettiField({rate:35,wind:[.08,0,0]}));
export const snow=defineNativeStage(()=>snowField({radius:.03,opacity:.6}));
export const energy=defineNativeStage(()=>energyField({finish:'neon'}));
```

`particleField` provides explicit point/line/box/disk/sphere emitters. Nine
ready-to-use configurations are `snowField`, `sparkField`, `bubbleField`,
`fireflyField`, `dustField`, `confettiField`, `energyField`, `starField` and
`petalField`. These assemble the **original feedback solver, FixedStepRunner,
FastNoiseLite curl, swept collision, life curves and Native particle renderer**.
The new code is creator configuration, stateless primitive sampling and GPU
sprite geometry. It is not a replacement solver or a GPU simulation claim.

Each field starts with an explicit seeded birth burst so the first frame already
has a usable population. No prewarm, negative time or future frame is evaluated.
`initialCount` replaces the time0 burst; continuous `rate` may add its own time0
birth according to the existing birth planner. Emitters return offsets relative
to `position`, in existing right-handed meter/+Y-up space. Disk area and sphere
volume/surface sampling use the Core seed and stable birth ordinal.

`rate`, `lifetime`, emitter shape, initial velocity, palette, forces, trails,
colliders and seed are immutable history. Use `simulation` for original budgets,
substeps, bursts and sub-emitters. Explicit top-level controls override matching
advanced fields; other advanced data is retained. No current-frame evaluation
pretends to apply animated forces to prior simulation steps. `color`, `opacity`,
`radius`, `trailOpacity`, `trailWidth` and original appearance fields accept legal
Core Signals at the requested frame. `radius` and seeded `sizeVariation` change
appearance only; physical collision radii retain the original simulation values.

`color` is scene-linear RGB; with a palette it tints the inherited particle color.
Signed/HDR components remain floats. `scatter` is per-axis box velocity jitter
in m/s, not a cone angle. Scalar gravity means downward acceleration; a vector
uses its authored axes. Wind is an extra acceleration vector (m/s²); drag is1/s.
Turbulence uses the pinned existing FastNoiseLite curl. Vortex/attraction use the
original softened laws. A `floor` is an invisible collision plane, with the
existing restitution/friction profile; it does not add a floor mesh.

Built-in disc, ring, star, petal and rectangular confetti appearances are automatic.
Discs reuse the analytic Native billboard. The other four use original Three
Shape/Earcut geometry plus Native GPU drawMesh, without a CPU pixel texture or
new pixel shader. Persistent vertex/index buffers are created during Stage init;
the float sprite image is recorded and released per frame. `spriteResolution`
defaults64 and can be configured. There is no SDR intermediate.

The reviewed Three0.186.1 distribution bundles Earcut3.0.2 under the
[ISC license](https://raw.githubusercontent.com/mapbox/earcut/v3.0.2/LICENSE).
Its complete notice is retained in source, generated bindings and package
licenses. `UPSTREAM.json` pins the exact installed source and license hashes;
the builder rejects changed bytes. Three remains MIT; no new npm dependency
or external engine is introduced.

```ts
particleField({
  emitter:{shape:'disk',radius:1,plane:'xz'},
  sprite:{image:'atlas',columns:4,rows:2,frameBlending:true},
  style:{spriteFrame:2.5},
})
```

An atlas image input is borrowed; a `{resource,size,decode,missingProfile}` image
descriptor uses the same declared Native resource contract as Image Puppet.
Resource images are owned only for that recording and released automatically.
ICC decoding retains its existing explicit host dependencies. `backgroundInput`
borrows a same-sized PM linear Rec709 image. Finishing runs after this composite,
so it affects the combined image. Existing depth/soft-intersection controls remain
available through the low-level Native renderer; no new spatial Stage port exists.

These are billboards/capsule trails, not six-degree-of-freedom angular bodies,
particle-particle collision, volumetric smoke or fluid simulation. CPU fixed-step
state, palette values and GPU primitive plans retain their respective original
budgets; no particle-count cap or automatic quality reduction is added here.

Complete editable projects are `examples/particle-confetti.tsx`,
`particle-gallery.tsx` and `particle-input.tsx` (two Native Stages composed through
the existing surface input). These need no WASM permission, browser or daemon.

Reproduce with `validation/particle/run.ps1 -NativeGpu <release.exe> -SpiderMonkey
<host.exe> -NativeDiagnostics <debug.exe> -MediaPython <python.exe>`; optionally
set `-PythonModulePath <private-site-packages>`. Python/ICC support is needed for
the declared PNG sprite-resource case and previous Puppet PNG compatibility.
The new field and media cases run with WASM permission omitted. The script performs no tool or
dependency installation. It records lossless float/Alpha/black/white parity,
random/repeated frames, new sessions, custom atlases, empty fields, public TSX
media and the existing surface-port composition. H.264 error is measured
separately. Raw failures, commands, wall times and device evidence are retained.

## Individual controls

- `ribbonScene({ribbon, particles, background})`: complete shot. Change ribbon
  width/length/amplitude/turns/speed/phase/twist, strands/spacing, material, or camera. Omit options
  for the designed defaults; `particles:false` removes the dust.
- `particles`, `particleBurst`, `particleFountain`, `particleRain`,
  `vortexParticles`: existing checkpointed feedback simulation and GPU drawing.
  `simulation` is an immutable history configuration; `style` is current-frame
  appearance. `backgroundInput` explicitly borrows a declared image port.
- `characterMotion({asset, controls})`: existing Graphics Mesh/Skeleton, FK/IK
  control and GPU skinning. Skin rendering is unlit; it does not claim a new
  professional character material system. Existing low-level rig APIs remain.
- `puppetCard({mesh,textureInput,pins})`: ARAP with animated XY pin components.
  Supply one anchor per connected component; foldovers fail by default.
- `rigidScene({world})`, `ropeScene({points,simulation})`,
  `clothScene({mesh,simulation})`: existing Rapier/XPBD and checkpoint recovery,
  paired with cameras, material and lighting. World forces/kinematic targets and
  cloth pins retain the existing substep Signal semantics. Convex hull display
  is deliberately rejected rather than drawing an uncomputed source surface.
- `orbitalScene`, `crystalScene`, `emberScene`, `lagoonScene`: existing spatial
  recipes, using Stage dimensions, seed and actual local time automatically.
- `noiseTexture`: actual pinned FastNoiseLite GPU noise/fractal/domain warp;
  scalar alpha/gain/bias use Core Signals. No CPU pixel fallback.

All numeric animated fields use Core `Signal<number>` (static, keyframe,
expression or spring where allowed). RGB and position vectors use three scalar
Signals. No new interpolation, global current-frame state or time progression.
Simulation FPS is inherited from the first real FrameContext; a changed FPS
requires a new instance. Seeds come from the Stage unless explicitly overridden.
Random access uses the existing fixed-step/checkpoint algorithms, not playback
wall time. Reopening creates fresh instances.

Ribbon motion is `phase(context) + context.time * speed(context)`. Animating
speed does not integrate a velocity history; animate phase for an authored
phase curve. The final Composition compositor may promote F16 Stage images to
F32; this preserves their quantized values and never introduces an SDR pass.

## Composing effects safely

```ts
// Existing low-level filters returning caller-owned images:
post: [ownedPost((image, ctx) => fx.blur(image, {radius: 3}))]
// Existing managed processImage RETAINS its result until its next call:
post: [retainedPost((image, ctx) => processImage(image,
  (input, fx) => fx.vignette(input, {amount: .3}), {context: ctx}))]
```

This ownership adapter is a **local candidate**, not a frozen cross-library
standard. Posts execute in authored order. Inputs are borrowed; identical
returns do not transfer ownership. A new `owned` result transfers to this chain.
A `retained` result is immediately copied on GPU, with identical format/color/
alpha, so the provider can invalidate it later. This copy is intentional, not
a claim of zero-copy composition. A provider must await all work it starts;
unawaited concurrent invalidation cannot be repaired by a chain. Callbacks must
not return other borrowed resources as `owned`.

Intermediate images and geometry buffers are managed. A successful render
returns one frame-local caller-owned float image to the existing Stage adapter;
the module never disposes the borrowed scope or another module's input. Close
waits for its active recording, then cleans its own instances. Concurrent calls
to one instance fail (`E_CREATION_BUSY`) rather than reorder work. Failed posts
clean their own candidates; session/device cancellation, final queue completion,
loss diagnostics and reconstruction remain with the existing Renderer/owner.
Logical release is not a GPU completion fence. No image handle persists into
another frame. The Scene owns its immutable topology until dispose.

## Native and security

F16/F32, scene-linear Rec.709, premultiplied output; HDR/signed RGB remain floats
until explicit output/display conversion. No GPU means an error. No SDR or CPU
pixel fallback and no changes to the P4 ABI. Rigid/Puppet/cloth/rope additionally
require the existing explicit `allowWasm`; installing a package is not trust.
No permissions are granted by these helpers. Source users can import
`createSpatialCreation(init, {puppet,rigid,deform})` with their existing verified
ModuleLoaders. R1 users receive those services from the ordinary v2 initializer.
The declared byte resources carry exactly the reviewed original solver builds.

## Candidate build and integration

`node --import tsx modules/spatial-creation/scripts/build.ts .frameweave/spatial-creation/package-001`
creates a fresh R1 candidate; it never installs or refreshes locks. Main owns
final public SDK exports, immutable identity/version and cross-library naming.
This candidate is not a released SDK. Existing R1 package description/tags and
resource guide expose intent/requirements without creating a discovery service.
`creation-guide.json` is independent candidate documentation, not Agent Tool
Result or a new public metadata schema. Current ACL-1 function-level capability
search expects P4 descriptors; it cannot honestly advertise these Native Stage
constructors as P4 plugins. Package inspection and the guide remain available.

Reproduce the focused campaign (supply your existing binaries; no automatic
browser/daemon/dependency installation):

```powershell
./modules/spatial-creation/validation/run.ps1 -NativeGpu <release.exe> -SpiderMonkey <host.exe> -NativeDiagnostics <debug.exe>
```

That script uses a new private project and explicit local-candidate trust, runs
the compiler/targeted tests, installs through public `packages install`, and
executes real R1 constructors with and without explicit WASM permission. It
tests unordered frames/new sessions and post failure/retry/close, then writes
three PNGs and a **one-second** MP4 and fully decodes the video. Lossless
storyboards and decoded H.264 storyboards are separate artifacts. The final
video command is the public CLI; PNGs reuse the same exact compiled build through
the official Native media service. The initial campaign also ran public CLI
`frame` and `storyboard`. Raw commands, durations and failures are retained under
`validation/evidence`. This is not full installation/portable/Linux acceptance.

Native mesh shading uses the existing single-scatter GGX profile, not exact
Three MeshStandardMaterial. Visibility is nearest opaque surface; no shadows,
transparent layer sorting, fabric anisotropy or motion blur is claimed. Ribbon
geometry is CPU control math, GPU shading; physical simulations are CPU/WASM.
Native mesh work is O(pixels × triangles) with explicit configurable budgets.
Keep segment counts sensible; no automatic resolution/precision reduction.

Reuse: Three 0.186.1 (MIT) geometry/frame transport and existing skin/rig controls;
FastNoiseLite 1.1.1 (MIT); existing EffectCraft-derived ARAP (MIT/Apache-2.0),
Rapier3D-f64 0.36.1 (Apache-2.0), PositionBasedDynamics 2.2.0-derived constraints
(MIT). Exact sources/notices remain in the respective existing modules and are
carried by the builder. No GPL source or new npm dependencies are introduced.

## Foam and Shatter (0.19.5 candidate)

`foamField(options)`, `shatterImage({image:'inputName',...})` and
`shatterMesh({asset,image:'inputName',...})` are named imports inside an existing
`defineNativeStage` initializer. See editable `examples/foam-shatter.tsx`.
Foam includes continuous births, variable lifespan, growth, wind, turbulence,
viscosity, stickiness, overlap correction, pop impulse, GPU height-flow maps,
user textures and environment reflections. Persistent flow must use an explicit
historical evaluator, gradient or admitted resource; a current-only Stage port
is rejected. Texture/environment ports are borrowed current-frame inputs.

Foam uses Core fixed steps and managed Native reset/replay; packed GPU state has
16 F32 words per slot. Capacity derives from birth rate and lifespan, without
truncating active bubbles. Pair updates are simultaneous, O(capacity squared),
with configurable total replay/render work and actual device memory checks.
No GPU handles are serialized into checkpoints. Await `record()` before reuse;
`dispose()` awaits an active recording. Higher creator disposal uses the existing
CreationStage guard. Closing a scope/device requires a new Session, never a hidden
CPU or SDR fallback. Native owner keeps execution lifetime beyond logical release.

Shatter reuses five EffectCraft pattern families, explicit label grouping and
Graphics MeshData; it generates real front/back/interior faces, timed blast
spheres, mass variation, drag, gravity and grouped tumbling. Motion is absolute
time and directly seekable. Custom planar cells must be convex. Fragment meshes
and a padded material atlas use the existing Native textured depth-peel path.
Thickness zero emits only a front, preserving transparent cut-image semantics.
Numeric color components are scene-linear RGB; Alpha is separate `opacity` or
`interiorOpacity`. Inputs/outputs are PM linear Rec709 F16/F32. Native WebGPU
clip depth is explicitly converted from the standard Three projection range.
All temporary buffers/images belong to the adapter; source images and scope are
borrowed. Caller owns each returned output image. No GPU owner/P4 ABI changes.

EffectCraft MIT revision and exact source/license hashes are in `UPSTREAM.json`
and `vendor/effectcraft-simulation/`. The original CPU pixel renderer, global
cache, fixed 30fps and 3000-bubble truncation are excluded. This is an adaptation,
not a pixel-identical replacement for an existing project or Adobe binary.

Reproduce the focused campaign with
`node modules/spatial-creation/validation/coverage-round3/run.mjs UNIQUE_TAG`.
The fixed campaign ledger counts failures, build/install and actual media time;
all video evidence is one second. Public frame/render commands are recorded in
that script's `verify.ts`; no default GPU, trust or WASM policy is changed.

## Terrain waves and image-driven caustics (0.20 candidate)

`waveWorld(options)` and `heightCaustics({surface:'waves',bottom:'floor',...})`
compose through the existing image ports. Editable three-Stage example:
`examples/waves-caustics.tsx`. Constructors manage temporary resources.
Wave sources support point/line/ring profiles, Core Signals and explicit start/end
seconds. Initial Gaussian impulses or aligned height/velocity grids are supported.
Terrain includes planes, shores, islands and admitted replayable GPU image maps;
water depth controls wave speed. Dry ground and circle/box obstacles impose a
no-flux stencil. Each edge can reflect or use an explicit absorbing sponge.

`createWaveWorld(init,options)` exposes the same Stage-local managed buffers and
`record(context)`; no extra runner. Packed F32 state is height, velocity, wet, depth
per cell. Current frame views are borrowed until another recording/reset. Await
recording before reuse; disposal awaits pending work and releases only owned data.
Existing Native stateStep and Core fixed-step reset/replay define time. Default
substeps are four; unsafe CFL fails with E_CREATION_STABILITY rather than changing
speed, resolution or authored time. Work/state budgets remain configurable.

The plane uses centered XY coordinates (image row Y down), height Z towards the
light; it does not claim a world-normal Graphics AOV. Views: raw signed height,
water depth, signed plane normal and lit surface. Height view RGB is a documented
data encoding, Alpha is interpolated wet coverage. Native image ports are unchanged.

Caustics read an actual height/normal image and bottom image. Gradients and the
full refractive 2x2 Jacobian run on GPU; repeat/mirror/clamp/transparent sampling,
optional sky reflection, directional/point lighting and PM surface composition
are explicit. Normals use declared signed or unorm encoding with positive Z.
Focusing uses a configurable finite bound. This is the original geometric
single-valued small-slope approximation, not photon/path tracing. No CPU pixel
rendering, SDR conversion, device sharing or resource permission is added.

The original EffectCraft surfaces.rs and MIT notice are carried with exact
revision/hash records. Its CPU pixel loops, global cache, hardcoded clock and
resolution truncation are excluded. Run the focused campaign with
`node modules/spatial-creation/validation/coverage-round4/run.mjs UNIQUE_TAG`;
raw GPU state, F64 optical comparisons, command logs and one-second media are
saved under validation/coverage-round4/evidence.
Optional `smoothing` reuses the original Native PA GPU Gaussian (sigma0..64px);
the example uses5px before height derivatives to remove coarse-grid lines.


Contact scenes use `collidingCloth`, `collidingRope` or `collidingParticles` inside
`defineNativeStage`. `examples/contact-physics.tsx` is editable and one second.
Use the existing CLI `--allow-wasm` only after reviewing the local package.
The lower-level `createContactPhysics(loader, {model,fps,...})` returns
`sample(context)`, `reset()`, `diagnostics()` and idempotent `dispose()`. The
loader is an existing verified R1 resource, not a filesystem/permission bypass.

The original Core FixedStepRunner owns F64 state and checkpoint/replay. The
reviewed PBD constraints run through the existing C1 WASM bytes binding; new
contact geometry adapts fixed Parry/PBD sources. Sphere, plane and explicit
Graphics mesh colliders may move via local Core Signals. Particle, vertex-face
and edge-edge self contact use conservative separating-plane advancement,
normal complementarity, Coulomb friction and restitution. Kinematic colliders
have infinite mass; finite rigid coupling is not claimed by this entry.
Units are meters, seconds and kilograms. Normals are explicit unit vectors.

`sample` owns returned data, rejects concurrent calls, and accepts repeated or
random aligned frames. A failed seek needs explicit `reset`/recreation.
Cancellation is checked at call and fixed-step boundaries; synchronous WASM
work is bounded by configurable `maxWork`, `ccdIterations` and packet budgets.
Unresolved CCD or exceeded strict contact tolerance fails with a structured
error; the implementation does not silently reduce quality. Contacts expose
feature weights, TOI, normal/tangent impulse and residual penetration; ghosts
for kinematic meshes appear after `dynamicVertexCount` in snapshots.

Native rendering uses the existing mesh/trail renderer; particle spheres and
colliders share the same 3D depth resolve. F64 physics is explicitly rounded
to F32 display positions; linear709 premultiplied RGBA16F/32F remains resident.
No GPU handle is checkpointed. Disposal releases WASM buffers and owned mesh
resources; GPU command lifetime remains the original owner's responsibility.
Run `node modules/spatial-creation/validation/coverage-round5/run.mjs TAG`;
set RUSTC, FRAMEWEAVE_RUST_SYSROOT and FRAMEWEAVE_RUST_LINKER for the pinned
1.99.1 wasm32 toolchain when it is not installed as the default target.


`coupledPhysicsScene({world:{bodies,soft,cuts,breaks,...}})` reuses the pinned
Rapier F64 rigid/soft solver. `softRope`, `softCloth` and `softSolid` accept
ordinary positions/Graphics mesh data (solids need explicit tetrahedra), local
Signals, masses, pins and `softAttachment` links to declared rigid bodies.
`softMaterial`, `plasticMaterial` and `tearingMaterial` expose frequency,
damping, physical constitutive models, yield/creep/permanent-set bounds and
strain/force tear thresholds. `cutSoftBody(id,frame,triangle)` is an explicit
world-space blade at a positive aligned local frame. These operations change
real physical topology; they do not just hide rendered edges.

`fractureBodies` turns convex extruded R3 fragments into actual convex-hull
Rapier bodies with adjacency bonds. `breakableJoint` thresholds use solved
linear force in Newtons and torque in Newton meters separately. The display
uses Rapier's actual generated hull, rather than guessing a convex hull.

`createCoupledPhysics(loader,world)` exposes `sample`, `reset`, `geometries`,
`diagnostics` and idempotent `dispose`. Its only planner is Core FixedStepRunner;
its C1 instance contains the existing reviewed rigid adapter plus a narrow
soft-body adapter. Binary snapshots retain the complete world, plastic rest
state, tearing lineage and broken joints. Small control packets and on-demand
geometry/state data follow the existing C1 data contract; GPU image pixels
stay outside WASM/JS. Reported events belong to the requested frame's substeps.

Soft `force` is total Newtons distributed over free particle mass across the
current pieces, so splitting does not silently multiply the authored force.
Pinned targets move at fixed substep end; forces evaluate at substep start.
Simulations reject concurrent operations; close waits for pending work; failed
seeks require explicit reset/recreation. Abort is observed at call/substep
boundaries. Whole-world snapshots carry no GPU handles. The Native mesh
renderer is rebuilt for actual topology changes and otherwise reused; all
objects share its depth resolve and existing color/Alpha contract.

Edit `examples/coupled-cloth.tsx` and render with the reviewed local R1 candidate
and existing `--allow-wasm`. Reproduce focused checks with
`node modules/spatial-creation/validation/coverage-round6/run.mjs TAG`.
`build-coupled-kernel.mjs` verifies the exact locked Rapier dependency source
inventory offline. The Windows-only MinGW helper copies owned linker inputs
to short temporary paths; it makes no directory links or global changes.
A modern Windows SDK Winsock import library is used only for host build tools
when required by the installed MinGW; it is not shipped in the WASM module.
### Imported characters (candidate0.23)

`characterActor({asset:characterDocument(model), controls, textures, camera})`
creates one ordinary Native CreationStage. See `examples/imported-character.tsx`.
The caller describes a character and controls; static GPU geometry, full skin
influences, morphs, texture atlas and temporary frame buffers are managed inside
the existing Native scope. Output is owned scene-linear Rec709 PM F16/F32.

Prepare explicitly selected local data with
`node --import tsx modules/spatial-creation/scripts/import-character.ts model.glb --output .frameweave/my-character`.
For .gltf, `--resources map.json` maps exact buffer/image URIs to explicitly
selected local files. No network, decoder download, code execution or WASM grant
is performed. Import `model.character.json`, declare the generated images with
existing `Resource` declarations, then bind image IDs through `textures`.
This preparation helper is separate from the public CLI/bin.

The import path uses actual Three0.186.1 GLTFLoader/BVHLoader. The retained
AnimationMixer resets to bind TRS and evaluates each supplied absolute Core
FrameContext. Reordered/repeated requests do not advance hidden animation time.
`characterClip`, `characterBone`, `characterMorph`, `twoBoneIK`, `footPlant` and
`footContact` accept existing scalar Signals. The high-level actor plays the
first clip if controls are omitted; the low-level animator defaults to bind pose.
Foot planting uses an explicit world anchor, ground plane and optional local-up;
it does not capture an undocumented previous-frame position.

`createCharacterRetargeter(target,source,{map,root,scale})` uses actual
SkeletonUtils transfer. Map target IDs/names to source IDs/names explicitly;
anatomy is never guessed. Retargeting preserves target local offsets by default.
`createCharacterAnimator`/`createCharacterRenderer` are retained lower-level
objects: await each call and dispose them before their borrowed Native scope.
`deform` returns an owned packed F32 buffer `[worldXYZ,worldNormalXYZ]` per vertex;
the caller releases it. GPU data crosses no new Stage port or public ABI.

All JOINTS_n/WEIGHTS_n rows are preserved, normalized only by the explicit import
policy, then evaluated by a GPU CSR skin recipe after morph displacement.
Graphics-v1 export deliberately rejects >4 influences instead of truncating.
Normals use the inverse transpose of the blended affine skin matrix; degenerate
normal matrices fall back to the geometric face normal. The render recipe reuses
the existing dominant-axis triangle hit and single-scatter GGX mathematics, with
UV/vertex-color interpolation and complete stable source-over layers. F32 edge
predicate uncertainty uses deterministic half-open shared-edge ownership. No
claim of pixel identity with Three MeshStandardMaterial or legacy creators is
made for this newly selected path. Input textures are admitted linear float
images; PM input is unpremultiplied once for alpha-mode interpretation. The atlas
uses GPU copies without CPU pixel reads, no rescaling and no SDR intermediate.

First profile supports triangle geometry, skins, morph position/normal, TRS,
LINEAR/STEP/CUBICSPLINE clips, base-color texture/vertex color, unlit or GGX,
opaque/mask/blend, wrap and nearest/bilinear sampling. Compressed geometry,
nontriangle/instanced topology and additional material maps require explicit
adapters and fail diagnostically; this is not a universal glTF viewer. Ray work
and byte plans are configurable and checked before allocation. Transparency
uses a complete ray-layer scan with potentially quadratic work; no layers,
triangles or resolution are silently dropped. Physical peak GPU memory and
other OS/GPU backend behavior remain unverified.

Reproduce this round with
`node modules/spatial-creation/validation/coverage-round7/run.mjs UNIQUE_TAG`.
The runner records all attempts in one <420-second campaign. Public frame/render
commands and one-second MP4 decoding are recorded in its raw evidence logs.
