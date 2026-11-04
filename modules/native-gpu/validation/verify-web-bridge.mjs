import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve('.'),out=resolve(process.argv[2]??'artifacts/native-web-bridge/checks');await mkdir(out,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),sourceDiff=execFileSync('git',['diff','--binary'],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024**2});
await writeFile(join(out,'source.diff.txt'),sourceDiff);
const commands=[
 ['types',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false']],
 ['stages-and-native-regressions',['--import','tsx','--test','--test-concurrency=1',
  'tests/native-web-bridge.test.ts','tests/native-gpu-v2.test.ts','tests/native-gpu-production.test.ts',
  'tests/native-gpu-composite.test.ts','tests/native-gpu-export.test.ts','tests/native-gpu-security.test.ts',
  'tests/native-gpu-audio.test.ts','tests/native-gpu-authoring.test.ts','tests/native-gpu-cancellation.test.ts']],
];
const results=[],start=performance.now();
for(const [name,args]of commands){const begin=performance.now(),child=spawn(process.execPath,args,{cwd:root,env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/native-web-validation-home')},windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>{timedOut=true;child.kill();},240000);
 const code=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',done);});clearTimeout(timer);await writeFile(join(out,name+'.stdout.txt'),stdout);await writeFile(join(out,name+'.stderr.txt'),stderr);results.push({name,args,code,timedOut,wallMs:performance.now()-begin});console.log(JSON.stringify(results.at(-1)));}
const result={version:1,sourceCommit,platform:process.platform,node:process.version,wallMs:performance.now()-start,results,ok:results.every(r=>r.code===0&&!r.timedOut),scope:'Named Stage bridge and native regressions only; no whole-repository or independent-install claim.'};await writeFile(join(out,'commands.json'),JSON.stringify(result,null,2)+'\n');if(!result.ok)process.exitCode=1;
