import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
const root=resolve(import.meta.dirname,'..'),art=join(root,'artifacts/main-mixed-audio'),out=join(root,'docs/main-mixed-audio');await mkdir(out,{recursive:true});
const sourceCommit='1521cadac87460229161ffb19882f806d04671ef',ledger=JSON.parse(await readFile(join(art,'campaign.json'),'utf8')),proof=JSON.parse(await readFile(join(art,'intake.json'),'utf8')),real=JSON.parse(await readFile(join(art,'after.json'),'utf8'));
for(const [file,expected]of Object.entries(proof.protectedHashes))if(createHash('sha256').update(await readFile(join(root,file))).digest('hex')!==expected)throw Error('Protected resource/ORT implementation changed');
const historical=execFileSync('git',['diff','846f976a',sourceCommit,'--name-only'],{cwd:root,encoding:'utf8'}).trim().split(/\r?\n/);if(historical.some(file=>/(?:packages|plugins)\.lock\.json$/.test(file)))throw Error('Historical lock changed');
const qualification={...ledger,sourceCommit,runtimePin,setupAndLauncherReservationMs:20000,finalAuditChargeMs:2000,chargedMs:ledger.spentMs+22000,proof,real,locksRewritten:false,worktreesSynchronized:false,commands:[]};
for(const command of ledger.commands)qualification.commands.push({...command,rawStdout:await readFile(command.stdout,'utf8'),rawStderr:await readFile(command.stderr,'utf8')});if(qualification.chargedMs>=420000)throw Error('Campaign budget exceeded');
await writeFile(join(out,'qualification.json'),JSON.stringify(qualification,null,2)+'\n');
const mixed=real.rows.find(row=>row.name.startsWith('public runCLI')).detail;
await writeFile(join(out,'REPORT.md'),`# Main mixed A/V seal and cancellation — 2026-11-04

Frozen code: ${sourceCommit}, baseline846f976aa6d52ca6c4791d41fb51e31dd1b98448.
Owner source15ed28a3b62ab004ebff021fae94d756a7b18e05 plus
c2a2fd81123d9046590235346a8d7df0104659ad; evidenceff747ff2bf83ffcdace8915ccfdcf07e4d62bb19.
The frozen patch SHA2566a278ad78738ca38df166f1699dbd65a26ff54e6abfdafb16edd0a3efbf91e9a
was checked/applied as a function-level integration, not an old Renderer replacement.

PASS within the tested scope. Renderer.createAudio retains the full authenticated
BuiltProject and shares normal queues/topology/ports/caches. Session owns one
Renderer, initializes audio before any GPU request, upgrades for an image and can
evaluate audio after Native initialization. Native media audioTrack no longer
substitutes an audio-only manifest.

Main retained original whole-project Shared-host preflight and added a negative
regression; execution pruning cannot prune transaction/permission checks. Native
export audioTrack also observes AbortSignal immediately. Original resource reader,
adapter, worker and NativeLogicHost hashes are unchanged; Renderer.close's ORT
shutdown method remains byte-identical. No Rust/wire/permission change or new
binary was needed for this repair. Existing matching Main runtime remains13b568f7.

Actual validation:

- Six mixed/close units and fifteen affected Audio/native-media regressions pass.
  Whole-source types pass, with a final type check after service cancellation wiring.
  Batches/source digests are separate in the raw ledger; this is not a claim that
  every historical attempt ran as one all-green invocation.
- 21-minute logical stereo F32 WAV, 483840000 PCM bytes: selected random/repeated,
  cut-straddling, reopened and before/after-Native requests are byte-exact. Fixture
  has deterministic head/tail signals and sparse zero middle; it is not a complete
  21-minute A/V export or a general compressed-seek/peak-memory benchmark.
- Official CLI exports24 frames/1second with8 Native slots. Full decode succeeds;
  PCM source count48000, AAC decode${mixed.decodedSamples} (128 codec padding),
  mean absolute error${mixed.mae}, cut amplitude ratio${mixed.cutAmplitudeRatio}.
  Output: ${mixed.output}.
- Modified tvg.json and fabricated audio-only manifests still fail integrity.
- Actual hanging Audio worker cancellation: Session104.8ms and Native export
  audio phase109.3ms, versus configured/default5s/20s timeouts.
- Measured/charged command ledger${ledger.spentMs.toFixed(3)}ms includes initial
  runner SyntaxError setup failures conservatively charged1000ms. Add20000ms
  launcher/setup reservation and2000ms final audit = ${qualification.chargedMs.toFixed(3)}ms (<420000).

Runtime Pin: ${runtimePin.integrity}. Historical package/plugin locks and trust
were not rewritten. The frozen code was immediately sent to Agent-4 for continued
qualification in its original round-7 budget. No worktree was synchronized.

Not qualified here: full21-minute output, throughput/peak RAM/VRAM, non-Windows
platforms, complete npm release/installation or all six export policies. Agent-4's
editing parent-chain/catalog integration remains separate. Existing AudioBlock/1
and explicit audio conversion/Shared restrictions remain in force.

Reproducible: node scripts/verify-main-mixed-audio.mjs prepare, quick, real,
cancel, regression, types. Original owner attempts/media remain under
modules/native-gpu/validation/mixed-av-seal/evidence; Main-specific raw logs,
media and source digests are embedded/referenced in qualification.json.
`);
console.log(JSON.stringify({sourceCommit,chargedMs:qualification.chargedMs,runtimePin}));
