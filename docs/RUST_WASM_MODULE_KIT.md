# Rust/WASM Module Development Kit v1

This kit adds authoring tools, not a new runtime or package manager. Start at
`tools/rust-wasm-kit/kit.mjs`; a generated module contains its own build/test/pack
scripts. No files under `src/`, package CLI, Stage, animation, GPU ABI or AnalysisTask
need modification. All module execution still requires C1's explicit `--allow-wasm`.

## Quick start for a new Agent

Use the reviewed Frameweave checkout and its installed dependencies. Read the generated
README before building. You must supply the reviewed local authority: it is provenance,
not a remote service or a trust certificate. No command downloads tools or adds trust globally.

```powershell
node tools/rust-wasm-kit/kit.mjs init work/my-stats --id studio.my-stats --authority studio.reviewed --example statistics
node work/my-stats/module.mjs build
node work/my-stats/module.mjs test --browser
node work/my-stats/module.mjs pack --output work/reviewed-my-stats

# demo/project.tsx already calls the exact version. Review the package first.
npm run frameweave -- packages inspect work/reviewed-my-stats --project work/my-stats/demo/project.tsx
npm run frameweave -- packages install work/reviewed-my-stats --project work/my-stats/demo/project.tsx --trust local:studio.reviewed
npm run frameweave -- effects lock --project work/my-stats/demo/project.tsx
npm run frameweave -- packages verify --project work/my-stats/demo/project.tsx
npm run frameweave -- render work/my-stats/demo/project.tsx --allow-wasm --output artifacts/my-stats.mp4
```

`--example rgba` selects the image-input starter. Both recipes copy the **same**
Rust shim, binding, Worker, builder, test harness and R1 packaging flow. `--execution
direct|worker` chooses execution in the authored adapter; it does not authorize WASM.
`--version` and `--rustc` set initial pins. Existing directories are never overwritten.
The supplied recipes are small test modules, not a new visual-effects catalogue.

If the module is outside this checkout, set `FRAMEWEAVE_ENGINE_ROOT` explicitly.
Set `RUSTC` to an installed compiler if needed. Provision the reviewed
`wasm32-unknown-unknown` target yourself. `FRAMEWEAVE_RUST_SYSROOT` and
`FRAMEWEAVE_RUST_LINKER` optionally select workspace-local files. The tool never
runs rustup, installs Cargo crates, invokes a package download or changes a global toolchain.
Use a worktree-local `FRAMEWEAVE_HOME` when running tests that write the user library.

Edit `rust/src/algorithm.rs`, its explicit packet codec in `contract.ts`, the official
`effect.json` parameters, and independent `tests/vectors.json`. Then rebuild and run
tests. Keep common lifecycle code unchanged unless the module needs a reviewed adaptation.

## Audit of existing foundations

| Existing source | Reused capability / boundary |
| --- | --- |
| `examples/wasm-grayscale/client.ts`, `assets/grayscale.js`, `assets/worker.js` | C1's async initialization, independent instance ownership, request IDs, transferred byte buffers, failure propagation and dispose/terminate/revoke pattern. Its grayscale names, fixed buffer, global glue function and algorithm were not copied into the new contract |
| `src/core/types.ts::RenderOptions`, `src/render/server.ts::startRenderServer`, `src/render/renderer.ts::Renderer.create`, `src/preview/server.ts::startPreview` | Already implement the one explicit WASM authorization; no new toggle or CSP modification |
| `src/web/clock.ts::CLOCK_SCRIPT` | Frame evaluation forbids creating Stage timers. Client starts a timer only during Worker initialization; frame requests use the existing host timeout |
| `src/render/web-adapter.ts`, `src/web/bootstrap.ts` | Existing init/render/dispose, error attribution, BrowserContext/opaque iframe and timeout cleanup |
| `src/plugins/sdk.ts::PluginManifestV2/ManifestParameters/defineEffect`, `src/plugins/parameters-v2.ts` | The sole parameter schema and nested animation semantics. Generated types derive from this SDK; no new interpolation, array identity or signal format |
| `src/packages/manifest.ts::validatePackage/readPackage`, `manager.ts::installPackages/restorePackages/verifyPackages` | R1 manifest, canonical content hash, module hashes, trusted local snapshots, immutable versions and frozen locks |
| `src/packages/runtime.ts::packageModuleLoader` | Declared-module loading, Stage-local cache, browser SHA-256 validation and core-v1 host-import rejection |
| `src/compiler/build.ts`, `src/plugins/compiler.ts` | Existing TS/TSX graph, required type gate, declared resources and package runtime/module bundling |
| `src/compiler/export.ts::exportProject`, `flatten.ts::exportFlatProject`, `portable.ts` | Source-tree and embedded capsule export; explicit E_FLAT_EXPORT for managed module loaders |

