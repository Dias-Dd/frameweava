# Rust grayscale in direct and Worker Stages

The left 64×64 Stage runs Rust directly. The right Stage uses a dedicated Worker and independent Rust instance/Memory. Both generate the same input from FrameContext and yield matching pixels/checksums for sequential and out-of-order requests.

```powershell
npm run frameweave -- examples/wasm-grayscale/project.tsx --allow-wasm
npm run frameweave -- frame examples/wasm-grayscale/project.tsx --frame 12 --allow-wasm --output artifacts/wasm-c1/frame-12.png
npm run frameweave -- render examples/wasm-grayscale/project.tsx --allow-wasm --output artifacts/wasm-c1/demo.mp4
```

Without authorization, the existing CSP denies compilation. See [the execution policy](../../docs/WASM.md).

## Compile the included real Rust source

With Rust and its wasm32-unknown-unknown target available:

```powershell
rustup target add wasm32-unknown-unknown
node examples/wasm-grayscale/build.mjs
```

The script calls rustc directly with no external crates, package downloads or wasm-bindgen dependency. RUSTC can select a compiler outside PATH. FRAMEWEAVE_RUST_SYSROOT / FRAMEWEAVE_RUST_LINKER optionally select workspace-local target libraries and linker. Cargo.toml describes the equivalent library for Rust tooling; the script is the canonical asset build command.

`assets/build.json` records the actual compiler, flags, source/binary SHA-256 and ABI version. The included asset is 27,551 bytes compiled from Rust, not a tiny hand-authored add module. Different compiler releases can generate different bytes; rebuilding updates provenance. Tests independently verify source/binary hashes, computation and allocation release.

`grayscale.js` is small audited glue for this explicit ABI, and `worker.js` is a prebuilt classic Worker. Both use existing Resources. The example-local client is not a new engine ABI or WASM manager. Its canvases use explicit block layout.
