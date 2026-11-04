# PME validation record

See [implementation/API report](PROFESSIONAL_MEDIA_ENGINE.md) and
[non-image/audio design](PME_AUDIO_STAGE_CONTRACT.md). All measurements below are
actual runs on this Windows machine; they are not predictions for other platforms.
Generated media/logs are preserved outside Git, with a delivery copy and SHA-256
inventory. The verification scripts are tracked and recreate their own fixtures.

## Environment and run identity

- Baseline `74a8031`, branch `agents/agent-1`; no Git synchronization or Main merge.
- Windows x64, Node 22.19.0, Python 3.13.7, Playwright 1.64.1 / Chromium 156.0.8078.4.
- Optional native dependencies: OCIO 2.5.2, OpenEXR 3.4.4, NumPy 2.3.4,
  PyVips3.2.0/CFFI2.0.0 using existing libvips8.18.7. PyVips official sdist SHA-256:
  `5fa47cdce4e7f450747c118c12fde913e0710850c6015d8ec4f5af490003a347`.
- FFmpeg 6.1.1 essentials via existing ffmpeg-static 5.3.0, GPLv3 build;
  external ffprobe 9.0.2. Every format uses actual encoder and decoded bytes.
- Browser explicitly provisioned at worktree-local `.frameweave/dx1a-browsers`.
- Private `.frameweave/user-home`; ONNX semantic tests may use its Windows short
  path alias, referring to the same files and hashes. No shared user library writes.
- Hardware inventory: NVIDIA RTX 5070 Laptop / Intel Graphics. Actual WebGPU adapter
  reports NVIDIA/Blackwell, `isFallbackAdapter:false`; browser hides precise device ID.
  Forced software runs identify ANGLE/SwiftShader WebGL2.
- Windows tested. Linux/macOS/native monitor HDR playback and hardware encode untested.

## Milestone acceptance

| Milestone | Actual implementation and evidence | Status / boundary |
|---|---|---|
| PME-0 | PNG-only baseline traced through real code; native tools and GPU capability queried | Complete audit; no assumption that Stage means image |
| PME-1 | Real isolated Web A→B16F; NumPy float16 independent oracle, negative/>1/alpha/random seek | Implemented and numerically verified, CPU transport |
| PME-2 | Float32 linear blends, isolated groups/mask, existing Layer tree + same execution queue | Implemented basic CPU compositor, no RGBA8 intermediate |
| PME-3 | Analytic spaces/transfers, actual ACES2 config, LCMS16, LUT1D/3D, EXR metadata | Implemented bounded profile; custom OCIO and float HDR ICC unavailable |
| PME-4 | Stage→PQ10→HEVC→decode numeric luminance; EXR HALF/FLOAT intermediates | Minimum HDR/high-bit acceptance met |
| PME-5 | HLG/ProRes422/HQ/4444/XQ/DNxHRHQX/TIFF16 and 12-bit input | Tested profiles only; ProRes colour input10, no full professional-format parity claim |
| PME-6 | Numeric reference, actual images/videos, software/physical timing, compatibility suites | Evidence and remaining limits below; no blanket certification claim |

## Numeric and decoded-media results

Initial complete17-check run: `artifacts/professional-media/validation-yekYN2/`.
Final complete18-check native-ICC run: `artifacts/professional-media/validation-hx3X3D/`.
Final script includes a coloured ICC cube; final-run pointer is
`artifacts/professional-media/latest.json`. `results.json` has per-check raw values,
timings and failures; ffprobe JSON, `.media.json`, PNG, EXR, TIFF, MOV and MP4 remain
beside it. Earlier failing runs were retained, not overwritten with fabricated results.

| Test | Measured result / reference |
|---|---|
| A→B binary16 | Max absolute error **0**, all 32768 samples vs independently generated NumPy half oracle |
| Extended scene values | Negative and >10 RGB preserved; source alpha 0/.25/.5/1; B→compose keeps negatives and highlights |
| EXR HALF and FLOAT | Both max error **0** for this half-valued fixture; actual float16/float32 channels and chromaticities read by OpenEXR |
| HDR10 signal | 1024-pixel gray ramp, actual Main10/yuv420p10, PQ/2020/2020nc tags and mastering/CLL; **311 distinct luma codes**, not an 8-bit ramp |
| HDR10 actual decode | Max PQ-code error **0.0024601221**, MAE **0.0003932031**; max luminance error **8.27661 cd/m²** over authored 0–1000 cd/m² ramp |
| TIFF16 decode | Max RGB and alpha error **7.6293945e-6**, within half an integer16 step |
| ProRes4444 / XQ | Max RGB **0.00418262**, MAE **0.000399564**, alpha max **0.000617981**; actual yuva444p12 decode but effective colour input10 |
| ICC16 gray | 1024 distinct decoded gray levels; final float-PCS max encoded error **.002901763**, alpha **7.62939e-6** |
| ICC colour cube | 4913 RGB reference colours; sRGB CIE76 max **.01227459**, P3 max **.37440844** (threshold1 retained); P3 max encoded-channel error **.00534066** |
| YUV12 input | Actual yuv444p12/FFV1, 1024 distinct float output levels; max neutral-code error **5.96046e-8** |
| PCM mux | 4000 samples, 48000 Hz, 24-bit mono; actual decoded 12000 bytes exactly equal, start0, duration.083333, timebase1/48000 |

