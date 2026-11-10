# Current Native host

SpiderMonkey is the sole Native Stage logic host. Chromium/V8 selection, browser fallback and the old reference-loader integration patches are removed. The installed runtime resolves its binary and unchanged provenance receipt in `native-bin/<platform>-<arch>`; explicit `FRAMEWEAVE_SPIDERMONKEY` remains available.

Real React/reconciler, deterministic time, binary commands, sealed module bytes, WASM opt-in, failure propagation and cleanup remain. Windows uses AppContainer. Linux x64 uses Bubblewrap and seccomp. Node still evaluates the top-level compilation manifest. Servo separately handles HTML/CSS/DOM drawing.

## Linux x64

Use a glibc system with `/usr/bin/bwrap`, enabled unprivileged user namespaces,
and libseccomp. Debian uses the `bubblewrap` and `libseccomp2` runtime packages,
plus `libseccomp-dev`, a C++ toolchain and Rust for building. Supply the reviewed
Mozilla static archive from [UPSTREAM.json](UPSTREAM.json) and provision the locked Cargo dependencies.

```sh
MOZJS_ARCHIVE=/absolute/path/libmozjs-x86_64-unknown-linux-gnu.tar.gz node modules/spidermonkey-host/build.mjs
FRAMEWEAVE_SPIDERMONKEY="$PWD/.frameweave/spidermonkey-target/debug/frameweave-spidermonkey-host" \
  node --import tsx --test tests/spidermonkey-linux.test.ts
```

The build verifies the archive SHA-256 and runs Cargo offline with its lock.
The broker launches the worker in separate user, mount, PID and network
namespaces. The private root exposes the verified executable and read-only
system libraries. The worker verifies those namespaces and applies memory,
process and syscall restrictions before evaluating authored code. Project
files and credentials remain outside the worker. Use an executable temp
directory via `TMPDIR` if the default system temporary filesystem is mounted
`noexec`.

See [Native-only migration](../../docs/NATIVE_ONLY_MIGRATION.md),
[MODULE_RESOURCES.md](MODULE_RESOURCES.md) and [THIRD_PARTY.md](THIRD_PARTY.md).
Validation covers Windows x64 and Debian 13 x64 in WSL2. Public binary
redistribution and macOS isolation are pending.
