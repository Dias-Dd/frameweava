# Native GPU color and mesh texture v1

These are optional Native scope operations on the existing device/Surface
contract. No P4 ABI, TVG, Stage DAG, engine permission or package format changes.
Ordinary pixel `run()` still rejects a different input/output color identity.

## Explicit linear color conversion

```ts
const working = await gpu.convertColor(input, {
  version: 1, color: acescg, format: 'rgba32float', signal
});
// ... existing effects consume working ...
await gpu.release(working);
```

`NativeColorConversion` is exported from `modules/native-gpu/authoring.ts`.
The operation records a GPU pass and returns an owner-local image, not CPU
pixels. Completion is the existing frame ticket, not return from this method.
Dimensions and Alpha mode are preserved; output format defaults to input format.
Identity conversion returns a separately owned image. Reference-white scaling,
Rec.709, Rec.2020, Display-P3 and ACEScg use existing `gamutMatrix()` coefficients,
including the existing Bradford D65/D60 adaptation. Matrix calculation is tiny
control work; all pixel transformation is on GPU. No clipping, tone mapping or
gamut compression. Negative RGB and HDR values are preserved within the selected
format's representable range. Premultiplied linear RGB transforms directly;
non-identity conversion also transforms PM alpha-zero emission RGB directly.
The paired CPU linear reference preserves this contribution too. Identity
conversion preserves components. Alpha is unchanged.

Only the scene-linear inputs already permitted by PixelScope are accepted.
This is **not** the ACES rendering/view transform or PQ/HLG encoding. Continue
using the existing display/OCIO and media encoding paths for those operations.
Invalid colors, unknown versions, unsupported transfer functions, foreign/stale
handles, cancellation, and nonrepresentable F32 matrix coefficients fail before
recording the conversion. Split coefficients, compensated products/sums and a
runtime rounding barrier protect HDR cancellation from driver reassociation.
An explicit F16 output uses the existing binary16 RNE publication, not an RGBA8
or implicit intermediate. F16 still occupies 16 bytes/pixel of F32 working memory.

## Textured resident mesh

```ts
const uvs = await gpu.createField({type:'f32', dimensions:[4,1,1],
  components:2, semantic:'generic', channels:['u','v']},
  Float32Array.of(0,0, 1,0, 0,1, 1,1));
const image = await gpu.convertColor(input, {version:1, color:linear709});
const out = await gpu.drawMesh({positions, indices, matrix,
  texture:{version:1, image, uvs, filter:'linear',
    addressU:'clamp', addressV:'clamp'},
  color:[1,1,1,1],
  output:{width,height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
```

The optional `NativeMeshTexture` leaves old solid-color mesh bindings and shader
semantics intact. Positions remain explicit f32 XYZ fields; optional indices are
u32, with the existing indexed draw behavior. UVs are f32 fields with two
components per vertex. Nonindexed draws require at least `count` UV pairs;
indexed draws require UVs for every position vertex. Index values are not read
back for a per-frame CPU scan; normal GPU storage/vertex bounds apply.

UV origin is **top left**, normalized, perspective-correct. Texel `(x,y)` has UV
`((x+.5)/width,(y+.5)/height)`; bilinear sampling uses `uv*size-.5`. Filtering is
`nearest` or `linear` (default linear). Independent U/V address modes are clamp
(default), repeat, mirror and transparent border. Repeat/mirror also apply to
neighboring taps at seams. There are no mipmaps, anisotropic filtering, automatic
derivatives or implicit vertical flips in v1. The source image can be opaque,
straight or premultiplied. Straight inputs are premultiplied **before** filtering;
opaque inputs use alpha one. `color` is a straight linear HDR multiplicative
tint: PM RGB multiplies `color.rgb*color.a`, alpha multiplies `color.a`.
Output is straight or premultiplied; uncovered geometry remains transparent.
An opaque output tag is rejected for textured meshes: explicitly composite onto
an opaque background when required. This avoids falsely tagging triangle holes
or transparent border samples as opaque. Old solid mesh behavior is unchanged.

Texture and output must have identical color metadata. Convert explicitly
upstream. Every handle must belong to the same scope. UVs can be compute results
or explicitly ordered persistent state; state must be reset/advanced via the
existing state contract. The mesh binds positions, UVs, the existing F32 image
storage buffer and a uniform. It does not upload another GPU texture, allocate
another Host/device, or read pixels/vertices back. Raster color/depth targets and
the existing F16/F32 resolve remain owner-managed. This is a minimal texture
material, not a PBR/G-buffer/custom material system.

## Lifetime, errors and integration

`release()` / `releaseBuffer()` revoke authoring handles after their last recorded
use. Recorded passes remain valid; physical lifetime follows the existing
admitted allocation plan. Borrowed module leases own converted/mesh outputs,
never their borrowed inputs or shared device. Failure and close use the existing
owner cleanup. UV buffers participate in Stage remapping, persistent-state
ordering and image-alias liveness. There is no new scheduler or resource registry.

