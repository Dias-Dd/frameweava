# Declared module bytes in the Native host

The source host adapter is implemented. The concrete Core hook proposal is
`integration/module-resources-core.patch`; it is **not applied to Core** here.
Main owns its integration, package versions, SDK pin and installed acceptance.

## Contract and admission

`sealedStageModuleResources(build,stageId,{signal,maxBytes,maxResources})` runs
in the trusted Node controller. It checks the existing BuiltProject seal over
manifest + sorted Stage bundles/assets, then snapshots only exact declared file
Resource IDs from the current Stage's compiled `$packages` closure. It uses no
image decode, new registry, network request or authored Node path. Module reads
are bounded, checked again after the seal, and abortable.

The existing `native.init` binary transport carries `moduleResources`. Bootstrap
keeps the snapshot private and supplies an internal `init.readModuleBytes`:

```ts
type Request = {
  version: 1;
  packageRef: string;
  module: string;
  resourceId: string;
  format: 'resource' | 'wgsl' | 'wasm';
  expectedIntegrity: string;
};
// readModuleBytes(request): Promise<Uint8Array>
```

All fields must match an admitted module. Foreign package/module, changed
format/digest or arbitrary URL/path requests reject. There is no `verified:true`
shortcut. The host independently checks SHA-256 using its existing no-IO Rust
digest primitive exposed as `crypto.subtle.digest`; the original ModuleLoader
checks the locked digest again. Its owner/dependency/format/capability checks,
Stage-local cache and JavaScript namespace loader remain authoritative.

The proposal adds this optional callback to the **existing** packageModuleLoader
and passes it through createManagedStage. Browser loading retains its current
fetch branch. Native imports neither fetch nor Node globals into authored JS.

## WASM behavior and Native entry points

Default WASM remains unavailable. Explicit host `allowWasm:true`, the existing
package `wasm` capability for wasm-format loads, and the actual enabled engine
are all required. Core still rejects host/WASI imports. Existing resource-byte
clients get a stable `E_WASM_PERMISSION` before solver instantiation when denied.

The embedded mozjs runtime has no initialized off-thread Promise dispatcher.
`wasm-promises.ts` adapts compile/instantiate to the real synchronous native
Module/Instance constructors and returns the standard Promise/overload shapes.
It does not implement a WASM interpreter. Compilation blocks the isolated host;
controller deadlines/cancellation can terminate it. Streaming APIs are not added.

- Puppet native entry: `createNativePuppetTools(loadModule)` and
  `createNativePuppetProcessorTools(loadModule)`.
- Rigid native entry: `createNativeRigidBodyTools(loadModule)`.
- Deformable native entry: `createNativeDeformableTools(loadModule)`.

These call the original EffectCraft-derived, Rapier and XPBD solver code, with
the existing non-Worker clients inside the OS-isolated SpiderMonkey process.
Original browser defaults are unchanged. Ordinary JS state, solver checkpoints
and GPU buffers remain separate; existing Core FixedStepRunner is reused.

Snapshots default to 48 MiB and 256 module/resource identities, configurable up
to the existing 64 MiB message's practical 63 MiB byte budget. Owned Uint8Array
uses byte tag10 in the **same** host codec, not JSON or u32-per-byte encoding.
GPU protocol/owner/P4 are unchanged. Copies occur on admission, transport decode,
reader ownership, first ModuleLoader load and solver instance creation. No
per-frame module transfer occurs. Physical peak memory is unknown; no zero-copy
claim is made. Stage disposal clears readers after disposing solver instances.
Rejected/cancelled initialization is recreated, not treated as a resumable RPC.

## Verification

```powershell
$env:FRAMEWEAVE_HOME = "$PWD/.frameweave/native-final-home"
node --import tsx --test tests/spidermonkey-module-resources.test.ts tests/spidermonkey-host.test.ts tests/spidermonkey-base64.test.ts
node modules/spidermonkey-host/integration/check-module-resource-types.mjs
node --import tsx modules/spidermonkey-host/validation/module-resources/run.ts
```

The last command uses the exact proposed Core callback in an explicit test
bundle; it never changes Core files on disk. Real SpiderMonkey/Rust-WASM tests
cover five constructors, default denial, explicit grant, independent digest
failure, imports rejection, 100→0→100 and reopened hosts, buffer cleanup and
process exit. The fixture records real Native draw commands but does not execute
them on GPU; installed CLI/R1 and the complete formally wired Renderer path are
pending Main. It does not substitute this fixture for release acceptance.
Raw outcomes, original failures and WASM byte identities are in
`validation/module-resources/evidence`; command logs/times remain in
`../spatial-effects/validation/native-final/evidence` as the same campaign.