Unlike the C1 demo, the kit does not use ambient global glue or relative Worker imports.
The browser client asks R1 for the declared `bytes` and `worker` resource modules.
Their hashes are checked before any transfer. The direct path also instantiates its own
verified bytes, because R1's `wasm` module loader caches an instance per Stage: two uses
of one plugin must not accidentally share an allocation map. Both instantiation paths
explicitly enforce the current zero-host-import rule. The package also declares its
`core` WASM module with the existing `core-v1` ABI and `producer: rust`.

## Three contracts, not one

| Layer | Version / purpose |
| --- | --- |
| Rust internal ABI | Optional kit `bytes-v1`: export names, ownership and byte-call status. Only this binding requires it |
| TS binding / Worker | `runtime/session.mjs`, typed `runtime/client.ts`, application `contract.ts`; Worker message revision `v:1` |
| Frameweave public API | Existing P4 Manifest schemaVersion 1 / apiVersion 1, parameterSchemaVersion 2, R1 package schema/API 1, R1 `core-v1`; unchanged |

`core-v1` is R1's import-free core WASM format; it is **not** an assertion that every
Rust module exports bytes-v1. Other raw libraries can use an application-specific
binding while retaining the same package/resource/lifecycle mechanisms. Do not label
an arbitrary wasm-bindgen binary bytes-v1 or manually translate its ownership scheme.

## bytes-v1 ABI and ownership

All pointers, operation IDs, lengths and capacities are wasm32 unsigned i32 values.
The shim bounds individual buffers to 16 MiB. Pointers are identities of Rust-owned
boxed byte slices, never caller-owned allocations. A module instance owns its map and
initialization state. There are no imports, shared memory, background simulation or threads.

| Export | Contract |
| --- | --- |
| `memory` | WebAssembly.Memory, not shared; recreate JS views after allocation/growth |
| `fw_abi_version() -> u32` | Must equal 1 before initialization |
| `fw_init() -> i32` | 0 on success, -1 if already initialized |
| `fw_alloc(len:u32) -> u32` | Nonzero pointer or 0 for invalid size / uninitialized state. OOM may trap; it is not a quota guarantee |
| `fw_free(ptr:u32) -> i32` | 0 releases exactly one owned allocation, -2 for an unknown/already-freed pointer |
| `fw_call(op,inPtr,inLen,outPtr,capacity) -> i32` | Nonnegative number of output bytes, at most capacity; negative application status. Buffers must be distinct and lengths match allocations. Empty input is pointer 0 / length 0 |
| `fw_buffer_count() -> u32` | Live owned allocation count for diagnostics/tests, not total heap bytes |
| `fw_dispose() -> i32` | Clears owned buffers and application initialization state; 0, idempotent |

Status values: -1 uninitialized, -2 invalid buffer/length, -3 unsupported operation,
-4 malformed packet/value, -5 insufficient output capacity. `algorithm::run` can add
documented negative statuses; it must never report success above capacity. No string
pointer, object serialization or automatic JSON marshalling is implicit.

The binding allocates input and output, copies input after both allocations, calls Rust,
copies output into an owned Uint8Array and releases temporary allocations in `finally`,
including negative statuses. Errors carry stable `E_WASM_*` codes. A trap can invalidate
application state: treat it as fatal to that instance; cleanup still attempts release,
and the host/context is the final boundary if Rust cannot cooperate. Freeing buffers
does not shrink linear-memory pages or prove that process memory was returned to the OS.

