import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/main-integration-20261103'),file=join(out,'campaign.json');
await mkdir(out,{recursive:true});let ledger;
try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={version:1,baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),budgetMs:419000,spentMs:0,commands:[]};}
const tasks={
 setup:[['runtime',['scripts/prepare-merged-runtime.mjs']]],
 audit:[['audit',['--import','tsx','scripts/audit-main-merge.ts']]],
 types:[['types',['node_modules/typescript/bin/tsc','--noEmit']]],
 catalog:[['catalog',['--import','tsx','modules/pro-animation/scripts/build-catalog.ts']]],
 l0:[['l0',['--import','tsx','--test','tests/shared-state-native.test.ts','tests/native-stage-ports.test.ts','tests/composite-stage.test.ts','tests/pro-animation-pa4-property.test.ts','modules/native-2d/validation/model.test.ts','modules/native-2d/validation/canvas-layout.test.ts']]],
 integration:[['integration',['--import','tsx','scripts/verify-merged-libraries.ts']]],
 inventory:[['inventory',['scripts/build-function-catalog.mjs']]],
};
const phase=process.argv[2];if(phase==='runtime')tasks.runtime=[tasks.setup[0]];if(phase==='final')tasks.final=[...tasks.types,...tasks.integration,...tasks.inventory];if(phase==='check')tasks.check=[...tasks.types,...tasks.l0,...tasks.catalog];if(!tasks[phase])throw Error('Choose setup, types, catalog, l0, integration or inventory');
const remaining=ledger.budgetMs-ledger.spentMs;if(remaining<1000)throw Error('Validation budget exhausted; retain this ledger');
const source=execFileSync('git',['diff','HEAD','--binary'],{cwd:root,maxBuffer:16*1024**2}),head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
let projected=0;const running=new Map(),completed=[];
async function run([name,args],i){
 const prefix=join(out,(ledger.commands.length+i+1)+'-'+name),started=performance.now();let stdout='',stderr='';
 const result=await new Promise(done=>{const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/main-merge-home'),FRAMEWEAVE_MEDIA_PYTHON:process.env.FRAMEWEAVE_MEDIA_PYTHON??join(root,'.frameweave/pme-python/Scripts/python.exe')}});running.set(child,started);const timer=setTimeout(()=>child.kill(),Math.min(remaining-1000,150000));child.stdout.on('data',b=>{stdout+=b;if(name==='integration')process.stdout.write(b);});child.stderr.on('data',b=>stderr+=b);child.on('error',e=>stderr+=String(e));child.on('close',(code,signal)=>{clearTimeout(timer);running.delete(child);done({exitCode:code,signal});});});
 const entry={name,args,...result,ms:performance.now()-started,head,workingPatchSha256:createHash('sha256').update(source).digest('hex'),stdout:prefix+'.stdout.log',stderr:prefix+'.stderr.log'};
 completed.push(entry);await Promise.all([writeFile(entry.stdout,stdout),writeFile(entry.stderr,stderr)]);console.log(JSON.stringify({name,...result,ms:entry.ms}));if(result.exitCode!==0)console.error((stderr+'\n'+stdout).slice(-6500));return entry;
}
const guard=setInterval(()=>{projected=completed.reduce((n,e)=>n+e.ms,0)+[...running.values()].reduce((n,t)=>n+performance.now()-t,0);if(projected>remaining-1000)for(const child of running.keys())child.kill();},100);
let results;try{if(phase==='check'||phase==='final')results=await Promise.all(tasks[phase].map(run));else{results=[];for(const job of tasks[phase]){const result=await run(job,results.length);results.push(result);if(result.exitCode!==0)break;}}}finally{clearInterval(guard);}
ledger.commands.push(...results);ledger.spentMs+=results.reduce((n,e)=>n+e.ms,0);await writeFile(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({totalMs:ledger.spentMs,budgetMs:ledger.budgetMs}));if(results.some(e=>e.exitCode!==0))process.exitCode=1;
