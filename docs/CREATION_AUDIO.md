# Unified creation and Audio Stage

Trusted ordinary TS/TSX can use the public SDK and named factory exports:

```powershell
frameweave create examples/creation/audio.tsx --output tone.wav --json
```

Source checkout: prefix the arguments with `node --import tsx src/cli.ts`.
Installed package: use its normal `frameweave` executable. `export` still exports editable projects; `create` produces media. Direct `frameweave project.tsx` remains interactive preview.

Engine can be omitted. Native visual factories use the Native runtime; `defineAudioStage` marks CPU audio factories. Actual managed requirements are intersected; conflicts fail, never auto-split. Opaque native code declares dependencies using `Stage.requires`. Factories must be named exports, or use entry/exportName plus explicit audio metadata. No implicit serialization of closures.

Use ordinary Layer for both media types. `content.audio(ref('sound','audio'),{sampleRate,durationSamples})` describes actual PCM output. Layer start/end are project frames; audio.startSample is a sample-precise project placement within start's frame; sourceOffsetSamples/sourceEndSample trim source material. Gain/Pan use the existing Signal evaluator at each sample. Parent intervals/gain apply. Mono/stereo mixing uses Float64 accumulation, then Float32 output. No PCM is carried in JSON/Surface.

One high-level `content.video(...,{audio:content.audio(...)})` explicitly links video and audio, lowering to normal visual/audio Layers. Merely declaring both output types on a Stage does not link them. `ref(stage)` still means the surface port. With no authored Layers, legacy implicit placement takes each Stage's first surface and first audio separately; write explicit Layers to exclude intermediate outputs.

Explicit Composition duration wins; otherwise finite placed content determines the frame endpoint. Unplaced media does not extend an explicitly placed work. Unknown/infinite duration requires an explicit bound. Audio natural end and trim remain sample precise within the finite frame range; inferred project duration is rounded up to frame coverage, so WAV can include the final frame's residual silence.

Default outputs: one visual frame PNG; finite visual sequence MP4; audio-only WAV; mixed MP4. Explicit PNG/WAV emits an omission warning for the other media. Choose MOV explicitly. Source range start/end is half-open. Visual ranges work; AU-1 audio/mixed export v1 explicitly rejects partial ranges rather than silently ignoring them. Legacy render/preview video commands reject placed audio and direct users to create; frame/storyboard remain visual captures.

Public Node `renderCreation({project,output,format?,start?,end?,audio?,render?,signal?})` uses the formal Session and audio exporter. Audio defaults: actual unique placed 48/96k rate, stereo, Float32 WAV, clip reject, no dither. Integer PCM quantization may be configured explicitly; Float32 retains headroom. MP4 uses AAC (lossy and padded); MOV uses PCM24. Default video is explicit SDR Rec.709/H.264 with a black matte. CLI `--settings` uses existing PME settings, `--audio-settings` accepts a Quantization JSON object; `--sample-rate`, `--layout`, `--wav-format`, `--block-samples` override audio policy. No implicit resampling. Audio media export uses project dimensions, not preview resizing.

Public paths: `@frameweave/engine/audio` for portable authoring/DSP, `/audio/node` for host I/O/export, `/node` for renderCreation, and existing `/render-session` for describeAudio/evaluateInterval/mixAudio. Audio-only execution launches no Chromium and generates no placeholder image.

Limits: stateless DSP, rate 1, zero lookaround/latency/tails; mono/stereo mixer; no resampling, state recovery, RF64, audio-only MOV/MP4, partial audio media export or V-SHARED audio interval transactions. Existing resource/block budgets are enforced. Trusted CPU code runs in bounded Workers with restricted realms; node:vm is not an OS sandbox for malicious third-party code. CSP, P4 visual ABI, WASM consent and runtime/plugin pins remain enforced.