Application packets are explicit:

- Statistics op 1: little-endian f32 gain + 1..256 f32 samples; output f32 sum, mean,
  min, max. Finite values are required. The fixed vector gain=2, samples=[1,2,3]
  must produce [12,4,2,6].
- RGBA op 1: little-endian f32 gain + u32 RGB invert mask + straight RGBA8 pixels;
  output is RGBA8 with unchanged alpha. It validates gain [0,2] and mask [0,7].
  These CPU pixels use the existing Canvas/P4 image boundary; no GPU ABI is introduced.

## Worker messages and lifecycle

Requests are `{v:1,id,method,...}`; ID is a positive safe integer. Responses are
`{v:1,id,result}` or `{v:1,id,error:{code,message}}`. Supported methods:

| Method | Payload / result |
| --- | --- |
| init | Transferred verified WASM ArrayBuffer; returns true after compile, ABI check and init |
| call | operation, transferred input ArrayBuffer, output capacity; returns transferred owned output ArrayBuffer |
| diagnostics | Returns allocation count and disposed state |
| dispose | Rust cleanup acknowledgement `{remainingBuffers:0}`, then self.close |

The generated Worker is a self-contained esbuild IIFE including shared glue. It fetches
no URLs, calls no importScripts, and has no path relative to its original source directory.
The client revokes its Blob URL on init failure, cancellation, protocol failure or disposal.
Errors reject the associated request; fatal Worker errors reject all pending requests.
Dispose prevents new calls, awaits cleanup then terminates; repeated dispose is safe.

`initializationTimeoutMs` is an adapter-local init budget, not another Stage time model.
Render calls use the host's `RenderOptions.timeoutMs`; the client schedules no frame timer.
AbortSignal terminates Worker work immediately. Direct synchronous WASM cannot be
preempted by an event in the same JS thread: choose Worker execution for long operations.
An uncooperative call or free ultimately needs host context teardown. No automatic retries
are performed, and no partial result is published as successful.

## Build, types, tests and packaging

| Module-local command | Responsibility |
| --- | --- |
| build | Validate current manifests, generate SDK-derived types, invoke the pinned installed rustc, bundle Worker/glue, verify actual WASM exports and types, record inputs/outputs |
| types / types --check | Generate/check types from effect.json and run the real engine typechecker |
| test | Verify build input/output hashes and ABI, typecheck, execute independent byte vectors against real Rust, test allocation/error cleanup |
| test --browser | Also pack into a temporary local snapshot, install via R1, explicitly lock, prove default CSP denial, render out-of-order PNGs and fully decoded MP4 |
| pack [--output new-directory] | Verify types/build/ABI, collect the complete explicit runtime + rebuild source tree, and ask existing readPackage for canonical R1 integrity. It does not install or authorize the package |

The collected directory is typechecked and its relative JS import graph is checked by
esbuild without execution. This also catches missing side-effect imports, which the
existing TypeScript configuration intentionally does not reject by itself. Excluded
development files or imports escaping the package produce E_KIT_DEPENDENCY.
The resulting directory is an ordinary P4-R1 package. R1, not build.json, defines its
trusted identity and immutable content. A build record is provenance/staleness checking,
not a signature. Pack refuses overwrite; rebuild a reviewed version into a fresh directory
or publish a new version. No second lock resolver, registry or install database exists.

Types are emitted as an `as const satisfies PluginManifestV2` manifest plus
`ManifestParameters<typeof manifest>` and the existing Schema v2 `defineEffect(manifest).use`.
This preserves optional nested defaults and required top-level parameters. ABI function declarations
describe the chosen binding, while `contract.ts` describes application packets. Parameters
are still authored and animated by existing P4 v2 mechanisms. Arrays retain existing index
semantics; this kit makes no stable-identity or new interpolation promise.

