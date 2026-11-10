# Full Windows installation

The full installer carries the application and its supported Windows x64
dependencies. End users do not need Node, npm, Python, Rust, a C++ compiler,
or manually configured runtime paths. A compatible graphics driver remains a
machine prerequisite; installing software does not add missing GPU features.

## Current delivery

The verified local-development bundle is at
`D:\Frameweave-Full-Installer-20261110`. Install it in PowerShell:

```powershell
& 'D:\Frameweave-Full-Installer-20261110\install.ps1' -BundleDirectory 'D:\Frameweave-Full-Installer-20261110'
```

The default destination is `%LOCALAPPDATA%\Frameweava`. Use `-InstallDir D:\Frameweava`
to change it. The script adds `bin` to the user's PATH and its current process.
Open a new terminal if installation was launched in a separate PowerShell
process. Then run `frameweave --version`, `frameweave doctor --json`, or
`frameweave packages list` from any project directory. `-NoPath` leaves PATH
unchanged. Re-running the installer for the active version verifies it and
restores any missing official libraries instead of downloading all runtimes.

Included components:

- Private Node 22.19.0 and frozen JavaScript dependencies.
- Matching production Native GPU and isolated SpiderMonkey hosts, with their
  original byte-sensitive build provenance.
- The existing locally reviewed Servo runtime, Native Media bridge, and
  DirectML ONNX inference runtime; discovery is automatic.
- Embedded Python 3.13.7, NumPy, OpenEXR, OpenColorIO and pyvips/libvips.
- FFmpeg and FFprobe 6.1.1, fetched from the original immutable upstream assets
  when constructing this private bundle, with their licenses retained.
- All eleven current official R1 packages, installed from GitHub with exact
  versions, archive hashes, package hashes and explicit recorded source trust.
- The pinned multilingual MiniLM q8 model and tokenizer for offline semantic
  search, plus the small ESPCN super-resolution model and editable example.

The six installation archives total about 495 MiB. Their combined installed
footprint is larger: runtimes and models are unpacked, and libraries are
installed separately. This is the full runtime bundle size, not the 37 MiB
installed effect-package snapshot size.

## Public download is deliberately blocked

**This is a local-development full bundle, not a qualified public binary release.**
The existing Servo delivery explicitly records unqualified ANGLE binaries and
unqualified embedded mozjs static inputs. See
`modules/servo/THIRD_PARTY_NOTICES.md` and `modules/servo/native/upstream.json`.
Its source/build and third-party redistribution records must be completed
before these binaries can be placed in a public GitHub Release. The separate
SpiderMonkey host also needs its exact MPL source and third-party notice
assembly before a public runtime release. NVIDIA CUDA/OptiX/TensorRT local
experimental bundles are not included or silently advertised as published.

`install/windows-x64.json` therefore returns a clear blocked status. The HTTPS
bootstrap and CMD bootstrap are implemented, but a remote one-line command must
not be advertised as a working full installation until a qualified manifest
and matching assets are published. Source/R1-package publication does not
prove native-runtime redistribution qualification.

## Integrity and failure behavior

The bootstrap checks artifact length and SHA-256, rejects archive traversal,
absolute paths and symbolic links, extracts into a private staging directory,
and switches the active-version pointer only after setup succeeds. Model bytes,
native runtime receipts, the sealed application inventory and R1 packages are
verified. Changed data files are not silently overwritten. Failed setup keeps
the previous active version; it can leave downloaded models or library data
for a subsequent attempt. It is not a transactional rollback of all user data.

No CSP, WASM, filesystem, process, network, package-integrity or Stage permission
is loosened. WASM and specialized hardware remain governed by their ordinary
project contracts. Installing a default model does not claim that arbitrary
project-specific neural models are included.

## Reproduce

`scripts/build-full-windows.py --help` lists explicit artifact paths. The build
accepts only `--local-development`, verifies frozen native provenance, copies
dependencies physically, packages an embedded Python, and seals the resulting
application. It must not be used to authorize public redistribution. Source
roots and other Agent worktrees are not reset, linked, or synchronized.

Run `scripts/verify-full-installation.mjs <installation> <evidence-directory>`
using the installed private Node to check CLI execution, all packages, PNG,
EXR, WAV, Servo with sound, actual media decoding, DirectML ESPCN and offline
semantic inference. The acceptance script removes inherited Frameweave and
Python overrides and removes host Node/Python from child-process PATH.

Current evidence and the cumulative validation ledger are in
`D:\Frameweave-Full-Installer-20261110`. Failed attempts are retained in that
ledger; the campaign is capped below 420 seconds. This is targeted installer
acceptance, not a full regression of every effect or every platform.
