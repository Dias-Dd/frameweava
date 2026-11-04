# Hardware media checkpoint review — 2026-11-02

Two previously explicit CPU-pixel boundaries now have an opt-in GPU-resident implementation on Windows/NVIDIA: declared movie input and professional HDR video delivery. Reference output and explicit CPU video input remain available. See ../../NATIVE_MEDIA_GPU.md for the user/API contract, restrictions and reproduction commands.

Source checkpoint: `8d556d49102fa29487509b5b5471363cc50eda90`. Raw build/test logs are committed separately as evidence; they retain failed attempts and batch boundaries. The static diff check reports only trailing blank lines in the byte-pinned upstream header and the helper source; no source bytes were changed after the final smoke to conceal those warnings.

## Measurements

RTX 5070 Laptop, NVIDIA 596.49, Vulkan native owner plus one adapter-matched D3D11 codec device. Full environment and CPU model are recorded in reference-and-exploratory.json / gpu-candidate.json. Node 22.19.0; bundled FFmpeg 6.1.1 encoding/mux; independent FFmpeg/FFprobe 9.0.2 inspection and AV1 decoding; OCIO 2.5.2; installed Rust and MSVC, no tool downloads.

Frozen input: existing `modules/native-gpu/examples/two-stage.tsx`, source frame range 0..5 at 1080p and 0..3 at 4K. Scene-linear ACEScg F32/F16 working Surfaces, ACES 2.0 HDR1000 Rec.2020 PQ, black matte, HEVC Main10, P4 VBR CQ12, no B-frames. Source resolution and new frames are identical between the paired routes. GPU route requests two independent slots; existing reference route is serial. No repeated-frame/cache-hit FPS is used.

| New-frame export | CPU reference wall | GPU candidate wall | Wall speedup | GPU frame-pipeline aggregate / frame |
| --- | ---: | ---: | ---: | ---: |
| 1080p, 6 frames | 10,699.61 ms | 1,511.66 ms | 7.08× | 282.40 / 6 = 47.07 ms |
| 4K, 4 frames | 24,277.84 ms | 1,609.56 ms | 15.08× | 308.78 / 4 = 77.20 ms |

Wall time includes a new native owner, renderer initialization, first-use shader/encoder setup, GPU work, compressed output and mux. Project compilation was measured once, then the same BuiltProject was supplied explicitly. Filesystem/driver/OCIO caches were not flushed. These are short-export wall averages and a bounded multi-frame pipeline aggregate, **not steady-state frame latency, GPU query time or a 10 ms claim**. P95, peak RSS/VRAM, power/quiet-mode state and long-duration throughput were not measured.

The initial exploration used CONSTQP on the direct path; those GPU rows in reference-and-exploratory.json are superseded and excluded. The reference backend already used P4 VBR CQ12 and was unchanged by the codec-helper-only RC correction. Candidate GPU rows were remeasured separately after matching that nominal RC policy. Both raw measurement files are retained, with their batch boundaries; this is not a claim that different codec implementations produce bit-identical pictures.

Production candidate statistics have zero `imageReadbacks`, `pixelTransferBytes`, `bufferExports.readbacks`, `nativeEncoding.cpuPixelUploads` and `nativeEncoding.cpuPixelReadbacks`. GPU-side float copies, P010 packing, fences, compressed CPU bitstream writes and audio work remain.

## Numerical/media evidence

- Pre-encode F32 ACES2 CPU-vs-GPU grid: negative RGB, 0..64 scene values and alpha 0/.25/.5/1; max absolute PQ-code error **0.0000718702**, RMS **0.00000126487**. Fixed assertion stays **0.0002**. Raw failed intrinsic-atan2 attempts (about 0.00125) are retained. No assertion was loosened.
- Flat H.2648 GPU decode vs existing CPU decoder: max working-linear error **0.0000118613** across continuous, backwards and out-of-order frames; a separate two-slot batch verified no CPU pixel transport.
- VFR testsrc2 with edges/padded codec texture: max working-linear error **0.0000534635**; declared 8-bit resampling threshold was 0.012. HEVC P010/PQ input: max **0.0000438690** against CPU; fixed flat threshold 0.0002. Timing is presentation-order plus source-relative 100 ns PTS verification, not guessed CFR.
- Real TSX GPU output with actual AU-1 sine audio: HEVC and AV1, 6 frames at 60 fps, 10-bit limited-range Rec.2020/PQ; mastering display and CLL/FALL inspected on the bitstream; independently decoded error below the unchanged 0.006 lossy-code threshold (HEVC measured 0.0007864833). Decoded audio contains exactly 4,800 stereo samples and nonzero energy.
- HLG MOV carries 10-bit HLG tags. The existing EXR/CPU reference regression preserves negative RGB, extended range and alpha. Real small HEVC/AV1/HLG, EXR and PNG evidence is under media/. `two-stage-4k-hdr.mp4` is the measured candidate's actual 4K output; the 960×540 PNG is a display-only derivative, visually inspected.
- Final production executable smoke after the owner-poison error-policy delta: CLI JSON parses; 1 real HEVC frame, 800 audio samples, zero pixel readbacks/transfers. Its complete result is smoke-final.json.

## Validation batches (do not combine as a single all-green run)

