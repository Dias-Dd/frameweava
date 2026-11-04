import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,copyFile,cp,rename,symlink,utimes,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import sharp from 'sharp';
import {createAnalysisService,executeAnalysisTool} from '../src/analysis-tools/index.ts';
import {AnalysisArtifactStore,hashAnalysisFile,canonicalAnalysisValue} from '../src/analysis/artifact.ts';
import {createTrackReader,validateTrackData} from '../modules/graphics-contracts/track.ts';
import {AnalysisQuerySession} from '../src/analysis-tools/query-session.ts';
import type {TrackData} from '../modules/graphics-contracts/track.ts';

const parent=resolve('.frameweave/dx1b-tests');await mkdir(parent,{recursive:true});
let real:string,id:string,data:TrackData;
before(async()=>{
  real=await mkdtemp(join(parent,'real-'));await mkdir(join(real,'assets'));await copyFile(resolve('prototypes/analysis-job-mvp/assets/david.webm'),join(real,'assets/person.webm'));
  const service=await createAnalysisService({projectRoot:real});try{const run=await service.run({capabilityId:'face-tracking',input:'assets/person.webm'});id=run.artifact.artifactId;data=validateTrackData(JSON.parse(await readFile(run.artifact.resources[0].path,'utf8')));assert.equal(data.samples.length,64);}finally{await service.close();}
});
async function fixture(){const root=await mkdtemp(join(parent,'case-'));await cp(join(real,'.frameweave'),join(root,'.frameweave'),{recursive:true});return root;}
const artifactDir=(root:string)=>join(root,'.frameweave/analysis-tools/artifacts',id);
const reader=()=>createTrackReader(data);
test('1/10/64/256 batch points retain exact order, duplicates, loss, interpolation and Reader diagnostics',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root});try{
    for(const n of [1,10,64,256])for(const mode of ['linear','nearest'] as const){const times=Array.from({length:n},(_,i)=>[4.0625,.125,8,-1,7.99,4,4][i%7]),got=await executeAnalysisTool(service,'sampleBatch',{artifactId:id,times,mode});assert.equal(got.records.length,n);for(let i=0;i<n;i++){assert.equal(got.records[i].sourceTimeSeconds,times[i]);assert.deepEqual(got.records[i].result,reader().query(times[i],{mode}));}}
    const all=await service.sampleBatch(id,{times:data.samples.map(s=>s.timestampUs/1e6)});assert.equal(all.records.filter(r=>r.result.valid).length,57);
    const mutable=[4,.125],pending=service.sampleBatch(id,{times:mutable});mutable.reverse();const captured=await pending;assert.deepEqual(captured.records.map(r=>r.sourceTimeSeconds),[4,.125]);
  }finally{await service.close();}
});
test('batch verifies the entire Artifact once, including when its parser session is hot',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root}),original=AnalysisArtifactStore.prototype.read;let count=0;
  AnalysisArtifactStore.prototype.read=(async function(this:AnalysisArtifactStore,...args:Parameters<typeof original>){count++;return original.apply(this,args);}) as typeof original;
  try{await service.sampleBatch(id,{times:Array(256).fill(4)});assert.equal(count,1);await service.sampleBatch(id,{times:[4,4]});assert.equal(count,2);assert.equal(service.queryCacheStatus().hits,1);assert.equal(service.queryCacheStatus().authentication,'full-c3-every-call');}finally{AnalysisArtifactStore.prototype.read=original;await service.close();}
});
test('batch is bounded and failures are atomic; malformed time and mode retain the official Reader error',async()=>{
  const service=await createAnalysisService({projectRoot:await fixture()});try{
    for(const times of [[],Array(1025).fill(0),Array(4)])await assert.rejects(service.sampleBatch(id,{times}),{code:'E_ARGUMENT'});
    for(const time of [NaN,Infinity,Number.MAX_VALUE,'4' as any])await assert.rejects(service.sampleBatch(id,{times:[4,time]}),{code:'E_GRAPHICS_DATA'});
    await assert.rejects(service.sampleBatch(id,{times:[4],mode:'bad' as any}),{code:'E_GRAPHICS_DATA'});
    await assert.rejects(service.sampleBatch(id,{times:[4],maxGapSeconds:-1}),{code:'E_GRAPHICS_DATA'});
    const values=await service.sampleBatch(id,{times:Array(1024).fill(4)});assert.ok(Buffer.byteLength(JSON.stringify(values))<2*1024*1024);
  }finally{await service.close();}
});
test('hot cache cannot authorize same-size frame tampering, restored mtime, corrupt metadata or deleted files',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root}),path=join(artifactDir(root),data.samples[20].frameAsset),bytes=await readFile(path);
  try{await service.sample(id,{time:4});await service.sample(id,{time:4});assert.equal(service.queryCacheStatus().hits,1);const changed=Buffer.from(bytes);changed[100]^=1;await writeFile(path,changed);await utimes(path,new Date(0),new Date(0));await assert.rejects(service.sample(id,{time:4}),{code:'E_ANALYSIS_CACHE'});assert.equal(service.queryCacheStatus().entries,0);await writeFile(path,bytes);await service.sample(id,{time:4});
    const complete=join(artifactDir(root),'complete.json'),saved=await readFile(complete);await writeFile(complete,'{}');await assert.rejects(service.sampleBatch(id,{times:[4]}),{code:'E_ANALYSIS_CACHE'});await writeFile(complete,saved);await rename(path,join(root,'removed-frame.png'));await assert.rejects(service.sample(id,{time:4}),{code:'E_ANALYSIS_CACHE'});
  }finally{await service.close();}
});
test('fully re-authenticated same-key content replacement cannot reuse an old parsed trajectory',async()=>{
  const root=await fixture(),directory=artifactDir(root),service=await createAnalysisService({projectRoot:root});try{
    const initial=await service.sample(id,{time:4});assert.ok('result' in initial&&initial.result.valid);const next=structuredClone(data);next.samples[32].anchor!.x+=.02;await writeFile(join(directory,'track.next'),JSON.stringify(next));await rename(join(directory,'track.next'),join(directory,'track.json'));
    const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));Object.assign(manifest.files.find((f:any)=>f.path==='track.json'),await hashAnalysisFile(join(directory,'track.json')));const text=JSON.stringify(canonicalAnalysisValue(manifest),null,2);await writeFile(join(directory,'manifest.json'),text);await writeFile(join(directory,'complete.json'),JSON.stringify({schemaVersion:1,cacheKey:id,manifestSha256:createHash('sha256').update(text).digest('hex')}));
    const later=await service.sample(id,{time:4});assert.ok('result' in later&&later.result.valid);assert.equal(later.result.anchor.x,next.samples[32].anchor!.x);assert.notDeepEqual(later.result,initial.result);
  }finally{await service.close();}
});
test('directory links and resource deletion remain errors after warming a query session',async()=>{
  const root=await fixture(),directory=artifactDir(root),service=await createAnalysisService({projectRoot:root});try{await service.sample(id,{time:4});const moved=directory+'-saved';await rename(directory,moved);await symlink(moved,directory,'junction');await assert.rejects(service.sampleBatch(id,{times:[4]}),{code:'E_ANALYSIS_PATH'});}finally{await service.close();}
});
test('metadata changes during parallel verification are rejected and all validation readers settle',async()=>{
  const root=await fixture(),store=new AnalysisArtifactStore(join(root,'.frameweave/analysis-tools/artifacts')),original=(store as any).file;let modified=false;
  (store as any).file=async function(...args:any[]){const file=await original.apply(this,args);if(!modified){modified=true;const complete=join(artifactDir(root),'complete.json'),record=JSON.parse(await readFile(complete,'utf8'));record.schemaVersion=2;await writeFile(complete,JSON.stringify(record));}return file;};
  await assert.rejects(store.read(id),{code:'E_ANALYSIS_CACHE'});assert.ok(modified);
});
test('batch cancellation, cache clearing and service close never return stale success',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root});
  const early=new AbortController();early.abort();await assert.rejects(service.sampleBatch(id,{times:[4]},{signal:early.signal}),{code:'E_CANCELLED'});
  const controller=new AbortController(),pending=service.sampleBatch(id,{times:Array(256).fill(4)},{signal:controller.signal});setImmediate(()=>controller.abort());await assert.rejects(pending,{code:'E_CANCELLED'});
  await service.sample(id,{time:4});service.clearQueryCache();assert.equal(service.queryCacheStatus().entries,0);await service.sample(id,{time:4});assert.equal(service.queryCacheStatus().entries,1);
  const pendingClose=service.sampleBatch(id,{times:[4]}),closing=service.close();await assert.rejects(pendingClose,{code:'E_ANALYSIS_SERVICE_CLOSED'});await closing;assert.equal(service.queryCacheStatus().entries,0);await assert.rejects(service.sampleBatch(id,{times:[4]}),{code:'E_ANALYSIS_SERVICE_CLOSED'});
});
test('bounded Reader session evicts old entries without caching filesystem trust or exposing live objects',async()=>{
  const session=new AnalysisQuerySession();for(let i=0;i<5;i++){const root=await fixture(),artifact=await new AnalysisArtifactStore(join(root,'.frameweave/analysis-tools/artifacts')).read(id);assert.ok(artifact);await session.track(artifact);}
  assert.equal(session.status().entries,4);assert.ok(session.status().serializedBytes<=session.maxBytes);const root=await fixture(),artifact=await new AnalysisArtifactStore(join(root,'.frameweave/analysis-tools/artifacts')).read(id);assert.ok(artifact);session.clear();const loading=session.track(artifact);session.clear();await loading;assert.equal(session.status().entries,0);session.close();assert.equal(session.status().entries,0);
});
test('real Node PNG overlay and retained Renderer agree on query/hold semantics, not cross-backend pixels',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root});try{
    const images:Buffer[]=[];for(const [i,time]of [0,.125,4,4.0625,7.875,4].entries()){
      const result=await service.preview(id,time,`node-${i}.png`);assert.equal(result.backend.id,'node-sharp-svg');assert.deepEqual(result.result,reader().query(time));const bytes=await readFile(result.output.path);assert.deepEqual(await hashAnalysisFile(result.output.path),{sha256:result.output.reference.sha256,bytes:result.output.reference.bytes});const rgba=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(rgba.info.width,640);assert.equal(rgba.info.height,480);images.push(bytes);
      if(result.result.valid){const p=(Math.round(result.result.anchor.y*480)*640+Math.round(result.result.anchor.x*640))*4;assert.deepEqual([...rgba.data.subarray(p,p+3)],[122,255,209]);}else{const frame=data.samples.find(s=>s.timestampUs===result.backgroundTimestampUs)!;assert.deepEqual(rgba.data,await sharp(await readFile(join(artifactDir(root),frame.frameAsset))).ensureAlpha().raw().toBuffer());}
    }assert.deepEqual(images[2],images[5]);const compatible=await service.preview(id,4,'renderer.png',{backend:'renderer'});assert.equal(compatible.backend.id,'renderer');assert.deepEqual(compatible.result,reader().query(4));assert.notDeepEqual(await readFile(compatible.output.path),images[2]);
    await assert.rejects(service.preview(id,4,'node-2.png'),{code:'E_ANALYSIS_OUTPUT_EXISTS'});await assert.rejects(service.preview(id,4,'../escape.png'),{code:'E_ANALYSIS_PATH'});
  }finally{await service.close();}
});
test('lean CLI inspect/batch/Node preview run with browser and compiler module imports forbidden',async()=>{
  const root=await fixture(),loader=join(root,'deny-browser.mjs');await writeFile(loader,"export async function resolve(s,c,n){if(/^(playwright|three|react)(\\/|$)/.test(s)||/src[\\\\/]compiler[\\\\/]build\\.ts/.test(s)||(s==='esbuild'&&!c.parentURL?.includes('/node_modules/tsx/')))throw Error('BROWSER_IMPORT_FORBIDDEN '+s);return n(s,c);}");
  await writeFile(join(root,'image.ppm'),Buffer.concat([Buffer.from('P6\n1 1\n255\n'),Buffer.from([30,60,90])]));
  for(const args of [['inspect',id],['sample-batch',id,'--times','4,.125,4.0625,4'],['preview',id,'--time','4','--output','cli.png'],['run','brightness','--input','image.ppm']]){
    const r=await promisify(execFile)(process.execPath,['--no-warnings','--loader',pathToFileURL(loader).href,'--import','tsx',resolve('src/analysis-tools/entry.ts'),...args,'--project',root,'--json'],{windowsHide:true,maxBuffer:1024*1024});assert.equal(JSON.parse(r.stdout).ok,true);assert.equal(r.stderr,'');
  }
});
