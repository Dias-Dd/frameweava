/** One cumulative verification ledger, including setup and failed commands. */
import {spawn} from 'node:child_process';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';
const out=resolve(process.env.FRAMEWEAVE_VIDEO_ROTO_RUN??'outputs/video-roto-round4');await mkdir(out,{recursive:true});
const file=join(out,'campaign.json');let ledger;try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={version:1,budgetMs:419000,totalMs:0,commands:[]};}
if(ledger.totalMs>=ledger.budgetMs)throw Error('Cumulative campaign budget exhausted');
const [label,executable,...args]=process.argv.slice(2);if(!label||!executable)throw Error('check.mjs label executable args...');
const started=performance.now(),row={label,command:[executable,...args],startedAt:new Date().toISOString()};let log='';
const child=spawn(executable,args,{cwd:process.cwd(),env:{...process.env,FRAMEWEAVE_VIDEO_ROTO_RUN:out,FRAMEWEAVE_HOME:resolve('.frameweave/user-home')},stdio:['ignore','pipe','pipe'],windowsHide:true});
for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log+=b;process.stdout.write(b);});
const timer=setTimeout(()=>child.kill(),ledger.budgetMs-ledger.totalMs);
const code=await new Promise(ok=>{child.on('error',e=>{log+=String(e);ok(-1)});child.on('exit',(code,signal)=>{row.signal=signal;ok(code??-1)});});clearTimeout(timer);
row.exitCode=code;row.wallMs=performance.now()-started;ledger.totalMs+=row.wallMs;ledger.commands.push(row);await writeFile(join(out,label+'.log'),log);await writeFile(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({label,code,wallMs:row.wallMs,cumulativeMs:ledger.totalMs}));if(code!==0)process.exitCode=1;
