# Basic editing library — work in progress

Rounds 1–3 provide project-frame trimming, splitting, concatenation, image/video overlay, fit/placement, speed/reverse/freeze/time remapping, subtitle parsing/preparation/burn-in and Native GPU output. They lower to the existing Composition, Stage, Resource and Layer contracts. Importing this module starts no runtime.

See [the editable cuts example](examples/cuts.tsx). Authors describe clips; the library owns temporary GPU images and geometry. The Stage returns one caller-owned scene-linear Rec709 premultiplied F16/F32 image. Source assets remain controlled Resources. Video defaults to **explicit CPU input decoding**, with tagged Rec709 interpreted at 100 nits; composition is GPU rendering. Set `decoder:'hardware'` to require the qualified hardware profile. It never silently falls back. Unknown/conflicting color tags fail through the existing importer. Use explicit interpretation for HDR. PNG assumptions require `missingProfile:'assume-srgb'` or an actual profile.

All `from`, `duration`, `at` and split positions are **project frames**, not source nominal frame indices. `frames(seconds,fps)` uses the existing Engine conversion. Source video sampling uses exact rational PTS; VFR selection belongs to the existing decoder. Cuts are half-open. A source range beyond actual media fails rather than freezing the last frame. Tracks are ordered bottom-to-top; overlaps require an explicit two-clip transition. Gaps show the authored background. Transforms accept existing Engine Signals and use the supplied Stage FrameContext. Time never advances by rendering.

Export `const edited=editingStage({fps:24,tracks:[...]})`, then `editComposition({width:640,height:360,factory:edited})`. The compiler resolves that named export through its existing ESM identity. The fixed plan remains in the Stage module, so the clip table is not sent again as frame props. Signals are evaluated inside the Stage against the supplied FrameContext. Advanced factories can still call `createEditingStage()` and use the serialized plan props supplied by the explicit `fps/tracks` form of `editComposition()`; serialization prevents Core's recursive props evaluation from replacing the authored Signals.

The library retains geometry for the Stage lifetime, releases per-frame intermediates after recording, and borrows the Session scope. A logical release is not a GPU completion barrier. Session/device recovery and cancellation still belong to the existing Renderer. Standalone callers must await recordings, release their result, wait through the owner's completion API, then dispose. Concurrent calls on one instance fail clearly. Changing a plan requires reopening the Session; no previous-frame cache is used by this library.

Main exposes ordinary SDK imports through `@frameweave/engine/editing` and explicit host preparation through `@frameweave/engine/editing/node`. These use the existing SDK/Native boundaries; managed R1 project-top-level authoring remains a separate contract. Examples use carried relative source imports. No new registry, mixer, renderer, clock or runtime is introduced.

Seven-round acceptance: (1) basic video edits; (2) time/speed; (3) existing text/subtitle integration; (4) existing effect/transition integration; (5) audio editing; (6) Analysis-based edit assistance; (7) actual 20+ minute qualification. **Short media checks do not qualify long videos or audio.** Existing source decoder seek/cache and long audio limits are retained and recorded as integration boundaries. The source typography integration is present; Main's formal Node provider remains an independent integration gate.

## Try the editable example

From the repository root, using the existing reviewed Native/SpiderMonkey runtime and FFprobe:

```powershell
$env:FRAMEWEAVE_FFPROBE=(Get-Command ffprobe).Source
node --import tsx modules/editing/validation/prepare.ts
node --import tsx src/cli.ts frame modules/editing/examples/cuts.tsx --frame 12 --output artifacts/edit-cut.png --json
node --import tsx src/cli.ts storyboard modules/editing/examples/cuts.tsx --frames 0,12,23 --output artifacts/edit-board.png --json
node --import tsx src/cli.ts render modules/editing/examples/cuts.tsx --output artifacts/edit-cuts.mp4 --encoder libx264 --max-concurrency 1 --json
```