These are specified test signals, not a promise of worst-case codec error for all
content. HDR10 uses declared mastering 1000/.005 cd/m² and authored CLL/FALL values;
metadata is inspected but not automatically measured from the entire programme.
OCIO working-space roundtrip max error1.90735e-6; HLG decode max code error.00342466.
The packed ICC path initially preserved grey but failed coloured reference at CIE76
2.94313 (max encoded error.07251). It was replaced with actual relative-colourimetric
LCMS import/float Lab/export via PyVips, not a looser assertion. The more accurate
colour-cube path has the explicitly recorded larger near-black gray code error above;
no transform is described as a mathematically exact roundtrip or float-HDR ICC.

4:2:2 colour-edge loss is explicitly retained:

| Codec | Full-image max source RGB error | Source MAE | Max error against uncompressed YUV422 reference |
|---|---:|---:|---:|
| ProRes422 | .1745191 | .00234576 | .00621295 |
| ProRes422HQ | .1753979 | .00229360 | .00414196 |
| DNxHRHQX | .0805219 | .00118478 | .00579828 |

Initial sharp-edge interior threshold .04 failed for ProRes422/HQ (.04488/.04400).
That observation is still recorded as `sourceInteriorWithin004:false`. It was not
discarded or relabelled lossless. The test now separately measures the necessary
4:2:2 chroma sampling roundtrip and codec reconstruction error against uncompressed
YUV422. The transport/codec reconstruction test passes; a requirement for preserved
sharp source chroma should select EXR/TIFF or 4:4:4, not claim 4:2:2 meets that criterion.

The actual ACL3 storyboard was opened and visually inspected: it shows alpha bands,
colour/highlight gradients and repeated frame3. This is the **SDR ACES2 display
preview**, not a screenshot proving a reference HDR monitor output. HDR correctness
uses decoded signal values and metadata in addition to actual playable files.

## Measured performance

Raw run `artifacts/professional-media/performance-8UfAyn/`, 22 records, zero failed
rows. Two warm samples per GPU policy; no statistical throughput claim. Cold means
fresh Renderer/Stage, not empty OS/driver cache. This run completed before the final
quality/full-regression load; unrelated machine load was uncontrolled.

The representative existing **RGBA8** chain is Color + Blur + Glow, eight actual GPU
passes including output. This is not the float HDR compositor. WebGPU timestamps
sum actual render-pass durations; query mapping, fences, Canvas readback and CPU
conversion are independent host spans. SwiftShader provides no GPU timer, so its
GPU execution value is null, not the CPU fence time.

| Chain / resolution | Cold evaluate wall ms | Warm evaluate wall ms | Actual GPU query ms (warm) | Canvas→CPU readback ms (warm) | CPU format ms (warm) | structuredClone copy ms (warm) |
|---|---:|---|---|---|---|---|
| NVIDIA WebGPU 1080p | 141.31 | 57.04 / 49.79 | .393216 / .196608 | 6.1 / 4.8 | 13.1 / 14.0 | 17.4 / 17.5 |
| SwiftShader WebGL2 1080p | 334.20 | 187.43 / 185.89 | unavailable | 16.2 / 10.6 | 9.8 / 11.3 | 11.6 / 14.6 |
| NVIDIA WebGPU 4K | 317.64 | 179.44 / 174.90 | 1.507328 / 1.376256 | 23.8 / 18.0 | 47.8 / 49.3 | 70.7 / 70.8 |
| SwiftShader WebGL2 4K | 982.58 | 740.82 / 786.97 | unavailable | 57.3 / 44.4 | 41.1 / 142.1 | 93.0 / 70.7 |

