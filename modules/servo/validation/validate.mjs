// One reproducible scoped campaign. Original logs and failures are retained.
import {spawnSync,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const campaign=process.argv[2]??'final';if(!/^[a-z0-9-]+$/.test(campaign))throw Error('Expected a simple campaign name');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),out=join(root,'artifacts/servo-module',campaign);mkdirSync(out,{recursive:true});
if(!process.env.FRAMEWEAVE_SERVO_RUNTIME||!process.env.FRAMEWEAVE_CARGO_REGISTRY)throw Error('Explicit runtime bundle and Cargo registry required');
const steps=[['build-inputs',['--import','tsx','modules/servo/validation/verify-build.ts']],['types',['node_modules/typescript/bin/tsc','--noEmit']],['module-types',['node_modules/typescript/bin/tsc','--noEmit','-p','modules/servo/tsconfig.json']],...['admission','lifecycle','native','features','project','media'].map(n=>[n,['--import','tsx',`modules/servo/validation/verify-${n}.ts`]]),['native-regression',['--import','tsx','--test','--test-concurrency=1',...['native-module','native-gpu-v2','native-gpu-composite','native-gpu-authoring','native-gpu-cancellation','native-gpu-production','native-gpu-security','native-gpu-packages'].map(n=>`tests/${n}.test.ts`)]]];
const started=performance.now(),results=[];
const report={version:1,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),started:new Date().toISOString(),runtime:process.env.FRAMEWEAVE_SERVO_RUNTIME,steps:results};
for(const [name,args]of steps){const start=performance.now(),r=spawnSync(process.execPath,args,{cwd:root,env:{...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/user-home')},encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:32*1024**2});const stdout=r.stdout??'',stderr=r.stderr??'';writeFileSync(join(out,name+'.stdout.txt'),stdout);writeFileSync(join(out,name+'.stderr.txt'),stderr);const result={name,command:[process.execPath,...args],ms:performance.now()-start,status:r.status,error:r.error?.message??null,stdoutSha256:createHash('sha256').update(stdout).digest('hex'),stderrSha256:createHash('sha256').update(stderr).digest('hex')};results.push(result);console.log(JSON.stringify(result));writeFileSync(join(out,'campaign.json'),JSON.stringify({...report,ms:performance.now()-started},null,2)+'\n');if(r.status!==0){process.exitCode=1;break;}}
for(const name of ['build-check.json','admission.json','lifecycle.json','native-two-servo.json','features.json','real-tsx.json','media/result.json']){try{writeFileSync(join(out,name.replaceAll('/','-')),readFileSync(join(root,'artifacts/servo-module',name)));}catch{}}
