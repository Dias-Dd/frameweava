# Frameweave Forge — native GPU authoring and media

This is an engine adapter on the existing TVG, time evaluator and Renderer.
Rust/wgpu owns one device per Renderer. Isolated JavaScript records commands;
React performs ordinary reconciliation and hooks through SpiderMonkey.
Declarative native Stages need no browser; optional DOM/CSS drawing belongs to
Servo. See [MEDIA.md](MEDIA.md) for current video input, GPU state checkpoints,
and accurate HEVC/AV1/HDR final-output contracts.

## Build and run

Use the installed Rust/Cargo toolchain and reviewed Cargo.lock cache:

```powershell
node modules/native-gpu/build.mjs --release
npm run frameweave -- modules/native-gpu/examples/ball.tsx
npm run frameweave -- frame modules/native-gpu/examples/ball.tsx --frame 90 --output ball.png
npm run frameweave -- render modules/native-gpu/examples/ball.tsx --output ball.mp4
npm run frameweave -- frame modules/native-gpu/examples/ball.tsx --frame 90 --output ball.exr
npm run frameweave -- storyboard modules/native-gpu/examples/ball.tsx --frames 0,60,119 --output board.png
```

The build is offline/locked and never installs compilers or dependencies. An
absent Cargo cache requires explicit standard Cargo provisioning. Build receipts
include source hashes, compiler, flags and executable SHA. CLI verifies the
binary once at load. Distribution includes the current platform's release
binary plus receipt; other platforms need their own build. Only Windows x64,
Vulkan, RTX 5070 Laptop was exercised here. NVENC is explicit; unsupported hardware
fails with encoder diagnostics. `--encoder libx264` explicitly selects software
encoding. Source SDK/Worker provenance gates are never disabled for packaging.

Direct TSX opens the native window with source watching. Web/HTTP preview was
removed. `--no-open --frames 12 --no-watch` is a finite headless smoke test.
Native visual factories and immutable R1 versions need native adapters/new
versions. Alternatively, a declared `engine="web"` Stage may use the existing
Web implementations through the explicit PNG compatibility boundary below.
There is no automatic fallback to Web when native compilation/rendering fails.
`create`, professional `media`, `inspect` and Session services remain separate
existing APIs during migration; they are not all native-enabled by this change.

## Native preview controls and reuse

The bottom toolbar toggles playback, steps one frame, or jumps one second
or one minute in either direction. Click or drag the timeline above it.
Space toggles playback, Left and Right step one frame, and Home and End
jump to the endpoints.
The title shows the current frame, status and actual presentation rate.
The window survives a successful source reload and displays the replacement
at the current timeline position. Windows audio can drive the preview clock.
Fixed-step Stages replay required simulation steps when seeking. Stages
can supply `checkpoint: {version: 1, capture, restore}` to capture all
authored mutable state as plain wire values or byte arrays. The GPU owner
captures persistent buffers and step cursors on the same queue. Hooks cannot
record GPU work. Preview restores the nearest eligible checkpoint before the
target and replays the remaining steps. Use `--checkpoint-interval 30` and
`--checkpoint-mib 128` to tune retention, or `--checkpoint-mib 0` to disable
it. Opaque state and unsupported stages use ordered replay.

For an intermediate replay step, the native owner keeps simulation compute,
state resets and their image dependencies. The owner can skip complete image
writes that only contribute to presentation. The target frame still executes
the full graph. Externally observable or unqualified plans execute in full.
Set `FRAMEWEAVE_PREVIEW_FULL_REPLAY=1` when comparing against full replay.

Use `--adaptive` or `--quality-scale 0.5` for approximate preview.
Compatible Stages see both logical and render dimensions. Pausing and
releasing the scrub bar request the full quality for the selected frame.

The window can use a GPU-resident display cache when all Stages are
stateless, declarative native pixel Stages with `props.nativeCache` set to
`'deterministic-v1'` and the project has no external resources. A matching seek
can present the saved display frame without recording or running the Graph.
Cache entries include the active Stage and Layer interval, time, dimensions
and quality. A bounded LRU is charged against the native session byte budget.
A reload of another eligible declarative build can retain unchanged intervals
on the same device. Changed intervals are dropped and recomputed. Keyframe
edits invalidate the affected interpolation intervals. Ordinary authored
JavaScript uses regular recording. The same declaration allows upstream
Stage results to be reused with unchanged dependencies. An opted-in authored
Stage still executes JavaScript on each request. The owner can reuse its
single output image when the recorded range writes full images and any
compute uses only immutable inputs or scratch private to that Stage.
The cache key covers shader and parameter changes, immutable data, input images and the
actual recorded subframe dependency graph. Live state and external imports
remain on the full execution path.

