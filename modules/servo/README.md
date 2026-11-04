# Servo native image module (development candidate)

`createServo` records an ordinary optional pass on the existing Native GPU
owner. It does not create a Web Stage, a second Renderer, or a JavaScript logic
host. Native pixel/compute/mesh passes can precede and follow it in one Stage.
The implementation is currently Windows x64 + Vulkan + D3D11/ANGLE + Servo 0.7.

```ts
const ui = await createServo(init.gpu, {
  profile: 'sdr-srgb8', execution: 'trusted-local',
  width: init.width, height: init.height, seed: init.seed, input: false,
  html: '<div id="label" style="color:white">Title</div>',
  javascript: `window.frameweaveRender = (context, params) => {
    document.getElementById('label').textContent = params.title;
  };`,
});
// Inside renderAt(context), with values evaluated by the existing TSX system:
const image = await ui.render(undefined, {context, parameters: {title: 'Hello'}});
// Return image, or feed it to the existing GPU effects. On Stage disposal:
await ui.dispose();
```

See `examples/chain.tsx` (two Servo modules separated by the existing floating
Gaussian blur) and `examples/hdr-overlay.tsx` (SDR UI over an HDR background).
The public Stage entry is `@frameweave/engine/servo` (`servoStage`, `createServo`).
Node asset preparation uses `@frameweave/engine/servo/node` (`prepareServo`,
`writeServoDocument`). On Windows x64, Frameweave automatically finds the
optional reviewed runtime in `native-bin/win32-x64/servo` under its own install
directory. `FRAMEWEAVE_SERVO_RUNTIME` overrides this path for development.
Source checkout Node scripts can select
`--conditions=frameweave-source`; installed SDKs use the compiled public exports.
Main's focused integration covers official imports, prepared resources with the
original files unavailable, Flat/Capsule/source-tree exports and a three-slot
MP4. Full package/platform acceptance is recorded separately; SDK availability
does not grant unreviewed native runtime execution or change the SDR profile.

## Precision and resource contract

- Output is the ordinary owner-local `GpuPixelImage`: RGBA32F, premultiplied,
  scene-linear Rec.709/D65, reference white 100 nits. It is not a serializable
  CPU Surface or an author-visible texture/OS handle.
- **Servo's WebRender cache is BGRA8. This is an explicit SDR profile, not
  lossless HDR rendering.** Input is encoded/clipped to sRGB8 on GPU, and output
  is decoded to linear premultiplied F32 on GPU. The original input is retained
  according to the existing graph's resource lifetime; it is not modified.
- `input:true` requires one matching-size linear Rec.709 image. Use
  `{{frameweave.input}}` as an `<img>` source. Convert/resample other images
  upstream explicitly. `input:false` generates transparent content without
  converting the professional background; composite it with ordinary Layers.
- Each invocation has one optional input conversion and one output conversion.
  It has no CPU pixel readback, PNG/HTTP transport or numerical validation pass.
  ANGLE/WebRender may have internal GPU copies; this is not a claim of zero
  physical copies. Final encoding and explicit tests still materialize pixels.
- Vulkan and ANGLE use distinct API devices on the **same verified adapter**.
  Win32 NT textures, queue-family acquire/release and shared GPU timeline fences
  order access. A completion ticket includes those waits; submission alone is
  not completion. The current adapter also has a D3D11 allocation device;
  counters report this separately from the single Frameweave wgpu owner.

Three separate versions apply: native module command extension v1 (within
private GPU protocol 2), Servo DLL C ABI1, and module version `0.1.0`. No P4
Manifest, TVG, Surface v2, keyframe or audio-port semantics are changed.

## Lifecycle and time

Create once during Stage initialization. HTML, JS, dimensions/profile and seed
are immutable instance configuration. Animate `render` parameters with the
existing TSX parameter/keyframe system. Control JSON uses dynamically sized
packets within the existing owner budgets and wire addressability. Fractional
local frames are supported. See AUTHORING.md for configurable operator budgets.
The existing C1 clock script supplies Date/random/timer rules. A synchronous
`window.frameweaveRender(context, parameters)` updates the DOM per invocation;
returning a Promise is explicitly unsupported. DOM, layout/font caches and GPU
resources persist. Readiness reuses Servo's image/font/display-list machinery
without requesting a screenshot or invoking `read_to_image`.