The rustc pin defaults to 1.99.1 and may be explicitly selected at initialization. A wrong
installed version fails with E_KIT_TOOLCHAIN. The canonical build uses direct rustc with no
external crates; Cargo.toml is the equivalent project description, not an implicit download
path. Rust sources and declarations are carried. No generated npm binary is fetched.
`dist/build.json` has no time or machine path and records actual compiler hash, target,
flags, esbuild version and source/output SHA-256. Prefix remapping removes the module's
absolute path. Repeated local builds are tested byte-for-byte; different rustc releases,
LLVM/linker/standard-library builds or host platforms can change bytes. The compiler string
alone is not a signed toolchain identity. Keep independently verified toolchain provenance.

## Portable export and diagnostics

Source-tree exports and `--single-file --layout capsule` preserve the installed R1
package tree, Worker JS, glue, WASM, resources, licenses, package locks and SDK requirement.
Both are verified with source packages and the original project/store made unavailable.
They still require the compatible pinned Frameweave SDK, installed JS dependencies and browser.
No network fetch is hidden behind a claim of standalone offline execution.

Plain flat `--single-file` currently rejects these managed loaders with **E_FLAT_EXPORT**;
use a capsule or tree. The required future improvement would retain package loader identity
and verified module bytes in a flat TSX while preserving lock semantics, not just paste source.
This task does not modify the exporter. A remote URL, missing declared resource, oversized
asset or unsupported import must surface through current export/build diagnostics.

## wasm-bindgen compatibility: separate adapter, not bytes-v1 emulation

The upstream generator emits distinct deployment targets and JS/TS/WASM artefacts; its
`generate_web_loading` / generated `initSync` construct an import object and instantiate
the module, while default web initialization can infer a URL from `import.meta.url`.
See the [official deployment guide](https://rustwasm.github.io/docs/wasm-bindgen/reference/deployment.html),
[CLI guide](https://rustwasm.github.io/docs/wasm-bindgen/reference/cli.html) and
[`crates/cli-support/src/js/mod.rs`](https://github.com/wasm-bindgen/wasm-bindgen/blob/main/crates/cli-support/src/js/mod.rs)
(`generate_web_loading`, `__wbg_get_imports`, `initSync`, OutputMode::Web).

Kit v1's bytes-v1 template continues to reject imported WASM (E_KIT_IMPORTS /
E_WASM_IMPORTS); R1 core-v1 still rejects it with E_PACKAGE_PERMISSION.

Kit v2 now provides a **separate, implemented checked adapter**:
[wasm-bindgen data profile](RUST_WASM_MODULE_KIT_V2.md). It preserves generated binding
ownership and collects glue, snippets, declarations and WASM as existing R1 resources.
A reviewed, hash-pinned import profile and initSync factory consume verified bytes;
the public R1 package format and core-v1 loader do not need to change. The earlier v1
proposal that a public R1 ABI extension was necessary is superseded by this working
Kit-local resource/JavaScript adapter. Do not route imported WASM through bytes-v1 or
remove core-v1's import check.

The new profile covers synchronous data methods and reviewed callbacks; it does not
claim universal wasm-bindgen, Emscripten, WASI or threaded compatibility. The v1 template,
its generated formats and memory semantics remain unchanged.

## Sources and licenses

Kit, templates, adapters and both new fixtures are Apache-2.0 under the repository license;
each generated tree contains LICENSE and source attribution. The common lifecycle pattern
comes from Frameweave C1, with R1 verified loading and a new small generic binding replacing
algorithm-specific names. No EffectCraft/Canvix or third-party effect code is imported.
Rust target 1.99.1's verbatim COPYRIGHT / LICENSE-APACHE / LICENSE-MIT and reviewed archive
URL/hash are carried in each module's `licenses/rust-std/`. Review these notices again
when changing the toolchain or adding crates; no compiler binary is redistributed.
Rust compiler/standard-library provenance is recorded separately from module licensing;
esbuild, TypeScript and the engine's existing dependencies retain their own licenses.
Any future Cargo crate, wasm-bindgen glue or third-party model requires its own reviewed
lockfile/source/license inventory; these zero-external-crate templates make no such claim.
