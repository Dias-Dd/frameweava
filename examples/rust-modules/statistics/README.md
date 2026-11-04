# Frameweave Rust/WASM module

This copied tree is editable and has no dependency on C1's grayscale demo or its directory.
Apache-2.0; the shim and lifecycle adapter derive from Frameweave's C1 pattern.
The two starter algorithms are test fixtures, not production effects.

Use Node >=22 and the reviewed Frameweave checkout with its own dependencies.
When outside that checkout, set FRAMEWEAVE_ENGINE_ROOT to it. Nothing here installs or downloads compilers, npm packages, targets or models.
Set RUSTC if an installed rustc is not on PATH. The exact compiler pin is in module.config.json.
Provision wasm32-unknown-unknown yourself; FRAMEWEAVE_RUST_SYSROOT / FRAMEWEAVE_RUST_LINKER can select an isolated target and linker.

```powershell
node module.mjs build
node module.mjs types --check
node module.mjs test
node module.mjs test --browser
node module.mjs pack --output .frameweave/reviewed-package
```

Build invokes rustc without Cargo dependencies, generates types from the official P4 Schema v2 manifest,
bundles the Worker and shared glue with the engine's esbuild, validates the ABI and typechecks entry points.
dist/build.json contains compiler/source/output hashes with no timestamps or local paths.
With the same reviewed toolchain/dependencies, build twice and compare those bytes.
Compiler changes, standard-library builds and cross-platform codegen may change output; the pin is not a universal reproducible-build guarantee.

`test` verifies hashes/types and runs independent byte vectors against actual Rust.
`test --browser` additionally creates an isolated local package/project, checks default CSP rejection,
renders random frames and a real MP4, and leaves evidence under .frameweave/kit/smoke-*.
Pack makes an ordinary P4-R1 package directory, not a new archive or package manager. It refuses overwrites.
Installation and effects locking remain explicit review operations:

```powershell
# From the engine root; substitute the package and project paths and the declared local authority.
npm run frameweave -- packages inspect <package> --project <project.tsx>
npm run frameweave -- packages install <package> --project <project.tsx> --trust local:your.reviewed.source
npm run frameweave -- effects lock --project <project.tsx>
npm run frameweave -- packages verify --project <project.tsx>
npm run frameweave -- render <project.tsx> --allow-wasm --output artifacts/module.mp4
```

`demo/project.tsx` is the exact-version TSX example. Install the package into its demo directory before using it.
For typed authoring, generated/types.ts exports `Parameters` and `use`; the type comes from
`ManifestParameters` in the existing SDK, rather than a competing parameter schema.

Portability: use `export <project.tsx> --output <new-directory>` or
`export <project.tsx> --single-file --layout capsule --output <chosen-name.tsx>`.
Current flat TSX export rejects package module loaders with E_FLAT_EXPORT; it must not silently drop
WASM/Worker files. A capsule includes those bytes and locks, but still requires the pinned SDK,
browser and explicit --allow-wasm. It is not a universal zero-install standalone HTML app.

Three distinct layers: Rust's optional bytes-v1 ABI; TS glue/client binding; P4's Manifest/API 1,
parameterSchemaVersion 2 and R1 core-v1 package format. Changing one does not rename the others.
bytes-v1 exports memory plus fw_abi_version/init/alloc/free/call/dispose/buffer_count.
Calls use bounded byte slices and little-endian application packets, with owned copied output.
Negative statuses are Rust errors; JavaScript exceptions carry E_WASM_* codes. Every allocation is freed
in finally. The Worker accepts v1 init/call/diagnostics/dispose messages with request IDs, errors,
deadlines and cleanup; it performs no network imports. Cancel/timeout terminates it.
Direct synchronous WASM cannot be interrupted by AbortSignal mid-call; use a Worker for long calls.

Edit rust/src/algorithm.rs and contract.ts together; supply independent tests/vectors.json.
Keep lifecycle code unchanged when possible. Inputs are at most 16 MiB, output capacity must be explicit.
The image fixture is straight RGBA8; color/alpha contracts remain the existing Stage contract.
There is no GPU/image ABI or second animation system here.

For libraries with a different raw ABI, write a binding adapter. bytes-v1 is optional, not a new engine
requirement. Typical wasm-bindgen modules need generated JS and host imports; current R1 core-v1
denies imports. This tool rejects them explicitly, rather than bypassing that check through raw bytes.
See the kit ABI guide for a separately reviewed compatibility proposal before using such modules.
Do not hand-write replacements for generated wasm-bindgen memory/heap ownership conventions.
