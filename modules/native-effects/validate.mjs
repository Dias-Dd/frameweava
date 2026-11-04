// Single campaign ledger. Reuse phases/setup; never reset failed attempt time.
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {spawn,execFileSync} from 'node:child_process';
const root=resolve('.'),phase=process.argv[2],spatial=phase?.startsWith('spatial-'),raster=phase?.startsWith('raster-'),pa=phase?.startsWith('pa-'),color=phase?.startsWith('color-'),builtin=phase?.startsWith('builtin-'),io=phase?.startsWith('io-'),out=join(root,'artifacts/native-effects',io?'checkpoint-io':builtin?'checkpoint-builtin':color?'checkpoint-color':pa?'checkpoint-pa':raster?'checkpoint-raster':spatial?'checkpoint-spatial':'checkpoint-1');await mkdir(out,{recursive:true});
const implemented=await readFile(join(root,'modules/native-effects/images.ts'),'utf8'),names=implemented.match(/nativeImageEffectNames=\[([\s\S]*?)\]/)?.[1].match(/'\w+'/g)??[];if(new Set(names).size<20)throw Error('Migrate at least twenty original effect functions before validation');
const commands={build:['modules/native-gpu/build.mjs','--release'],diagnostics:['modules/native-gpu/build.mjs','--diagnostics'],types:['node_modules/typescript/bin/tsc','--project','modules/native-effects/tsconfig.json','--noEmit','--pretty','false'],unit:['--import','tsx','--test','tests/native-effects.test.ts'],gpu:['--import','tsx','modules/native-effects/validation.ts','gpu'],performance:['--import','tsx','modules/native-effects/validation.ts','performance'],media:['--import','tsx','modules/native-effects/validation.ts','media']};
commands.contracts=['--import','tsx','modules/native-effects/validation.ts','contracts'];
commands.extended=['--import','tsx','modules/native-effects/validation.ts','extended'];
commands.extendedMedia=['--import','tsx','modules/native-effects/validation.ts','extendedMedia'];
commands.extendedChain=['--import','tsx','modules/native-effects/validation.ts','extendedChain'];
commands.regression=['--import','tsx','modules/native-effects/validation.ts','regression'];
commands['spatial-types']=['node_modules/typescript/bin/tsc','--project','modules/native-effects/spatial/tsconfig.json','--noEmit','--pretty','false'];
commands['spatial-unit']=['--import','tsx','--test','tests/native-spatial.test.ts','tests/mesh-deformation.test.ts','tests/spatial-compute.test.ts','tests/spatial-fields.test.ts','tests/spatial-vfx.test.ts'];
for(const phase of ['numeric','vfx','math','media','performance','contracts','evidence'])commands['spatial-'+phase]=['--import','tsx','modules/native-effects/spatial/validate.ts',phase];
commands['raster-types']=['node_modules/typescript/bin/tsc','--project','modules/native-effects/raster/tsconfig.json','--noEmit','--pretty','false'];
commands['raster-unit']=['--import','tsx','--test','tests/native-raster.test.ts','tests/gpu-image-effects.test.ts','tests/gpu-image-matte.test.ts','tests/gpu-image-tile.test.ts','tests/gpu-image-over.test.ts','tests/gpu-image-crossfade.test.ts','tests/gpu-image-replace-matte.test.ts'];
for(const p of ['gpu','media','performance','ab'])commands['raster-'+p]=['--import','tsx','modules/native-effects/raster/validate.ts',p];
commands['raster-evidence']=['modules/native-effects/raster/freeze.mjs'];
commands['raster-inventory']=['modules/native-effects/audit.mjs','modules/native-effects/inventory.json'];
commands['pa-types']=['node_modules/typescript/bin/tsc','--project','modules/native-effects/pa/tsconfig.json','--noEmit','--pretty','false'];
commands['pa-unit']=['--import','tsx','--test','tests/native-pa-images.test.ts','tests/native-effects.test.ts','tests/native-raster.test.ts','tests/pro-animation-float.test.ts','tests/pro-animation-pa2-procedural.test.ts'];
for(const p of ['gpu','contracts','media','performance','precision','bipolar','ab','borrowed','mean'])commands['pa-'+p]=['--import','tsx','modules/native-effects/pa/validate.ts',p];
commands['pa-inventory']=['modules/native-effects/audit.mjs','modules/native-effects/inventory.json'];
commands['pa-evidence']=['modules/native-effects/pa/freeze.mjs'];
commands['pa-runtime']=['modules/native-effects/pa/runtime-proof.mjs','copy-delivery'];
commands['pa-diagnostics']=['modules/native-gpu/build.mjs','--diagnostics'];
commands['color-runtime']=['modules/native-effects/color/runtime.mjs'];
commands['color-types']=['node_modules/typescript/bin/tsc','--project','modules/native-effects/color/tsconfig.json','--noEmit','--pretty','false'];
commands['color-unit']=['--import','tsx','--test','tests/native-color-effects.test.ts','tests/native-effects.test.ts','tests/native-pa-images.test.ts','tests/native-raster.test.ts'];
for(const p of ['gpu','contracts','media','performance'])commands['color-'+p]=['--import','tsx','modules/native-effects/color/validate.ts',p];
commands['color-inventory']=['modules/native-effects/audit.mjs','modules/native-effects/inventory.json'];
commands['color-evidence']=['modules/native-effects/color/freeze.mjs'];
commands['builtin-types']=['node_modules/typescript/bin/tsc','--project','modules/native-effects/builtin/tsconfig.json','--noEmit','--pretty','false'];
commands['builtin-unit']=['--import','tsx','--test','tests/native-builtin-effects.test.ts','tests/native-effects.test.ts','tests/native-pa-images.test.ts','tests/native-raster.test.ts'];
for(const p of ['gpu','contracts','media','performance','time'])commands['builtin-'+p]=['--import','tsx','modules/native-effects/builtin/validate.ts',p];
commands['builtin-inventory']=['modules/native-effects/audit.mjs','modules/native-effects/inventory.json'];
commands['builtin-evidence']=['modules/native-effects/builtin/freeze.mjs'];
commands['io-prepare']=['--import','tsx','modules/native-effects/io/prepare.ts'];
commands['io-types']=['node_modules/typescript/bin/tsc','--project','modules/native-effects/io/tsconfig.json','--noEmit','--pretty','false'];
commands['io-unit']=['--import','tsx','--test','tests/native-image-input.test.ts','tests/native-color-effects.test.ts','tests/native-effects.test.ts'];
commands['io-checks']=['--import','tsx','modules/native-effects/io/verify.ts'];
commands['io-inventory']=['modules/native-effects/audit.mjs','modules/native-effects/inventory.json'];
commands['io-evidence']=['modules/native-effects/io/freeze.mjs'];
if(raster){const source=await readFile(join(root,'modules/native-effects/raster/filters.ts'),'utf8'),names=source.match(/nativeRasterEffectNames=\[([^\]]+)\]/)?.[1].match(/'\w+'/g)??[];if(new Set(names).size<20)throw Error('Migrate twenty raster functions before validation');}
if(spatial){const source=await readFile(join(root,'modules/native-effects/spatial/frame.ts'),'utf8'),groups=JSON.parse(source.match(/nativeSpatialNames=(\{[\s\S]*?\}) as const/)?.[1]??'{}');if(Object.values(groups).reduce((n,a)=>n+a.length,0)<20)throw Error('Migrate twenty new spatial algorithms before validation');}
if(phase.startsWith('extended')){const source=await readFile(join(root,'modules/native-effects/extended.ts'),'utf8'),added=source.match(/additionalNativeEffectNames=\[([\s\S]*?)\]/)?.[1].match(/'\w+'/g)??[];if(new Set(added).size<20)throw Error('Migrate twenty additional functions before the next batch tests');}
if(!Object.hasOwn(commands,phase))throw Error('Specify build/diagnostics/types/unit/gpu/performance/media/contracts');
const file=join(out,'campaign.json');let state;try{state=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;state={version:1,baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),attempts:[],budgetMs:420000};}
if(spatial&&!state.scope){state.scope='New mesh/compute/fields/vfx migration after frozen 95b74c7adf7d87f1bc15227c448af244e441e6bb, not a reset of image qualification';state.priorCampaign='artifacts/native-effects/checkpoint-1/campaign.json';}
if(raster&&!state.scope){state.scope='New 23 legacy Surface image operations after frozen 043c5ff44ef24e4ddd32c8d15fc75dabb8fcad94. Prior image/spatial campaigns remain frozen, not reset.';state.priorCampaigns=['artifacts/native-effects/checkpoint-1/campaign.json','artifacts/native-effects/checkpoint-spatial/campaign.json'];}
if(pa&&!state.scope){state.scope='Six remaining PA/InnerShadow image adapters after frozen 0c4111fedcfec8bf63b768c07ab12b2856120858. User explicitly approved a final batch below twenty functions. Prior raster campaign is frozen, not reset.';state.priorCampaigns=['artifacts/native-effects/checkpoint-raster/campaign.json'];}
if(color&&!state.scope){state.scope='Complete remaining automatic-colour category: four original statistics plus existing 23 Raster/six PA explicit workingColor contracts on the newly delivered owner. Starts after frozen PA 22370b1; not a reset/retry of its completed campaign. No shared owner/algorithm changes.';state.priorCampaigns=['artifacts/native-effects/checkpoint-pa/campaign.json'];}
if(builtin&&!state.scope){state.scope='Seven remaining Core/legacy builtin professional image contracts after frozen colour f08d86d8. User explicitly permits <50 final existing-library cleanup. Root plugin audit added; old Canvas8 remains unchanged, no byte-parity claim, temporal prefix is an explicit owner gap.';state.priorCampaigns=['artifacts/native-effects/checkpoint-color/campaign.json'];}
if(io&&!state.scope){state.scope='Restore the existing explicit importImage helper and close CPU-input/declared-resource end-to-end paths after frozen e40bfd3. Not a new pixel effect or a reset of the completed builtin campaign. Existing owner upload/resource/trust limits are preserved.';state.priorCampaigns=['artifacts/native-effects/checkpoint-builtin/campaign.json'];}
const spent=state.attempts.reduce((s,r)=>s+r.wallMs,0);if(spent>=state.budgetMs)throw Error('Cumulative campaign validation budget exhausted');
const observedCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(observedCommit!==state.baseCommit){state.externalBaseline=observedCommit;state.baselineReason='User-authorized Main synchronization during this campaign; budget is NOT reset. Earlier raw results retain their pre-sync qualification.';}
const id=state.attempts.length+1,dir=join(out,`${id}-${phase}`);await mkdir(dir,{recursive:true});const log=await open(join(dir,'raw.log'),'w'),start=performance.now(),date=new Date().toISOString();
const child=spawn(process.execPath,commands[phase],{cwd:root,windowsHide:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/user-home'),FRAMEWEAVE_NATIVE_EFFECTS_RUN:dir}});let timedOut=false;
const timeout=setTimeout(()=>{timedOut=true;if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill('SIGKILL');},Math.min(180000,state.budgetMs-spent));
let code;try{code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});}finally{clearTimeout(timeout);await log.close();}
state.attempts.push({phase,date,sourceCommit:observedCommit,command:[process.execPath,...commands[phase]],pid:child.pid,code,timedOut,wallMs:performance.now()-start,log:join(dir,'raw.log')});state.spentMs=state.attempts.reduce((s,r)=>s+r.wallMs,0);await writeFile(file,JSON.stringify(state,null,2)+'\n');console.log(JSON.stringify(state.attempts.at(-1)));if(code!==0){console.log((await readFile(join(dir,'raw.log'),'utf8')).slice(-10000));process.exitCode=1;}
