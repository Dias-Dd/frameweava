// Bounded final targeted campaign; no pack/install/L3 or shared locks refreshed.
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const out=resolve('.frameweave/pa3-native-transitions/final');await mkdir(out,{recursive:true});
const results=[];const started=performance.now();
const jobs=[
 ['types',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false']],
 ['targeted',['--import','tsx','--test','--test-concurrency=1','tests/pro-animation-native-transitions.test.ts','tests/pro-animation-native-transitions-gpu.test.ts','tests/pro-animation-native-transitions-stage.test.ts','tests/native-effects.test.ts']],
 ['media',['--import','tsx','modules/pro-animation/validation/check-native-transitions-media.ts']],
];
for(const [name,args] of jobs){
 const begin=performance.now();const child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,FRAMEWEAVE_HOME:resolve('.frameweave/user-home')}});let stdout='',stderr='';
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('close',ok);});
 const result={name,command:[process.execPath,...args],code,seconds:(performance.now()-begin)/1000};results.push(result);
 await writeFile(join(out,name+'.stdout.txt'),stdout);await writeFile(join(out,name+'.stderr.txt'),stderr);console.log(JSON.stringify({...result,tail:(stdout+stderr).slice(-1000)}));
 if(code!==0)break;
}
const result={schemaVersion:1,baseCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),seconds:(performance.now()-started)/1000,results,ok:results.length===jobs.length&&results.every(r=>r.code===0),scope:'Final affected paths only. Earlier failures and build receipts remain in parent directory. Not a whole-repository or installed R1/L3 result.'};
await writeFile(join(out,'commands.json'),JSON.stringify(result,null,2));if(!result.ok)process.exitCode=1;
