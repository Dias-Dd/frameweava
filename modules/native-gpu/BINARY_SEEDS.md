# Native typed-buffer binary admission

The public `createBuffer` / `createField` API and its f32/u32/i32 semantics are
unchanged. Large initial typed words now travel as little-endian binary after
an init/reconfigure JSON header, rather than as a giant JSON number array.
This is private transport extension v1 inside native protocol 2, not a new
TVG port, image encoding, P4 ABI or author permission.

The default binary threshold is a batching choice, not a scene-capacity limit.
There is no permanent 8 MiB control or 512 MiB seed ceiling in this path.
Host callers can configure transport policy:

```ts
const client = await NativeGpuClient.create(program, {
  executable,
  transport: {
    maxControlBytes: operator.controlBytes,
    maxSeedBytes: operator.seedBytes,
  },
});
```

Defaults follow the explicit program budget; the control default also covers
the actual metadata envelope. CLI callers retain their existing memory budget
option. These operator byte counts are passed to the native child so both
sides apply the same policy. The program's GPU allocation budget and actual
device limits remain authoritative. Adjusting a budget never changes data
types, enables software/SDR fallbacks or authorizes undeclared resources.

The header declares format/version, exact total bytes, buffer index, word
count and type. Rust validates the complete manifest before reserving seed
storage, streams words in bounded chunks, then runs normal program validation.
Duplicate/foreign buffers, mismatched types, conflicting inline words, image
views, overflow, configured-budget violations and truncated bodies reject.
Only init/reconfigure accept this extension. All other commands retain their
existing semantics.

Header and binary chunks form one serialized pipe transaction; concurrent
stats, close and frame commands cannot interleave with the body. The native
reader admits only one staged binary request at a time. No paths, files or
native handles are imported. Once transmission starts, a failed/aborted
transfer must terminate the owner; it cannot omit the remaining body and
continue with a misaligned pipe. Existing deadlines/failure latching apply.

This resolves the 153,294-triangle manor's admission failure without reducing
the scene. It does **not** establish ten-million/billion-triangle rendering.
The current scene is an expanded triangle array with software BVH queries.
Indexed/instanced geometry, out-of-core loading, visibility/LOD, acceleration,
upstream JS-host transport and physical memory all need separate scale tests.
Existing versioned structural/device limits outside this patch were not
silently removed or claimed fixed.

Rebuild the native binary with its normal provenance receipt:

```powershell
node modules/native-gpu/build.mjs --release
node --import tsx --test tests/native-seed-transport.test.ts tests/native-gpu-cancellation.test.ts
```

The targeted tests exercise both init and reconfigure with a seed whose old
JSON representation exceeds 8 MiB, preserve exact u32 bit patterns through a
production GPU compute pass and named export, check malformed/truncated
payloads and configurable limits, and retain cancellation/slot behavior.
No entire-repository or cross-platform validation is implied.
