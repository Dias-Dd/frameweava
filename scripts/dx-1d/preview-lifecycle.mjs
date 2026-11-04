// Public CLI/HTTP consumer and external OS process observation only.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {processes,descendants,browsers,cleanupOwned} from './processes.mjs';
const [entry,directory]=process.argv.slice(2),launcher=JSON.parse(process.env.FRAMEWEAVE_CLI_JSON??'[]');
if(!entry||!directory||!launcher.length)throw Error('Pass <project> <new-output-directory>, set FRAMEWEAVE_CLI_JSON');
const output=resolve(directory);await mkdir(output);const delay=ms=>new Promise(r=>setTimeout(r,ms)),records=[];
for(const abnormal of [false,true]){
  const child=spawn(launcher[0],[...launcher.slice(1),resolve(entry),'--no-open','--accurate','--width','160'],{cwd:resolve(entry,'..'),windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',done=false,exitCode=null;const known=new Map();child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const ended=new Promise((r,j)=>{child.once('error',j);child.once('close',(code,signal)=>{done=true;exitCode=code;r({code,signal});});});let snapshot;
  async function observe(){snapshot=await processes();descendants(snapshot,child.pid,known);return snapshot;}
  try{
    let url;const started=Date.now();while(!url){try{url=JSON.parse(stdout).preview;}catch{}if(done||Date.now()-started>30000)throw Error('Preview did not announce a public URL: '+stderr);await observe();await delay(150);}
    let state;for(;;){state=await(await fetch(url.replace('/?','/state?'))).json();if(state.error)throw Error(JSON.stringify(state.error));if(state.ready)break;if(Date.now()-started>90000)throw Error('Preview not ready');await observe();await delay(150);}
    const frame=await fetch(url.replace('/?','/frame?')+'&frame=6&format=png');assert.equal(frame.status,200);assert.equal(frame.headers.get('content-type'),'image/png');await writeFile(join(output,abnormal?'before-abnormal.png':'preview-frame.png'),Buffer.from(await frame.arrayBuffer()));
    await observe();assert.ok(browsers([...known.values()]).length,'No browser observed; cannot claim cleanup validated');
    let termination;
    if(abnormal){
      // Kill the actual observed CLI owner, not the npm wrapper. This is a forceful
      // process termination on Windows, NOT an emulated Ctrl-C/graceful SIGINT.
      const browserRoot=browsers(snapshot).find(p=>p.parent===child.pid||known.has(p.parent)&&/node/i.test(known.get(p.parent).name));
      if(!browserRoot)throw Error('Could not identify an owned CLI parent; refuse broad process termination');
      const target=browserRoot.parent===child.pid?snapshot.find(p=>p.pid===child.pid):known.get(browserRoot.parent);
      if(!target||!/node/i.test(target.name))throw Error('Owned Node CLI target unavailable; refuse termination');
      process.kill(target.pid,'SIGKILL');termination={kind:process.platform==='win32'?'TerminateProcess':'SIGKILL',target};
    }else{await fetch(url.replace('/?','/close?'),{method:'POST'});termination={kind:'public-preview-close'};}
    const exit=await Promise.race([ended,delay(15000).then(()=>{throw Error('CLI did not exit after close/termination');})]);
    if(!abnormal)assert.equal(exit.code,0);
    let remaining=[];for(let i=0;i<8;i++){await delay(500);const now=await observe();remaining=browsers(now.filter(p=>known.has(p.pid)&&known.get(p.pid).created===p.created));if(!remaining.length)break;}
    const cleanup=remaining.length?await cleanupOwned(remaining):[];
    records.push({abnormal,termination,exit,stdout,stderr,observedBrowsers:browsers([...known.values()]),remainingBeforeHarnessCleanup:remaining,harnessCleanupPids:cleanup,cleanupVerified:remaining.length===0});
  }finally{if(!done)child.kill();const now=await processes();await cleanupOwned(now.filter(p=>known.has(p.pid)&&known.get(p.pid).created===p.created));}
}
await writeFile(join(output,'lifecycle.json'),JSON.stringify({platform:process.platform,records,scope:'owned processes actually observed; no guarantee for processes created/exited between samples; no Renderer hooks'},null,2));
console.log(JSON.stringify({normal:records[0].cleanupVerified,abnormal:records[1].cleanupVerified,output}));
if(records.some(r=>!r.cleanupVerified))process.exitCode=2;
