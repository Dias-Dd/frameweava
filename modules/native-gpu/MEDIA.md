# Native media input, history and accurate output

These are adapters on the existing compiler, Renderer and GPU owner. TVG, P4/R1,
Stage timing, resource integrity and WASM authorization are unchanged.

## Declared video input

`NativeGpuScope.importResource` also accepts `NativeVideoResource`:

```tsx
import {Composition, Resource, Stage, Layer, ref} from '@frameweave/engine';
import {
  defineNativeStage, linear709, type NativeVideoResource,
} from '@frameweave/engine/native';

export const movie = defineNativeStage(init => ({
  renderAt(c) {
    return init.gpu.importResource({
      version: 1, id: 'footage', decode: 'video', decoder: 'cpu',
      position: {num: c.frame, den: 60}, boundary: 'clamp',
      interpretation: {...linear709, transfer: 'rec709', reference: 'display'},
      metadataPolicy: 'validate',
      output: {
        width: init.width, height: init.height,
        format: 'rgba32float', alpha: 'opaque', color: linear709,
      },
      cacheBytes: 128 * 1024 ** 2,
    } satisfies NativeVideoResource);
  },
}));

export default (
  <Composition width={1920} height={1080} fps={60} durationInFrames={120}>
    <Resource id="footage" src="./footage.mp4" kind="media"/>
    <Stage id="movie" factory={movie}/>
    <Layer source={ref('movie')}/>
  </Composition>
);
```

Use `{frame: n}` for zero-based presentation order, or rational seconds relative
to the first presentation timestamp. VFR lookup uses the frame containing that
time. Boundary is explicitly `error`, `clamp`, or `loop`. No wall clock is used.
Output resizing happens during decode, before upload/composition.
This resource selects the video stream only. Audio placement remains explicit
through AU-1; importing an image stream does not infer a soundtrack.

The current qualified decoder is an **explicit CPU fallback**. It retains one
FFmpeg process for sequential frames, prebuffers pipe data, caches float frames,
and reopens for reverse/large seeks. Random seeks currently decode from the
beginning using a frame-accurate trim; long-GOP seeking is not optimized.
The initial bounded PTS scan also reads the stream. No hardware/zero-copy claim
is made: decoded F32 private files are uploaded to the existing owner.

Only sealed, declared media/file resources are accepted. Source bytes are
verified/snapshotted once; there are no per-frame content hashes. FFmpeg/FFprobe
allow only local file/pipe protocols and an explicit binary-container demuxer
list; playlists/network protocols are rejected. F32 leases are pinned through
native admission/ACK and active base-program retention, then evicted or removed
at session close. Per-video cache is explicit, at least one frame; aggregate
CPU caches are bounded to 512 MiB. There is no browser/PNG/Base64 transport.

This profile accepts tagged limited-range planar YUV, including 10/12-bit.
Reference white and HLG interpretation must be explicit. Alpha video, arbitrary
RGB/full-range containers and ambiguous/duplicate PTS fail explicitly.
Frame decode has a 30-second deadline; initial probe has a 120-second deadline
and 64 MiB PTS-output bound. Cancellation kills and drains the child; a subsequent
request can reopen. `FRAMEWEAVE_FFPROBE` must name a reviewed installed tool.
For AV1 10-bit software decode, use an explicitly provisioned FFmpeg with a
qualified decoder; this Windows bundled 6.1.1 libaom rejected the test stream.

## GPU-only state checkpoints

After a completed stateful frame:

```ts
await renderer.nativeStateCheckpoint('save', 'shot/frame-24');
// ... advance consecutive authored stateStep calls ...
await renderer.nativeStateCheckpoint('restore', 'shot/frame-24');
// Replay beginning at the saved cursor's next step.
await renderer.nativeStateCheckpoint('release', 'shot/frame-24');
```

Snapshot copies and restoration use the existing GPU queue/device; no state
pixels are read by the CPU. Each snapshot retains all persistent state buffers
and their epoch/step cursors. Storage is charged against the admitted session
budget, including reconfiguration. Names are immutable until release, bounded,
owner-local, and die with the owner. Different sessions cannot import them.
Restore invalidates previous slot publications and Renderer prepared/cache data.
Stateful plans remain serial. Rewinding an active media encoder is rejected.

This is not a disk checkpoint or a snapshot of JS closures, React hooks, modules,
external I/O, or Servo DOM. Such authored history still needs an explicit reset
and deterministic replay; the runtime never pretends arbitrary JS is rewindable.
GPU reset/replay via the existing `stateStep` epoch contract remains supported.

## HEVC, AV1 and accurate HDR delivery

