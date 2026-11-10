# Full installer delivery — 2026-11-10

Result: **PARTIAL**. A private full Windows x64 bundle is assembled and installed.
The public HTTPS/CMD bootstrap source exists; a publicly redistributable full
runtime release is blocked by existing third-party provenance gaps. It is not
advertised as a working public one-line full installation.

## Source and artifact identity

- Main starting point: `2defd664d9e02f5ae5841366145741201c2023bb`.
- Publishing source starting point: `c0ac4b0e7897fa847e307139ddcb14ec44aabfe1`
  on `Dias-Dd/frameweava`, `dev`.
- Publishing source retains MIT; existing third-party and Apache notices are
  preserved. No experimental NVIDIA binary was published.
- Full bundle: `D:\Frameweave-Full-Installer-20261110`.
- Private installation: `%LOCALAPPDATA%\Frameweava`.
- The exact engine ZIP SHA-256, Node/Python/FFmpeg/FFprobe upstream URLs and
  fingerprints are in that directory's `windows-x64.json` and `upstream.json`.
- SDK Runtime Pin for this built publication snapshot:
  `658cb305c0527d2290c7c9b3b1ebb60b9d5922ab7bc7304afc173bfd0629e8ac`.
  No historical project lock was edited to bypass a mismatch.

## Changes

- `install.ps1`: private full bundle or verified HTTPS assets; safe extraction;
  staged activation; user PATH and CLI launcher; existing-version verification.
- `install.cmd`: Windows CMD bootstrap and adjacent local-bundle installation.
- `bin/setup-full.mjs`: runtimes/default models, Python media libraries, exact
  official package installation and sealed engine verification.
- `scripts/build-full-windows.py`: frozen local artifact assembly, embedded
  Python, pinned default models, original notices, private distribution gate.
- `scripts/verify-full-installation.mjs`: reproducible installed acceptance.
- `src/media/python.ts`: discover the bundled portable Python before old managed
  environments. Explicit operator overrides keep their meaning.
- `modules/native-gpu/executable.ts`: discover the bundled DirectML inference
  runtime alongside Servo; the native owner still verifies original receipts.
- `install/windows-x64.json`: truthful public full-release blocker.

All eleven current official packages are installed using the actual remote R1
package mechanism. No compiler or npm install runs on the user's machine.
Node, Python, FFmpeg, FFprobe, Native GPU, SpiderMonkey, Native Media, Servo,
DirectML/ORT, multilingual MiniLM q8/tokenizer and ESPCN are physically included.
The package Store is shared by all projects in this installation's data folder.
Project-specific large neural models and CUDA/OptiX/TensorRT development SDKs
are not falsely counted as installed defaults.

## Real validation and failures

The cumulative campaign used **418.581 seconds**, including failed attempts,
acquisition, physical dependency copies, building, compression, installation,
media checks and a conservative cleanup reserve. No full-suite run occurred.
The machine-readable step ledger is
`D:\Frameweave-Full-Installer-20261110\validation-timing.json`; individual logs
and failed evidence are retained beside it.

| Check | Result / evidence |
|---|---|
| Production GPU / SpiderMonkey provenance | PASS in distribution build; exact source/binary receipt checks |
| Full private archive, 19,146-file sealed installation | PASS in setup; model hashes and eleven R1 package snapshots verified |
| Embedded Python 3.13.7 + NumPy/OpenEXR/OCIO/pyvips | PASS after DLL search fix; actual imports using private interpreter |
| Bundled FFmpeg and FFprobe | PASS, actual `-version` and decoded PCM |
| Installed CLI with host Node/Python removed from PATH | PASS for real PNG and WAV commands after launcher binding fix |
| Native PNG, 160 × 90, actual nonzero pixels | PASS; `smoke-fixed/core.png` and corresponding CLI JSON |
| WAV, 48 kHz, actual FFprobe + FFmpeg decode | PASS; `smoke-fixed/tone.wav`, `tone-probe.json` |
| Default multilingual model offline | PASS; actual two-document semantic inference and expected ranking |
| Servo runtime | Initial FAIL on undeclared app-local CRT DLLs; layout corrected without altering native receipts. Targeted render then hit the eight-second remaining test allocation; final real Servo render is UNVERIFIED |
| Real DirectML ESPCN frame | NOT RUN in final installed acceptance; bytes/runtime receipts installed and verified, execution remains unverified |
| Final installed MP4/EXR/OCIO pixel transform | NOT RUN in this bounded campaign; decoder/import availability alone does not constitute those media tests |
| Fresh machine without preinstalled Microsoft runtimes | NOT RUN; app-local CRT is included, but this host already has development tools |
| Network-only complete installer | BLOCKED, no full runtime assets uploaded |

Failed attempts were not erased or counted as passes:

1. A retired Gyan archive URL returned 404; immutable upstream FFmpeg-static
   release assets replaced it.
2. Windows PowerShell 5 parsed an unmarked UTF-8 ellipsis incorrectly; bootstrap
   source is now ASCII. Its environment also lacked `Get-FileHash`; the
   installer now hashes through .NET directly.
3. The initial Python sanity check did not retain its DLL-directory handle or
   configure CFFI's process-local search path. It now follows the existing OCIO
   bridge behavior; no global DLL search policy was relaxed.
4. A test cutoff killed the parent installer just as setup completed. The
   verified receipt existed and all eleven packages were installed. Activation
   was recovered using the installer's unchanged completion code; the stale
   lock was preserved as `install.operation.interrupted-test`. **This is not a
   fully repeated, unattended installation pass.** Normal setup has no such
   short test cutoff.
5. The generated launcher accidentally activated advanced positional binding;
   it now accepts CLI arguments normally. The real installed PNG/WAV checks
   used the fixed launcher.
6. Placing CRT files inside sealed Servo/DirectML directories correctly raised
   `E_NATIVE_MODULE_INTEGRITY`. CRT files were moved to executable directories
   and private Python instead; original runtime receipts are unchanged. Both
   the local bundle and installed inventory were resealed. Servo remains
   unverified after the bounded retest timed out; no success is inferred.

The final bundle layout repair occurred after PNG/WAV/offline-model evidence;
those tests were not rerun or relabeled as a single all-green final campaign.
Changes to the reproducible builder's parallel hashing/reduced build-only copy,
the existing-version fast path and CMD adjacent-bundle path were source-reviewed
but not rerun after the budget was exhausted.

## Public release blockers and remaining work

The actual Servo delivery explicitly flags ANGLE binaries and embedded mozjs
inputs as unqualified for redistribution. The SpiderMonkey host also requires
the exact MPL-covered source retrieval notice and linked third-party notices
for its binary release. Those obligations must be assembled from the actual
artifacts, not removed from documentation or replaced by a matching hash.
The installer intentionally refuses to call this a public full release.

Before announcing a public command: qualify those artifacts/notices, publish
immutable runtime/model archives, replace the blocked manifest with exact HTTPS
assets and hashes, run the real remote bootstrap on a fresh Windows consumer,
and complete final Servo/DirectML/MP4/EXR and reinstallation tests. macOS/Linux
installers are not delivered by this Windows-only bundle.

No other Agent worktree was changed or synchronized. Existing unrelated dirty
Main files were preserved. Final commit IDs are reported in the delivery
message; this report is committed with the matching source changes.
