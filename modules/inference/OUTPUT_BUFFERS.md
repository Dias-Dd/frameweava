# Preallocated Native inference outputs

The existing API accepts an optional destination map:

```ts
const result = await gpu.runInference(model, inputs, {
  outputs: { next: nextBuffer },
  signal,
});
// result.next === nextBuffer
```

Omitting `outputs` preserves the original allocation behavior. Providing the map
requires every declared output name exactly once, F32 storage of exactly the
declared tensor length, and live writable buffers belonging to this scope.
Outputs cannot alias an input or each other. Immutable initialization buffers,
image views and declared read-only resource buffers are not writable destinations.
Validation completes before recording a pass or allocating fallback outputs;
partial maps do not silently allocate their missing entries. Unknown options fail.

The buffers are borrowed. The call does not release or transfer them. They use
the existing buffer/state lifecycle; no raw memory, provider import or native
pointer is exposed. The underlying provider may copy between its resident tensor
allocation and the owner's GPU buffers: this API is not a zero-copy claim.

## Explicit recurrent state and long replay

Model execution remains `temporal:'stateless'`. Recurrence is explicit data in
the existing managed GPU state buffers, rather than hidden model-session history:

```ts
// Stage initialization; shapes/names must match the admitted model.
const history = await gpu.createStateBuffer(
  { type: 'f32', length: 4 }, new Float32Array([2, -.5, 8, .5]),
  { version: 1, id: 'history' },
);
const next = await gpu.createStateBuffer(
  { type: 'f32', length: 4 }, undefined, { version: 1, id: 'next' },
);
const delta = await gpu.createBuffer(
  { type: 'f32', length: 4 }, new Float32Array([.25, -.5, 1, 0]),
);
const replay = createNativeReplay(gpu, [history, next], { segmentPasses: 768 });

// Existing renderAt Context and replay clock. No invented time system.
await replay.record(context, async () => {
  await gpu.runInference(model, { history, delta }, { outputs: { next } });
  await gpu.copyBuffer(next, history);
});
```

`createNativeReplay` emits the existing reset/epoch/consecutive `stateStep`
commands. A manual loop must do the same. Persistent outputs need an explicit
step in each submitted segment before any write; complete a logical step before
calling `flushState({version:1})`. Buffers created with ordinary `createBuffer`
during initialization become immutable and cannot be used as destinations.
Use managed state for mutable intermediates that survive a flush.

`flushState` supports same-frame Pixel/color/compute/inference/state commands.
Ordinary transient tensors and read-only image views may continue within that
frame; cross-frame history still requires explicit managed state. Model definitions retain exact Stage identity, provider,
content hash and sealed Resource admission. Stages receive distinct model indices
and state namespaces. Models whose resolved definitions remain in the plan stay
loaded across flushes and the final image plan; their known model/tensor bytes are
counted even in plans that do not call them. Removing their declarations via the
trusted controller retires them; owner closure releases all sessions and leases.
The provider's hidden working memory remains unknown, as before.

Intermediate submissions emit no visible media frame. The existing frame
transaction checkpoints/rollback and failed-Stage latch remain authoritative.
Inference fences and provider sessions are not rewound: the model is stateless,
and restored explicit GPU buffers supply subsequent inputs. No CPU fallback or
new filesystem/network/WASM authority is granted.

Same-frame image preprocessing uses a private `frameContinuation` v1 descriptor:
`{version:1, frame, images, data}` names the exact image/data prefix of the owner's
last completed submission. Metadata, counts, single-slot order and frame identity
must match; a borrow permits one submission only. It contains no native pointer,
path, external texture or cross-owner handle. Initialization, cross-frame reuse,
changed metadata and aliased image allocation maps reject explicitly.

The Node controller appends each Stage packet in original DAG order. A flush
executes only the pending prefix, clears submitted commands and keeps the same
owner's completed buffers. Prior Stages are not executed again. Subsequent
resource/Pixel/color/imageToBuffer preprocessing can consume them. Declared
Resource models and pictures still pass existing seal/lease admission; their old
uploads are not silently requested from undeclared locations. Servo, mesh, ray
commands and temporal-source forks remain outside this qualified cut profile.

Borrowed images use identity allocations and retained storage, without readback,
encoding or CPU re-upload. All retained image/data declarations currently live
until the authored frame finishes; released intermediates are not compacted out
of this first prefix implementation. Large-image long preroll therefore needs a
sufficient configured byte budget; it is not constant-memory streaming. The next
frame starts a fresh recording; close/error releases the owner. Failed JS frames
restore managed state and fail-latch the Stage; transient buffers are discarded,
not exposed as reusable checkpoints. No general cross-frame GPUTexture contract
is introduced.

## Availability, diagnostics and qualification

Query the actual owner's `gpu.capabilities().nativeInference` before requiring
this extension: `{version:1, preallocatedOutputs:true, stateContinuation:true,
imageContinuation:'same-frame-prefix-v1', outputAliasing:'forbidden',
persistentOutput:'explicit-stateStep'}`. An older
owner does not advertise it. Ship matching Core/SDK and Native owner receipts;
no existing SDK lock is silently refreshed.

- `E_INFERENCE_OPTIONS`: malformed/unknown options.
- `E_INFERENCE_OUTPUTS`: wrong names, forbidden destination or alias.
- `E_INFERENCE_SHAPE`: exact dtype/length mismatch.
- Existing owner-local token, cancellation and state-sequence errors are retained.

The fixture in `validation/output-fixture.ts` is an authored two-input ONNX Add
graph with no external weights/operators. Tests use real ORT CPU as an independent
reference and real reviewed ORT DirectML on Native GPU. The recurrent two-Stage
test covers 300→0→1→300, exact negative/HDR/alpha values, stable buffer counts,
retained sessions, controlled failure rollback, PNG, EXR and decoded MP4.
The same engine buffer-binding implementation is provider-neutral; CUDA/TensorRT
and non-Windows platforms are not newly qualified by this DirectML experiment.
An additional 80→1→80 fixture uses an upstream stateful Stage, a sealed image
Resource, generated Pixel images, F32→F16 conversion and imageToBuffer
preprocessing. It checks the upstream counter executes once, exact negative/HDR
values, a resident model across cuts and a real EXR. Direct protocol tests reject
foreign/stale frames, altered metadata, count/version/alias faults and replayed
borrow submissions. Agent-3 owns its SAM2 weights/adapter and production workload
validation; this generic fixture is not a claim that SAM2 itself was rerun here.
