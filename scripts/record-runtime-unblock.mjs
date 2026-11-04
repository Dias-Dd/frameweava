import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),art=join(root,'artifacts/main-runtime-unblock'),out=join(root,'docs/main-runtime-unblock');await mkdir(out,{recursive:true});
const ledger=JSON.parse(await readFile(join(art,'campaign.json'),'utf8')),sync=JSON.parse(await readFile(join(root,'outputs/main-sync/agent2-latest.json'),'utf8'));
const qualification={...ledger,sourceCommit:sync.after,setupLauncherAndSyncReservationMs:30000,chargedMs:ledger.spentMs+30000,sync,runtime:JSON.parse(await readFile(join(art,'runtime.json'),'utf8')),servo:JSON.parse(await readFile(join(art,'servo.json'),'utf8')),ort:JSON.parse(await readFile(join(art,'ort.json'),'utf8')),commands:[]};
for(const command of ledger.commands)qualification.commands.push({...command,rawStdout:await readFile(command.stdout,'utf8'),rawStderr:await readFile(command.stderr,'utf8')});
if(qualification.chargedMs>=420000)throw Error('Cumulative campaign limit exceeded');await writeFile(join(out,'qualification.json'),JSON.stringify(qualification,null,2)+'\n');
await writeFile(join(out,'REPORT.md'),`# Main: Agent-2 synchronization and two blockers — 2026-11-04

Frozen Main source: ${sync.after}. Integration baseline: e25824f1716cea8c9b94108ef55102c1d2bba409.

- Resident source 1b1229a2a48fcbc6abf3ef426fe14a65a889a80a and evidence
  4a1d09273054016ffff828243e895f298acda104 integrated as 21fb328f/58a5a2e8.
- Servo frozen source 8d29413930416d1037c03007cf8e9d3d9a445a94,
  745f722c6ca464fc0ccec19a131ac0b3333e4f70 and evidence
  1f6cd3c3a70f81522cb3ac657171f767b1568ee0 integrated as c04bb8d2/3ef8a5e9/4a2d5f4b.
  No moving development branch HEAD was merged.
- Public /servo and /servo/node exports and compiler/typechecker aliases are
  connected. Portable SDK classification admits exact index/stage/document files;
  Node preparation is separate. Flat normalizes the equivalent relative SDK imports.
- NativeLogicHost Stage disposal and resource-lease deletion now have separate
  phases. Renderer waits for Stage/JS shutdown with GPU alive, then actual Native
  process/ORT exit, then lease removal. Genuine failures remain visible.

Main validation PASS for the stated scope:

- 14 focused unit/regression cases; whole repository TypeScript checking.
- Real resident geometry F16/F32, random/repeated frames, replacement/index moves,
  no repeated upload, PNG and independently decoded three-frame MP4.
- Official Servo Stage/Node imports; original HTML/CSS/JS unavailable; evaluated
  CSS variables, random/repeated F32 frames and PNG; Flat, Capsule and source-tree
  re-render comparisons; relative-import Flat compile; Node preparation rejected
  in a Stage; three-slot three-frame MP4 independently decoded.
- Two original SlimSAM ONNX models from verified receipt eaf27d62... were copied
  as immutable inputs into Main's own test directory. The minimal Core-only
  three-slot MP4 and complete decode passed using reviewed ORT DirectML ABI1;
  runtimeVerified=true, cpuFallback=false and close succeeded. This targets the
  same model/lease failure path; it does not requalify Agent-3's whole effect library.
- Measured commands ${ledger.spentMs.toFixed(3)}ms plus conservative 30000ms for
  setup/launching/sync = ${qualification.chargedMs.toFixed(3)}ms, below 420000.
  Earlier test-fixture failures are retained: missing explicit readback permission,
  missing negative-fixture fps/duration, and NVENC minimum-size rejection. Only
  the affected tail was rerun with explicit software video encoding for the tiny
  fixture. Production GPU/pixel quality and safety rules were not relaxed.

Agent-2 was synchronized **once**, to the frozen source above. All ${sync.draftsPreserved}
uncommitted files were preserved with no collisions archived; its node_modules,
.frameweave, outputs and work directories were not copied or linked to another
checkout. Native/SM and optional Servo assets were individually copied with
receipts. Current matched release SHA is ${sync.nativeSha256}; it includes the
resident checkpoint plus Servo's later native dimension guard. The old resident
release was not paired with changed Rust source.

The eleven authoring SDK drafts remain in place. Main Runtime Pin:
${sync.mainRuntimePin}; Agent-2 Runtime Pin: ${sync.agentRuntimePin}.
The explicit difference is those retained drafts. Historical locks were not
rewritten. Backup and draft hashes: ${sync.backup}.

Limitations: Windows/Vulkan/RTX5070 Laptop only; Servo's own raster remains SDR8.
This campaign did not rerun full npm installation, all six export policy
combinations, the full repository runtime suite or other platforms. It does not
claim a fully qualified new npm release. The newer Agent-4 mixed-audio execution
and seal finding is assigned by the human to Agent-1 and was not modified here.
No Agent-1/3/4 workspace was synchronized; future Main commits do not authorize
another Agent-2 synchronization.

Raw commands, attempts, precise hashes and media paths are in qualification.json.
Reproduce focused stages with node scripts/verify-runtime-unblock.mjs
quick / resident / servo / ort. Optional native runtimes require their explicit
reviewed asset directories; this is not an installer that downloads or trusts them.
`);console.log(JSON.stringify({sourceCommit:sync.after,chargedMs:qualification.chargedMs}));