The explicit `libx264` selection is for this portable SDR example; it does not change the engine's default encoder. Input footage and PNGs must be inside the project or supplied through existing explicit package Resources. For a long shot, replace the fixture paths/sizes and clip frame counts. For Node-side metadata preparation, `inspectFootage()` from `./node.ts` reuses the existing media inspector and returns a typed asset; it does not decode the full movie or authorize Stage file access.

For raw Surface v2 input, specify `decode:'surface-v2'` and the source's actual `alpha` (`straight`, `premultiplied` or `opaque`). This profile currently requires source dimensions and scene-linear Rec709 to match the declared metadata. Straight input is associated once with the existing GPU prepare kernel, before texture filtering. No intermediate SDR8 conversion is introduced. The ordinary ICC image path uses the engine's existing SDR ICC adapter and its documented precision limits.

Validation: `node modules/editing/validation/run.mjs <unique-attempt>` records every attempted command and its wall time in `validation/evidence-round1/`; cumulative campaign allowance is 420 seconds including failures. Use a fresh worktree/campaign for independent reproduction, rather than deleting failed records. Numerical fixtures exercise raw RGBA/Alpha and visibility over black/white, signed HDR, F32/F16, cuts/gaps, repeat/random/reopened instances. Media fixtures exercise the actual public CLI and a fully decoded one-second H.264 output. H.264 loss is reported separately.

No dependency was added. Authoring/scheduling glue is original Apache-2.0 repository code. Rendering reuses Native Resource import, spatial-creation placement/textureQuad/constant/prepare/interpolation, GPU PixelEffects source-over and the existing CLI/encoder. Final SDK aliases, catalog discovery and Runtime Pin review remain Main's integration work.

## Time and speed

`speedClip(shot,2)` multiplies the current source rate and halves its duration (ceiling to whole project frames); `speedClip(reverseClip(shot),2)` therefore speeds up a reverse. `reverseClip()` reverses the existing sample sequence, and reversing twice restores it. `freezeClip(shot,13,48)` holds sample offset 13 of the clip for 48 project frames. Use `remapClip(shot,keyframes([...]))` for absolute source positions in project-frame units, evaluated against the actual Stage FrameContext. Do not also supply `from`/speed for an absolute mapping. Remapping an already-mapped clip replaces its mapping; speed/reverse helpers require an affine clip, with a clear error for unsupported composition.

See `examples/time.tsx`: forward at 3×, a hold and reverse at 3× in one editable one-second composition. Fractional source positions use the existing rational timestamp transport, with no accumulated `dt`, invented clock, hidden timestamp quantization or frame advancement. JS floating Signal values are encoded only if rational division reproduces the same Number; unsafe transport values fail. Static rational speeds remain exact within that transport. Source-boundary errors are retained. Sampling chooses actual containing source frames; no optical-flow interpolation is claimed.

These functions currently edit the **image stream**. Source audio has not been placed or time-stretched implicitly; explicit audio editing is round 5. Reverse/random access retains the existing decoder's seek cost and limits. It is not yet a long-video performance qualification.

Round-2 reproduction: `$env:EDIT_CAMPAIGN='round2'; node modules/editing/validation/run.mjs <unique-attempt>`. The independent ledger includes all failures. Real numerical checks use five GPU paths and independent expected frame formulas; the actual one-second encoded output is fully decoded and all 24 frame selections are compared separately from raw float correctness.

## Subtitles and titles

