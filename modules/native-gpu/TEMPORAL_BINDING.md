# Managed Stage-local temporal source binding v1

Optional `NativeStageInit.temporal` and GPU-capable `NativePluginInit.temporal` bind a **sealed R1 resource module**, then actually record that source/prefix again for each supplied fractional sample context. Core has no dependency on pro-animation and adds no time planner, reducer, Stage DAG, native device, submit loop or animation semantics.

This profile is **not arbitrary managed JS replay**. A resource describes a reviewed stateless native pixel prefix using the existing `NativePixelDescription`/kernel ABI1 and Core numeric Signals. First step has zero inputs; subsequent steps take only `input`, the previous local prefix image. Cross-Stage images, compute/mesh/Servo/inference/history/fixed-step sources and multiple nested binding windows are explicitly outside v1. Existing explicit time callbacks/effect APIs remain available independently.

## API

```ts
// During Stage init; the package must actually be in this Stage's compiled R1 closure.
const source = await init.temporal!.bind({
  version: 1, packageRef: 'studio.sources@1.0.0', module: 'motion-source',
});
return {
  renderAt(context) {
    return source.window(context, {}, sourceAt =>
      timeEffects.shutterBlur(sourceAt, {count: 8, angleDegrees: 180}, context));
  },
  dispose: () => source.dispose(),
};
```

`sourceAt` structurally matches Agent-2's `(sample:{index,time,weight,context})=>Promise<GpuPixelImage>`. It is valid only in its active window/frame epoch. Every invocation re-evaluates the source parameters using **the complete supplied context**, then emits fresh GPU runs. It does not change host Date/Math/global time, re-execute arbitrary author JS, relabel an old image or seek another Stage. Repeated/out-of-order samples are genuine new evaluations, with no historical frame store or cross-window output cache.

`window` options: optional `parameters` (one numeric-Signal row per prefix step, exact existing f32/u32 layout) and `signal` from `init.temporal.cancellation()` (or a real host `AbortSignal` where available). Rows default to the resource's authored Signals. Plain data is copied at entry; changing the caller array later has no effect. Existing `evaluate/checkSignals/nativeParameters` own keyframe, spring, expression and numeric encoding semantics. Ordinary numeric `let` results stay captured numbers. Functions, ordinary accessors, custom prototypes, cycles, sparse arrays and non-copyable Proxy data are rejected; there is no new expression language. Native structuredClone is used in addition to descriptor checks. This is not a claim that standard JS reflection can suppress every malicious Proxy trap before rejecting it; ordinary Stage JS remains governed by the existing host isolation, not this data validator.

SpiderMonkey has no DOM AbortController/AbortSignal. Create local cancellation through the actual service, not a separately bundled module registry:

```ts
const cancel = init.temporal!.cancellation();
// pass {signal: cancel.signal} to window; cancel.abort() is one-way/idempotent.
```

Both the controller and token are frozen; token state lives in this service's private WeakMap. Unknown/structurally forged/another Stage's tokens reject with `E_NATIVE_TEMPORAL_DATA`, without reading an arbitrary aborted getter/callback. Managed facades delegate creation to the same Core service, so separately bundled R1 code has no registry identity problem. Host AbortSignal reads use the captured builtin accessor. Cancellation checks run before/after each awaited source record and before commit. This cancels subsequent window recording and rolls back its additions; it is **not hardware preemption of an already submitted kernel**. Existing outer frame/owner cancellation remains responsible for submission, completion and device teardown. No global polyfill, extra host permission or native binary is installed.

Context fields are finite and complete; FPS, seed, duration and dt retain the enclosing output identity. Sample time equals context.time, and local/global frame↔time coordinates must agree. Local retiming may retain global time; shutter plans may change both according to their existing mapping. Core does not replace Agent-2's plans or clamp the source domain silently. Negative explicit sample times remain possible. Bind only during init; create a new Stage to change sealed source identity.

## Resource profile

Use the existing P4-R1 `modules` entry `{format:'resource',path:'./motion-source.json'}`. No Manifest/API version or capability format change. A typical file:

```json
{
  "version":1,"profile":"native-pixel-prefix-v1","id":"motion-source",
  "steps":[{
    "description":{
      "version":1,"inputOrder":[],"parameterTypes":["f32"],
      "kernel":{"abiVersion":1,"id":"studio/motion","version":"1.0.0",
        "inputCount":0,"parameterWords":1,
        "code":"fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),-.125,2.,.5);}"},
      "output":{"format":"rgba32float","alpha":"premultiplied",
        "color":{"primaries":"rec709","whitePoint":"D65","transfer":"linear",
          "reference":"scene","range":"full","referenceWhiteNits":100}}
    },
    "parameters":[{"$expr":"frame","args":[]}]
  }]
}
```

