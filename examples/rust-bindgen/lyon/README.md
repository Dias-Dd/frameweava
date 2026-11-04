# wasm-bindgen data profile (Kit template 2)

This tree is independent of bytes-v1. It uses normal wasm-bindgen ownership and generated types,
not a hand-written pointer ABI. The P4/R1 schema/API remain v1, P4 parameters v2.

Setup: installed Rust 1.99.1, wasm32-unknown-unknown, an installed Cargo host linker, Node >=22,
the reviewed Frameweave SDK checkout and wasm-bindgen CLI 0.2.129. Set FRAMEWEAVE_ENGINE_ROOT
outside the checkout; RUSTC/CARGO/WASM_BINDGEN can select reviewed installed tools.
The SDK's explicit `node tools/rust-wasm-kit/provision-bindgen.mjs` downloads only the pinned,
SHA-256 checked official Windows x64 CLI. Other platforms use a reviewed installed CLI.
No runtime download or implicit tool installer exists.

```powershell
node module.mjs fetch                 # Explicit, Cargo --locked; reviewed crates.io checksums
node module.mjs build                 # Cargo --locked --offline + pinned bindgen + audited bundle
node module.mjs types --check
node module.mjs test
node module.mjs test --browser
node module.mjs pack --output .frameweave/reviewed-package
```

`lock` is the separate, deliberate Cargo lock generation/update command. Review Cargo.lock
after changing dependencies; build/fetch never silently regenerate it. CARGO_HOME defaults
to this module's private .frameweave directory. FRAMEWEAVE_CARGO_TARGET_DIR can choose a short
worktree-local cache. On Windows GNU, configure CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER
to a working installed linker; Rust's own rust-lld may avoid an old MinGW shadowing it.
FRAMEWEAVE_RUST_SYSROOT / FRAMEWEAVE_RUST_LINKER select an already-reviewed wasm target/linker.

Edit normal Rust #[wasm_bindgen] wrappers around a real crate, not a new WASM Host. The starter
exports class Engine with a no-argument constructor and primitive/typed-array methods, plus
live_sessions for explicit free verification. Generated/api.ts derives its public function
types from bindgen's .d.ts, handles imports/Memory/free/RPC and returns an async API.
generated/p4.ts derives use()/parameters from the existing P4 Schema v2. Agent metadata is
generated/agent-api.json; it is a package file, not a registry.

Imports are restricted by import-policy.json (exact generated intrinsic body hashes) and
module.config.json (declared, hash-pinned data-only snippets). Build rejects ambient browser
or network globals, eval/Function, dynamic imports, uncollected snippets and unsupported
intrinsics. Review a new intrinsic/source hash rather than bypassing these gates.
The raw async glue is carried for audit as data; only the tree-shaken initSync factory runs.
It receives verified bytes, never an inferred URL. A fresh factory owns every client instance.

R1's ordinary resource loader verifies WASM, factory source, snippets, declarations and Worker
bytes. The package deliberately does not label imported WASM core-v1. The core-v1 loader
continues to reject imports. This checked JS adapter uses the already-authorized C1 capability.
Only the host --allow-wasm enables compilation. Neither unsafe-eval nor allow-same-origin is added.

The Worker is one prebuilt bundle and performs no fetch/importScripts. Init has a bounded
timer; render calls retain the Stage's existing deadline. Abort terminates the Worker;
dispose calls generated free, checks live_sessions, rejects pending work and revokes its Blob URL.
Direct synchronous WASM cannot be preempted in the same JS thread. Free does not shrink all heap pages.

Use existing packages install/verify/restore and effects lock. Review the source authority
before installation. demo/project.tsx uses the exact P4 reference and needs that local install.
Export a directory or --single-file --layout capsule; flat managed-loader export remains an
explicit E_FLAT_EXPORT. Carried bytes/locks still require the pinned SDK, browser and --allow-wasm.

Source and generated hashes, Cargo.lock, dependency notices, compiler/generator versions and
CLI hash are carried. .frameweave/last-build-metrics.json holds variable timing separately
from reproducible provenance. No compiler, registry cache or target build output is packaged.
Changing Rust/crates requires review of licenses/ and pinned source metadata.

The supported profile is synchronous data computation with reviewed callbacks, not arbitrary
DOM/Node/WASI/async networking/JS functions passed by users, Emscripten, SAB threads or GPU ABI.
It inherits Frameweave's trusted-code model; static policy is not an adversarial JS sandbox.
