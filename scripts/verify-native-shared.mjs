import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/native-shared'),file=join(out,'campaign.json');
await mkdir(out,{recursive:true});
let campaign;try{campaign=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;campaign={version:1,baseline:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),budgetMs:419000,spentMs:0,commands:[]};}
const jobs={
 unit:[['unit',['--import','tsx','--test','tests/shared-state-native.test.ts']]],
 core:[['types',['node_modules/typescript/bin/tsc','--noEmit']],['regression',['--import','tsx','--test','tests/shared-state-native.test.ts','tests/native-data-export.test.ts','tests/native-stage-ports.test.ts']]],
 regression:[['regression',['--import','tsx','--test','tests/shared-state-native.test.ts','tests/native-only-rendering.test.ts','tests/native-data-export.test.ts','tests/native-stage-ports.test.ts']]],
 integration:[['integration',['--import','tsx','scripts/verify-native-shared-integration.ts']]],
};
const phase=process.argv[2]??'unit';
const selected=phase==='final'?[...jobs.core,...jobs.integration]:jobs[phase];if(!selected)throw Error('Use unit, core, regression, integration, or final');
const remaining=campaign.budgetMs-campaign.spentMs;if(remaining<1000)throw Error('Shared validation budget exhausted; do not reset the ledger');
const receiptFiles=['src/shared-state/protocol.ts','src/render/renderer.ts','modules/shared-state/plan.ts','modules/shared-state/session-adapter.ts','modules/render-session/index.ts','modules/native-gpu/authoring.ts','modules/native-gpu/logic-host.ts','modules/native-gpu/scope.ts','modules/spidermonkey-host/bootstrap.ts','modules/stage-orchestration/native-port-types.ts','modules/stage-orchestration/native-ports.ts','modules/native-gpu/service.ts','modules/shared-state/native-delivery.ts','examples/native-shared/project.tsx','scripts/verify-native-shared-integration.ts','tests/shared-state-native.test.ts','tests/native-stage-ports.test.ts'];
const sources={};for(const p of receiptFiles)try{sources[p]=createHash('sha256').update(await readFile(join(root,p))).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;}
async function runJob([name,args],i,limit){
 const prefix=join(out,(campaign.commands.length+i+1)+'-'+name),started=performance.now();let stdout='',stderr='';
 const result=await new Promise(resolve=>{const child=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/native-shared-home'),FRAMEWEAVE_MEDIA_PYTHON:process.env.FRAMEWEAVE_MEDIA_PYTHON??join(root,'.frameweave/pme-python/Scripts/python.exe')}});const timer=setTimeout(()=>child.kill(),limit);child.stdout.on('data',b=>{stdout+=b;if(name==='integration')process.stdout.write(b);});child.stderr.on('data',b=>stderr+=b);child.on('error',e=>{stderr+=String(e);});child.on('close',(code,signal)=>{clearTimeout(timer);resolve({exitCode:code,signal});});});
 const entry={name,args,ms:performance.now()-started,...result,sources,stdout:prefix+'.stdout.log',stderr:prefix+'.stderr.log'};
 await Promise.all([writeFile(entry.stdout,stdout),writeFile(entry.stderr,stderr)]);console.log(JSON.stringify({name,ms:entry.ms,...result}));if(result.exitCode!==0)console.error((stderr+'\n'+stdout).slice(-2600));return entry;
}
if(phase==='final'){
 const short=Math.min(30000,Math.floor((remaining-2000)/4)),long=Math.min(180000,remaining-short*2-2000);
 if(long<1000)throw Error('Insufficient remaining budget for the final batch');
 const results=await Promise.all(selected.map((job,i)=>runJob(job,i,i===2?long:short)));campaign.commands.push(...results);campaign.spentMs+=results.reduce((n,x)=>n+x.ms,0);if(results.some(x=>x.exitCode!==0))process.exitCode=1;
}else{
 for(const job of selected){const entry=await runJob(job,0,Math.min(campaign.budgetMs-campaign.spentMs-1000,180000));campaign.commands.push(entry);campaign.spentMs+=entry.ms;await writeFile(file,JSON.stringify(campaign,null,2)+'\n');if(entry.exitCode!==0){process.exitCode=1;break;}}
}
await writeFile(file,JSON.stringify(campaign,null,2)+'\n');console.log(JSON.stringify({totalMs:campaign.spentMs,budgetMs:campaign.budgetMs}));
