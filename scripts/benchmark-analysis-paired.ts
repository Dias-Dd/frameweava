/** Same process/data, alternating baseline/current calls to expose host-load variance. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const baselineRoot=resolve(process.argv[2]??'outputs/dx1b/baseline-source');
const old=await import(pathToFileURL(join(baselineRoot,'src/analysis-tools/service.ts')).href),current=await import('../src/analysis-tools/service.ts');
const project=resolve('outputs/acl2/e2e/run-FMrO3d'),id='2fb30b462b9c242205c0bfd1e50f286a8f7ffc0de15190546434950e15e22e12';
const a=await old.createAnalysisService({projectRoot:project}),b=await current.createAnalysisService({projectRoot:project}),rows:any[]=[];
try{for(const n of [1,10,64,256]){const oldMs:number[]=[],newMs:number[]=[],times=Array.from({length:n},(_,i)=>[4.0625,.125,8,-1,0,7.875,4][i%7]);for(const time of times){let t=performance.now();const before=await a.sample(id,{time});oldMs.push(performance.now()-t);t=performance.now();const after=await b.sample(id,{time});newMs.push(performance.now()-t);assert.deepEqual(after,before);}
 let t=performance.now();const batch=await b.sampleBatch(id,{times});const batchMs=performance.now()-t;t=performance.now();await b.sampleBatch(id,{times});const warmBatchMs=performance.now()-t;assert.equal(batch.count,n);rows.push({n,oldSingleMs:oldMs.reduce((x,y)=>x+y),newSingleMs:newMs.reduce((x,y)=>x+y),oldPerCallMs:oldMs,newPerCallMs:newMs,batchMs,warmBatchMs});}
}finally{await a.close();await b.close();}
const result={baselineCommit:'33b7b95',baselineRoot,project,id,node:process.version,method:'alternating old/new single calls in one process, then current batch; same full real Artifact',rows};await writeFile(resolve('outputs/dx1b/paired.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
