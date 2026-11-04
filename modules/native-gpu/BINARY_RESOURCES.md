# Native read-only binary Resource v1

`init.gpu.importBufferResource({version:1,id,profile:'raw-bytes-v1',bytes,byteOffset?,byteLength?})` returns `{version:1,buffer,sourceBytes,byteOffset,byteLength,storageByteLength,access:'read-only'}`. See `examples/native-buffer-resource/project.tsx`. The ID must be an exact existing declared `Resource kind="file"`; URLs and authored filesystem paths are not accepted. `bytes` is the exact full source size, not an integrity credential. The range defaults to the remaining bytes from `byteOffset` (default0); it must be nonempty/in-bounds and fit the caller's session budget and actual device buffer/binding limits. `storageByteLength=ceil(byteLength/4)*4` is distinct from the true length. Raw little-endian u32 storage preserves all input bits, zero-padding the last word. It has no colour space or alpha semantics.

The existing compiled build seal and declared Resource identity remain authoritative. The existing Node Resource adapter verifies/snapshots the complete source once by streaming into its private lease. Only the Node adapter creates the private native `Data.sourceResource` descriptor; authored packets containing one are rejected. The existing owner uploads the selected range into immutable storage once, shared between its frame slots. Identical admitted plan storage is reused by existing reconfiguration; a changed source identity/layout needs fresh admission. Per-frame file hashing, numeric scans and CPU readbacks are not introduced. Admission does use a disk snapshot, CPU staging and GPU upload; this is not zero-copy import.

`buffer` is an ordinary owner-local `GpuDataBuffer` with existing `readOnly` metadata. Read-only compute/pixel inputs, index reads and cloning into a separate mutable buffer are allowed. Writes, clear/copy targets, shader STORE bindings, persistent-state aliases, inference outputs and ray outputs are forbidden. The native owner checks actual Naga storage access, not just the recording flag; `immutable` by itself is not treated as a security permission. Native private file/size/range/layout validation is repeated at admission, and the selected byte range is padded only in its staging buffer. This profile does not accept CUDA raw pointers or authorize arbitrary PTX. A future CUDA reader must be fixed/reviewed or copy this source into a private writable allocation.

Initialization may declare assets and compile kernels. Frame calls can reuse them; explicitly release the buffer at disposal (normal owner/Stage cleanup also retires it). Abort before/while streaming and cancellation after admission use existing cancellation errors; GPU cancellation is not hardware kernel preemption. A failed snapshot is removed, and closing the Resource adapter waits for pending snapshots and removes lease files. Source bytes changing after an accepted snapshot do not mutate that running owner's data; a new build/admission must verify the new bytes.

Diagnostics include `E_NATIVE_BINARY_SCHEMA`, `E_NATIVE_BINARY_BUDGET`, `E_NATIVE_BINARY_LENGTH`, `E_NATIVE_BINARY_READ_ONLY`, `E_NATIVE_BINARY_PERMISSION`, `E_NATIVE_BINARY_LEASE`, `E_NATIVE_BINARY_IO`, existing `E_NATIVE_RESOURCE_*`, and `E_RENDER_CANCELLED`. Existing state validation can reject a forged state alias first with `E_NATIVE_STATE`. Owner statistics expose cumulative actual `resourceImports.binaryUploadBytes`; explicit named buffer exports remain separately counted readbacks. Physical peak memory is not inferred from logical bytes.

This is an optional Native scope/private protocol extension, not a P4 ABI, Graphics data contract, TVG, scheduler, package registry or transport redesign. The single client integration hunk only adds the optional Data type field. Main must reconcile that hunk with its independent binarySeeds/framing work, and owns final SDK Runtime Pin/R1 distribution qualification. This byte bridge alone is not a NanoVDB parser, Deep EXR decoder, sparse sampler or universal typed asset format; those retain their own explicit profiles and numerical acceptance tests.

The separately versioned `nanovdb-float-indexed-v1` profile adds a fixed, reviewed sparse codec and derived readonly index; see `../sparse-volume/README.md`. The raw-bytes-v1 contract above is unchanged. Derived storage includes an explicit trailer and reports original/derived lengths separately.

## Frame-local seed identity

Native initialization reports a versioned `seedScope` prefix to the existing
controller. Initialization and persistent seeds keep their immutable Stage
identity. Read-only resources created during `renderAt` use a frame-local seed
cache: omission is allowed across cuts of that frame, and starts fresh on the
next frame even when the same data index has a different length or resource.
Source bytes, declared Resource identity, private lease and read-only checks still
apply. This changes no P4/TVG schema, public Resource API or native owner wire;
Core/SDK bootstrap/controller must be updated together. Legacy initialization-only
handshakes retain their previous immutable seed behavior.