Timestamp precision is browser/driver constrained; these values do not imply nanosecond
measurement accuracy. GPU query readback uses MAP_READ and is separately reported
as `gpuTimingReadbackMs`. Canvas readback includes browser conversion/bridge overhead.
All explicitly owned textures/buffers/query sets are zero after double disposal.
Peak physical GPU memory is unknown (`null`), not inferred from logical allocations.

The original 4MP guard blocked the first 4K attempt. `maxPixels` is now explicit
opt-in (up to16MP); the default guard remains4MP and device texture limits still apply.

True high-precision CPU A/B→linear2020 float composition:

|  | 1080p | 4K |
|---|---:|---:|
| Cold frame wall ms | 4186.81 | 17221.10 |
| Repeated same frame wall ms | 1059.89 | 15796.06 |
| Repeat Stage cache hits | 2 | 0 |
| Cold float compositor total ms | 935.44 | 3547.74 |
| Cold unpack/decode ms | 268.39 | 1105.97 |
| Cold working-colour conversion ms | 306.45 | 1183.27 |
| Cold linear raster/allocation ms | 128.49 | 440.01 |
| Cold float32 pack/base64 ms | 231.80 | 818.22 |
| Cold Stage A/B validation ms | 307.81 / 289.01 | 1371.30 / 1191.61 |

The 128MiB cache's existing JSON-string estimate excludes large4K half packets;
repeated4K is a rerun, not a hot Stage-cache benchmark. A single 4K RGBA16F packet
is66,355,200 decoded bytes and88,473,600 base64 characters. CompositeRGBA32F is
132,710,400 bytes /176,947,200 characters. JavaScript string storage, validation,
realm transport and additional allocations dominate; this is **not realtime HDR**.

One-frame software libx265 HDR encode after the prepared professional frame:

| Span ms | 1080p | 4K |
|---|---:|---:|
| Capability/preflight | 346.29 | 305.28 |
| Transform + code-range validation | 2392.87 | 8069.18 |
| Pack / alpha colour adapter | 701.87 | 2175.36 |
| stdin write/backpressure | 12.46 | 95.70 |
| Final encoder drain | 112.58 | 328.82 |

Encoding overlaps writes and FFmpeg work; final drain alone is **not** complete encoder
compute time. No hardware-encoder comparison was made. This performance run explicitly
permits clipping the colourimetric conversion (counts79610/317598); the separate
quality/OCIO HDR output does not use that clipped benchmark as a quality oracle.

## Regression and delivery status

Initial targeted suite: **109/109 passed**, 0 skipped, 202.61s, raw
`artifacts/pme-regression-initial.log`. It covered core/compiler/input/runtime/C2,
professional float data and RenderSession. The final broad suite and targeted reruns
are recorded at delivery; final counts must be read with their environment diagnostics.

An initial full-suite environment failure was real: ignored
`prototypes/analysis-job-mvp/assets/david.webm` was absent, so11 analysis-dx cases failed
in the before hook. The existing `prepare-assets.mjs` was run without changing its
pinned video/model hashes, and its exact locked MediaPipe runtime installed in this
worktree only. This is fixture provisioning, not a relaxed test or disabled checksum.
The original failing log is retained; analysis-dx is rerun after provisioning.

Final typecheck passes (`artifacts/pme-typecheck-final.log`). Full raw suite:
**361 tests,346 pass,15 fail,0 skipped**,1100.96s (`pme-full-regression.log`).
Failures are accounted for rather than describing that run as green:

-11 missing analysis fixture before-hook failures → existing pinned provisioning and
  **11/11** rerun pass (`pme-analysis-rerun.log`,20.99s).
-1 new data-only fixture had omitted its numeric input generic → fixed the fixture's
  TypeScript declaration, retained runtime assertions; the real DAG test passes.
-2 Rust rebuild cases had no compiler on PATH → explicitly selected already installed
  rustc/Cargo1.99.1, existing owned wasm target, reviewed rust-lld and bindgen0.2.129;
  no new Rust download. Full six-file targeted suite **58/58**,0 skipped,364.36s,
  including both kit builds/types/pack/restore/Worker/R1 suites (`pme-final-targeted.log`).
-1 tracked Energy Vortex example lock remains deliberately stale. Read-only HEAD-byte
  hashing gives baseline SDK `4f331873bd4e51e4dfe7b5f68e497fb4105bd74ca950dad262df1deb9a41b300`,
  while its tracked lock already required `53ccdd2e...` before PME. The original test
  still refuses with `E_PLUGIN_LOCK`; no lock assertion was changed and no tracked
  lock refreshed. This remains an integration review item, not a runtime pass.

