# Native data interfaces v1

Borrowed module leases forget an allocation after an explicit release receives
the owner's `E_NATIVE_SCOPE` for that already-owned, expired handle. The original
error still propagates; a second release is no longer owned by that lease.
Foreign handles are rejected before reaching the owner, and other release errors
retain bookkeeping for retry and propagate unchanged. This does not free physical
or in-flight GPU resources, close the Stage owner, or automatically sweep handles
that callers never release. Recording-only tests exercise 128 frame invalidations;
they are not a long-session heap or GPU-memory profile.

These extend the existing owner and command protocol 2. P4, TVG, ordinary JS
variables, immutable initialization inputs and animation time are unchanged.

- `gpu.imageToBuffer(image,{version:1})` is a read-only F32 working-RGBA view.
  Source Half/Alpha/colour metadata and GPU allocation lifetime are preserved.
  `cloneBuffer` makes a writable copy. Existing four statistics reuse this path.
- `gpu.importResource({version:1,id,decode,output})` accepts a declared Resource
  ID or its exact `init.resources` URL. The host verifies the existing compiled
  build seal, snapshots bytes and uploads on admission, without remote fetches.
  `surface-v2` preserves explicit float/colour/Alpha; `icc-sdr` reuses ICC16 import
  and requires the existing reviewed `FRAMEWEAVE_MEDIA_PYTHON` runtime. Missing
  ICC profiles require explicit `missingProfile:'assume-srgb'`. HDR is not routed
  through ICC. Native image admission uses actual device limits and session budgets (see
  `IMAGE_ADMISSION.md`); resource snapshots are
  bounded to 256 configurations / 4 GiB and released at session closure.
- Existing `gpu.upload(surface)` / filter `importImage(surface)` now support
  explicit small float CPU values (65536 RGBA words). Larger inputs report
  `E_NATIVE_UPLOAD_LIMIT` and use the declared Resource path. These explicit CPU
  uploads are observable; they are not a GPU-resident effect-chain fallback.
- `createStateBuffer` / `createStateField(descriptor,seed,{version:1,id})` create
  persistent leases during initialization. Before updates, record
  `stateStep(buffers,{version:1,epoch,step,reset})`. Reset starts at step zero with
  a fresh epoch; later steps must be consecutive. State survives compatible plan
  changes, uses one ordered frame slot, and is isolated by Stage. Definitions and
  initial seeds cannot change. Seek by reset/replay; replay obeys the existing
  command budget. After cancelled/rejected recordings, explicitly reset/replay;
  the API does not automatically checkpoint arbitrary JS closures. Ordinary
  `createBuffer` initialization inputs remain immutable.
- `publishBuffer(id,buffer,{version:1})` declares a named result, without reading
  or waiting. The host `NativeBufferExporter` configures a private file lease and
  reads a completed ticket. IDs, owner, frame, slot generation and byte length
  are checked; stale/foreign tickets fail. Drain frames and stop further submits
  during explicit export. Temporary binary files are removed after reading;
  repeated close is safe. `exportedPositions` decodes position fields. Stage
  `readBuffer` / `readDeformedPositions` remain rejected inside renderAt, avoiding
  a recording/execution deadlock. Explicit exports can wait/read CPU data;
  ordinary GPU rendering performs neither operation.

## Main integration

`extensions.ts` supplies `nativeExtensionLayout(program)` for the existing
Renderer layout key. Include it unconditionally so resource/import/publication
changes cannot reuse an incompatible plan. Treat cached persistent definitions
like immutable definitions when computing metadata keys. Capacity already clamps
stateful plans to one slot in `nativeFrameCapacity`; stateless plans retain MFR.

Main owns the public Renderer/CLI export entry: create one `NativeBufferExporter`
for the owner, configure bootstrap and every admitted program with its lease,
serialize reads after completion/drain, and close it with that owner. Do not
enable CPU export through authored browser RPC. The reference integration in
`validation/verify-interfaces.ts` exercises the actual logic-host packet and same
GPU owner; it does not claim the public Renderer export method is already wired.

Existing package identities/locks must remain immutable. Main must version the
changed statistics implementation when publishing its successor package.

Editable example: `examples/interfaces-v1.tsx`. Reproduction:

```powershell
$env:FRAMEWEAVE_HOME = "$PWD/.frameweave/user-home"
$env:FRAMEWEAVE_MEDIA_PYTHON = '<reviewed installed Python with existing media dependencies>'
node modules/native-gpu/validation/validate-interfaces.mjs
```

Frozen evidence identifies a single passing campaign; earlier failures are
retained separately. Windows/Vulkan/RTX 5070 Laptop only. Linux/macOS, full repo,
installed distribution and all six portable modes are not qualified here.
