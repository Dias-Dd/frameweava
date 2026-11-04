# Native GPU media I/O v1

Windows/NVIDIA checkpoint: hardware movie input and GPU HDR video delivery reuse the existing native owner, Stage DAG, Surface metadata, frame slots, permission checks and AU-1 mixer. Existing CPU input and reference delivery remain explicit alternatives. No P4 ABI or TVG change.

## Run

Use the already installed MSVC compiler, Rust toolchain, reviewed Python/OCIO environment and NVIDIA driver. The build never downloads a compiler or a driver:

```powershell
node modules/native-gpu/native-media/build.mjs '<installed vcvars64.bat>'
node modules/native-gpu/build.mjs
$env:FRAMEWEAVE_MEDIA_RUNTIME = '<this checkout>/.frameweave/native-media/runtime'
$env:FRAMEWEAVE_MEDIA_PYTHON = '<reviewed Python with OpenColorIO 2.5.2>'
$env:FRAMEWEAVE_FFPROBE = '<reviewed ffprobe>'
frameweave render project.tsx --settings hdr.json --professional-backend gpu --encoder hevc_nvenc --output hdr.mp4 --json
```

`av1_nvenc` is also supported. These commands additionally require the existing installed native GPU and SpiderMonkey runtimes. The helper is explicitly built/configured; it is not silently downloaded or automatically carried inside a project Capsule. An independent installed-package acceptance has not been run for this increment.

Keep `--professional-backend reference` for clip:false, unsupported transforms, EXR, non-NVIDIA platforms and CPU reference comparisons. GPU delivery requires explicit `conversion.clip:true`; it never changes the meaning of clip:false. `--professional-backend gpu` without professional video settings fails.

GPU OCIO v1 admits the pinned CG/studio built-in OCIO 2.5 configs, scene-linear source encoding with a 100-nit reference, and **ACES 2.0 HDR 1000 nits Rec.2020 PQ**. Other views receive `E_NATIVE_MEDIA_OCIO_PROFILE` and must use the reference backend until qualified. Colorimetric PQ/HLG conversion is a separate supported profile, not an ACES view. Matte flattening is explicit; HEVC/AV1 4:2:0 does not preserve alpha.

## Movie input

Within the existing `defineNativeStage` lifecycle:

```tsx
const image = await init.gpu.importResource({
  version: 1, id: 'movie', decode: 'video', decoder: 'hardware',
  position: { frame: context.frame }, boundary: 'error',
  interpretation: { ...linear709, transfer: 'rec709', reference: 'display' },
  metadataPolicy: 'validate',
  output: { width: init.width, height: init.height,
    format: 'rgba32float', alpha: 'opaque', color: linear709 },
});
```

Declare `<Resource id="movie" src="./source.mp4" kind="media"/>`. The output is an ordinary existing Native Surface. `rgba16float` explicitly rounds to the existing Half contract; the working buffer is still F32. Rational source time is also supported. Frame indices refer to presentation order; loop/clamp/error are explicit. Random backward access currently resets and replays the decoder rather than using a keyframe seek index.

The admitted profile is a self-contained local MP4/MOV/M4V with tagged limited-range, left-sited opaque 4:2:0 H.264/HEVC/AV1 8/10-bit video and explicit Rec.709/PQ/HLG interpretation. H.264 8-bit and HEVC P010 are verified here; AV1 hardware **input** has not been qualified. Required Media Foundation codecs must already be installed. Missing codecs/platform/interoperability are errors, never hidden CPU fallbacks; use `decoder:'cpu'` deliberately if needed.

`NativeResourceImages` streams and seals the declared file once into a private lease. `video-container.ts` rejects external `dref` references; Media Foundation receives a read-only byte stream, not a URL. FFprobe builds a sorted packet PTS index instead of decoding the whole source with `-show_frames`. Probe/codec-header inspection remains CPU work; no decoded pixel payload passes through Node on this path. Unsupported edit/discard/sample layouts can fail the source-relative PTS check instead of drifting silently.

`bridge.cpp` requires DXGI decoder-owned NV12/P010 textures (`D3D11_BIND_DECODER`), performs transfer/gamut conversion and proxy scaling on the GPU, and returns a private RGBA32F texture/fence. The import shader writes the existing native F32 working buffer. Luma/chroma filtering clamps to the **visible** image, including padded codec textures. Profile restrictions are explicit; arbitrary chroma siting, alpha video, interlaced/multiview and out-of-contract signal values are not qualified.

## Delivery and synchronization

The private, optional `NativeProgram.mediaExport` is independent of legacy `export` and `Data.initial`. No package/Stage/graphics schema is repurposed. Legacy runtimes reject the unknown optional feature instead of silently treating it as SDR. Changing an active encoding/color/layout policy fails; completed frame capacity may shrink/grow.

Route:

```
existing GPU F32 Surface
  -> shared RGBA32F GPU image
  -> OCIO HLSL + immutable LUTs / colorimetric GPU conversion
  -> GPU P010 pack (limited range, left chroma)
  -> registered NVENC GPU resource
  -> compressed bytes -> stream-copy mux + existing AU-1 audio
```

The existing Vulkan owner remains the renderer. One adapter-LUID-matched D3D11 **interop/codec device** is shared by decoding and encoding, under that owner's lifetime. It is visible in `hardwareVideo.additionalD3D11Devices`; `devicesCreated:1` counts the primary wgpu device, not the entire machine. GPU-side copies and API ownership transitions remain. This is CPU-pixel-roundtrip-free delivery, not literal zero-copy GPU execution. No GPUTexture is passed between unrelated owners or BrowserContexts.

