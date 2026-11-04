# Runtime-created resident geometry, v1

Use `createResidentBuffer(descriptor, typedArray)` or
`createResidentField(fieldDescriptor, typedArray)` for CPU-authored geometry/data
that will be drawn repeatedly. They may run during initialization or the first
`renderAt`; handles survive later frames in the same Stage scope. Query
`gpu.capabilities().nativeResidentBuffers?.version === 1` first when supporting
older engines. Generic GPU interfaces expose these as optional methods; Native
provides them with a matching reviewed owner binary. Unsupported owners fail
explicitly with `E_NATIVE_RESIDENT_UNAVAILABLE`.

```ts
let positions: GpuDataBuffer | undefined;
// During first render, after layout/tessellation has produced all CPU vertices:
positions ??= await gpu.createResidentField({
  type: 'f32', dimensions: [vertices.length / 3, 1, 1], components: 3,
  semantic: 'position', space: 'object', units: 'pixels'
}, vertices);
// Draw with the same positions in later frames; transform/style remain parameters.
// On same-shape geometry edits:
positions = await gpu.replaceResidentBuffer(positions, editedVertices);
// On cache eviction/module disposal:
await gpu.releaseBuffer(positions);
```

The initial array is complete, type checked and snapshotted once; later mutations
of that CPU array do not mutate GPU storage. Resident buffers are read-only.
Writes/clear/copy targets, inference outputs, writable compute bindings and state
aliases are rejected. Read-only compute, draw positions/indices/UVs, Pixel ABI2,
and copying into a separate transient buffer work normally. GPU-generated
mutable history still uses explicit state buffers/steps, not this geometry API.
Existing `createBuffer`/`createField` remain frame-local during rendering; existing
initialization preparation is unchanged.

`replaceResidentBuffer` preserves shape and returns a fresh immutable identity.
It validates and creates the replacement before retiring the old handle, so a
bad array/budget failure leaves the old handle valid. Callers must assign the
returned handle. For a topology/shape change, create a new field/buffer and retire
the previous one after success. In-flight commands keep their old storage safely.
Replacing requires budget for the overlap. Release of a known resident handle
is idempotent; foreign owners are rejected. Module leases own their allocations,
cannot replace/release another lease's buffers, and clean up on disposal.

## Ownership and transfer

The recorder creates opaque, monotonically allocated local identities, preserves
them independently of per-frame buffer indices, and sends seed words only on
first use. The trusted controller namespaces identities by Stage, retains their
immutable definitions, and includes all live retained resources in the existing
program memory admission. A release is recorded; physical retirement occurs at
the next admitted plan that drops the resource after outstanding work completes,
or owner shutdown. This is not immediate hardware preemption.

The same Native owner stores buffers by identity, sharing them across frame
slots and plan-index changes. It uploads new words once and reuses that buffer.
The Node/native bulk transport also omits already admitted resident seeds on
reconfiguration; the owner resolves references from its admitted pool and checks
metadata/identity before reusing them. No per-frame content hashing, file lease,
GPU readback, global Host, new device or graphics document format is introduced.

This is an optional versioned private Data extension (`resident: {version:1,id}`)
inside existing Native program protocol v2, plus a scoped live-set on the existing
recording packet. Old projects never send the field. New calls require matching
SDK/controller/Native binary; old binaries reject the unknown extension, and the
capability guard prevents silently claiming residency. P4 ABI, Manifest, TVG and
permissions are unchanged. Initialization seed identity and frame-local immutable
Resource identity keep their existing contracts.

## Budget, measurements, and boundaries

There is no fixed resource-count cap. The existing configurable session `maxBytes`
and actual storage-buffer/device limits apply. All retained geometry, including
temporarily unused cached resources, is charged as fixed immutable storage once,
not once per frame slot. Caller/library cache eviction controls retention; an
unbounded application cache can exhaust its budget. Physical driver peak memory
is not inferred from these logical byte counts.

Native statistics provide `residentBuffers` with live buffers, bytes, actual
upload count/bytes, reuse events and evictions. These are distinct from ordinary
Resource uploads, explicit buffer readback and physical memory. Recording scope
statistics expose its live resident count/bytes. Creation inside a temporal
sampling window and resident resources in temporal source forks are rejected
until a dedicated fork-lifetime contract is qualified. Arbitrary GPU-written
temporary buffers are not implicitly promoted. A normal parameter-only transform
does not need geometry replacement.

The editable `examples/native-resident-buffers/project.tsx` prepares a 6,144-vertex
grid on its first frame. The integration test compares it against ordinary
frame-local buffers pixel for pixel across new/random frames, edits, slot/layout
changes, PNG and decoded MP4. Test-only readbacks use the existing explicit named
buffer export. The production path retains resident GPU data throughout.
