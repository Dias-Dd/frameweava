import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/main-audio-intervals'),file=join(out,'campaign.json');await mkdir(out,{recursive:true});
let ledger;try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={version:1,budgetMs:419000,spentMs:0,commands:[]};}
const tasks={quick:[['types',['node_modules/typescript/bin/tsc','--noEmit']],['old-audio',['--import','tsx','--test','tests/audio.test.ts','tests/audio-ports.test.ts','tests/audio-adapter.test.ts','tests/audio-io.test.ts']],['intervals',['--import','tsx','--test','tests/audio-resources.test.ts']]],
  types:[['types',['node_modules/typescript/bin/tsc','--noEmit']]],intervals:[['intervals',['--import','tsx','--test','tests/audio-resources.test.ts']]],
  decoder:[['decoder',['--import','tsx','--test','--test-name-pattern=six-second','tests/audio-resources.test.ts']]],
  delivery:[['delivery',['--import','tsx','scripts/check-audio-interval-delivery.ts']]],
  finish:[['types',['node_modules/typescript/bin/tsc','--noEmit']],['intervals',['--import','tsx','--test','tests/audio-resources.test.ts']],['inventory',['scripts/build-function-catalog.mjs']],['adapter',['--import','tsx','--test','tests/audio-adapter.test.ts']]],
  inventory:[['inventory',['scripts/build-function-catalog.mjs']]]};
const phase=process.argv[2];if(!tasks[phase])throw Error('Choose quick, types, intervals or inventory');
const remaining=ledger.budgetMs-ledger.spentMs;if(remaining<3000)throw Error('Cumulative campaign budget exhausted');
const env={...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/home-main-audio-intervals')};
env.FRAMEWEAVE_FFPROBE??=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Command ffprobe).Source'],{encoding:'utf8',windowsHide:true}).trim();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),diff=execFileSync('git',['diff','HEAD','--binary'],{maxBuffer:16*1024**2}),running=new Map(),rows=[];
// Include new files in source identity too; git diff alone omits untracked additions.
const sources=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','src/audio','src/core/types.ts','src/render/renderer.ts','src/compiler/build.ts','src/authoring-tools/index.ts','modules/render-session/index.ts','tests/audio-resources.test.ts','scripts/verify-audio-intervals.mjs'],{encoding:'utf8'}).trim().split(/\r?\n/).sort();
const digest=createHash('sha256');for(const source of sources)digest.update(source).update('\0').update(await readFile(join(root,source))).update('\0');const sourceSha256=digest.digest('hex');
const guard=setInterval(()=>{const used=rows.reduce((s,r)=>s+r.ms,0)+[...running.values()].reduce((s,t)=>s+performance.now()-t,0);if(used>=remaining-1000)for(const child of running.keys())child.kill();},100);
try{await Promise.all(tasks[phase].map(async([name,args],index)=>{const start=performance.now(),prefix=join(out,`${ledger.commands.length+index+1}-${name}`);let stdout='',stderr='';
  const result=await new Promise(done=>{const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true});running.set(child,start);const timer=setTimeout(()=>child.kill(),Math.min(remaining-1000,75000));child.stdout.on('data',b=>{stdout+=b;if(name==='decoder')process.stdout.write(b);});child.stderr.on('data',b=>stderr+=b);child.on('error',e=>stderr+=String(e));child.on('close',(exitCode,signal)=>{clearTimeout(timer);running.delete(child);done({exitCode,signal});});});
  const row={name,args,...result,ms:performance.now()-start,head,sourceSha256,patchSha256:createHash('sha256').update(diff).digest('hex'),stdout:prefix+'.stdout.log',stderr:prefix+'.stderr.log'};rows.push(row);await writeFile(row.stdout,stdout);await writeFile(row.stderr,stderr);console.log(JSON.stringify({name,...result,ms:row.ms}));if(row.exitCode!==0)console.error((stderr+'\n'+stdout).slice(-7000));
}));}finally{clearInterval(guard);}
ledger.commands.push(...rows);ledger.spentMs+=rows.reduce((s,r)=>s+r.ms,0);await writeFile(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({totalMs:ledger.spentMs,budgetMs:ledger.budgetMs}));if(rows.some(r=>r.exitCode!==0))process.exitCode=1;