All steps use the same explicit scene-linear color encoding and Stage dimensions; each has explicit PM16F/32F output. F16 publication uses the existing half rounding and F32 working storage. Metadata declares the reviewed shader's color/Alpha contract; Core does not scan/repair arbitrary shader pixels, secretly premultiply or clamp HDR/negative RGB.

The binder owns the real `moduleResourceReader` created from `sealedStageModuleResources`. Caller-supplied readers/hashes/paths are not accepted. Lookup requires exact admitted packageRef/module/format/resourceId/hash. A module facade is limited to its own package and declared transitive dependencies, intersected with any parent delegation; seeing other packages in the Stage snapshot does not authorize them. Initialization uses existing verified bytes and compiled-kernel caching; no per-frame source/resource hash or network operation is introduced.

## Ownership and transactions

One window at a time in the same recorder/owner. GPU-capable R1 initializers receive a facade bound to their existing borrowed lease. Core privately grants only this window's actual fresh, still-valid, not-yet-transferred source images; there is no public adopt API. Other retained/foreign images cannot be granted or released. Lease closure after an await prevents grants; rollback/release/dispose revoke a grant once. The existing managed adapter removes root `temporal` from its common init fields and injects no facade for modules without GPU capability.

`sourceAt` transfers a fresh caller-owned source image. The existing reducer can consume/release it through its lease. Window success retires internal scratch/tokens and preserves the returned final image with normal frame-local lifetime; it does not release the reducer's result or another retained image. A returned pre-window/foreign/released image fails. Closing a binding is idempotent when quiescent; disposal while a recording is active is a BUSY error. There is no hidden reset.

Failure or cancellation rolls back only window-added image/data/pass/parameter records and temporary ownership; pre-window work survives. Source failures stay failures even if a consumer catches them. Lease disposal is authoritative and is not resurrected by rollback. Compiled kernel identities remain cached so the existing delta protocol stays valid. Unsettled sampling/returning from renderAt with an active window fails and drains; existing execution deadlines remain authoritative. No GPU submission/readback occurs while recording. Actual memory/device/frame-slot admission and completion/cancellation stay in the existing native owner. Existing command limits are checked, with no additional arbitrary sample/size cap.

No V-SHARED reads/writes/commits are invented. Parameters already supplied from a committed outer snapshot are copied once; subframes do not create logical commits. **Current baseline Native CONFIG/shared adapter use is still explicitly rejected. This checkpoint does not implement Main's separate shared-snapshot integration.**

## Verification and integration

Tests: `tests/native-temporal.test.ts`, `tests/native-temporal-renderer.test.ts`. `validation/temporal-binding/fixture.ts` assembles a test-only installed R1 package, carrying exact temporal plan/reducer sources from frozen `ba70eac38170567b48adfded74e3602f5bbf304b`; it never synchronizes another worktree. Its generated bundle is a validation dependency, not a new animation implementation or a formal published package.

The real chain is TSX → actual R1 initializer/borrowed lease → sealed source → three fractional shutter samples → Agent-2 compensated GPU reducer → existing compositor/output. CPU references, random/repeated frames, F16/F32, root binding, normal rendering, PNG/EXR and decoded MP4 are recorded separately from explicit terminal readback. Resident submission checks require zero image/buffer readbacks. Numeric materialization timing is not a preview FPS benchmark.

Core touch points: `temporal-types/data/temporal.ts`, `scope.ts` recording transactions, `borrow.ts` private ownership, `provenance.ts` lease retirement, `bootstrap.ts` frame lifecycle, `logic-host.ts` seek policy, optional authoring/plugin init types and `stage-bindings.ts` facade injection. `pixel-parameters.ts` only extracts existing host-neutral parameter encoding and keeps `program.ts`'s export/behavior. No Rust owner, binarySeeds framing, CLI presenter, TVG, P4 Manifest, time-plan or reducer changes.

Build source identity changes; Main owns final SDK Runtime Pin and formal R1/installed/distribution integration. No old lock or trust decision is refreshed. Windows/NVIDIA is the actual hardware test environment; other GPUs/OS, unqualified source profiles, full repo and final installed distribution are unverified. Existing unrelated red tests remain reported, with original assertions intact.
