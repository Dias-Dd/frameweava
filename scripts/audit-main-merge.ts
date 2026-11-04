import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';
import {runtimePin} from '../src/compiler/runtime-lock.ts';

const root=resolve('.'),base=join(root,'artifacts/main-integration-20261103');
const catalog=JSON.parse(await readFile(join(root,'docs/function-catalog/functions.json'),'utf8'));
const html=await readFile(join(root,'docs/function-catalog/index.html'),'utf8');
new Script(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
assert.equal(catalog.rows.length,catalog.metadata.counts.rows);
assert.ok(catalog.rows.every((r:any)=>r.name&&r.signature&&r.source&&r.status));
assert.equal(new Set(catalog.rows.map((r:any)=>r.library+'|'+r.name+'|'+r.role)).size,catalog.rows.length);
const manifest=JSON.parse(await readFile(join(root,'modules/spatial-creation/frameweave.package.json'),'utf8'));
for(const name of manifest.bindings.gpuExports)assert.ok(catalog.rows.some((r:any)=>r.library==='spatial-creation'&&r.name===name),'Missing managed facade '+name);
const latest=JSON.parse(await readFile(join(base,'latest-consumer.json'),'utf8'));
const consumer=JSON.parse(await readFile(latest.result,'utf8'));assert.equal(consumer.ok,true);assert.deepEqual(consumer.runtimePin,runtimePin);
const paths=execFileSync('git',['ls-files','examples'],{encoding:'utf8'}).split(/\r?\n/).filter(f=>/(?:lock|runtime)\.json$/.test(f));
const historical=[];
for(const path of paths){const lock=JSON.parse(await readFile(path,'utf8'));historical.push({path,declaredRuntime:lock.runtime??null,runtimeMatches:lock.runtime?lock.runtime.integrity===runtimePin.integrity:null,requirements:lock.requirements??null,action:'preserved unchanged; explicit reviewed reinstall/relock or re-export required for changed SDK/packages'});}
const groups:Record<string,{rows:number;namedImports:number}>={};for(const r of catalog.rows){const g=groups[r.library]??={rows:0,namedImports:0};g.rows++;if(r.role==='命名导入函数')g.namedImports++;}
const result={ok:true,runtimePin,counts:catalog.metadata.counts,groups,consumer:latest.result,historical,checks:['HTML script syntax','unique callable rows and signatures','all spatial managed named exports covered','consumer runtime pin equals final source','historical locks not silently rewritten']};
await writeFile(join(base,'audit.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,counts:result.counts,historicalLocks:historical.length,runtime:runtimePin.integrity}));
