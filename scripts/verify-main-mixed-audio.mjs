import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/main-mixed-audio'),file=join(out,'campaign.json');await mkdir(out,{recursive:true});
let ledger;try{ledger=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={version:1,sourceDelivery:'15ed28a3+c2a2fd81 / ff747ff2',objective:'Frozen mixed A/V seal and cancellation integration',budgetMs:419000,spentMs:1000,initialSetupFailure:{attempts:2,code:'Runner SyntaxError: missing phase array brackets',measuredCombinedMs:260,conservativeChargedMs:1000},commands:[]};}
const phases={
 prepare:[['prepare',['scripts/prepare-main-mixed-audio.mjs']]],
 quick:[['types',['node_modules/typescript/bin/tsc','--noEmit']],['mixed-unit',['--import','tsx','--test','tests/mixed-audio-execution.test.ts','tests/native-close-order.test.ts']]],
 real:[['long-source',['--import','tsx',join(out,'long.mjs')]]],
 cancel:[['cancel',['--import','tsx','scripts/check-main-mixed-cancel.ts']]],
 regression:[['audio-regression',['--import','tsx','--test','tests/audio-resources.test.ts','tests/audio-adapter.test.ts','tests/audio-ports.test.ts','tests/native-gpu-audio.test.ts']]],
 inventory:[['inventory',['scripts/build-function-catalog.mjs']]],
 types:[['types',['node_modules/typescript/bin/tsc','--noEmit']]],
};
const phase=process.argv[2];if(!phases[phase])throw Error('Unknown phase');const remaining=ledger.budgetMs-ledger.spentMs;if(remaining<5000)throw Error('Campaign budget exhausted');
const env={...process.env,FRAMEWEAVE_HOME:join(root,'.frameweave/home-main-mixed-audio'),FRAMEWEAVE_NATIVE_GPU:join(root,'native-bin/win32-x64/frameweave-native-gpu.exe'),FRAMEWEAVE_SPIDERMONKEY:join(root,'native-bin/win32-x64/frameweave-spidermonkey-host.exe')};
env.FRAMEWEAVE_FFPROBE??=execFileSync('powershell.exe',['-NoProfile','-Command','(Get-Command ffprobe).Source'],{encoding:'utf8',windowsHide:true}).trim();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope=['src/render/renderer.ts','src/audio/execution-stages.ts','modules/render-session/index.ts','modules/native-gpu/service.ts','tests/mixed-audio-execution.test.ts'],digest=createHash('sha256');for(const path of scope)digest.update(path).update('\0').update(await readFile(join(root,path))).update('\0');const sourceSha256=digest.digest('hex'),running=new Map(),rows=[];
const guard=setInterval(()=>{if(rows.reduce((s,r)=>s+r.ms,0)+[...running.values()].reduce((s,t)=>s+performance.now()-t,0)>remaining-1000)for(const child of running.keys())child.kill();},100);
try{await Promise.all(phases[phase].map(async([name,args],i)=>{const start=performance.now(),prefix=join(out,`${ledger.commands.length+i+1}-${name}`);let stdout='',stderr='';
 const result=await new Promise(done=>{const child=spawn(process.execPath,args,{cwd:root,env,windowsHide:true});running.set(child,start);const timer=setTimeout(()=>child.kill(),Math.min(remaining-1000,name==='long-source'?150000:100000));child.stdout.on('data',b=>{stdout+=b;if(name==='long-source'||name==='cancel')process.stdout.write(b);});child.stderr.on('data',b=>stderr+=b);child.on('error',e=>stderr+=String(e));child.on('close',(exitCode,signal)=>{clearTimeout(timer);running.delete(child);done({exitCode,signal});});});
 const row={name,args,...result,ms:performance.now()-start,head,sourceSha256,stdout:prefix+'.stdout.log',stderr:prefix+'.stderr.log'};rows.push(row);await writeFile(row.stdout,stdout);await writeFile(row.stderr,stderr);console.log(JSON.stringify({name,...result,ms:row.ms}));if(row.exitCode!==0)console.error((stderr+'\n'+stdout).slice(-6000));
}));}finally{clearInterval(guard);}ledger.commands.push(...rows);ledger.spentMs+=rows.reduce((s,r)=>s+r.ms,0);await writeFile(file,JSON.stringify(ledger,null,2)+'\n');console.log(JSON.stringify({spentMs:ledger.spentMs,budgetMs:ledger.budgetMs}));if(rows.some(r=>r.exitCode!==0))process.exitCode=1;
