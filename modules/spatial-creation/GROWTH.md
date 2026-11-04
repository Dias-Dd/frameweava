# L-system and space-colonization creation (candidate)

```ts
import {colonizationScene, lsystemScene} from 'spatial-growth-candidate';
const plant = defineNativeStage(init => colonizationScene(init, {
  cloud:{count:600, center:[0,1.8,0], radius:[1,1.2,.7], seed:17},
  source:{speed:1, influence:.6, kill:.09},
  leaves:{tipOnly:false, probability:.25, size:.1},
}));
```

Editable projects: examples/growth.tsx (real geometry development), examples/lsystem.tsx.
Use ordinary Stage offsets for pre-roll; the one-second shot is not a shortened
simulation clock. Authors choose geometry, growth controls, material, camera and motion;
no GPU buffers, recipes or temporary images are required by these scene factories.

Reuse: real **lindenmayer1.5.4**, MIT, revision64b321b8c4a7d610db59c19256b1dca6e945fbeb.
Original ESM/license and source hashes are retained under vendor/lindenmayer. Exactly one
append-spread expression is adapted to an element loop (avoids JS argument-count ceiling).
Typed wrapper successors use **original Core seededRandom**; no global Math.random patch.
No runtime dependency install, evaluator, DOM, Babel/compiler or alternate simulation host.

`lsystemSpec`, `rewriteLSystem` accept string symbols or typed `growthToken(symbol,...params)`,
ordinary TS successor functions and explicitly weighted alternatives. Parametric callbacks
receive readonly current word, generation/index, deterministic random(salt) and the original
library branch-aware match(pattern,direction). Strings are symbols, never JS expressions.
Successors are bounded before append by caller maxSymbols/maxBytes/maxWork. Callbacks are
trusted local author code and must be pure for replay; external/module effects are ordinary
JS and are not transactionally undone. Managed R1 helpers execute in an initialized Native
Stage; keep module-scope options plain data, call helpers inside the Stage factory.

3D Turtle commands: F(length) draws, f(length) moves pen-up and starts a new root;
+/- rotate around localZ, &/^ localX, backslash/slash localY, | turns180degrees, []
push/pop the complete turtle state, !(radius) sets radius, @ (size) marks a leaf.
Angles are degrees, distances meters; heading starts+Y, normal+Z. Quaternion transport and
optional tropism preserve ordinary 3D geometry; malformed brackets fail. Generations are
explicit grammar applications, not a second work timeline. Births are computed from path
length/speed, and visible growth uses existing FrameContext/Signal time.

Colonization implements the published Runions/Lane/Prusinkiewicz algorithm
https://www.algorithmicbotany.org/papers/colonization.egwnp2007.pdf (equations, no paper text
or external source copied). Actual all-node nearest-attractor assignment, unit-direction
averaging, reached-attractor removal, one child per attracted node, deterministic ties,
optional tropism/jitter and explicit nearest-tip bootstrap. Spatial hash scans every
relevant candidate, no nearest-neighbor truncation. pex-space-colonization1.0.1 and
space-colonization0.2.0 were reviewed, not copied: parent-index/random/rotation issues,
missing carried license notice, dependency/state layout and checkpoint adaptation cost.
New small solver is Apache-2.0. CPU F64 geometry/control is intentional; GPU expands
vertices, shades and rasterizes. No CPU pixel rendering or implicit GPU fallback.

`createColonizationSimulation` reuses **Core FixedStepRunner**, with plain cloneable
node/attractor state, fixed substeps, bounded checkpoints and replay. `sample(context)`
returns an owned value. `snapshot()/restore()` use explicit version/source/clock/state;
restore validates matching physical inputs and recomposes the same Core runner at the
absolute step anchor; seeking before that anchor replays the original initial state.
Budget/checkpoint-policy changes do not masquerade as new physical inputs, but restored
state must fit the new budget. No GPU handles/functions in snapshots. A failed seek does
not publish its candidate; the runner is discarded and next seek reconstructs from reset.
reset/dispose are explicit and idempotent. Local pre-abort and step-boundary polling are
supported; asynchronous interruption of synchronous JS still belongs to the host timeout.

Stateful controls follow the **existing physics local-time/frame Signal contract** via
its actual controlContext/sampleContext helpers. Global/progress expressions for these
history-dependent controls require a formal original Stage mapping and currently fail
explicitly; no guessed global clock. Display-time, object/material and camera Signals use
the actual FrameContext and support the existing full expression vocabulary. Pure L-system
callbacks can use supplied generation/random and ordinary TS, not an implicit clock.

Topology/radii/leaves are ordinary control data. Parallel-transport frames, terminal-demand
pipe radii, explicit radii, stable IDs and pure subtree pruning are reusable. `growthMeshes`
exports **complete** capped tubes/leaves as existing MeshData chunks; `growthSkeleton`
exports existing SkeletonData/weights and validates it against the chosen mesh. Existing
Graphics-v1 limits (16,384vertices/chunk,256bones/rig and value budgets) still apply to
these optional legacy value exports; larger Native geometry is not capped to that size.
No watertight Boolean union at branch junctions, botanical biomechanics or implicit texture
asset/rig import is claimed. Branch state is algorithm data, not a new scene/Stage Graph IR.

GPU: `recordGrowthGeometry` returns OWNED existing C2 position/normal/UV fields plus
dispose(). All geometry expands in native compute; material uses a 2x2per-triangle float
Gouraud atlas with affine fourth texel, then the **existing Native raster-v1** and real
camera projection/depth peeling. Numeric RGB is working-linear Rec709 signed/HDR; output
F16/F32, premultiplied Alpha. Simple two-light/rim material is not a full PBR/IBL renderer.
Object position/rotation/spin/scale and camera/orbit reuse existing creation controls.
`createGrowthRenderer` returns owned provisional images; Core final tickets determine GPU
completion. Logical release/dispose is not a GPU-idle barrier; owner retains queued uses.
Frame geometry is never placed in CPU checkpoints. Empty/pruned scenes produce transparency.

Budgets: symbols1e6, rewrite work1e7, token bytes64MiB; colonization maxNodes10000,
maxSteps100000 per Core replay, maxPairTests1e9 per seek,8checkpoints/64MiB logical state;
GPU geometry/material256MiB,8sides and256atlas tile columns by default. Caller-configurable,
not permanent engine capacity limits; real u32/device/binding/texture limits remain.
CPU object/driver physical peak memory unknown. Dense worst-case nearest searches can
still be O(attractors*nodes); work budgeting never silently skips candidates/steps.
GPU geometry is F32; CPU state is F64. Final display precision is qualified per scene.

Build/validate: `node modules/spatial-creation/validation/coverage-round11/run.mjs 01`.
Fresh private FRAMEWEAVE_HOME, immutable candidate and matched Native/SpiderMonkey only.
Public output commands: frame, storyboard and render (examples copied into candidate).
No GPU state continuation is required by this CPU-control/GPU-render profile; direct Native
MP4 is tested rather than silently changing export strategy. Broader owner continuation
fix is frozen in Agent1 and awaits Main integration; this module never swaps private
protocols/executables. Final catalog/RuntimePin/independent install remains Main work.
