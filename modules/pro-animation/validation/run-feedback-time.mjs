// One cumulative campaign; reruns append rather than resetting the 420-second budget.
import {spawn,execFile} from 'node:child_process';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'../../..'),out=join(root,'.frameweave/pa3-feedback-time/logs');await mkdir(out,{recursive:true});
const jobs={package:['--import','tsx','modules/pro-animation/validation/check-feedback-package.ts'],control:['--import','tsx','modules/pro-animation/validation/check-feedback-control.ts'],types:['node_modules/typescript/bin/tsc','--noEmit','--pretty','false','-p','modules/pro-animation/validation/feedback-time-tsconfig.json'],l0:['--import','tsx','--test','tests/pro-animation-native-feedback-time.test.ts'],stage:['--import','tsx','modules/pro-animation/validation/check-feedback-time.ts']};
for(const phase of process.argv.slice(2)){
 if(!jobs[phase])throw Error('Unknown phase '+phase);
 const previous=(await readFile(join(out,'timings.jsonl'),'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;})).trim().split('\n').filter(Boolean).map(JSON.parse),spent=previous.reduce((n,r)=>n+r.seconds,0);if(spent>=420)throw Error('Cumulative campaign exhausted: '+spent);
 process.env.FRAMEWEAVE_HOME=join(root,'.frameweave/user-home');
 const job=jobs[phase],executable=Array.isArray(job)?process.execPath:job.executable,args=Array.isArray(job)?job:job.args;
 const stamp=phase+'-'+Date.now(),begin=performance.now(),child=spawn(executable,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const timer=setTimeout(()=>{if(process.platform==='win32'&&child.pid)execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill();},Math.floor((420-spent)*1000));const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('close',ok);});clearTimeout(timer);
 const record={phase,command:[executable,...args],exitCode:code,seconds:(performance.now()-begin)/1000};await writeFile(join(out,stamp+'.stdout.txt'),stdout);await writeFile(join(out,stamp+'.stderr.txt'),stderr);await appendFile(join(out,'timings.jsonl'),JSON.stringify(record)+'\n');console.log(JSON.stringify({...record,cumulativeSeconds:spent+record.seconds,tail:(stdout+stderr).slice(-2200)}));if(code!==0){process.exitCode=1;break;}
}
