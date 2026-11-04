import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openRenderSession} from '../modules/render-session/index.ts';
import {engineRoot} from '../src/compiler/build.ts';
import type {PerformanceEvent} from '../src/render/performance.ts';

const parent=join(engineRoot,'artifacts/main-pme-shared');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'benchmark-'));
const old=execFileSync('git',['show','a357767:modules/render-session/index.ts'],{cwd:engineRoot,encoding:'utf8',windowsHide:true});
const normalized=old.replace(/(from\s+)(['"])(\.[^'"]+)\2/g,(_,prefix,quote,spec)=>{const target=resolve(engineRoot,'modules/render-session',spec);let path=relative(root,target).replaceAll('\\','/');if(!path.startsWith('.'))path='./'+path;return prefix+quote+path+quote;});
await writeFile(join(root,'baseline-session.ts'),normalized);
const baseline=await import(pathToFileURL(join(root,'baseline-session.ts')).href);
const entry=join(root,'ordinary.tsx');await writeFile(entry,`import {Composition,Stage,Rect} from '@frameweave/engine';export default <Composition width={160} height={90} fps={25} durationInFrames={111}><Stage id="visual"><Rect x={12} y={20} width={40} height={30} fill="#62efca"/></Stage></Composition>;`);
const stats=(v:number[])=>{const s=[...v].sort((a,b)=>a-b);return {count:v.length,medianMs:s[Math.floor(s.length/2)],p95Ms:s[Math.ceil(s.length*.95)-1],minMs:s[0],maxMs:s.at(-1)};};
const rows=[];
for(const [cohort,kind]of ['baseline','main','main','baseline'].entries()){
 const events:PerformanceEvent[]=[],factory=kind==='main'?openRenderSession:baseline.openRenderSession,s=await factory(entry,{cache:true,onProfile:(e:PerformanceEvent)=>events.push(e)}),times=[];
 const start=performance.now();try{
  assert.equal((await s.renderFrames([0,6,0])).ok,true);const coldMs=performance.now()-start;
  for(let i=0;i<3;i++)assert.equal((await s.renderFrames([0,6,0])).ok,true);
  for(let i=0;i<12;i++){const t=performance.now(),report=await s.renderFrames([0,6,0]);assert.equal(report.ok,true);assert.equal(report.session.browserStarts,1);times.push(performance.now()-t);}
  rows.push({kind,cohort,coldMs,batchSize:3,warmupBatches:3,times,stats:stats(times),events});
 }finally{await s.close();}
}
const shared=[];
for(const cache of [false,true]){const events:PerformanceEvent[]=[],s=await openRenderSession(join(engineRoot,'examples/shared-state/project.tsx'),{cache,onProfile:e=>events.push(e)}),times=[];
 try{for(let i=0;i<3;i++)await s.renderFrame(i%2?0:100);for(let i=0;i<20;i++){const start=performance.now();const frame=await s.renderFrame(i%2?0:100);times.push(performance.now()-start);assert.equal(frame.shared!.revision,i+4);}shared.push({cache,warmupFrames:3,times,stats:stats(times),sealValidation:stats(events.filter(e=>e.phase==='session.validate').map(e=>e.durationMs)),events});}finally{await s.close();}}
const before=stats(rows.filter(r=>r.kind==='baseline').flatMap(r=>r.times)),after=stats(rows.filter(r=>r.kind==='main').flatMap(r=>r.times));
const result={scope:'Session orchestration comparison only. a357767 Session and Main Session use the SAME current Renderer, dependencies, device, scene and PNG/disk inspection path. Not an old-vs-new GPU timing.',device:{platform:process.platform,arch:process.arch,node:process.version},order:['baseline','main','main','baseline'],before,after,medianChangePercent:(after.medianMs/before.medianMs-1)*100,rows,shared,gpuTiming:'not measured',memoryPeak:'unknown'};
await writeFile(join(root,'results.json'),JSON.stringify(result,null,2));await writeFile(join(parent,'benchmark-latest.json'),JSON.stringify({root},null,2));console.log(JSON.stringify({root,before,after,medianChangePercent:result.medianChangePercent,shared:shared.map(r=>({cache:r.cache,stats:r.stats,sealValidation:r.sealValidation}))}));