## Authoring

```tsx
import {Composition, Stage, Layer, ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {linear709} from '@frameweave/engine/web';
export const picture = defineNativeStage(async init => {
  const kernel = await init.gpu.compile({
    abiVersion: 1, id: 'studio/example', version: '1.0.0',
    inputCount: 0, parameterWords: 1,
    code: 'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),-.2,2.,1.);}',
  });
  return {renderAt(context) {
    let value = 0;
    for (let i = 0; i < 4; i++) value += context.time * .1;
    if (value > 1) value = 1;
    return init.gpu.run(kernel, [], {
      parameters: new Float32Array([value]),
      output: {width: init.width, height: init.height,
        format: 'rgba32float', alpha: 'opaque', color: linear709},
    });
  }};
});
export default <Composition width={640} height={360} fps={60}
  durationInFrames={120} background="transparent">
  <Stage id="picture" factory={picture}/><Layer source={ref('picture')}/>
</Composition>;
```

The editable ball example uses real React hooks and ordinary state, loops and
conditions. `defineNativeReactStage` and `NativePass` come from
`@frameweave/engine/native/react`; the Stage file uses React's JSX pragma. HTML
and CSS visuals are rejected rather than captured. No special explosion or sound
function names exist. Event functions are authored code; audible media must use
AU-1's explicit audio timeline, not wall-clock sound playback during replay.

`nativeSimulation(state, update, {fps})` reuses FixedStepRunner. It snapshots
explicit structured-cloneable state and restores the top-level object in place.
Nested references held outside that state, arbitrary external side effects and
untracked closure variables are not automatically rewound. Use the existing
explicit seed/time model for repeatable randomness. JS logic executes serially
in requested frame order; GPU frame buffers may overlap afterward. There is no
speculative renderAt(0). Conditions can change GPU topology; rebuild occurs on
the same device after outstanding work completes. Changing topology is currently
expensive (pipelines/allocations are rebuilt); stable topology is fastest.

## One shared scope for effect authors

`init.gpu` implements existing PixelPass ABI 1/2 and Compute ABI 1, typed
f32/u32/i32 buffers/fields, clear/copy/clone/write, and native `drawMesh`.
The existing cellularVolume/renderVolume and twistPositions algorithms are
exercised without another Host. Pixel sampling keeps integer coordinates as
pixel centers; normalized UV uses sampleUv, not sample(uv * size).

Initialization may compile kernels and create immutable input buffers. Their
seeds are sent once, stored once on the GPU and shared read-only between frame
slots. Clone them into frame buffers before mutation. GPU dispatch/draw belongs
inside renderAt. Mutable frame resources expire at the next call. Use
`createStateBuffer` or `createStateField` with `stateStep` for ordered, persistent
feedback. Preview can checkpoint those buffers as described above. Mesh is
triangles from explicit XYZ positions/u32 indices, matrix and constant HDR color;
it is not a complete material/scene renderer. CPU image upload/import of decoded
resources is not implemented. CPU readBuffer/readback/present inside effects fail
explicitly; final output is a separate engine-owned operation.

`complete()` on the recording adapter only validates recording/abort state; it
is not a GPU fence. Real completion is the Renderer's frame ticket. Capabilities
state `execution: recording`. Actual hardware evidence comes from the already
admitted native device, not navigator.gpu. Standalone recorders report
hardwareVerified=false. R1 initializers receive revocable borrowed scopes;
module dispose releases its own resources and never destroys the Stage owner.

Native R1 bindings use schemaVersion 2, engine native-gpu, named initializer,
gpuApi native-wgpu and native-gpu capability. Manifest/apiVersion remain 1;
legacy schemaVersion 1/Web is unchanged and is not implicitly native-compatible.
Package trust, verified bytes, versions/locks, resource declarations and WASM
permission remain mandatory. platforms web still means browser JavaScript host,
not Node filesystem/network/process privilege. Initializers use NativePluginInit.
Capsule/flat native named bindings are tested in fresh library homes.

## Resident composition, scheduling and export

Pixel images, typed fields, mesh drawing, Stage dependency images and Layer
composition use the SAME device. Private protocol 2 remaps only declared PortRefs
into resident indices; literal JSON cannot forge image capabilities. No GPU
objects or native pointers are public TVG PortValues. The public TVG schema,
existing Web Pixel/Compute contracts and animation time semantics are unchanged.

