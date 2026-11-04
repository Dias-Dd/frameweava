import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {performance} from 'node:perf_hooks';
const root=resolve('.'),out=resolve('modules/editing/validation/evidence-round7'),tag=process.argv[2]??'01';
if(!/^[\w-]+$/.test(tag))throw Error('Unique attempt tag required');await mkdir(out,{recursive:true});
// Human 2026-11-04: "再增加420秒预算". This extends this existing ledger;
// every previous setup, failed attempt and interrupted render remains charged.
const budgetAuthorization={date:'2026-11-04',instruction:'再增加420秒预算',previousMs:420000,additionalMs:420000,totalMs:840000};
let workTiming;try{workTiming=JSON.parse(await readFile(join(out,'work-timing.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const timePolicy={date:'2026-11-04',instruction:'不要再让我加预算了，我授权你只要测试时间少于开发时间就可以',developmentEvidence:'work-timing.json',prior840SecondAllowanceRetainedAsHistory:true};
const budgetMs=workTiming?Math.floor(workTiming.developmentWallLowerBoundMs-workTiming.unmeasuredHarnessReserveMs)-1000:840000;
if(!Number.isSafeInteger(budgetMs)||budgetMs<=0)throw Error('A positive measured-development allowance is required');
const env={...process.env,EDIT_EVIDENCE:out,EDIT_RUN:tag,EDIT_FROZEN_CORE:resolve('.frameweave/editing/core-3b59'),FRAMEWEAVE_HOME:resolve('.frameweave/editing/home-round7'),FRAMEWEAVE_NATIVE_GPU:resolve('native-bin/win32-x64/frameweave-native-gpu.exe'),FRAMEWEAVE_SPIDERMONKEY:resolve('native-bin/win32-x64/frameweave-spidermonkey-host.exe'),PYTHONDONTWRITEBYTECODE:'1'};
env.FRAMEWEAVE_FFPROBE??=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Command ffprobe).Source'],{encoding:'utf8',windowsHide:true}).trim();
env.FRAMEWEAVE_MEDIA_PYTHON??='C:/Users/ASUS/AppData/Local/Programs/Python/Python313/python.exe';
env.FRAMEWEAVE_MEDIA_RUNTIME??=resolve('native-bin/win32-x64/media');
env.PYTHONPATH??=[resolve('.frameweave/spatial-creation/aov-python-site'),resolve('.frameweave/spatial-creation/icc-python-site')].join(';');
const commands=[['setup',['modules/editing/validation/setup-long.mjs']],['supplement',['modules/editing/validation/setup-long.mjs','--supplement']],['types',['node_modules/typescript/bin/tsc','--noEmit','-p','modules/editing/validation/tsconfig.json']],['unit',['--import','tsx','--test','modules/editing/validation/audio.test.ts','modules/editing/validation/audio-resource.test.ts','modules/editing/validation/smart.test.ts','tests/audio.test.ts']],['prepare',['--import','tsx','modules/editing/validation/prepare-long.ts']],['patch',['modules/editing/validation/patch-long.mjs']],['closepatch',['modules/editing/validation/patch-close-long.mjs']],['real',['--import','tsx','modules/editing/validation/verify-long.ts']],['qualify',['--import','tsx','modules/editing/validation/qualify-long.ts']],['codec',['--import','tsx','modules/editing/validation/verify-long-aac.ts']]];
env.EDIT_PHASE??='^(setup|supplement|types|unit|prepare|patch|closepatch|qualify)commands.unshift(['frozen-overlay',['modules/editing/validation/refresh-long.mjs']],['frozen-types',['node_modules/typescript/bin/tsc','--noEmit','-p','.frameweave/editing/frozen-types.json']]);
for(const [name,args]of commands){if(env.EDIT_PHASE&&!new RegExp(env.EDIT_PHASE).test(name))continue;
 const previous=[];for(const f of await readdir(out))if(f.endsWith('-time.json'))previous.push(JSON.parse(await readFile(join(out,f),'utf8')));const remaining=budgetMs-previous.reduce((n,r)=>n+(r.wallMs??r.budgetChargeMs),0);if(remaining<2000)throw Error('Coherent round-7 campaign budget exhausted');
 const file=join(out,name+'-'+tag);try{await readFile(file+'-time.json');throw Error('Refusing evidence overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const start=performance.now(),child=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...env,EDIT_REMAINING_MS:String(remaining-1500)},stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
 // The final long render may use the remaining campaign allowance. All earlier
 // failures and setup/build operations remain charged in this same ledger.
 const timer=setTimeout(()=>child.kill(),remaining-500);const exitCode=await new Promise((yes,no)=>{child.once('error',no);child.once('exit',yes);});clearTimeout(timer);
 const row={command:[process.execPath,...args],exitCode,wallMs:performance.now()-start};await writeFile(file+'.stdout.txt',Buffer.concat(stdout));await writeFile(file+'.stderr.txt',Buffer.concat(stderr));await writeFile(file+'-time.json',JSON.stringify(row)+'\n');console.log(JSON.stringify(row));
 if(exitCode!==0){process.stdout.write(Buffer.concat(stdout));process.stderr.write(Buffer.concat(stderr));process.exitCode=1;break;}
}
const rows=[];for(const f of await readdir(out))if(f.endsWith('-time.json'))rows.push({file:f,...JSON.parse(await readFile(join(out,f),'utf8'))});await writeFile(join(out,'campaign.json'),JSON.stringify({budgetMs,budgetAuthorization,timePolicy,allCommandsTimed:rows.every(r=>typeof r.wallMs==='number'),cumulativeWallMs:rows.reduce((n,r)=>n+(r.wallMs??r.budgetChargeMs),0),includesFailedAttempts:true,rows},null,2)+'\n');
;
if(env.EDIT_PHASE?.includes('frozen'))commands.unshift(['frozen-overlay',['modules/editing/validation/refresh-long.mjs']],['frozen-types',['node_modules/typescript/bin/tsc','--noEmit','-p','.frameweave/editing/frozen-types.json']]);
for(const [name,args]of commands){if(env.EDIT_PHASE&&!new RegExp(env.EDIT_PHASE).test(name))continue;
 const previous=[];for(const f of await readdir(out))if(f.endsWith('-time.json'))previous.push(JSON.parse(await readFile(join(out,f),'utf8')));const remaining=budgetMs-previous.reduce((n,r)=>n+(r.wallMs??r.budgetChargeMs),0);if(remaining<2000)throw Error('Coherent round-7 campaign budget exhausted');
 const file=join(out,name+'-'+tag);try{await readFile(file+'-time.json');throw Error('Refusing evidence overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
 const start=performance.now(),child=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...env,EDIT_REMAINING_MS:String(remaining-1500)},stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
 // The final long render may use the remaining campaign allowance. All earlier
 // failures and setup/build operations remain charged in this same ledger.
 const timer=setTimeout(()=>child.kill(),remaining-500);const exitCode=await new Promise((yes,no)=>{child.once('error',no);child.once('exit',yes);});clearTimeout(timer);
 const row={command:[process.execPath,...args],exitCode,wallMs:performance.now()-start};await writeFile(file+'.stdout.txt',Buffer.concat(stdout));await writeFile(file+'.stderr.txt',Buffer.concat(stderr));await writeFile(file+'-time.json',JSON.stringify(row)+'\n');console.log(JSON.stringify(row));
 if(exitCode!==0){process.stdout.write(Buffer.concat(stdout));process.stderr.write(Buffer.concat(stderr));process.exitCode=1;break;}
}
const rows=[];for(const f of await readdir(out))if(f.endsWith('-time.json'))rows.push({file:f,...JSON.parse(await readFile(join(out,f),'utf8'))});await writeFile(join(out,'campaign.json'),JSON.stringify({budgetMs,budgetAuthorization,timePolicy,allCommandsTimed:rows.every(r=>typeof r.wallMs==='number'),cumulativeWallMs:rows.reduce((n,r)=>n+(r.wallMs??r.budgetChargeMs),0),includesFailedAttempts:true,rows},null,2)+'\n');
