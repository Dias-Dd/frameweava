// SPDX-License-Identifier: Apache-2.0
// Run from the SDK root after building both profiles. Measures data calls, not ABI-only overhead.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
const load=async p=>import(pathToFileURL(resolve(p)).href),json=async p=>JSON.parse(await readFile(p,'utf8'));
await mkdir('artifacts/wasm-bindgen-v2',{recursive:true});
const records=[];
for(const [profile,names] of [['bindgen',['lyon','bindings']],['bytes-v1',['statistics','rgba']]])for(const name of names){
 const base=`examples/${profile==='bindgen'?'rust-bindgen':'rust-modules'}/${name}`,sizes={};
 const files=profile==='bindgen'?['dist/generated/module_bg.wasm','dist/generated/module.js','dist/binding.mjs','dist/worker.js']:['dist/module.wasm','runtime/session.mjs','dist/worker.js'];
 for(const file of files){const bytes=await readFile(`${base}/${file}`);sizes[file]={bytes:bytes.length,gzipBytes:gzipSync(bytes,{level:9}).length};}
 let initialize,call;
 if(profile==='bindgen'){
 const bytes=await readFile(`${base}/dist/generated/module_bg.wasm`),p=await json(`${base}/dist/import-profile.json`),{createBinding}=await load(`${base}/dist/binding.mjs`),{createSession}=await load(`${base}/runtime/session.mjs`);
 initialize=()=>createSession(bytes,p,createBinding);call=name==='lyon'?s=>s.invoke('tessellate',[new Float32Array([0,0,1,0,1,1,0,1])]):s=>s.invoke('normalize',['Frameweave',new Float64Array([1,2,3,4])]);
 }else{const bytes=await readFile(`${base}/dist/module.wasm`),{instantiateModule}=await load(`${base}/runtime/session.mjs`),v=(await json(`${base}/tests/vectors.json`))[0];initialize=()=>instantiateModule(bytes);call=s=>s.call(v.operation,Uint8Array.from(v.input),v.capacity);}
 const times=[];let session;for(let i=0;i<21;i++){const begin=performance.now();session=await initialize();times.push(performance.now()-begin);session.dispose();}
 session=await initialize();for(let i=0;i<100;i++)call(session);const before=session.diagnostics(),begin=performance.now();for(let i=0;i<10000;i++)call(session);const callMeanMs=(performance.now()-begin)/10000,after=session.diagnostics(),dispose=session.dispose();
 const sorted=times.slice(1).sort((a,b)=>a-b);records.push({name,profile,sizes,initialization:{firstMs:times[0],warmMedianMs:sorted[Math.floor(sorted.length/2)],warmMinMs:sorted[0],warmMaxMs:sorted.at(-1),samples:20},callMeanMs,iterations:10000,before,after,dispose});
}
const report={platform:process.platform,arch:process.arch,node:process.version,method:'Node host wall clock; first compile and 20 repeated warm sessions; 100 warmup + 10000 data calls, own encoding/allocations included. Not browser/ABI algorithm throughput comparison.',records};
await writeFile('artifacts/wasm-bindgen-v2/performance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
