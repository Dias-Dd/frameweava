/** Bounded Main integration checks. Never overwrites a prior run or refreshes locks. */
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const phase=process.argv[2]??'fast',out=resolve(process.env.CHECKPOINT_EVIDENCE??'artifacts/main-committed-checkpoints'),ledger=join(out,'campaign.json');
await mkdir(out,{recursive:true});
let campaign;try{campaign=JSON.parse(await readFile(ledger,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;campaign={budgetMs:419000,reservedMs:10000,runs:[]};}
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sourceStatus=execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
const nativeEnv={...process.env,FRAMEWEAVE_HOME:resolve('.frameweave/checkpoint-home'),FRAMEWEAVE_NATIVE_GPU:resolve('native-bin/win32-x64/frameweave-native-gpu.exe'),FRAMEWEAVE_SPIDERMONKEY:resolve('native-bin/win32-x64/frameweave-spidermonkey-host.exe'),FRAMEWEAVE_AUTHORING_RUN:join(out,'image-native')};
nativeEnv.FRAMEWEAVE_SPHERICAL_RUN=join(out,'spherical');
nativeEnv.FRAMEWEAVE_SPHERICAL_CASES='1,3,8,10';
nativeEnv.FRAMEWEAVE_SPHERICAL_FRAMES='0,1,0';
const unitFiles=[
 'tests/native-image-authoring.test.ts','tests/native-image-advanced.test.ts','tests/native-image-authoring-families.test.ts','tests/native-image-authoring-data.test.ts','tests/native-image-authoring-fields.test.ts','tests/native-image-authoring-neural.test.ts','tests/native-image-authoring-sam2.test.ts','tests/native-image-authoring-video.test.ts',
 ...['model','time','subtitles','effects','audio','audio-resource','smart'].map(n=>`modules/editing/validation/${n}.test.ts`),
 ...['model','canvas-layout','svg'].map(n=>`modules/native-2d/validation/${n}.test.ts`),'modules/native-2d/validation/fonts/cancellation.test.mjs','tests/native-close-order.test.ts'
];
const commands=phase==='editing'?[['editing-long-evidence',['scripts/check-editing-long-evidence.mjs'],20000]]:{fast:[['types',['node_modules/typescript/bin/tsc','--noEmit'],80000],['units',['--import','tsx','--test','--test-concurrency=4',...unitFiles],80000]],native:[['decoder-audio',['--import','tsx','--test','--test-concurrency=1','tests/native-video-decoder.test.ts','tests/mixed-audio-execution.test.ts'],60000],['image-native',['--import','tsx','modules/native-effects/authoring/verify.ts','scenes'],100000]],decoder:[['decoder-with-probe',['--import','tsx','--test','tests/native-video-decoder.test.ts'],60000]],types:[['final-types',['node_modules/typescript/bin/tsc','--noEmit'],70000]],spherical:[['spherical-units',['--import','tsx','--test','tests/native-spherical.test.ts'],30000],['final-types',['node_modules/typescript/bin/tsc','--noEmit'],70000],['spherical-native',['--import','tsx','modules/native-effects/spherical/verify-single.ts'],90000]]}[phase];
if(!commands)throw Error('Use fast, native, decoder, spherical, editing or types');
if((phase==='native'||phase==='decoder')&&!nativeEnv.FRAMEWEAVE_FFPROBE)throw Error('Set FRAMEWEAVE_FFPROBE to an explicitly reviewed ffprobe executable');
if(commands.some(([name])=>campaign.runs.some(r=>r.name===name)))throw Error('Refusing to overwrite an attempted check');
const used=campaign.reservedMs+campaign.runs.reduce((n,r)=>n+r.wallMs,0);
if(used+commands.reduce((n,c)=>n+c[2],0)>=campaign.budgetMs)throw Error('Remaining cumulative campaign budget is too small');
await mkdir(nativeEnv.FRAMEWEAVE_AUTHORING_RUN,{recursive:true});
await mkdir(nativeEnv.FRAMEWEAVE_SPHERICAL_RUN,{recursive:true});
let saving=Promise.resolve();
const results=await Promise.all(commands.map(async([name,args,timeoutMs])=>{
 const started=new Date().toISOString(),t=performance.now(),child=spawn(process.execPath,args,{env:nativeEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',timedOut=false;child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const timer=setTimeout(()=>{timedOut=true;if(process.platform==='win32'){const stop=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.on('error',()=>child.kill());}else child.kill('SIGKILL');},timeoutMs);
 const result=await new Promise(r=>{child.once('error',e=>{stderr+=String(e);r({exitCode:null,error:String(e)});});child.once('close',(code,signal)=>r({exitCode:code,signal}));});clearTimeout(timer);
 const row={name,args,started,sourceCommit,sourceStatus,wallMs:performance.now()-t,timedOut,...result,tests:Object.fromEntries([...stdout.matchAll(/^# (tests|pass|fail|cancelled|skipped) (\d+)$/gm)].map(m=>[m[1],Number(m[2])]))};
 await writeFile(join(out,name+'.stdout.txt'),stdout);await writeFile(join(out,name+'.stderr.txt'),stderr);campaign.runs.push(row);
 saving=saving.then(()=>writeFile(ledger,JSON.stringify(campaign,null,2)+'\n'));await saving;
 console.log(JSON.stringify(row));return row;
}));
const chargedMs=campaign.reservedMs+campaign.runs.reduce((n,r)=>n+r.wallMs,0);console.log(JSON.stringify({phase,chargedMs,budgetMs:campaign.budgetMs,ledger}));
if(results.some(r=>r.exitCode!==0||r.timedOut)||chargedMs>=campaign.budgetMs)process.exitCode=1;