After the final ICC implementation, **54/54** tests passed,0 skipped,201.28s:
professional-media, C1 WASM, packages/R1, Session and distribution
(`pme-post-icc-regression.log`). The prior complete58-case kit/GPU run and full suite
remain separate records; no synthetic combined all-green full-suite count is claimed.
The final malformed-Surface location guard also passed the final **8/8** PME unit /
real-browser cases,0 skipped,11.70s (`pme-unit-final.log`): it retains the media error
code plus actual Stage ID/frame. Final typecheck was rerun after that guard.

`verify-professional-compat.ts` additionally copied both original P4 examples into a
new private fixture, explicitly regenerated **only that fixture's SDK identity** and
asserted exact unchanged plugin versions/content and unchanged original lock bytes.
Both compiled; random/repeated PNGs matched; actual12-frame480×270/30fps SDR MP4 decoded
as.4s. Evidence `sdr-compat-KYBCfw/results.json` and `pme-sdr-compat.log`. That verifies
runtime compatibility while preserving the stale tracked lock for the user to review.

The local npm release was installed in a clean, repository-external temp application:
`C:/Users/ASUS/AppData/Local/Temp/frameweave-pme-qaQDrv`.
`verify-professional-installed.mjs` invoked only installed bin/public exports. It
verified477 inventoried files including the native bridge, parsed doctor/capabilities
JSON, compiled real local TSX, wrote/read negative/highlight EXR, encoded/decoded HDR10,
and produced actual PNG/storyboard through installed Session/ACL3. Original SDK source
paths were not imported. Explicit external browser/Python tool paths remained host
configuration. Evidence `installed-EZCm0x/{results,commands,doctor}.json`,
`pme-installed.log`, `pme-release-build.log`, `pme-release-pack.json`.
Final-source installed rerun also passed: `installed-3wLDVt`, external application
`C:/Users/ASUS/AppData/Local/Temp/frameweave-pme-72XNMh`, raw `pme-installed-final.log`.
Its doctor verifies SDK integrity
`48718d3b4d9aa3e15c4fcf253cbb579d4b0e5b3fc876c66039ba90bb737322b1`.
Final SDR rerun `sdr-compat-miQDzH` uses that same identity, with unchanged tracked
lock/plugin bytes. The `installed-latest.json` pointer identifies the last consumer.

Final Python provisioning recipe was executed successfully (`pme-setup-verify.log`).
PyVips source/setup was inspected, its official sdist SHA checked and ABI mode tested
against the already installed libvips. `pme-pyvips-install.log` retains actual install
details. No runtime downloads, trust changes or WASM permission changes occurred.

Changed-file inventory and final Git identity are delivered as `CHANGED_FILES.txt`
and `COMMIT.txt` alongside the raw logs/media. Generated binaries/caches are not added
to Git. Source, scripts, examples, notices and reports form the independent commit.

## Remaining limitations and next decisions

- Float GPU shaders, same-device/cross-Stage texture leases and shared-memory/file
  transport need a separately reviewed versioned resource contract. Existing opaque
  Stage isolation prevents simply passing GPUTexture objects; CPU values are honest
  fallback. Prioritize a measured transfer adapter before advertising realtime4K.
- SIMD/native/WASM float composition could reduce present CPU cost; it must preserve
  alpha/colour/time reference results and existing WASM permission boundaries.
- No arbitrary OCIO config asset resolver or float HDR ICC processing; add only with
  explicit verified dependencies and profile/input metadata tests.
- ProRes input is10-bit on this encoder; full12-bit effective input needs a demonstrably
  compatible encoder/native adapter. Do not infer quality from a decoded12-bit label.
- No automatic shot/programme MaxCLL/FALL statistics, HDR monitor management, dynamic
  HDR metadata, hardware encoder or vendor certification validation.
- PCM accepts48/96k, mono/stereo or explicit bounded multichannel layouts; only48k24bit
  mono MOV byte-perfect mux is measured. No full audio Stage/runtime/resampler/DSP.
- Long films, huge Layer trees, native out-of-memory, tiled/deep EXR, full-range or
  other YUV matrices and custom camera/log IDTs need targeted future validation.
- Linux/macOS are design targets only. Native process cancellation is bounded120s,
  not guaranteed instantaneous; partial output files remain distinguishable by failure
  and absent success report.

The minimum image/HDR path is demonstrably present. Broader professional-engine
equivalence is not inferred from that minimum, codec names or this design document.