```powershell
frameweave render scene.tsx --output hevc.mp4 --encoder hevc_nvenc
frameweave render scene.tsx --output av1.mp4 --encoder av1_nvenc
frameweave render scene.tsx --settings hdr.json --output hdr.mp4 --encoder hevc_nvenc
frameweave render scene.tsx --settings hdr.json --output hdr-av1.mp4 --encoder av1_nvenc
frameweave frame scene.tsx --settings hdr.json --frame 0 --output linear.exr
```

Without settings, video uses the SDR display/packing path on the selected GPU.
The default H.264 encoder is libx264. Use --encoder to select h264_nvenc,
hevc_nvenc, av1_nvenc, libx265, or libaom-av1 explicitly. Set FRAMEWEAVE_FFMPEG
to a local FFmpeg build with the requested encoder if needed. Hardware
availability and dimensions are checked by an actual encoder invocation.

With professional settings v1, native output is explicitly materialized as an
F32 final-delivery Surface and fed to the existing PME ProfessionalVideoEncoder.
This route supports exact colorimetric or reference OCIO/ACES2 transforms,
explicit alpha flattening, HDR10/HLG and AU-1 placed audio with exact sample
intervals. Working color must match the native composition; use explicit
`convertColor` upstream for mixed encodings. EXR preserves float/alpha/color
metadata, including negative and extended RGB. PNG remains the normal SDR path.

Example `hdr.json`:

```json
{
  "schemaVersion": 1,
  "media": {
    "workingColor": {
      "primaries": "rec2020", "whitePoint": "D65", "transfer": "linear",
      "reference": "scene", "range": "full", "referenceWhiteNits": 100
    }
  },
  "video": {
    "preset": "hdr10",
    "outputColor": {
      "primaries": "rec2020", "whitePoint": "D65", "transfer": "pq",
      "reference": "display", "range": "full",
      "referenceWhiteNits": 100, "peakNits": 1000
    },
    "conversion": {
      "kind": "ocio", "clip": false,
      "transform": {
        "source": "Linear Rec.2020", "display": "Rec.2100-PQ - Display",
        "view": "ACES 2.0 - HDR 1000 nits (Rec.2020)"
      }
    },
    "alpha": {"mode": "flatten", "matte": [0, 0, 0]},
    "hdr10": {
      "masteringDisplay": {
        "red": [0.708, 0.292], "green": [0.17, 0.797],
        "blue": [0.131, 0.046], "white": [0.3127, 0.329],
        "minNits": 0.005, "maxNits": 1000
      },
      "maxCLL": 1000, "maxFALL": 400
    }
  }
}
```

HEVC/AV1 NVENC HDR uses an explicit planar 10-bit intermediate before P010.
An implicit 8-bit format-negotiation step is forbidden. Pinned FFmpeg cannot
feed raw HDR static side data into these hardware encoders, so the existing
encoded picture stream is tagged with actual HEVC prefix SEI or AV1 metadata
OBUs, preserving picture bytes and timestamps, then stream-copied into the final
container. This is real bitstream metadata, not just container color tags.
The adapter is bounded/streaming and has malformed-input tests. No codec source
was copied; syntax references are in `src/media/hdr-metadata.ts`.

Accurate final output currently includes GPU readback, CPU OCIO/packing and an
additional metadata/remux pass. It is not the resident preview path or a
zero-copy encoder. Preview remains GPU resident, and cannot request final
Surface readback without explicit host `nativeGpu.readback: 'final-surface'`.
Encoder quality remains lossy; a fixed-color test is not a universal quality
guarantee. HLG does not receive PQ mastering metadata.

## Reproduction and boundaries

Run `tests/native-media-delivery.test.ts`, `tests/hdr-metadata.test.ts` and the
existing native state/resource/frame-binding/audio regressions. Diagnostic
GPU inspections require an explicit `build.mjs --diagnostics` build; CLI requires
a production build/receipt. Set the existing SpiderMonkey, media Python and
FFprobe paths explicitly. Tests use a private FRAMEWEAVE_HOME.

Windows x64 / Vulkan / RTX 5070 Laptop is qualified by the checked-in evidence
under `validation/media-input-state-hdr`. The media delivery regression also
passed under Debian 13 x64 on WSL2 with Mesa EGL/GLES on Intel integrated
graphics and FFmpeg 7.1.5. It exercised declared video decode and seek, float
EXR, HEVC and AV1 HDR10 with audio, HLG and reference OCIO/ACES2 conversion.
The Linux test uses `libx265` and `libaom-av1` for encoding. Set
`FRAMEWEAVE_AV1_DECODE_FFMPEG` to a reviewed decoder with 10-bit AV1 support.

Bare-metal Linux, macOS, long media, production multi-camera workloads,
alpha-video decode and cross-process checkpoint persistence remain unverified.
The isolated Windows
Media Foundation probe returned real NV12 GPU textures, but also a 50 ms PTS
offset against the source. It is intentionally not enabled as a production
decoder before frame identity and synchronization are proven.