Required Vulkan/D3D timeline fences are GPU waits/signals. NVENC asynchronous events release a slot only after compressed output is available; CPU polls events without a blocking GPU pixel wait. Frame sequence is validated. Compressed bytes are CPU-visible for file/mux work. No per-frame file/transfer hash or numeric scan is added. Shader/LUT generation, local runtime binary hash verification, source sealing and resource admission are one-time work.

HEVC carries driver-written mastering/CLL/FALL. This driver did not expose the requested AV1 mastering metadata in its raw bitstream; AV1 therefore reuses `src/media/hdr-metadata.ts` to insert the **actual compressed bitstream metadata** before ordinary `-c:v copy` mux. No decoded pixels are involved. HLG carries its transfer tags without PQ mastering metadata.

## Correctness, failure and lifetime

The unmodified OCIO HLSL failed the fixed `0.0002` PQ-code CPU-reference threshold at very dark saturated colors (max about 0.00125). Isolated precise/reordering/LUT experiments did not solve it. Replacing the GPU atan2 intrinsic with range reduction plus a 21st-degree odd Taylor polynomial fixed the measured error: about 0.0000719 max, 0.00000126 RMS on the fixed negative/HDR/alpha grid. The series is evaluated only on [-tan(pi/8),tan(pi/8)]; truncation is below 7e-11 radians before float rounding. Hue-axis handling matches the CPU. This adaptation is named `float32-atan2-v1` in provenance. It is not a promise of bit-identical arbitrary OCIO transforms or drivers.

Half/float dynamic range remains in working Surfaces. Flattening and delivery clipping happen only at the explicit output boundary. Numerical tests compare pre-encode F32 output to the existing CPU OCIO reference. Lossy decoded video is tested separately. Source/movie and HDR signal limitations above are not silently generalized.

The owner retains readers, LUTs, shaders, decode samples and slot resources. Idle reconfiguration drops obsolete movie sources and unused slot surfaces; encoder slot growth/shrink is explicit. Vulkan imports/fences are released before their D3D handles. Partial encoder slot failures use RAII. Renderer closes the native owner **before** deleting its read-locked private resource files. Failure after GPU media submission poisons that owner, following the existing native module policy. Cancel/timeout can terminate the child and let the OS reclaim driver resources; there is no promise that a stuck system decoder can be interrupted inside `ReadSample`.

Known allocations are charged against the existing session budget: F32 working/import buffers, shared float targets, P010, immutable LUTs and compressed-slot reserve. Source plane allocation uses a conservative aligned allowance. Driver-managed codec reference surfaces/queues and peak total memory remain **unknown**, not included in a claimed exact peak-memory result.

## Reproduce and evidence

- Diagnostic math/slot tests: build both runtimes with `--diagnostics`, then run `tests/native-media-gpu.test.ts` and `tests/native-video-hardware.test.ts` with `node --import tsx --test --test-concurrency=1`. Diagnostic readback is compiled separately and rejected by production CLI.
- Rebuild both without diagnostics for `tests/native-media-gpu-delivery.test.ts`, `tests/native-media-integrity.test.ts` and the existing `tests/native-media-delivery.test.ts`.
- Set `FRAMEWEAVE_AV1_DECODE_FFMPEG` to an explicitly reviewed 10-bit AV1 decoder. Bundled FFmpeg 6.1.1 did not decode this AV1 stream; independent FFmpeg 9.0.2 was used for verification. Bundled 6.1.1 remains the qualified EXR-alpha path.
- `validation/hardware-media/benchmark.ts` uses the frozen existing two-Stage TSX, the same resolutions/new frames/ACES2 view, HEVC P4 VBR CQ12, no B-frames and a black matte. `--gpu-only` runs the candidate against the already measured unchanged reference implementation. Full invocation measures both.
- Detailed batches, failed experiments, measured exports, receipts and source hashes: `validation/hardware-media/REVIEW.md` and adjacent JSON/logs. No whole-repository or six-export-mode pass is claimed.

## Source and licensing

`native-media/upstream.json` pins the exact MIT-licensed nv-codec-headers n13.0.19.0 header and SHA256. Its notice is retained. The NVIDIA runtime DLL is loaded only from Windows System32 and is **not distributed**; API 13 needs a compatible installed driver (NVIDIA documents SDK 13 requirements). No CUDA toolchain or driver download is performed.

OCIO uses the existing 2.5.2 installation, configs and BSD-3-Clause license in `licenses/professional-media/OpenColorIO-2.5.2-LICENSE`. `ocio_shader.py` exports instructions/LUTs through its public API. This does not copy the OCIO CPU implementation. The atan polynomial, bridge, P010 pack and adapter are engine-authored. Windows Media Foundation/D3D11 are system dependencies.

Primary references: [NVENC 13 API guide](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.0/nvenc-video-encoder-api-prog-guide/index.html), [OCIO 2.5.2 ACES2 reference](https://github.com/AcademySoftwareFoundation/OpenColorIO/blob/v2.5.2/src/OpenColorIO/ops/fixedfunction/ACES2/Transform.cpp), [Media Foundation D3D11 decoding](https://learn.microsoft.com/en-us/windows/win32/medfound/supporting-direct3d-11-video-decoding-in-media-foundation).