This candidate's random-access qualification covers the committed fixtures,
not arbitrary history-dependent JavaScript. Such code needs reset/replay or
checkpoint integration before it may claim stateless seeking. CSS transitions,
animation-event-driven state, SMIL and arbitrary third-party DOM frameworks
are not yet qualified. Canvas/WebGL feature and GPU-input compatibility must
be checked separately; the verified input route is `<img>`. Canvas2D-generated
content is tested separately; this does not qualify GPU input drawn into Canvas
or arbitrary WebGL programs.

CSS keyframes use Servo/Stylo's existing interpolation with an explicit offline
timeline. Finished animation state is retained only in this module's offline
mode, so forward, completed, backward and alternating-iteration seeks remain
repeatable. `verify-features.ts` checks those sequences numerically against
independent expected opacity values (within one BGRA8 code value).

Persistent Servo instance count (modules × frame slots) is governed by the
existing owner budgets, actual device limits and optional operator policy,
without the historical 16-instance ceiling in the updated DLL.
The existing memory/capacity calculation includes shared BGRA8 images. It does
not measure all Servo/driver internal memory. Logical release invalidates the
author token; actual resources retire after GPU use and owner/session closure.
Repeated helper disposal is safe. A failed module execution closes that owner
for further submissions; timeout cleanup retains the existing process deadline.

## Safety and optional loading

`execution:'trusted-local'` declares the supported content profile. It does not
grant R1 trust, authorize arbitrary native code, or qualify untrusted browsing.
The fixed implementation is selected by the engine; authors cannot specify
DLLs, native pointers, device objects or shared handles. An operator provisions
a reviewed local bundle. The owner verifies the runtime receipt and file hashes
before loading it. Untrusted HTML/JS OS isolation and public
binary redistribution are not qualified by this candidate.

No external code/network loads are allowed by the module CSP/resource delegate.
Ordinary eval/Function, WASM and Node globals are denied in the verified profile.
WASM opt-in for Servo itself is not implemented. The existing C1 Stage WASM
authorization remains separate and unchanged. GPU interop capability never
implies permission to execute module content.

When supported, the sole owner enables Windows/Vulkan external-memory and
semaphore extensions at device creation. Ordinary Native projects load no
Servo DLL, import no external image, create no D3D11 devices and hash no Servo
files. Unavailable interop leaves ordinary Native rendering operational; an
actual module call reports `E_NATIVE_MODULE_UNAVAILABLE`. Availability and
enabled state are reported separately. `FRAMEWEAVE_DISABLE_EXTERNAL_IMAGES=1`
lets an operator explicitly restrict this optional path.

The load-time receipt covers the DLL, bridge, ANGLE dependencies and canonical
clock. Files are hashed once and held against concurrent write/delete. Unknown
local DLL dependencies are rejected. No frame performs file/transport hashes.
The unsafe Rust boundary is confined to the reviewed Win32/HAL/FFI adapters;
the rest of the owner retains `deny(unsafe_code)`.

## Explicit local build

Rust/MSVC, the Cargo source cache, ANGLE DLLs and the supplied Mozjs link-input
archive must already exist. No compiler or runtime-code downloader is added.

```powershell
node --import tsx modules/servo/build.mjs prepare `
  --registry <cargo-registry-source-directory> `
  --mozjs-archive <reviewed-local-archive> --angle-dir <reviewed-local-ANGLE> `
  --allow-local-development-inputs
node --import tsx modules/servo/build.mjs build --vs-env <vcvars64.bat>
$env:FRAMEWEAVE_SERVO_RUNTIME = (Get-Content .frameweave/servo-kit/build.json | ConvertFrom-Json).runtime
node modules/native-gpu/build.mjs --release
```

The build returns an immutable, content-addressed local runtime bundle. It uses
the pinned Cargo lock and source patches, disables Mozjs's network archive
download, and verifies prepared source before/after compilation. Source/debug
paths, native compilers, supplied static libraries and generated build metadata
limit binary reproducibility; a successful build is not a provenance audit of
the supplied binaries. See `THIRD_PARTY_NOTICES.md`.

Developer verification uses `validation/verify-native.ts`, `verify-project.ts`,
`verify-features.ts`, `verify-admission.ts` and `verify-media.ts`. Numerical
inspection scripts require the separate `--diagnostics` debug owner. Media
verification uses the production release owner and actual FFmpeg output.
Portable TSX/Capsules need this optional runtime installed separately; they do
not silently embed its native DLLs or establish redistribution permission.
