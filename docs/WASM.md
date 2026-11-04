# Rust WASM in isolated Web Stages

For reusable module authoring, see the [Rust/WASM Module Development Kit](RUST_WASM_MODULE_KIT.md): a copyable template, pinned Rust build, typed bindings, optional Worker, R1 packaging and portable-export verification. The grayscale example below remains the original C1 execution fixture. [Kit v2](RUST_WASM_MODULE_KIT_V2.md) adds a checked wasm-bindgen adapter using the same authorization and isolation.

WebAssembly compilation is denied by default. A trusted caller can explicitly authorize it for a Renderer or preview session with `allowWasm: true`; omission or false retains the old policy. PreviewOptions inherits the same field from RenderOptions.

```ts
const renderer = await Renderer.create(build, {allowWasm: true});
const preview = await startPreview(entry, {allowWasm: true, open: false});
```

One CLI flag, `--allow-wasm`, covers frame/storyboard/preview-clip/render and direct interactive preview:

```powershell
npm run frameweave -- frame examples/wasm-grayscale/project.tsx --frame 12 --allow-wasm --output artifacts/wasm/frame.png
npm run frameweave -- render examples/wasm-grayscale/project.tsx --allow-wasm --output artifacts/wasm/demo.mp4
npm run frameweave -- examples/wasm-grayscale/project.tsx --allow-wasm
```

API values must be boolean; strings/numbers/null fail with E_ARGUMENT. The flag takes no value: `--allow-wasm true` is invalid. Unknown CLI flags fail explicitly. Older CLIs reject the new bare flag; upgrade an older host rather than weakening its policy. Untyped calls into an older JS API cannot be retroactively validated by this release; its old CSP still denies WASM. New plugin runtime pins prevent silently substituting a different SDK.

## CSP and isolation

The chain is RenderOptions / PreviewOptions → Renderer → startRenderServer → the CSP response for `/stage/<id>.html`. Enabled sessions add only `'wasm-unsafe-eval'` to the existing Stage `script-src`. Blob Workers inherit that policy. The parent host page's CSP is unchanged. The explicit policy also enters the renderer cache fingerprint.

No ordinary `'unsafe-eval'`, `allow-same-origin`, filesystem access, external network source, new resource route, Service Worker, shared memory or GPU host is added. JS eval/Function stay blocked. Each Stage retains its independent BrowserContext and opaque sandbox iframe, initialization/render deadlines, resource whitelist and JSON/PNG boundary. This authorizes trusted code to compile WASM; it is not a malicious-code certification or an OS memory/CPU sandbox.

## Existing resources and lifecycle

The demo declares `grayscale.wasm`, `grayscale.js` and prebuilt `worker.js` as file Resources. Copying, hashes, URL allowlisting and P4 content/runtime locks are unchanged. The loader does not download dependencies or install packages. There is no new direct `.wasm` import loader or Rust/TS Worker compiler.

The Stage loads the declared classic JS glue using a script element. A direct client fetches/validates/instantiates Rust during async initialization. A Worker client fetches the declared worker, creates a Blob Worker using the existing rule, then supplies declared absolute glue/WASM URLs. Errors reject pending calls; renderAt awaits results before returning.

Rust owns one bounded RGBA8 buffer per instance, computes integer grayscale with alpha preserved, reports checksum/live allocations, and frees on disposal. JS recreates views after allocation, copies out borrowed memory, rejects use after disposal and drops instance references. Worker cleanup acknowledges Rust release, closes/terminates the Worker, rejects pending calls and revokes its Blob URL. Failed initialization terminates the Worker; a stuck initialization is stopped by the existing host context deadline. A stuck Worker cannot cooperate with free; context destruction is the hard stop. WASM free does not promise immediate return of linear-memory pages to the OS.

## Compatibility and limits

TVG 0.1, P4 Manifest/API 1, parameters, keyframes and analysis are unchanged. A real P4 v1 fixture carries these resources, uses existing async lifecycle and verifies that modified WASM bytes cause E_PLUGIN_LOCK. P4-R1 packages use this same explicit host authorization. A package capability declaration describes its WASM requirement and never enables compilation by itself; its package/resource integrity checks remain active.

`tests/wasm.test.ts` covers real Rust provenance/compute/free, default and explicit CSP, actual JS eval and opaque isolation, independent instances, Worker errors/termination, invalid/missing resources, init timeout, P4 integrity, CLI/preview and unchanged ordinary pixels. Windows Chromium is tested. Firefox/Safari/mobile, generated wasm-bindgen glue, Emscripten, WASI, SIMD and multithreaded WASM are outside this raw-ABI demo's coverage.
