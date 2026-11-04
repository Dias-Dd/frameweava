# Native image and workload admission

Native computation no longer inherits Web's 16,777,216-pixel policy. There is
also no fixed 256-triangle ceiling for exact transparent meshes. The configured
Native session byte budget is a positive safe integer, with the existing default
unchanged; the former arbitrary 4 GiB maximum for that explicit budget is gone.
Increasing a budget neither reserves that memory nor proves the device can run
the workload. Allocation limits, live-resource/slot budgets, driver failures and
execution deadlines remain enforced. No frames or transparency layers are dropped.

`nativePixelInfo` in `image-info.ts` reuses shared format/color/Alpha metadata
validation. Dimensions and working bytes must be safe integers; the existing GPU
ABI's U32 component indices must not overflow. With an actual device handshake,
images are checked against actual storage-buffer, buffer and pixel-dispatch
limits. Without a handshake the recording is provisional; the native owner
rechecks actual adapter/device limits and the full admitted program budget.
F16 still needs 16 bytes/pixel of F32 working storage, not 8.

Render attachments additionally use actual `maxTextureDimension2D`; storage-only
pixel computations do not inherit texture dimensions. Device checks happen before
resource creation, including mesh attachments, the display swapchain and module
textures. Pixel workgroup geometry must fit the actual device's dispatch limits.
This does not create a tiling algorithm or promise that every representable U32
image can run on the current hardware.

Native capability handshake adds optional
`nativeImages:{version:1,admission:'device-and-session-budget',maxTextureDimension2D}`.
`nativeMesh` keeps version 1 and reports `exactAdmission:'session-budget'`.
The former `exactMaxTriangles` is optional for compatibility with an older
handshake and is absent on the new owner. It must not be replaced by a hardcoded
256 fallback in effect libraries. A missing capability is unknown, not runtime
verification. Rebuild/use the matching owner and inspect its receipt; an old
binary still has its old admission policy.

Web `pixelInfo` and Web allocation paths retain their original policy. Pure
`estimateGpuImage` performs metadata/byte estimation, not allocation permission;
it can estimate larger images without granting Web execution. Native factory
recording, cross-Stage inputs, declarative plans and declared-resource metadata
use Native admission. Declared-resource integrity, the CPU Surface decoder's
separate size/byte rules, snapshot-cache quotas, Web PNG bridge and Servo/external
image boundaries are not silently relaxed. P4/TVG shape, Stage scheduling,
permissions, CSP and frame trust are unchanged.

Exact mesh peeling now uses three reusable first/even/odd binding records,
instead of a GPU uniform and binding group for every triangle. Its raw auxiliary
budget is `52*width*height+136` bytes per slot, plus identity indices only when
needed. Remaining per-input-triangle pass recording can still cost time;
indirect execution stops drawing/accumulating after empty layers, not render-pass
bookkeeping. Runtime deadlines and actual memory failures are meaningful errors,
not excuses to silently truncate or approximate a larger workload.

The over profiles also preserve valid PM alpha-zero nonzero RGB emission. A
zero-alpha discard is allowed only when RGB is also zero. Explicit cutout keeps
its selected threshold semantics. Emission preservation requires PM output;
Straight unassociation cannot represent that alpha-zero contribution. The
paired scene-linear CPU and GPU color transforms also retain alpha-zero PM
emission under gamut/white/reference-white changes. The CPU one-line reference
change and Native Graph dimension change are Main-authored dependencies.
Nonlinear CPU encoding/tone mapping is unchanged.

Reproduce:

```powershell
$env:FRAMEWEAVE_HOME = Join-Path (Get-Location) '.frameweave/user-home'
node modules/native-gpu/validation/validate-image-admission.mjs
```

Tests include real 4097×4097 F16/F32 execution with sampled corners, a valid
storage-only axis wider than actual texture limits, actual buffer/texture and
session rejection, an explicit 8 GiB budget on a small program, unchanged Web
denial, and more than 256 exact mesh triangles. No full large image is read back
to claim GPU execution: diagnostics sample only a tiny GPU-produced result.
Main's paired Graph change also removes the development 16K ceiling for Native
Stages and pure Native visual compositions (including Audio), retaining old
Web/mixed policies and positive-safe-integer checks. A real ordinary TSX
32769×1 composition is checked through public buffer export and PNG output.
The editable `examples/dynamic-image-admission.tsx` runs a real 4097-square
upstream Stage, then an explicit 320×180 GPU proxy. PNG/EXR/MP4 outputs validate
that proxy and are not advertised as full-resolution delivery qualification.
Windows RTX 5070 Laptop / Vulkan is the qualified device; full repository,
distribution, other platforms and arbitrary larger workloads require their own
evidence. No new general performance claim follows from removing a policy cap.

Frozen final checks: 46 targeted tests and three explicitly selected CPU color
checks pass, with both typechecks. The final paired source includes Main's Graph
patch from `f02155a7aef95bb1bd33c67395242098eeb7a619` and its supplied one-line
CPU linear-emission reference patch. Real 4097-square F16/F32 corner checks,
257-triangle exact peeling, 32769×1 ordinary TSX/public buffer/PNG output and
4097-square Stage → 320×180 proxy PNG/EXR/four-frame MP4 all pass. Proxy EXR
matches the GPU reference exactly. The recorded campaign totals 309.60 seconds,
including earlier failures/retries; logs retain the old fixture snapshot failure
and the generated wide example's optional-method type error before correction.
Earlier 41-test passes are labeled separately from the final paired 46-test
batch. Other professional-media tests outside the named CPU selection, full
repository/distribution and other hardware are not claimed as tested.
