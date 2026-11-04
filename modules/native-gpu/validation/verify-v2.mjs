// Targeted checkpoint validation, not a whole-repository regression campaign.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=resolve('.'),out=resolve(process.argv[2]??'artifacts/native-gpu-v2/checks');
await mkdir(out,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
const commands=[
 ['typecheck',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false']],
 ['native',['--import','tsx','--test','--test-concurrency=1',
  'tests/native-gpu.test.ts','tests/native-gpu-production.test.ts','tests/native-gpu-cancellation.test.ts',
  'tests/native-gpu-v2.test.ts','tests/native-gpu-composite.test.ts','tests/native-gpu-authoring.test.ts',
  'tests/native-gpu-export.test.ts','tests/native-gpu-audio.test.ts','tests/native-gpu-security.test.ts','tests/native-gpu-packages.test.ts',
  'tests/gpu-pixel-scope.test.ts']],
 ['deformable-wasm',['--import','tsx','--test','--test-name-pattern=real bytes-v1','tests/deformable-kernel.test.ts']],
 ['deformable-worker',['--import','tsx','--test','tests/deformable-worker.test.ts']],
];
const results=[],started=performance.now();
for(const [name,args] of commands){const start=performance.now(),child=spawn(process.execPath,args,{cwd:root,env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/native-v2-validation-home')},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
 const code=await new Promise((ok,fail)=>{child.once('error',fail);child.once('exit',ok);});clearTimeout(timer);await writeFile(join(out,name+'.stdout.txt'),stdout);await writeFile(join(out,name+'.stderr.txt'),stderr);results.push({name,command:[process.execPath,...args],code,timedOut,wallMs:performance.now()-start});console.log(JSON.stringify(results.at(-1)));
}
const result={version:1,sourceCommit,totalMs:performance.now()-started,platform:process.platform,node:process.version,results,ok:results.every(r=>r.code===0&&!r.timedOut),scope:'Only named affected tests. Builds, performance, visual inspection and distribution are separately recorded; no whole-repository green claim.'};await writeFile(join(out,'commands.json'),JSON.stringify(result,null,2)+'\n');if(!result.ok)process.exitCode=1;
