# Extended AOV and surface Deep creation (candidate)

```ts
import {aovScene,aovPlane} from 'spatial-aov-candidate';
const shot=defineNativeStage(init=>aovScene(init,{
  objects:[aovPlane({name:'Glass',size:[1.5,1.8],rotation:[0,20,15],
    material:{color:[.05,1.5,2.5],opacity:.6}})],
  camera:{projection:'orthographic',position:[1,.5,5],target:[0,0,0],viewHeight:2.7}
}));
```

No creator buffers, recipes, matrices or temporary leases. Existing Stage/Layer/time,
Signal/keyframes, creation post/finish and Native GPU owner are unchanged. Helpers run in
an initialized managed Native Stage. Editable shot: examples/aov.tsx. Common geometry uses
real fixed Three Plane/Box/Sphere constructors; arbitrary existing MeshData stays available.

`createAovCapture(init,{objects,maxBytes?,maxRayTests?})` captures explicit current and
previous AovSample (full FrameContext, SpatialCamera and every declared mesh pose).
No upstream Stage or historical result is inferred. Same frame may be sampled repeatedly.
Topology/IDs are initialized once; per-sample poses may supply positions preserving vertex
IDs/topology. Same local geometry rebasing, Three camera preparation and the exact existing
Three/MIT dominant-axis intersection/half-open edge predicates are reused.

Nearest geometric data: world position P, object/reference position Pref, positive axial
view depth Z (meters), ray distance, geometric camera-facing world normal N, interpolated
supplied world shading normal Ns (geometric fallback for absent/zero interpolants), top-left mesh UV, barycentrics,
current-minus-explicit-previous top-left pixel motion and independent validity, unlit
linear Rec709 albedo/emission/opacity. Prior motion visibility is not tested; prior W and
near/far are tested, off-screen displacement retained. The optional new producer uses the
existing character renderer half-open/compensated edge rule: unlike the older AOV producer,
it covers shared-edge pixels that the old F32 predicate can miss. Existing API/source is
unchanged; measured edge differences are retained, no pixel-equivalence claim. Materials are explicit unlit
albedo+emission, not reconstructed AOVs from an unrelated Three/PBR beauty renderer.
Opacity zero remains geometry in nearest fields; Cryptomatte/Deep reflect its zero
contribution. Supplied normals belong to the supplied pose; no automatic re-skin is implied.

Exact UInt32 object/material/primitive IDs are separate data, never numeric-float IDs or
color surfaces. Explicit IDs support the entire nonzero UInt32 range; 0 means background.
Auto IDs follow declaration order. Use explicit IDs when reordering assets; Crypto name
identities are order-independent. Unique mesh IDs and collision checks fail before capture.
`aovChannel(init,frame,name)` creates an owned data+validity pair with dispose(); depth,
normal, motion and position use the existing SpatialField descriptor/meaning. Other AOVs
have explicit C2 metadata and are not interchangeable spatial quantities. `aovPreview`
is diagnostic color, never data transport. Frames, extracted fields and Crypto/Deep
results own their buffers; dispose is idempotent and rejects active use. A frame also
owns its optional deep child. Borrowed inputs are not released by operations.

Cryptomatte uses the **unmodified MIT murmurhash3js-revisited3.0.0** x86.hash32 with UTF8
TextEncoder bytes, seed0, and the specified exponent correction/reinterpretation. Source,
archive integrity, fixed commit and licenses are in vendor/murmurhash. Official Psyop
BSD3 known vectors and independent public-domain Python Murmur oracle are retained in
validation/coverage-round12. `cryptoManifest/cryptoMetadata` produce canonical names,
adjusted 8hex IDs, 7hex metadata key, MurmurHash3_32/uint32_to_float32 metadata and embedded
JSON manifest. Hash collisions reject, not alias silently.

