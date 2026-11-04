// Final affected paths only. Builds/provisioning and all prior failures remain
// in the owned campaign directory; this does not reset a time budget or run L3.
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.frameweave/pa3-native-controls'),out=join(root,'final-'+Date.now());await mkdir(out,{recursive:true});
const diagnostics=join(root,'diagnostics-mesh-v1/frameweave-native-gpu.exe'),production=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
const jobs=[
 ['prepare',['modules/pro-animation/validation/prepare-native-controls.mjs']],
 ['types',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false']],
 ['numeric',['--import','tsx','--test','tests/pro-animation-native-controls.test.ts']],
 ['stages',['--import','tsx','--test','tests/pro-animation-native-controls-stage.test.ts']],
 ['media',['--import','tsx','modules/pro-animation/validation/check-native-controls-media.ts']],
];
const start=performance.now(),results=[];
for(const [name,args]of jobs){
 const begin=performance.now(),env={...process.env,FRAMEWEAVE_HOME:resolve('.frameweave/user-home'),FRAMEWEAVE_MEDIA_PYTHON:join(root,'media-python/Scripts/python.exe'),FRAMEWEAVE_NATIVE_GPU:name==='media'?production:diagnostics,FRAMEWEAVE_TRANSITION_VALIDATION_OUT:join(root,'legacy')};
 const child=spawn(process.execPath,args,{windowsHide:true,env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('close',ok);}),record={name,command:[process.execPath,...args],seconds:(performance.now()-begin)/1000,code};results.push(record);
 await writeFile(join(out,name+'.stdout.txt'),stdout);await writeFile(join(out,name+'.stderr.txt'),stderr);console.log(JSON.stringify({...record,tail:(stdout+stderr).slice(-700)}));if(code!==0)break;
}
const hash=b=>createHash('sha256').update(b).digest('hex'),binaries=[];
for(const file of [diagnostics,production])binaries.push({path:file,sha256:hash(await readFile(file)),receipt:JSON.parse(await readFile(join(resolve(file,'..'),'native-build.json'),'utf8'))});
// Preserve command output itself; an incomplete/failed job cannot become green.
const ok=results.length===jobs.length&&results.every(r=>r.code===0),proof={schemaVersion:1,baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),seconds:(performance.now()-start)/1000,ok,results,binaries,scope:'Final targeted campaign only; previous development/provisioning/failures preserved in parent. No full repository/L3/cross-platform claim.'};
await writeFile(join(out,'commands.json'),JSON.stringify(proof,null,2));await writeFile(join(root,'latest-final.json'),JSON.stringify({directory:out,ok},null,2));if(!ok)process.exitCode=1;