Private native protocol 2 adds optional kernel kind `color` and optional mesh
`uvs` / `textureVersion:1`. Missing fields preserve old paths. An older binary
rejects the new kind/fields; it does not silently reinterpret them. Rebuild the
native owner and inspect its build receipt. Wrong scope/layout/version yields
`E_NATIVE_SCOPE`, `E_NATIVE_MESH` or `E_NATIVE_COLOR`; unsupported image/color
metadata retains `E_GPU_PIXEL_CONTRACT` / `E_MEDIA_COLOR`; cancellation retains
`E_RENDER_CANCELLED`. Ordinary `run` color mismatch is still rejected at both
authoring and native admission. Package identities and SDK pins are Main-owned.
Effect libraries may adapt their existing `workingColor` wrapper to call this
operation once at the boundary; this checkpoint does not modify their versions.

## Reproduction

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
node modules/native-gpu/validation/validate-color-texture.mjs
```

The script records actual commands, wall times, exit codes, stdout/stderr hashes
and native build inputs. It includes root and validation typechecks, affected
GPU/mesh/state/alias/security regressions and the actual two-Stage TSX example
`examples/color-texture-v1.tsx`: ACEScg → Rec.2020 → Rec.709 → GPU deformation →
textured mesh → normal compositor → PNG / F32 EXR / six-frame MP4. Random frames
0/12/23/0 must repeat exactly; EXR is compared numerically to the diagnostic
GPU reference via the explicit named-buffer host export (large diagnostic JSON
is deliberately not allowed through the bounded control channel). MP4 is fully decoded. Test-only GPU inspections are counted
separately from production readbacks. Production timings use different new
frames, one frame slot, CPU-side recording through actual GPU completion; they
exclude display and encoding and must not be called full preview latency.

Hardware qualification here is Windows x64 / NVIDIA RTX 5070 Laptop / Vulkan.
Other adapters, Linux, macOS, SpiderMonkey integration, npm/Capsule/Flat exports,
full-repository regression and nonlinear GPU transforms are not qualified by
this campaign. Main owns combined integration and distribution verification.

## Frozen checkpoint results

Baseline: `9c6f3d39637e6c241c43d5674fdeb83136f9b8e0`, plus Main's explicitly
supplied two-file compatibility patch from
`de535fe2db2e4357dea665c94e8f8ab3d97ad2c4`. That patch preserves static protocol
v1 without a v2 export lease and initializes the cancellation test's prototype
fixture correctly; its assertions were not weakened. The first regression run
was 27/29 due to these two Main integration defects. It remains in the logs.
The final batch on the patched source is **30 passed, zero failures/skips**;
both typechecks and real TSX/media verification pass. The validation script
records **138.29 seconds**, including its failed first batch and reused builds.
Earlier development probes are retained separately, not presented as a single
all-green run. The only production source changes after that batch were none;
documentation and evidence were then frozen.

100 color cases include all four primaries, D65/D60 adaptation, reference-white
scaling, identity, roundtrip, random non-binary Alpha, deliberately cancelling
HDR, and F16/F32. F32 matched the CPU Float32 publication exactly for these
samples (not a universal bit-identity guarantee). 48 texture cases have maximum
F32 absolute error **9.5367e-7**, scaled error **1.4949e-7**. Additional tests cover
perspective-correct interpolation, centers, independent wrap axes, persistent UV
reset ordering, lease cleanup, invalid versions/layouts and foreign handles.
The perspective reference projects vertices to exact integer screen coordinates
to avoid confusing hardware subpixel snapping with interpolation error.

The compositor now checks colors only for actual active Layer/Mask references;
unused intermediate Stage outputs can use other colors. Different colors on
actual participating Layers or Masks still fail; no implicit conversion occurs.
This fixes the real two-Stage example's prior `E_NATIVE_COLOR` failure.

PNG is inspected and read at 640×360; F32 EXR retains RGB range
**[-0.5714113116, 5.1208496094]**, with **zero absolute error** versus the explicit
GPU buffer reference. The six-frame MP4 is fully decoded. Random frames
0/12/23/0 repeat exactly. Media files and hashes are in the frozen `summary.json`;
the actual generated files remain under `artifacts/native-color-texture/media`.

Real two-Stage, F32, three-color-conversion + GPU deformation + textured mesh
timings, each one slot, 17 different new frames after the first frame:

| Resolution | Init | First frame | New median | P95 | Allocated image buffers |
|---|---:|---:|---:|---:|---:|
| 1920×1080 | 1481.78 ms | 24.50 ms | 9.46 ms | 11.91 ms | 66,355,200 bytes |
| 3840×2160 | 1563.06 ms | 37.04 ms | 11.65 ms | 182.62 ms | 265,420,800 bytes |

The 4K P95 includes a real outlier; 17 samples make it the maximum. Power state,
thermal state and concurrent machine load were not controlled. Physical peak
memory is unknown. These measurements include JS recording/control IPC through
GPU completion, **exclude display and encoding**, and do not establish 10 ms
interactive preview or an improvement over an identical prior implementation.
Production benchmark frames have zero pixel readbacks, transfers, frame hashes,
numerical validation passes and blocking GPU waits. Terminal media encoding and
explicit test reference reads naturally materialize pixels and are separately
counted. Detailed frame samples, source hashes, both build receipts, original
failed logs and final logs are in `validation/color-texture-v1-checkpoint/`.