`captureCryptomatte(init,frame,{kind:'object'|'material',samplesPerAxis:2})` traces the
actual subpixel grid, complete surface order and alpha transmittance. It accumulates each
name's visible opacity contribution, aggregates repeat occurrences, and ranks descending
coverage with deterministic UInt hash ties. Two ID/coverage pairs per four-float plane;
all scene labels have rank capacity, no arbitrary six-rank truncation. These are data
planes: do not filter IDs, premultiply them, apply OCIO, tone-map, save HALF or use lossy
compression. `cryptomatteMatte` selects explicit manifest names and produces GPU F16/F32
PM grayscale coverage. Geometric nearest AOVs themselves are one center ray, not MSAA.

`capture(...,{deep:true})` preserves every actual surface hit, sorted by depth/primitive,
with Z=ZBack, PM working-linear RGBA, UInt Crypto/raw IDs, primitive and holdout. Capacity
is the full triangle count, never a per-pixel layer truncation. Optional storage can be
large. `mergeSurfaceDeep` stably interleaves two same-camera/frame/window streams on GPU;
`cropSurfaceDeep` removes explicit depth ranges; `holdoutSurfaceDeep` removes selected
beauty/alpha while retaining occlusion. `flattenSurfaceDeep` composites all layers on GPU
into signed/HDR F16/F32 linear709 PM. A holdout channel is this module's explicit profile,
not a claim that every external compositor or Core's point flattener applies it.

`importSurfaceDeep` reuses the formal declared Deep Resource and official layout helper;
Core validates source seal/hash/exact channels/windows/budgets/embedded color and alpha,
decodes/indexes once and imports read-only. No filename access, private command, second
message bus or permission is added. Original Float/Half numeric data and UInt/Float ID
bits are preserved; straight input is premultiplied on GPU. Nonlinear/other color spaces
require explicit conversion first. Raw/deep windows are retained; merging requires exact
alignment, no guessed reprojection. **Finite volume intervals remain rejected by the
existing surface contract.** No private-admission bypass or volume-splitting claim.

Explicit file export uses controlled `publishBuffer`/Renderer.exportNativeBuffer. Pure
`surfaceDeepDocument` compacts the readback into the existing DeepDocument; `aovDeepSource`
constructs a declaration from an actually decoded document. Node-only aov-io.ts provides
`writeAovDeep` via the existing reviewed Deep writer, and `writeAovExr` via fixed explicit
OpenEXR3.4.4 Python. These are trusted local Node filesystem operations, not Stage APIs or
new CLI commands; final public SDK/catalog routing belongs to Main. `aovFileChannels`
produces FLOAT spatial/color planes, UINT IDs and exact FLOAT Cryptomatte ranks/metadata.
Files use lossless ZIP/ZIPS, no global color transform or HALF conversion. No default
Python install/download, WASM trust or browser is triggered by module use.

Default own-buffer budget512MiB, maxRayTests2e9 are configurable. Capture nearest cost is
O(pixels*triangles); complete Deep/AA paths may cost O(pixels*samples*triangles^2). Full
requested quality is budgeted, never reduced. C2 u32 addressing, actual device limits and
optional legacy Graphics-v1 MeshData limits still apply. Physical GPU/process peak unknown.
No acceleration/production performance claim; final media need not be realtime.

On failed call, owned candidates are released; ordinary JS/external effects are not
transactional. Frames are absolute data, not shared mutable simulation state. Session
cancellation, queue completion and device-loss diagnosis/reopen belong to existing Core.
Logical dispose is not a GPU-idle fence. Do not use a disposed/foreign/prior-session handle.

Reproduce: node modules/spatial-creation/validation/coverage-round12/run.mjs UNIQUE_TAG.
One cumulative<420s campaign records failures/build/install/media; Native+SpiderMonkey
and Deep helper source/executable receipts must match. Actual runtime/platform, raw RGBA,
IDs, ranks, files, image review and full one-second video decode are recorded in evidence.
This is an optional Stage recipe, not a replacement renderer/host, GPU ABI or new scene IR.
