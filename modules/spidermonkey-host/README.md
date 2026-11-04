# Current Native host

SpiderMonkey is the sole Native Stage logic host. Chromium/V8 selection, browser fallback and the old reference-loader integration patches are removed. The installed runtime resolves its binary and unchanged provenance receipt in `native-bin/<platform>-<arch>`; explicit `FRAMEWEAVE_SPIDERMONKEY` remains available.

Real React/reconciler, deterministic time, binary commands, sealed module bytes, WASM opt-in, AppContainer isolation, failure propagation and cleanup remain. Node still evaluates the top-level compilation manifest. Servo separately handles HTML/CSS/DOM drawing; it does not replace this logic host.

See [Native-only migration](../../docs/NATIVE_ONLY_MIGRATION.md), MODULE_RESOURCES.md and THIRD_PARTY.md. Windows x64 is qualified; public binary redistribution and other OS sandboxes are not qualified. Earlier reference-loader instructions in Git history are not current setup instructions.

## Build from source on Windows x64

Prepare the locked Rust/Cargo dependencies and the official archive identified in `UPSTREAM.json`. The build verifies the archive SHA-256. From the repository root, point `MOZJS_ARCHIVE` at that file and run `node modules/spidermonkey-host/build.mjs --release`. Point `FRAMEWEAVE_SPIDERMONKEY` at the resulting host executable for source-checkout use. See `THIRD_PARTY.md` for license and redistribution information.
