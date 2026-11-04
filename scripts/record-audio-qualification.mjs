import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),art=join(root,'artifacts/main-audio-intervals'),out=join(root,'docs/main-audio-intervals');await mkdir(out,{recursive:true});
const campaign=JSON.parse(await readFile(join(art,'campaign.json'),'utf8')),delivery=JSON.parse(await readFile(join(art,'delivery.json'),'utf8'));
const evidence={...campaign,setupAndLauncherReservationMs:20000,chargedMs:campaign.spentMs+20000,delivery,commands:[]};
for(const command of campaign.commands)evidence.commands.push({...command,rawStdout:await readFile(command.stdout,'utf8'),rawStderr:await readFile(command.stderr,'utf8')});
if(evidence.chargedMs>=420000)throw Error('Audio campaign exceeds the human validation limit');
await writeFile(join(out,'qualification.json'),JSON.stringify(evidence,null,2)+'\n');
await writeFile(join(out,'REPORT.md'),`# Main audio interval delivery — 2026-11-04

Core source: ${delivery.sourceCommit}, baseline fd5c6bf007e16a0d2a84c8b13f9d84533d43fee4.
PASS for the tested source feature; complete npm/GPU/cross-platform release NOT qualified.

- Existing AU-1 tests: 15/15. New resource/worker/Session/media tests: 7/7.
  Final source campaign also passed full repository TypeScript checking.
- The 87.381354s stereo F32 WAV late 64-sample request returns exact PCM with
  512 payload bytes read; unrelated 40MiB data is not loaded into the Stage.
  Integrity hashes still stream complete sealed files; this is not a claim of
  512 total bytes of filesystem I/O.
- Real FLAC/AAC, two-track MOV, 44.1k conversion, 48/96k resampling/remix,
  random/repeated reads, private returned buffers, fresh JS realms, modified
  realm constructors/prototypes, cancel/close, missing streams, complete coverage,
  external container references and source/build tampering were exercised.
- Official two-Stage PortRef -> RenderSession -> WAV at 30000/1001 FPS:
  first-frame 1601 samples and zero sample error. Official CLI example:
  48048 stereo Float32 samples, ffprobe metadata and complete FFmpeg decode,
  max sample error ${delivery.maxSampleError}, output ${delivery.output}.
- Measured validation ${campaign.spentMs.toFixed(3)}ms, plus conservative 20000ms
  setup/launcher reservation = ${evidence.chargedMs.toFixed(3)}ms (<420000).
  Failed attempts are retained: initial TypeScript issues and zero-sign fixture
  assertions; the 150021ms pipe wait timeout was fixed by consuming partial pipe
  buffers. Subsequent real decoder tests passed. No numerical tolerance widened.
- Runtime Pin: ${delivery.runtimePin.integrity}. Historical plugin/package locks
  were not rewritten; changed SDK pins require explicit future lock review.
  No dependency, permission, Mixer, WASM or ordinary variable semantics changed.

API and repeatable commands: [Audio Resource intervals](../AUDIO_RESOURCE_INTERVALS.md).
Raw attempt logs and precise source digests: [qualification.json](./qualification.json).

Limitations: compressed backward cache misses restart from sample zero; existing
Session content sealing can still hash large sources per request. AudioBlock/1
transport remains bounded and long sources use multiple requests. Old whole-block
decode remains explicitly bounded. RF64 and unknown WAV layouts/subformats fail
explicitly. FFprobe is an explicit host prerequisite for compressed metadata.
Full npm release/installation, six export modes, all-GPU/full-repository runtime
tests and non-Windows platforms were not rerun. Agent-4 also reported the separate
mixed Native Session audio materialization guard; that additional finding is not
claimed fixed by this interval-service qualification. No worktree was synchronized
for this audio delivery.
`);
console.log(JSON.stringify({chargedMs:evidence.chargedMs,sourceCommit:delivery.sourceCommit}));
