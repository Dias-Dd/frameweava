// Targeted checks only. Append real commands/wall/exit and preserve failed logs.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const matte=process.argv.includes('--matte'),root=fileURLToPath(new URL('../',import.meta.url)),dir=join(root,'artifacts/gpu-image-effects',matte?'chain-matte':'chain-colour');await mkdir(dir,{recursive:true});
const file=join(dir,'commands.json');let rows=[];try{rows=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const commands={types:['node_modules/typescript/bin/tsc','--noEmit'],unit:['--import','tsx','--test','tests/gpu-resident-colour.test.ts',...matte?['tests/gpu-resident-matte.test.ts']:[]],gpu:['--import','tsx','--test',matte?'tests/gpu-resident-matte-gpu.test.ts':'tests/gpu-resident-colour-gpu.test.ts'],media:['--import','tsx','scripts/verify-resident-colour.ts',...matte?['--matte']:[]]};
for(const label of process.argv.slice(2).filter(v=>v!=='--matte')){
 if(!commands[label])throw Error('Choose types, unit, gpu or media');const used=rows.reduce((s,r)=>s+r.wallMs,0),remaining=600000-used;if(remaining<=0)throw Error('600-second cumulative check budget exhausted');
 const log=join(dir,`${rows.length+1}-${label}.log`),handle=await open(log,'w'),started=performance.now(),date=new Date().toISOString();
 const child=spawn(process.execPath,commands[label],{cwd:root,windowsHide:true,stdio:['ignore',handle.fd,handle.fd],env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/user-home')}});
 const timer=setTimeout(()=>child.kill(),remaining);let exitCode;try{exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});}finally{clearTimeout(timer);await handle.close();}
 rows.push({date,label,command:[process.execPath,...commands[label]],wallMs:performance.now()-started,exitCode,log});await writeFile(file,JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));if(exitCode!==0){console.log((await readFile(log,'utf8')).slice(-10000));process.exitCode=1;break;}
}
