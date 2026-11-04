import {readFile,writeFile,readdir,copyFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const base='edeec53657efa5660af7c002d541675d78094042',here='modules/spidermonkey-host',sha=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'buffer',windowsHide:true});if(r.status!==0)throw Error(r.stderr.toString());return r.stdout;};
const invariants={};for(const p of ['src/compiler/build.ts','src/compiler/evaluate.mjs','src/render/renderer.ts','modules/native-gpu/scope.ts','modules/native-gpu/client.ts','package.json','package-lock.json']){const current=await readFile(p);invariants[p]={unchanged:current.equals(git('show',base+':'+p)),sha256:sha(current)};}
const p='modules/native-gpu/logic-host.ts',record=s=>s.slice(s.indexOf(' async record('),s.indexOf(' close():'));
invariants['NativeLogicHost.record body']={unchanged:record((await readFile(p,'utf8')))===record(git('show',base+':'+p).toString())};
if(Object.values(invariants).some(v=>!v.unchanged))throw Error('Ownership invariant failed');
const files={};async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){if(['node_modules','target','validation'].includes(item.name))continue;const p=join(dir,item.name).replaceAll('\\','/');if(item.isDirectory())await walk(p);else files[p]=sha(await readFile(p));}}await walk(here);
for(const p of ['modules/native-gpu/logic-bootstrap.ts','modules/native-gpu/logic-host.ts','modules/native-gpu/react.tsx','tests/spidermonkey-host.test.ts','modules/spidermonkey-host/validation/run.ts','modules/spidermonkey-host/validation/compatibility.ts','modules/spidermonkey-host/validation/audit.mjs'])files[p]=sha(await readFile(p));
await mkdir(here+'/validation/raw',{recursive:true});for(const name of await readdir('.frameweave/spidermonkey-check'))if(name.endsWith('.log')||name==='cli.json')await copyFile('.frameweave/spidermonkey-check/'+name,here+'/validation/raw/'+name);
await writeFile(here+'/validation/source-audit.json',JSON.stringify({baseline:base,branch:git('branch','--show-current').toString().trim(),invariants,editableFiles:files,frozenBeforeCommit:true},null,2)+'\n');
console.log('PASS ownership invariants; exact record() body unchanged; source hashes and raw logs saved');