1. `diagnostic-final.log`: **4/4**, diagnostic native/helper builds, 25.83 s including helper build. Numerical OCIO reference, two-slot→one-slot→three-slot encoder lifetime, presentation-order movie tests, external-reference rejection, VFR edges and P010. This precedes the codec RC-only CONSTQP→VBR change; color shader/decoder math did not change with RC.
2. `production-final.log`: **5/5**, production helper, **62.60 s including helper build**. Existing declared-video/portable Resource integrity path and native EXR/HDR/audio regressions; new GPU HDR10/HLG/AV1/HEVC/CLI decoded media; explicit-policy rejection; changed/missing helper admission rejection. No diagnostics helper was used by production CLI.
3. `typecheck-final-3.log`: TypeScript passes. `profile-final.log`: the added unqualified-OCIO-view admission check passes. These occur after the production batch; the added whitelist does not alter the qualified view's shader.
4. `build-rust-error-cleanup.log`: final Rust build passes after media submission errors were made owner-fatal, following existing module behavior. `smoke-final.json` is the subsequent production CLI run. The entire numerical matrix was not repeated after this error-only delta.

Earlier compilation errors, failed assertions, AV1 metadata omission and experimental attempts are preserved in raw/. The conservative cumulative build/test/benchmark accounting is **416 seconds out of a strict 420-second campaign budget**; validation has stopped. No whole-repository, independent install, six export modes, multi-hour stress or full advanced-effect-library pass is claimed.

## Source and architecture changes

- `resources.ts`, `scope.ts`, `logic-host.ts`, `resource-images.ts`, `video-decoder.ts`, `video-container.ts`: additive explicit hardware decoder selection, declared sealed snapshots, packet PTS indexing, input validation. CPU decoder behavior retained.
- `src/media/input.ts` / `encoding.ts`: optional header-only probe and a reused HDR-metadata assertion; default reference probing/output retained.
- `native-media/bridge.cpp`, `video.hlsl`, `file-stream.h`: persistent Media Foundation DXVA source, GPU color/scale/plane handling, same-adapter interop, source-relative timestamp checking, read-only local input and lifetime.
- `native-media/encoder.h`, `ocio_shader.py`, `src/native_encode_windows.rs`: GPU OCIO/colorimetric output, GPU P010 packing, registered NVENC resources, nonblocking completion, precise hue calculation, partial-failure RAII and slot resizing.
- `src/native_video*.rs`, `external_windows.rs`, `gpu.rs`, `memory.ts`: audited local binary admission, imported float textures/fences on the existing native owner, same-slot frame execution/completion, memory admission, retirement on idle reconfigure and failure poisoning. Required resource-lifetime barriers are not per-frame numerical checks.
- `client.ts`, `src/protocol.rs`, `src/main.rs`, `build.mjs`: additive private mediaExport / hardware-video frame descriptor and diagnostics command, build provenance. Existing export and Data.initial are unchanged.
- `src/render/renderer.ts`: apply host-only mediaExport policy, keep image retarget identity, hardware frame deltas, native-close-before-private-file-release.
- `service.ts`, `cli.ts`: opt-in `--professional-backend gpu`, stream-copy mux, existing AU-1, AV1 compressed metadata adapter. It does not silently become the default for every professional setting.

No TVG/P4 ABI, package manager, AnalysisTask, time evaluator, public Graphics Schema, Browser security policy or Stage DAG has been changed. Generated effects keep the same ordinary Surface API. The C header is pinned MIT source, not a redistributed driver; existing OCIO BSD license is reused. See ../../native-media/upstream.json and ../../NATIVE_MEDIA_GPU.md.

## Main integration and remaining qualification

Main explicitly approved the optional private mediaExport field. Its independent binarySeeds v1 increment touches client/main/protocol/build; combine the **small additive sections**, not whole files. This checkpoint does not change request seed framing, Data.initial, MAX_LINE or Main's policy/seed limits. Main can preserve its seed_transport module and client request plumbing. `gpu.rs` media changes are owned by Agent-1. No moving Main code was copied, synced or merged.

Required integration checks still include the final merged binarySeeds + mediaExport control budget, independent package/native runtime installation, and a single TSX combining hardware movie input with direct HDR output. The current campaign verified those two boundaries and a generated native TSX→GPU HDR pipeline separately; it does not claim that combined movie-to-HDR scene was executed.

Other limits: Windows/NVIDIA only for this helper; no AV1 hardware-input qualification, keyframe seek acceleration, cross-platform decoder/encoder backend, arbitrary OCIO view, interlaced/alpha movie, multiview, live/network media, or driver-managed peak-memory claim. Existing explicit CPU fallback/reference paths cover supported alternatives. EXR/PNG delivery still materializes pixels for their file encoders. Hardware output is true 10-bit 4:2:0 with explicit alpha flattening, not a lossless HDR intermediary or 4:4:4 alpha codec. A stuck native system codec is handled by parent deadline/process teardown; rare in-flight device-removal fault injection is not qualified here.

The next useful performance work is long-clip GPU color/packing/encoding profiling and avoiding repeated immutable descriptor copies, after Main's common seed transport is integrated. This checkpoint does not promise 120 fps merely from removing the CPU pixel roundtrip.
