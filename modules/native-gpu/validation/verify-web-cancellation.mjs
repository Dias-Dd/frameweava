import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const before=process.argv.includes('--before'),out=resolve(process.argv[2]??'artifacts/native-web-cancellation');await mkdir(out,{recursive:true});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
await writeFile(join(out,'source.diff.gz'),gzipSync(execFileSync('git',['diff','--binary'],{windowsHide:true,maxBuffer:8*1024**2})));
const commands=before?[['counterexample',['--import','tsx','--test','--test-name-pattern=abort during real native recording','tests/native-web-prefix-cancellation.test.ts']]]:[
 ['types',['node_modules/typescript/bin/tsc','--noEmit','--pretty','false']],
 ['cancellation-and-bridge',['--import','tsx','--test','--test-concurrency=1','tests/native-web-prefix-cancellation.test.ts','tests/native-gpu-cancellation.test.ts',...process.argv.includes('--fix-only')?[]:['tests/native-web-bridge.test.ts']]],
];
const results=[],start=performance.now();
for(const [name,args]of commands){
 const begin=performance.now(),child=spawn(process.execPath,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false;
 child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
 const code=await new Promise((done,fail)=>{child.once('error',fail);child.once('exit',done);});clearTimeout(timer);
 await writeFile(join(out,name+'.stdout.txt'),stdout);await writeFile(join(out,name+'.stderr.txt'),stderr);results.push({name,args,code,timedOut,wallMs:performance.now()-begin});console.log(JSON.stringify(results.at(-1)));
}
const files=['src/render/renderer.ts','modules/native-gpu/logic-host.ts','modules/native-gpu/web-bridge.ts','modules/native-gpu/service.ts','tests/native-web-prefix-cancellation.test.ts'];
const hashes={};for(const file of files)hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const result={version:1,sourceCommit,hashes,platform:process.platform,node:process.version,mode:before?'unfixed-counterexample':'targeted-fix',wallMs:performance.now()-start,results,ok:results.every(r=>r.code===0&&!r.timedOut),scope:'Cancellation propagation and existing bridge/client regressions only; no performance or whole-repository rerun.'};
await writeFile(join(out,'commands.json'),JSON.stringify(result,null,2)+'\n');if(!result.ok)process.exitCode=1;
