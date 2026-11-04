import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
import {processes,descendants,browsers} from './processes.mjs';
const launcher=JSON.parse(process.env.FRAMEWEAVE_REPL_JSON??'[]'),output=resolve(process.argv[2]??'artifacts/dx-1d');if(!launcher.length)throw Error('Supply the documented REPL launcher as FRAMEWEAVE_REPL_JSON');
await mkdir(output,{recursive:true});const child=spawn(launcher[0],launcher.slice(1),{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const known=new Map();
child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const ended=new Promise((r,j)=>{child.once('error',j);child.once('close',r);});
try{
  const stop=Date.now()+15000;while(!stdout.includes('fw> ')){if(Date.now()>stop)throw Error('REPL did not start');descendants(await processes(),child.pid,known);await new Promise(r=>setTimeout(r,100));}
  for(let i=0;i<3;i++){descendants(await processes(),child.pid,known);await new Promise(r=>setTimeout(r,150));}
  assert.equal(browsers([...known.values()]).length,0);child.stdin.end('1+1\n.exit\n');assert.equal(await ended,0);assert.match(stdout,/fw> 2/);
  await writeFile(join(output,'repl-process-audit.json'),JSON.stringify({ok:true,launcher,observedChildren:[...known.values()],browserCount:0,scope:'Default startup and expression only; OS snapshots, no project opened. Not a sandbox claim.',stdout,stderr},null,2));
}finally{if(child.exitCode===null)child.kill();}
