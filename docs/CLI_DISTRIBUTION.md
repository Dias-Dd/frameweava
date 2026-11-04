# Native CLI distribution

Chromium and Web Stages have been removed. See [Native-only migration](NATIVE_ONLY_MIGRATION.md) for execution, removed commands, Servo limits and explicit lock migration.

Build from this checkout with `npm run build:distribution`, then use `npm pack ./dist --pack-destination artifacts` and install that tarball in the target project. Supply the reviewed production Native GPU build and SpiderMonkey host/receipt before building. The builder carries these platform binaries and verifies their source/binary receipts. It does not download a browser or compiler.

The tarball is for local validation until Main completes the native binary distribution/license assembly. Servo remains separately provisioned through `FRAMEWEAVE_SERVO_RUNTIME`; it is optional and its DLLs are not silently bundled.

For a GitHub Release, set `FRAMEWEAVE_OFFICIAL_CATALOG_URL` on the **build machine**
to the exact HTTPS URL of a versioned Release asset ending in `.json.gz` before
building the distribution. Upload the reported `officialCatalogAsset` alongside
the npm tarball. The distribution carries the GitHub URL, archive SHA-256 and
each package's fingerprint. Installed `packages install <name>` uses that
published catalog and stores packages under the Frameweave installation.
Without a release pin, a source checkout uses its local catalog. Use the normal
source approval argument on initial installation of a package authority.

Use `frameweave --version`, `frameweave doctor --json`, `frameweave init scene`, `frameweave scene/project.tsx`, `frameweave frame scene/project.tsx --output frame.png`, and `frameweave render scene/project.tsx --output video.mp4`. `--allow-wasm` authorizes SpiderMonkey only. No global tsx installation or source checkout is required at runtime.

`FRAMEWEAVE_HOME` selects the writable user library/cache. On Windows, use a short absolute path for ONNX models, for example `C:\fw-home`; existing model hashes remain mandatory. Native binaries and Servo have only been qualified on Windows x64. No Linux/macOS or public-release claim is made.
