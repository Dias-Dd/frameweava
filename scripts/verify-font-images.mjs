// Critical paths only. Requires an explicitly built production native backend.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve('artifacts/font-images/verify-'+Date.now());await mkdir(directory,{recursive:true});
const started=performance.now(),children=new Set(),timer=setTimeout(()=>{for(const c of children)c.kill();},360000);
async function run(name,args){const start=performance.now(),c=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});children.add(c);let log='';c.stdout.on('data',b=>log+=b);c.stderr.on('data',b=>log+=b);const exitCode=await new Promise((r,j)=>{c.on('error',j);c.on('close',r);});children.delete(c);await writeFile(resolve(directory,name+'.log'),log);return {name,args,exitCode,seconds:(performance.now()-start)/1000};}
try{const results=await Promise.all([run('types',['node_modules/typescript/bin/tsc','--noEmit']),run('font-unit',['--import','tsx','--test','tests/font-images.test.ts']),run('font-native',['--import','tsx','--test','tests/font-images-native.test.ts'])]);const report={results,wallSeconds:(performance.now()-started)/1000,sumCommandSeconds:results.reduce((n,r)=>n+r.seconds,0),ok:results.every(r=>r.exitCode===0)};await writeFile(resolve(directory,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({directory,...report}));if(!report.ok)process.exitCode=1;}finally{clearTimeout(timer);for(const c of children)c.kill();}
