# Audio Resource interval service

`AudioStageInit.audio` is the existing AU-1 host/worker channel's declared-resource
service. It does not retain authored JavaScript state between requests.

```ts
const info = await init.audio.info('music', 0);
const pcm = await init.audio.read({
  resourceId: 'music',
  stream: 0, // audio stream ordinal, not a container-wide stream index
  interval: {unit: 'samples', sampleRate: 48000, start: 2880000, endExclusive: 2880064},
  layout: 'stereo',
  conversion: {sampleRate: 'reject', layout: 'reject'},
});
```

The interval is absolute in the **requested output sample rate** and half-open.
The returned value-owned `AudioBlockV1` has exactly that coverage and startSample.
Choose `sampleRate:'resample'` and/or `layout:'remix'` explicitly when needed.
Conversion uses the admitted host FFmpeg decoder, never implicit time stretching.
If a clip has a source offset, rebase the returned startSample to its Stage local
coordinates before returning it as the Stage output. Missing samples fail with
`E_AUDIO_COVERAGE`; the service does not pad silence. Existing Mixer/Layer behavior
is unchanged.

`info()` returns source sample rate, channel count and known layout. PCM WAV has
an exact sampleCount. Compressed/container duration is not claimed to be an exact
decoded count. `read()` validates actual complete decoded coverage instead.

PCM WAV supports the existing s16/s24/f32 and named-speaker-mask contracts. Direct
reads scan headers and seek to the requested bytes. Other source rates (including
44.1 kHz) require explicit resampling into AU-1's 48/96 kHz output profiles. RF64,
multiple WAV data chunks and unsupported WAV subformats fail explicitly.
MP3, FLAC, AAC/M4A, Ogg/Opus, MP4/MOV, Matroska/WebM and AVI use an explicit audio
stream selection and the existing host FFmpeg installation. Compressed/container
metadata requires `FRAMEWEAVE_FFPROBE` or the operator's `audioResources.ffprobe`.
MP4/MOV additionally passes the existing self-contained-container gate; external
data references are forbidden. No authored path, executable or decoder handle is
accepted or returned.

The host retains bounded file, metadata, decoder and LRU PCM cache state. Sequential
requests reuse the same paused/backpressured decoder. A backward miss restarts at
decoded sample zero for exact alignment; it is **not a constant-time compressed
seek**. Long forward seeks can therefore be expensive. Per-request timeout,
cancellation, malformed output, source changes and lease close release affected
resources. Open-source and cache eviction close the decoder/file they own.

The first resource admission streams the compiler's existing byte-sensitive build
seal, including other assets, without retaining whole asset bytes. Subsequent
accesses validate the admitted file identity/size/high-resolution modification
stamp before and after use. RenderSession still validates source/build content
hashes and trust before and after requests. This reuses the existing local-code
trust model; Node vm restrictions are not an OS sandbox for malicious code.

Legacy `init.resources[id]` still returns bytes synchronously in the Audio realm.
It now loads only an accessed Resource. Large whole-byte access reports
`E_AUDIO_RESOURCE_BUDGET` and points to `init.audio.read()`. The old
`decodeAudioFile()` remains an explicitly bounded whole-block API: a six-second
whole decode can still exceed its AudioBlock budget. Long sources should use
sample intervals rather than raising a whole-source allocation.

Operator options on `openRenderSession(project,{audioResources:{...}})`,
`Renderer.create(build,{audioResources:{...}})` and `exportAudioProject()`:

| Option | Default | Meaning |
|---|---:|---|
| maxRequestBytes | 16 MiB | PCM bytes in a single service request |
| maxCacheBytes | 64 MiB | Retained PCM/legacy byte cache; zero disables it |
| maxLegacyBytes | 32 MiB | One legacy whole-resource byte access |
| maxOpenSources | 8 | LRU file/decoder leases |
| maxProbeBytes | 256 KiB | Decoder/container metadata |
| decoderTimeoutMs | 30000 | One host operation, including admission |
| ffmpeg / ffprobe | Existing FFmpeg / explicit FFprobe environment | Host executables |

These are configurable operation/cache defaults, not total-source-size ceilings.
The existing AudioBlock/1 transport remains bounded to 262144 sample frames and
16 MiB. Larger works use multiple requests. Stage execution timeouts remain in
effect as well. Native/SpiderMonkey/Node permissions and WASM consent are unchanged.

Node hosts may import `AudioResourceReader` and `AudioResourceOptions` from
`@frameweave/engine/audio/node`; the reader requires a genuine sealed BuiltProject
and owns its close lifecycle. Authored Stage code uses `init.audio` instead.

Mixed Native projects retain the **complete** compiler-sealed BuiltProject.
`Renderer.createAudio(build, options)` uses the same Renderer implementation and
queue, initializing just its audio execution closure; do not manufacture an
audio-only manifest. A RenderSession starts without a GPU for audio-only requests,
replacing its single owned Renderer when an image is first requested. Subsequent
audio requests can use that Native Renderer. Explicit CPU dependencies, port
validation, timing, cancellation and cache checks remain in the common path.
Native image dependencies cannot be implicitly materialized as audio inputs.
The original whole-project Shared-host preflight is retained: selection is not
permission or transaction isolation, and Shared intervals remain unsupported.
Both Session cancellation and Native export's audio phase interrupt the standard
Audio worker; they do not wait for its full Stage timeout. Native/ORT shutdown
still completes before host resource leases are deleted.

Reproducible authoring example (from the repository root):

```powershell
node --import tsx examples/audio-intervals/prepare.ts
npm run frameweave -- create examples/audio-intervals/project.tsx --output examples/audio-intervals/clip.wav
node scripts/verify-audio-intervals.mjs quick
```

The test runner records all attempts against a cumulative <420-second campaign
budget, including failures/timeouts. It does not run the full repository/GPU
suite. A full engine npm distribution still requires the separately qualified
matching Native release binary; this feature's source tests do not certify that
release package or other operating systems.
