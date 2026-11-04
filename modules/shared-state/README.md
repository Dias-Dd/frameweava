# Explicit shared state in the official RenderSession

Authoring: `@frameweave/engine/shared-state` exports `sharedVariable`, `SharedStage`, `sharedFrame`, limits and types. These are ordinary TS imports. Only explicitly declared variables participate; ordinary JS/TS variables retain their existing isolated realm semantics.

```ts
import {openRenderSession} from '@frameweave/engine/render-session';
import {sharedVariable} from '@frameweave/engine/shared-state';
const counter = sharedVariable({id:'counter', writer:'A', kind:'number', initial:0});
const session = await openRenderSession('./project.tsx', {cache:true});
try {
  await session.renderFrame(100);
  await session.renderFrame(0);
  await session.renderFrame(100);
  console.log(await session.readShared(counter));
} finally { await session.close(); }
```

The project declares a single writer with `<SharedStage writes={[counter]}>`. Readers declare `reads={[counter]}`; authoring creates explicit JSON dependency edges. Inside a Native Stage, call `sharedFrame(context, inputs, props)`, then `get`, `set`, `version` and `outputs`. See `examples/native-shared/project.tsx` in the source repository. Cells are bounded JSON values; they are not arbitrary live object references, and this is not a permission boundary for trusted host code.

One DX Session owns one queue, build/trust seal, Renderer, and optional coordinator. `renderFrame`, `mediaFrame`, `evaluateFrame`, inspection batches and reads share that queue. Shared results include an optional `shared` commit summary. `status()` returns metadata, not synchronous remote values. PNG inspection frames also retain the commit summary.

A transaction captures the Session identity, unique attempt, base revision, frame, values and versions. Renderer merges a copied/frozen FrameExecution after authored expressions and before its existing cache key. A retry gets a new attempt, including after a failed render. Unrelated Stages retain their existing cache eligibility. Shared values commit only after the requested outlet's checks/composition and post-render source/trust validation succeed. A batch commits each successful frame individually; later file/encoding failure does not undo earlier successful frames. Arbitrary JS/DOM/Worker/file side effects do not roll back.

`close()` now drains accepted requests and rejects new requests. `cancel()` immediately interrupts the backend, including an already waiting close; no late transaction may commit. Renderer.close itself still releases immediately. Source/resource/lock/trust/environment changes, initialization failure, timeouts and Native host loss require a new shared Session; `refresh()` rejects shared reset. Ordinary projects retain their previous invalidation/recovery behavior. Shared Stage-only requests are rejected explicitly.

Existing foreground CLI:

```text
frameweave session project.tsx --frames 100,0,100 --repeat 2 --output new-batches --json
frameweave media frame project.tsx --settings settings.json --frame 5 --output frame.exr --json
frameweave media render project.tsx --settings settings.json --output hdr.mp4 --json
```

`session` supports existing accurate/preview policies, explicit WASM permission and cache options. Professional projects require an explicit media policy through the SDK or `media` settings. Standalone Native frame/render/storyboard exports now use the same formal RenderSession for explicit shared projects. PNG, floating EXR and ordinary MP4/MOV delivery serialize successful frame transactions and explicitly materialize F32 for the existing PME encoder. The resident GPU encoder profile remains explicitly unsupported for shared exports. Interactive resident preview and one-shot inspection do not yet own shared transactions and retain the host-required diagnostic. There is no second official CLI, Renderer or Session.

The low-level Renderer supports immutable `FrameExecution` in PNG/data/media/time/preview outlets for host integrations. Its host-presence guard does not substitute for the DX coordinator, trust checks or publication validation. Shared structured error codes and bounded causes cross the existing RPC/evaluate boundary; Stage/frame attribution comes from the host. CSP and WASM/resource permissions are unchanged.

`modules/shared-state/node.ts` is a deprecated, unsealed historical test helper, excluded from npm. Its create entry delegates to DX. Its fromBuilt fixture is not a public runtime API. Historical `V_SHARED_*` reports document the earlier prototype; see the Main integration report for current acceptance results.

## Native execution restored

`SharedStage` retains its existing explicit JSON dependency edges. A Native writer may return `sharedFrame(...).outputs({calls})` without fabricating an image; a reader may return `sharedFrame(...).outputs({surface, seen})`. The existing Native scope transports image leases and JSON in separate typed ports; GPU images never enter shared cells or CPU PortValues. Native public frame results expose JSON `stageOutputs`; the composed final image is returned as PNG or `ProfessionalFrame.surface`. No per-Stage CPU surfaces are fabricated.

Native prepared-frame reuse includes the immutable FrameExecution identity. Native shared output values are not frame-number memoized; `cacheHits` remains zero for those evaluations. Repeated and out-of-order requests advance accepted shared history, while a new Session starts from declared initial values. Failed attempts discard cell drafts; ordinary JavaScript variables are not rewound. Root-level shared transactions are supported; nested Stage transaction domains remain a separate orchestration integration.

RenderSession automatically resolves the provenance-checked Native executable. Optional `nativeGpu: {executable, maxBytes, resourceLimits, rayQuery}` configures existing host policies without granting Stage permissions; `nativeStats()` reads actual owner diagnostics through the same Session queue. Explicit WASM authorization and resource/package seals are unchanged.

Reproduce focused checks with `node scripts/verify-native-shared.mjs core` and `node scripts/verify-native-shared.mjs integration`. All attempts append to one bounded ledger in `artifacts/native-shared/campaign.json`; do not reset that ledger to exceed its budget.
