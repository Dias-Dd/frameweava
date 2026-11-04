# Native-only runtime

This breaking change removes the Chromium/Playwright runtime, Chromium/V8
logic transport, Web Stage adapter, PNG compatibility bridge, browser
compositor/presentation server, browser SDK export and browser installation
command. The dependency lock no longer includes Playwright, React DOM or Pixi.
It does not uninstall a user's system browsers or delete other worktrees.

The execution path is TSX compilation → SpiderMonkey logic → the existing
Native GPU owner. HTML/CSS/DOM content uses the optional Servo effect module
within a Native Stage. Native effects can precede and follow Servo in the same
Stage. Native-only projects load neither Chromium nor Servo.

`engine="web"`, old DOM factories, declarative browser Stage children and Web
package bindings fail explicitly. They are not converted to Servo or silently
executed by Node. `/web` and the former browser builtin effects are retired.
Shared GPU/Surface types are exported from `@frameweave/engine/native`.
Generic non-DOM CPU/data contracts use `StageFactory`/`StageInstance`.
The existing Native Stage, Audio Stage, PortRef and TVG schema remain in use.

## Creation and execution

```powershell
frameweave init my-project
frameweave my-project/project.tsx --width 640 --memory-mib 2048
frameweave frame my-project/project.tsx --frame 12 --output frame.png
frameweave render my-project/project.tsx --output video.mp4
frameweave doctor --json
```

The runtime must contain the reviewed Native GPU and SpiderMonkey binaries for
the platform, with their unchanged provenance checks. `FRAMEWEAVE_NATIVE_GPU`
and `FRAMEWEAVE_SPIDERMONKEY` can select explicitly provisioned binaries.
The installed package also resolves SpiderMonkey from its own `native-bin`.
Browser executable options and `browser install` are removed. Native preview
keeps Main's explicit `--memory-mib` admission budget; it never silently raises
the budget or falls back to a browser.

WASM is denied by default in SpiderMonkey. `--allow-wasm` remains a strict,
explicit authorization for that host. It does not enable Servo WASM, network
access, Node globals or arbitrary browser APIs. Node remains the CLI/compiler
process; authored Native Stage logic executes in SpiderMonkey.

## Compatibility and package identities

Native algorithms, shaders, floating media formats, audio execution and resource
seals remain. Browser-only effects, WebGL owners, fixtures and browser tests are
retired. Their Native successors and independent numerical references remain.
Browser `PluginStage` execution is removed; Native modules use their existing
managed bindings and typed functions. `effects create` now scaffolds pure
functions only; generator/image browser templates fail explicitly.

`native-image-effects@0.5.0` updates the public SDK import path. This is new
package content, not a replacement of an installed 0.4.0 snapshot. Existing
package locks and SDK Runtime Pins are never refreshed automatically. Review
and explicitly install/lock the new identities after integration. R1's retained
`platforms: ["web"]` is existing serialized portable-JS package metadata; it
does not authorize a Web Stage. Only Native execution bindings are admitted.
The bundled catalog now contains Native bindings, not legacy browser packages.

The old Rust/WASM browser template initializer is retired. Rust sources, byte
ABIs, bindings, license/build utilities and Native solver WASM remain. A new
Native authoring template is not claimed. The old Chromium face-analysis
adapter reports `E_ANALYSIS_RUNTIME_REMOVED`; brightness/C3 analysis remains.

## Servo boundaries

Servo retains its reviewed-local content profile and GPU interop. Its internal
BGRA8 cache is explicitly SDR; returning F32 does not restore HDR detail. Render
an independent Servo overlay over a Native HDR background when appropriate.
Arbitrary React DOM frameworks, WebGL programs, asynchronous per-frame DOM
updates and Servo WASM are not newly qualified by removing Chromium.

Windows x64 is the qualified native platform in this checkpoint. Linux/macOS
and public binary redistribution are not qualified. SpiderMonkey's MPL source
and linked-dependency notice assembly still requires Main's distribution review
before a public release; local tarball testing is not a publication approval.

## Validation

See `modules/native-gpu/validation/native-only-checkpoint/result.json` for the
exact source state, commands, durations, failures and untested scope. Media
verification includes real Servo PNG, floating EXR and decoded MP4, with HDR
outside the overlay equal to `[2, -0.25, 0.5, 1]`. Final encoding materializes
pixels explicitly; this is not a zero-copy encoder claim.