Source-over, Add, Multiply, Screen, basic transforms, masks and isolated groups
reuse the compensated professional shader and have CPU numerical references.
F16 publication uses round-to-nearest, ties-to-even, including subnormals.
Compatible PixelPass intermediates in approximation-enabled preview can use
8-byte packed binary16 storage while retaining F32 arithmetic and the same
logical F16 quantization. Source imports, typed F32 views, incompatible readers,
and display and delivery boundaries use wide storage. Existing logical F32
images retain F32 storage and arithmetic.
Invalid shader values can propagate; production does not scan/certify pixels.
All composed images currently require the same scene-linear working encoding.

Lifetime allocation reuses dead image buffers; frame slots remain disjoint.
Dynamic scheduling is default: throughput starts at 8 slots, probes measured
throughput and backs off on regression. Interactive queues are bounded to 1..3.
The admitted capacity uses a 1 GiB default logical budget (explicit budgets
accept positive safe integer byte counts), device limits and 128 slots. A 92-slot simple graph is tested with 92
real submissions/completions. This does NOT mean 92 shaders simultaneously run,
nor promise 92 full-resolution complex frames fit memory. Memory overhead,
physical GPU peak and compositor/presentation driver allocations are not fully
observable. Submitted capacity and completed throughput are separate metrics.

The native preview path has no image readback, PNG, HTTP pixels, reupload,
Canvas2D, per-frame file/transfer SHA, numerical validation dispatch/readback or
explicit blocking GPU wait. Bounded metadata/parameter IPC, API validation,
Stage isolation, timeout/cancellation and completion callbacks remain.

PNG/MP4 use GPU display conversion and GPU RGBA/NV12 packing, followed by an
EXPLICIT asynchronous final-output readback to FFmpeg stdin. NVENC then uploads
that packed input. This is hardware encoding, NOT zero-copy encoding. Mapped
views are written directly, with bounded queues and ordered frame handoff. EXR
uses raw linear planar Float32, preserving HDR/negative values and Alpha.
The diagnostics sidecar's stats.sourceOutput records its scene encoding and
Alpha interpretation; this FFmpeg EXR adapter does not embed an OCIO profile.
The linear SDR transform respects primaries and referenceWhiteNits. Fixed ACES2
SDR100 is preview-qualified; exact final ACES2 is rejected rather than claiming
OCIO-equivalent delivery. HDR10/HLG/ProRes/DNxHR native export is not implemented;
the existing accurate professional service remains available. Placed audio is
rendered through AU-1 and muxed without silently dropping it; cross-native/audio
control dependencies currently fail explicitly. Native live audio playback,
shared-state transactions/SO-1 calls and multiple/CPU-only native output ports
still need their common execution adapters; shared-state is explicitly rejected.

## Explicit Web compatibility boundary

See examples/web-compatibility.tsx: native RGBA16F -> Canvas -> real Three.js ->
native RGBA32F, with an independent HDR branch in the same existing Stage DAG.
Only explicitly selected Web Stages are admitted. Authored implicit Web selection
fails E_WEB_EXPLICIT_ENGINE. Raw TVG already has an explicit required engine field.
Native factories cannot be assigned engine web; R1 binding engine checks remain.
Native main-Stage Canvas/OffscreenCanvas/getContext and browser GPU device creation
are blocked before authored modules evaluate; native React control hooks remain.
Web Stages receive their own Web lifecycle and no native GPU scope.

The boundary image policy is sRGB RGBA8 PNG, straight Alpha, colorimetric
conversion with explicit clipping warnings. This is an SDR copy: it does not
apply an approximate ACES2 view or replace/quantize the original native source.
Web -> Web reuses the PNG; native -> native remains device-resident. Ordinary
JSON/number/string/boolean ports retain their types, not an image encoding.
Web image outputs must be PNG; they are decoded and explicitly expanded into
scene-linear RGBA32F on the same native device. Expanding cannot recover HDR or
precision lost in the declared Web portion. Native composition remains float.