`parseSubtitles(text)` imports canonical three-digit-millisecond SRT or basic WebVTT using the original [subtitle.js 4.2.2](https://github.com/gsantiago/subtitle.js) MIT parser. Identifiers, multiline Unicode text and integer milliseconds are retained. Cue ranges are half-open; `subtitleFrames(cue,fps)` uses exact ceiling at both endpoints so visibility agrees with project sample times. `shiftSubtitles(cues,offsetMs)` explicitly moves them. Styling markup and cue settings require explicit `markup:'strip'` / `settings:'ignore'` policies; full WebVTT CSS/regions/karaoke and ASS are not implemented.

Node preparation uses the existing typography services, not a new font implementation:

```ts
const cues = parseSubtitles(srt);
const subtitles = await prepareSubtitles(cues, {
  width: 640, height: 360, fps: 24,
  services: typography, font: 'caption',
  style: {fontSize: 30, placement: 'bottom'}
});
// Add ...subtitles.tracks after your footage track.
```

Import `prepareSubtitles` / `prepareTitle` from the Node entry. `services` borrows an admitted `prepareParagraph(text,options)` provider, or the existing font/itemizer/path services. The caller owns and disposes that provider. Main's official `@frameweave/engine/typography/node` provider is available at its integrated checkpoint. This checkout also verified its frozen, independently installed preparation SDK slice through the typed seam, with newly prepared English/Chinese, real Native F32/F16 output and public PNG. No WASM is granted by these helpers. Missing glyphs fail rather than using an undeclared OS font.

Defaults are centered white scene-linear text, a 68% black plate, bottom placement and proportional safe margins. Font size/wrapping are Node preparation values. Clip transforms/opacity still use the existing Signals. Overlapping cues require `overlap:'layer'`; sub-frame cues with no sampled video frame require retiming or explicit `empty:'skip'`. Repeated identical text in one preparation shares its layout. `prepareTitle(text,options)` returns a normal typed text asset usable with `clip()`.

The returned data contains actual canonical paragraph/glyph geometry. Rendering reuses Agent-2's Native paragraph renderer and the existing native-2d plate on the same GPU owner. Buffers are prepared during Stage initialization, before immutable seeds are sealed, and reused across frames. Therefore text plans must use resident `editingStage()` or `createEditingStage(init,{plan})`; a late text plan in frame props fails `E_EDIT_TEXT_INIT`. Prepared viewports remain intact and the existing edit quad handles output resampling; changing aspect ratio does not automatically reflow text. Runtime rendering needs no font/WASM execution. Preparing a new SRT remains an explicit Node step; editing the SRT alone does not regenerate its prepared module.

Actual editable example: `examples/captions.srt` → `examples/captions-prepared.ts` → `examples/captions.tsx`. `validation/prepare-text.ts` demonstrates newly prepared English/Chinese with explicitly authorized, copied and verified Rust/WASM build inputs. It is a validation adapter, not an installed R1 provider or creator default. `scripts/import-typography.mjs <reviewed-delivery>` copies build inputs locally; it never executes another worktree or installs that data directory. `scripts/fetch-demo-font.mjs` explicitly fetches the fixed, unmodified Noto Sans SC OFL font. The source commit, checksums and original licenses are carried under `licenses/` and `vendor/`; there is no automatic network/font discovery on import.

The official preparation path is separately editable in `examples/captions-formal.tsx`. Its `captions-formal-prepared.ts` is generated from the same SRT by `validation/prepare-formal-text.ts` using real `createTypography`. `scripts/import-formal-typography.mjs <frozen-tgz>` verifies the reviewed archive hash, copies it locally and installs it offline with scripts disabled in an isolated consumer. It does not replace the worktree's Core SDK. Set `EDIT_CAMPAIGN=round3`, explicit `EDIT_FORMAL_TYPOGRAPHY_DELIVERY`, and `EDIT_PHASE='^formal-'` to reproduce the formal follow-up, including its separate type configuration. The frozen slice is named `@frameweave/typography-preparation`; it is the official Node provider's same-source delivery, not the whole Engine/CLI distribution. No font execution or WASM authorization occurs during Native frame rendering.

Round-3 reproduction uses `EDIT_CAMPAIGN=round3` and an explicit `EDIT_TYPOGRAPHY_DELIVERY` for the source-service validation. The ledger preserves all attempts, including one manual diagnostic probe whose Native service timing is known but full process time was not captured. That row is marked UNKNOWN and charged a reservation; it is not presented as an exact campaign duration. Formal provider/installed-SDK validation remains a distinct integration gate.

## Effects and transitions

```ts
const opening = withEffects(clip(footage, {duration: 72}),
  effect('exposure', {stops: .3}), effect('glow', {radius: 3, intensity: .4}));
const main = clip(footage, {from: 120, duration: 240});
const track = sequenceWithTransitions([opening, main],
  transition('crossDissolve', {duration: 12}));
export const edited = editingStage({fps: 24, tracks: [track],
  effects: [effect('vignette', {amount: .2})]});
```

`effect()` describes a typed call to an **existing** algorithm: exposure, brightnessContrast, hueSaturation, vibrance, levels, curves, channelMix, blackAndWhite, tint, tritone, colorBalance, vignette, filmGrain, pixelate, lumaKey, chromaKey, despill, unsharpMask, blur or glow. Parameters and bounds remain those algorithms' contracts and accept their existing Core Signals. Blur defaults to sigma 2 pixels; Glow to sigma 6, intensity .5, threshold 1. Both use transparent boundaries by default, with explicit `boundary:'clamp'` available; inherited sigma maximum is 64. There is no CPU pixel fallback. Descriptors cannot override the Stage's format, working color, Alpha or cancellation.

Order: source sampling → fit/transform → ordered clip effects → clip opacity → transition → bottom-to-top source-over → ordered timeline effects → final format publication. Therefore blur radii use **composition pixels**, effects are not automatically expanded beyond the composition, and clip opacity scales any Glow too. This is a deliberate authoring profile, not an implicit replacement of every existing low-level effect API.

`transition()` selects crossDissolve, fadeThroughColor, directionalWipe, irisWipe or pushTransition. `sequenceWithTransitions()` explicitly overlaps the two declared clips: resulting length is their sum minus overlap durations. It uses their existing tails/heads, without inventing source handles. Supply one transition for every boundary or an array containing `null` hard cuts. The default progress samples both endpoints: `(frame-incoming.at)/(duration-1)`, with a one-frame transition using 1. Existing `progress` Signals may explicitly override this. Overlap must fit both clips; three simultaneously active clips on one track fail clearly. Ordinary `sequence()` remains hard cuts.

Enhanced plans use RGBA32F, premultiplied Alpha, scene-linear Rec709 internally, then publish the requested F16/F32 result. Inputs preserve the declared import/color interpretation. The original Native recipe processor owns scratch and retains its latest result; the editing adapter makes a distinct owned GPU publication at each nonempty chain end. No Canvas snapshot, JS pixel roundtrip or second GPU owner is introduced. Session owns completion/retirement; release only ends logical use. Plans without effects/transitions retain their previous internal format. This profile intentionally differs from repeatedly quantized SDR8 effect chains; it does not claim bitwise equivalence with those workflows.

Editable one-second scene: `examples/effects.tsx`. Generate its real source with `validation/prepare-effects.ts`, then use the same `frame`, `storyboard` and `render --encoder libx264 --max-concurrency 1` commands. Round-4 reproduction: `EDIT_CAMPAIGN=round4; node modules/editing/validation/run.mjs <unique-attempt>`. The existing effects/transitions, Gaussian/Glow kernels and processor are reused unchanged; no dependency, registry or license change is introduced.

## Audio editing

```ts
export const voice = audioSource('voice', './voice.wav', {
  sampleRate: 48000, layout: 'mono', sampleCount: 480000
});
// Add to editComposition({width, height, factory: edited, audio: [...]})
const voiceTrack = audioSequence(
  audioClip(voice, {from: 24, duration: 120, gain: .8, fadeIn: 6, fadeOut: 6})
);
```

`audioSource()` returns a named exported **existing AU-1 factory**, backed by a declared Resource. Supply real metadata; the actual file is checked at initialization. On Core `3b59e16` or a compatible successor it borrows `init.audio.info/read` before accessing legacy bytes. Long WAV and admitted compressed/container sources use bounded sample intervals through the original AU-1 host channel. The host owns decoder/file/cache lifetimes and cancellation. The Stage keeps no historical JS state or private file handle. On the older Core, only its existing bounded small-WAV byte path remains; nonzero stream selection or conversion fails `E_EDIT_AUDIO_CORE` rather than pretending support.

The source profile outputs mono/stereo 48/96 kHz. Optional `stream` is a zero-based **audio** stream ordinal, default 0. `conversion:{sampleRate:'resample',layout:'remix'}` explicitly permits rate/layout conversion; both default to `reject`. A movie can supply its admitted selected audio stream. Source and clip offsets are measured in the requested output sample rate. There is no implicit time stretch or pitch processing. Exact WAV `sampleCount` must match complete output samples (`floor(sourceCount * outputRate / sourceRate)` after explicit resampling). Compressed/container metadata is not an exact decoded length: the authored `sampleCount` defines the intended source view and every interval must actually cover it, without silence padding.

`inspectAudioSource()` remains the old, bounded WAV convenience inspector for explicit local paths. For a long, already compiler-declared Resource, Node preparation can borrow the genuine Core reader:

```ts
import {AudioResourceReader} from '@frameweave/engine/audio/node';
import {inspectAudioResource} from '@frameweave/engine/editing/node';
const reader = new AudioResourceReader(builtProject); // genuine compiler-sealed build
try {
  const info = await inspectAudioResource(reader, 'music', './music.wav');
  // Store the returned metadata in your prepared TS module for audioSource().
} finally { await reader.close(); }
```

This helper does not grant access or create a reader from an arbitrary path. It uses Core metadata and keeps whole PCM out of JS. Pass an explicit output profile/conversion for 44.1 kHz or multichannel input. Compressed sources also require an explicit `sampleCount`; unknown exact duration is reported as `E_EDIT_AUDIO_METADATA`. The usual short WAV preparation remains available before a project has been compiled.

`audioClip()` uses project-frame `from` and `duration`, or explicit `fromSamples` for a sample-precise source start, static/Core Signal `gain` and `pan`, and frame-count `fadeIn`/`fadeOut`. Choose `from` or `fromSamples`. `audioSequence()` creates hard placements; `audioAt()` allows explicit gaps/overlaps for mixing or crossfades. The existing mixer evaluates gain/pan/fade at absolute sample coordinates. Fades follow AU-1's linear amplitude convention, including zero at the final sample. Separate parent gain preserves arbitrary existing keyframes/springs without nesting them into unsupported expression operands. Source offsets and output lengths use the Engine's absolute rational frame-to-sample endpoints, without accumulated frame rounding. Each clip view puts its source offset in a normal sealed Stage prop and returns the requested local AudioBlock coordinates. Source boundaries, rate/layout mismatches and conflicting Resource identities fail explicitly. Audio must fit the authored composition; extend its duration explicitly.

`audioComposition({fps,tracks})` creates an ordinary audio-only Composition. For A/V use `editComposition({...audio:[voiceTrack,...musicTracks]})`. Audio does not enter the visual compositor. The library uses normal Stage mappings per placed clip, normal Layer trims/groups and the existing Session/mixer/encoder. Audio remains CPU PCM in AU-1's existing bounded worker; visual effects stay Native GPU. Visual implementation is loaded only when a Native factory executes, so the same TSX's audio evaluation does not initialize unrelated Three objects. A local data snapshot helper supports that worker without changing globals or clocks. No browser, second mixer, new timing system or implicit permissions are introduced.

Actual one-second examples: `examples/audio.tsx` and `examples/audio-only.tsx`; create their WAVs with `validation/prepare-audio.ts`. Commands used in validation:

```powershell
node --import tsx src/cli.ts create modules/editing/validation/audio-fixture.tsx --output artifacts/edit-mix.wav --format wav --sample-rate 48000 --layout stereo --wav-format float32 --json
node --import tsx src/cli.ts render modules/editing/examples/audio.tsx --output artifacts/edit-audio.mp4 --encoder libx264 --max-concurrency 1 --json
```

The older branch Core's whole-resource and whole-decode failure evidence remains in round 5. The frozen `3b59e16` Core interval service now passes actual 21-minute/483840000-byte source requests, including repeated/random intervals, cut boundaries and reopen, with exact PCM comparison. Explicit 44.1→48 kHz conversion/remix and selecting a second MOV audio stream also pass against actual FFmpeg reference PCM. The earlier filtered-manifest rejection is fixed by Main1521cad, and Main cf214 resource-close ordering is included in the qualified isolated snapshot. The actual21-minute A/V qualification below now passes; historical failures remain in `AUDIO_CORE_GAPS.md`. Session cancellation follows existing terminal behavior; open a new Session after cancellation. Native queue and worker/device cleanup remain with their existing owners.

`examples/long.tsx` is an editable 21-minute, three-shot A/V cut with matching reordered audio. `validation/prepare-long.ts` generates real source media. `validation/run-long.mjs` retains one cumulative round-7 ledger, including setup and failed attempts. Its final owner campaign follows the later scoped testing-time/development-time authorization documented below; Main integration keeps its own separate short-validation policy. Its frozen Core source copy and editing overlay live entirely in this worktree; no other worktree is executed or modified, and this is not an installed SDK distribution. Round7 now qualifies an actual21-minute640×36024fps file using explicit hardware source decoding, with30240 decoded frames, matching reordered audio, source/cut comparisons and inspected decoded frames. It does not qualify all media profiles or an independently installed release.

Round-5 reproduction: `EDIT_CAMPAIGN=round5; node modules/editing/validation/run.mjs <unique-attempt>`. The main verifier renders/fully decodes a real MP4; `EDIT_PHASE='^(types|encode)$'` with `EDIT_MEDIA_RUN=<media-attempt>` separately examines its actual encoded waveform/timestamps. Raw mixed PCM/WAV errors and AAC/H.264 loss are kept separate. New code is Apache-2.0 repository glue over existing Core services; no dependency or copied external algorithm was added.

## Analysis-assisted edits

Prepare once in trusted local Node code, using the existing C3 task/executor/artifact store:

```ts
const {analysis, cues} = await analyzeEditSource('./source.mov', {
  projectRoot: projectDirectory, sceneThreshold: 10,
  silenceDb: -35, minSilenceSeconds: .25
});
await verifyCueSource(cues, './source.mov', {projectRoot: projectDirectory});
const selected = audibleRanges(cues, {paddingSeconds: .08});
// Save selected as ordinary editable data; there is no analysis in the frame loop.
const pictureClips = clipsFromRanges(footage, selected, {fps: 24, rounding: 'cover'});
const soundClips = audioFromRanges(sound, selected, {fps: 24, rounding: 'cover',
  audioOffsetSeconds: cues.audio.offsetSeconds});
```

`analyzeEditSource`, `readEditCues` and `verifyCueSource` belong to the Node entry. Selection helpers belong to the ordinary editing entry. `sceneRanges(cues)` partitions at measured cuts; `audibleRanges()` complements measured silence, adds explicit padding, joins short gaps and applies a minimum duration. It detects audible content, not speech. `snapToOnsets(cues,times,tolerance)` returns explicit matched/unmatched nearest candidates. An empty selection stays empty; choose content before creating a finite composition.

Algorithms are the original FFmpeg [scdet, silencedetect and astats](https://github.com/FFmpeg/FFmpeg/blob/n6.1.1/doc/filters.texi). Video scene times use integer PTS and the source time base; audio onset candidates use integer source samples and the measured window length. Silence times retain FFmpeg's text formatting precision, reported as `silenceTimeResolutionSeconds` for the reviewed six-significant-digit formatter. They are not sample-exact boundaries. RMS-rise candidates are windowed energy changes, not a musical beat/tempo model, transcription or semantic highlight detector. Encoded-source luma scores are independent of the scene-linear rendering color transform; no display/HDR render is silently replaced.

Range conversion is explicit: `rounding:'sample'` (default) selects the project sample times in the interval using ceil at both ends; `'cover'` expands to whole frames using floor/ceil to retain sound at subframe edges. Adjacent cover ranges can repeat a boundary frame. Use matching policies for picture and sound. Audio alignment uses actual stream PTS when available; offsets must be representable in source samples. Source footage ranges become ordinary 1x clips, after which existing time helpers remain available. No new timebase or runner is introduced.

The Node helper admits only paths below the explicit project root, uses the configured FFmpeg/FFprobe, records input/algorithm/helper/binary hashes and reauthenticates published bytes. `verifyCueSource()` rejects changed media before edit generation. Regenerate recommendations when replacing media; it does not rewrite locks. C3 owns cancellation, process cleanup and atomic publication. Metadata is streamed to artifact files; pixels and full PCM do not enter JS. `maxRecords` (default 1000000), `maxInputBytes` (16 GiB) and `timeoutMs` (300000) are configurable request budgets, not total timeline-duration limits. Existing C3 artifact budgets remain in effect. Discontinuous/incomplete audio metadata fails rather than becoming invented silence. The source profile selects the first video/audio stream; no multi-track editorial policy is inferred.

Editable workflow: `validation/prepare-smart.ts` creates one-second real media, runs C3 and writes `examples/smart-prepared.ts`. `examples/smart.tsx` turns those measured selections into a half-second A/V composition. `examples/smart-audio.tsx` exercises its audio through the current pure-audio Session route. The historical A/V `Session.mixAudio` gap and its Main fix are recorded in `AUDIO_CORE_GAPS.md`; the existing public Native export path produces the actual A/V video.

Reproduce with `EDIT_CAMPAIGN=round6` and `validation/run.mjs`; its default sequence includes source preparation, strict types, targeted units and actual media. `EDIT_PREPARE_RUN=<preparation-tag>` points the verifier at the recorded preparation. The paused attempt07 has unknown process-wide time and is charged a conservative allowance; previous successes and failures remain. The public `analyze list` snapshot has no registered edit-cues adapter on this baseline. This module exports a real C3 definition and Node service; Main owns registration in the existing public Analysis catalog/CLI, not a new registry. See the Node input/output types in `analysis-task.ts`. No claim that this new capability already runs through the public `analyze run` command is made.

No dependency was added. The LGPL original filters are invoked through the existing separately provisioned FFmpeg binary; source references and build-license distinction are in `licenses/ffmpeg-analysis.json`. No FFmpeg source is copied into Apache TypeScript. The scoped long-video source acceptance below passes; independently installed SDK/CLI remains Main L3.


Round7 final: editable `examples/long-hardware.tsx` has the same source bytes as the real qualified project (three seven-minute selections, source order0→14→7min). `video(...,{decoder:'hardware'})` is explicit and requires the admitted runtime; no CPU fallback or default export policy was changed. `examples/long.tsx` retains the ordinary CPU default. Neither entry manages GPU buffers or temporary images. The final local file and its SHA256/size are in `validation/evidence-round7/final.json`; selected decoded frames, probe, complete-decode log and all earlier failures are tracked beside it. The282,935,348-byte final MP4 stays outside Git.

Replay on a fresh isolated frozen snapshot: use `EDIT_PHASE=setup|prepare` with `validation/run-long.mjs`, then the reviewed `patch` and `closepatch` phases, followed by `qualify`. These modify only this worktree's ignored `.frameweave/editing/core-3b59` snapshot, not its checkout Core or another worktree. Do not reapply patches to an already patched snapshot or reset the existing ledger. Actual commands/env/model/binary receipts are preserved. Public Native CLI used `render <entry> --encoder h264_nvenc --max-concurrency 8 --initial-concurrency 8 --json`; first-cut calibration also supplied `--from 419.5 --to 420.5` (CLI arguments are separate tokens in the raw receipt/script). Full decode checks both streams and source locations; AAC has512 padding samples and is assessed as lossy audio, not PCM identity. Startup error matches an independent source-only AAC encode.

The human explicitly extended the original420s allowance, then replaced repeated budget requests with testing-time<development-time. One original ledger retains all timed commands and failures; `work-timing.json` records a conservative active-development wall-time lower bound, excluding font work/paused gaps and reserving60s for unmeasured harness overhead. No new Native renders follow successful long qualification.


Main consolidation (2026-11-04): committed editing source through `cb1c24aa` is integrated into the existing SDK entries. The long-media results above belong to the owner's explicitly patched frozen Core snapshot and matching older Native binary. They are not a rerun of the current Main/Rust distribution. Installed/portable and cross-machine qualification remain separate.
