import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,open,stat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve('.'),out=resolve('artifacts/native-effects/roto-authoring'),phase=process.argv[2],commands={
 neuraltypes:['node_modules/typescript/bin/tsc','--project','.frameweave/frozen-native-inference/sdk-bd188034/modules/native-effects/roto-authoring/tsconfig.neural.json','--pretty','false'],
 types:['node_modules/typescript/bin/tsc','--project','modules/native-effects/roto-authoring/tsconfig.json','--pretty','false'],
 syntax:['--import','tsx','modules/native-effects/roto-authoring/syntax.ts'],
 model:['modules/native-effects/roto-authoring/prepare.mjs'],
 build:['modules/native-effects/roto-authoring/build-fixture.mjs'],
 unit:['--import','tsx','--test','tests/native-roto-authoring.test.ts'],
 gpu:['--import','tsx','modules/native-effects/roto-authoring/verify.ts','gpu'],
 manifest:['--import','tsx','modules/native-effects/roto-authoring/verify-manifest.ts'],
 neuralchecks:['--import','tsx','modules/native-effects/roto-authoring/verify-neural-checks.ts'],
 neuralmedia:['--import','tsx','modules/native-effects/roto-authoring/verify-neural-media.ts'],
 neural:['--import','tsx','modules/native-effects/roto-authoring/verify-neural.ts'],
 media:['--import','tsx','modules/native-effects/roto-authoring/verify-paint-media.ts'],
 performance:['--import','tsx','modules/native-effects/roto-authoring/verify-performance.ts'],
 freeze:['modules/native-effects/roto-authoring/freeze.mjs']};
if(!Object.hasOwn(commands,phase))throw Error('Expected types/unit/gpu/media/performance/freeze');
await mkdir(out,{recursive:true});const file=join(out,'campaign.json');let ledger;try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const start=JSON.parse(await readFile('modules/native-effects/roto-authoring/implementation.json','utf8')).startedAt;ledger={version:1,scope:'Extension round3/4, neural masks and pressure paint/contour authoring; all attempts share one ledger.',base:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),budgetMs:420000,implementationStart:start,implementationMsBeforeFirstTest:Date.now()-Date.parse(start),attempts:[]};}
const spent=ledger.attempts.reduce((s,a)=>s+a.wallMs,0);if(spent>=Math.min(ledger.budgetMs,ledger.implementationMsBeforeFirstTest))throw Error('Cumulative verification budget exhausted');
const types=await readFile('modules/native-effects/roto-authoring/types.ts','utf8'),names=types.match(/plannedAuthoringNames=\[([^\]]+)/)?.[1].match(/'\w+'/g).map(v=>v.slice(1,-1)),body=(await readFile('modules/native-effects/roto-authoring/filters.ts','utf8'))+(await readFile('modules/native-effects/roto-authoring/neural.ts','utf8')),implemented=new Set([...body.matchAll(/async (\w+)\(/g)].map(v=>v[1]));if(!names||names.length<20||names.some(n=>!implemented.has(n)))throw Error('Complete all domain function bodies before starting tests');
const dir=join(out,`${ledger.attempts.length+1}-${phase}`);await mkdir(dir,{recursive:true});const receipts=[];for(const entry of await readdir('modules/native-effects/roto-authoring')){if(!/\.(ts|mjs|json)$/.test(entry))continue;const file='modules/native-effects/roto-authoring/'+entry;receipts.push({file,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});}await writeFile(join(dir,'source-receipt.json'),JSON.stringify({base:ledger.base,files:receipts},null,2));const stdout=await open(join(dir,'stdout.log'),'w'),stderr=await open(join(dir,'stderr.log'),'w'),start=performance.now(),date=new Date().toISOString(),child=spawn(process.execPath,commands[phase],{cwd:root,windowsHide:true,stdio:['ignore',stdout.fd,stderr.fd],env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/user-home'),FRAMEWEAVE_ROTO_AUTHORING_RUN:dir}});let timedOut=false;
const timer=setTimeout(()=>{timedOut=true;try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill('SIGKILL');}catch{}},Math.min(180000,ledger.budgetMs-spent,ledger.implementationMsBeforeFirstTest-spent));let code;try{code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});}finally{clearTimeout(timer);await stdout.close();await stderr.close();}
ledger.attempts.push({phase,date,command:[process.execPath,...commands[phase]],code,timedOut,wallMs:performance.now()-start,stdout:join(dir,'stdout.log'),stderr:join(dir,'stderr.log')});ledger.spentMs=ledger.attempts.reduce((s,a)=>s+a.wallMs,0);await writeFile(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify(ledger.attempts.at(-1)));if(code!==0){console.log((await readFile(join(dir,'stdout.log'),'utf8')).slice(-12000));console.log((await readFile(join(dir,'stderr.log'),'utf8')).slice(-12000));process.exitCode=1;}