Mixed graphs execute in dependency order with one frame in flight. At an image
boundary the native prefix executes once; its published image ports are retained
as exact private F32 working bytes (including canonical F16 publications), then
restored for downstream native work. The prefix's JS and GPU passes are not
replayed. Only Web-facing copies become PNG. Unrelated native ports keep their
professional values, though a mixed graph may pay additional raw readback/upload.
It makes no fast-preview or multiframe-throughput claim for mixed projects. The window and encoder remain
owned by the same native process/device; intermediate prefixes do not present or
encode extra frames. Web uses the existing opaque iframe, CSP, resource whitelist,
WASM authorization, timeout and dispose. It cannot create native package bindings.
The removed HTTP preview/player is not restored.

Boundary transport extension version 1 uses a private directory lease and
bounded, exact-sized little-endian F32 files between Node and Rust; only PNG
Surfaces enter Web. File names cannot escape the admitted directory. Reads require
a completed publication of the requested frame/slot, imports are single-assignment
and exact-sized, leases close on failure/dispose. This is a compatibility readback
and upload path, measured separately in stats.webBridge/compatibility. It is
neither a public resource path nor a package/filesystem permission grant.
Import provenance distinguishes native-publication from web-png; Web PNG
imports are always expanded to logical F32, never labelled HDR/F16 recovery.
No native texture/pointer crosses an iframe. P4, TVG and public Surface schemas
are unchanged.

With no Web Stage, no lease/files/PNG conversion, upload, boundary readback,
serialization barrier or single-frame policy is enabled. F16/F32, negative RGB,
HDR, Alpha, native multiframe admission and the original shader/transfer path
remain; production and numerical regressions assert the zero-boundary counters.
The same frozen native-only performance workload is measured separately.
Mixed-boundary blocking waits are counted in both blockingGpuWaits and the
webBridge breakdown; they are not hidden behind a native-only zero counter.

FFmpeg output diagnostics record the actual version. Native float/Alpha EXR is
qualified with bundled FFmpeg 6.1.1; external versions are explicitly rejected
until qualified. In particular 9.0.2 changed straight-Alpha EXR samples in Main's
roundtrip. NVENC errors preserve FFmpeg's actual driver/API/dimension diagnostics.

## Validation and measurements

```powershell
node modules/native-gpu/build.mjs --diagnostics
npm run typecheck
node --import tsx --test --test-concurrency=1 tests/native-gpu-*.test.ts
node --import tsx modules/native-gpu/benchmark.ts modules/native-gpu/examples/advanced.tsx artifacts/native-gpu-v2/performance.json 1920 40
```

Diagnostics builds alone expose explicit test image readback. Never use them as
production timing binaries. The benchmark uses the unchanged 12-algorithm workload
/1 (32 raymarch steps), measures Node request -> JS -> GPU completed and separates
compile, initialization, first frame, distinct new frames and resubmitted frames.
It does not measure physical scanout or video export. Raw samples include outliers;
GPU query time is not substituted for user waiting time. Do not compare the
historical direct-tape GPU timing with this authored JS end-to-end timing as an
optimization A/B. Old HTTP-preview tests exercise a deliberately removed API;
all-repository migration/regression and six export combinations remain Main's
integration responsibility. No SDK pin or Worker provenance was silently refreshed.

The type-only native factory addition touches a source sealed into older physics
Workers. The coordinated deformable-effects 0.6.1 rebuild regenerated provenance
through its existing script; WASM and Worker bytes are unchanged from 0.6.0.
No historical locks were edited. In this worktree, rigid-body-effects' analogous
offline rebuild is blocked by its absent private postcard/Cargo cache; its seal
and version remain unchanged. Full catalog distribution/independent installation
therefore remains blocked, not silently bypassed. Main owns the final SDK pin
and immutable catalog integration. This checkpoint is not a completed migration
of the whole effect library or all existing authoring/inspection services.
# Image data view v1

`await gpu.imageToBuffer(image, {version:1, signal})` borrows the same owner's
F32 working RGBA storage as a read-only typed field. It performs no CPU readback,
upload, colour conversion or alpha conversion. Source logical format, colour and
alpha are retained in field metadata. An image exposed as an F32 field view uses wide storage.
The engine extends the image allocation's lifetime through every data consumer.
Release the view with `releaseBuffer`; use `cloneBuffer` for a writable frame copy.
Foreign/stale views and writable bindings are rejected. This optional scope
method does not change P4, TVG or older Web scopes. Existing automatic statistics
use it when available and keep their explicit legacy Web adapter otherwise.

Temporal upstream sampling: see [TEMPORAL_SOURCES.md](TEMPORAL_SOURCES.md) for declared Resource/PortRef sources, explicit clock rules, isolated JS seek hooks and unsupported historical profiles.
