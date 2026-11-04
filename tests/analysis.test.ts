import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,readdir,unlink,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import {createAnalysisTask,createNodeAnalysisExecutor,AnalysisArtifactStore,analysisHash,analysisCacheKey} from '../src/analysis/index.ts';
import type {Input,Output} from './fixtures/analysis-task.ts';
import type {BrightnessInput,BrightnessOutput} from '../examples/analysis/brightness-task.ts';
import type {AnalysisIdentity,AnalysisResult,AnalysisSnapshot} from '../src/analysis/types.ts';

const base=resolve('.frameweave/analysis-c3-tests');await mkdir(base,{recursive:true});
const root=()=>mkdtemp(join(base,'case-'));
const fixture=(cacheRoot:string,input:Input={value:42},extra:Record<string,number>={})=>createAnalysisTask({input,executor:createNodeAnalysisExecutor<Input,Output>({module:resolve('tests/fixtures/analysis-task.ts'),cacheRoot,...extra})});
const noStaging=async(p:string)=>assert.ok(!(await readdir(p)).some(n=>n.startsWith('.tmp-')));
const waitPhase=async(job:ReturnType<typeof fixture>,phase:string)=>{
  if(job.status().phase===phase)return;
  await new Promise<void>((resolveDone,reject)=>{const off=job.subscribe(s=>{if(s.phase===phase){off();resolveDone();}});job.wait().then(()=>{off();reject(Error('Phase not reached'));},e=>{off();reject(e);});});
};
const identity:AnalysisIdentity={inputs:[{id:'file',sha256:analysisHash('content'),bytes:7}],algorithm:{id:'test',version:'1',integrity:analysisHash('code')},models:[],parameters:{a:1,b:2},runtime:{id:'node',version:process.version,integrity:analysisHash('runtime'),environment:{platform:process.platform}}};

test('create/start/status/subscribe/wait preserve types, progress, isolation and cleanup semantics',async()=>{
  const p=await root(),marker=join(p,'released'),job=fixture(p,{value:42,cleanupDelay:60,mode:'cleanup-marker',marker});
  const states:AnalysisSnapshot<Output>[]=[],off=job.subscribe(s=>states.push(s));assert.equal(job.status().state,'created');
  const changed=job.status();changed.state='failed';assert.equal(job.status().state,'created');
  job.start();const result=await job.wait();off();
  assert.equal(result.output.value,42);assert.equal(job.status().state,'succeeded');assert.equal(job.cancel(),false);
  assert.equal(result.artifact.manifest.identity.runtime.executor?.id,'node-child-process');result.output.value=0;assert.equal(job.status().result?.output.value,42);
  assert.ok(states.some(s=>s.phase==='work'&&s.progress===.5));assert.ok(states.some(s=>s.executionFinished&&!s.cleanupFinished));
  assert.equal(await readFile(marker,'utf8'),'released');assert.equal(result.cleanup.complete,true);assert.equal(result.cleanup.processExited,true);assert.equal(result.cleanup.stagingRemoved,true);assert.equal(result.cleanup.forced,false);await noStaging(p);
});
test('duplicate start and terminal start are rejected; pre-start cancellation allocates nothing',async()=>{
  const p=await root(),a=fixture(p);a.start();assert.throws(()=>a.start(),{code:'E_ANALYSIS_STATE'});await a.wait();assert.throws(()=>a.start(),{code:'E_ANALYSIS_STATE'});
  const b=fixture(p);assert.equal(b.cancel(),true);await assert.rejects(b.wait(),{code:'E_CANCELLED'});assert.equal(b.status().cleanup?.processExited,true);assert.throws(()=>b.start(),{code:'E_ANALYSIS_STATE'});
});
test('synchronous starting cancellation and repeated cancel do not lose an abort',async()=>{
  const p=await root(),job=fixture(p);let accepted=false;
  job.subscribe(s=>{if(s.phase==='starting'&&s.state==='running'){accepted=job.cancel();job.cancel();}});job.start();await assert.rejects(job.wait(),{code:'E_CANCELLED'});assert.ok(accepted);assert.equal(job.status().state,'cancelled');await noStaging(p);assert.deepEqual((await readdir(p)).filter(x=>/^[a-f0-9]{64}$/.test(x)),[]);
});
test('active cancellation waits for registered cleanup and child close before settling',async()=>{
  const p=await root(),job=fixture(p,{value:1,delay:1000,cleanupDelay:60});job.start();await waitPhase(job,'work');assert.equal(job.cancel(),true);await assert.rejects(job.wait(),{code:'E_CANCELLED'});assert.equal(job.status().cleanup?.resources.fixture,true);assert.equal(job.status().cleanup?.processExited,true);await noStaging(p);
});
test('cancel before commit wins over computation; cancellation after commit gate is rejected',async()=>{
  const p=await root(),before=fixture(p,{value:5,cleanupDelay:80});let cancelled=false;
  before.subscribe(s=>{if(s.executionFinished&&s.state==='running')cancelled=before.cancel();});before.start();await assert.rejects(before.wait(),{code:'E_CANCELLED'});assert.ok(cancelled);assert.ok(!(await readdir(p)).some(x=>/^[a-f0-9]{64}$/.test(x)));
  const after=fixture(p,{value:6});let rejected=false;after.subscribe(s=>{if(s.phase==='committing')rejected=after.cancel()===false;});await after.start().wait();assert.ok(rejected);assert.equal(after.status().state,'succeeded');
});
test('executor exceptions and invalid output/invalid progress are observable, never cached',async()=>{
  for(const [mode,code]of [['error','E_FIXTURE'],['live-error','E_FIXTURE'],['invalid-output','E_ANALYSIS_OUTPUT'],['bad-progress','E_ANALYSIS_PROGRESS']]){
    const p=await root(),job=fixture(p,{value:1,mode});await assert.rejects(job.start().wait(),{code});assert.equal(job.status().state,'failed');assert.equal(job.status().cleanup?.processExited,true);await noStaging(p);assert.equal((await readdir(p)).length,0);
  }
});
test('unexpected child exit rejects, removes staging and never publishes a result',async()=>{
  const p=await root(),job=fixture(p,{value:1,mode:'crash'});await assert.rejects(job.start().wait(),{code:'E_ANALYSIS_PROCESS'});assert.equal(job.status().cleanup?.complete,false);await noStaging(p);assert.equal((await readdir(p)).length,0);
});
test('unresponsive task and its owned grandchild are forcibly terminated with unknown cleanup exposed',async()=>{
  const p=await root(),marker=join(p,'owned.pid'),job=fixture(p,{value:1,mode:'hang',marker},{cancelGraceMs:200});job.start();await waitPhase(job,'blocking');const pid=Number(await readFile(marker,'utf8'));job.cancel();await assert.rejects(job.wait(),{code:'E_ANALYSIS_TERMINATED'});assert.equal(job.status().cleanup?.forced,true);assert.equal(job.status().cleanup?.complete,false);assert.equal(job.status().cleanup?.processExited,true);assert.throws(()=>process.kill(pid,0));await noStaging(p);
});
test('cleanup failure is never reported as success or published',async()=>{
  const p=await root(),job=fixture(p,{value:1,mode:'cleanup-fail'});await assert.rejects(job.start().wait(),{code:'E_ANALYSIS_CLEANUP'});assert.equal(job.status().state,'failed');assert.equal(job.status().cleanup?.complete,false);assert.ok(job.status().cleanup?.errors.some(d=>d.message.includes('Deliberate cleanup')));await noStaging(p);assert.equal((await readdir(p)).length,0);
});
test('a failed task can be explicitly re-executed without a broken cache entry',async()=>{
  const p=await root(),marker=join(p,'fail-once');await writeFile(marker,'fail');const input:Input={value:7,mode:'fail-once',marker};await assert.rejects(fixture(p,input).start().wait(),{code:'E_FIXTURE'});const retry=await fixture(p,input).start().wait();assert.equal(retry.output.value,7);assert.equal(retry.cacheHit,false);
});
test('cache keys canonically encode input, parameters, algorithm, model and runtime identities',()=>{
  const key=analysisCacheKey(identity);assert.equal(key,analysisCacheKey({...identity,parameters:{b:2,a:1}}));
  for(const other of [{...identity,inputs:[{...identity.inputs[0],sha256:analysisHash('changed')}]},{...identity,parameters:{a:2,b:2}},{...identity,algorithm:{...identity.algorithm,version:'2'}},{...identity,algorithm:{...identity.algorithm,integrity:analysisHash('new-code')}},{...identity,models:[{id:'m',version:'1',integrity:analysisHash('model')}]},{...identity,runtime:{...identity.runtime,environment:{platform:'other'}}}])assert.notEqual(key,analysisCacheKey(other));
  assert.throws(()=>analysisHash({x:NaN}));assert.throws(()=>analysisHash({x:undefined}));assert.throws(()=>analysisHash(new Uint8Array(2)));
});
test('persisted cache skips execution and dependency revisions correctly invalidate',async()=>{
  const p=await root(),first=await fixture(p).start().wait(),warm=await fixture(p,{value:42,mode:'error'}).start().wait();assert.equal(warm.cacheHit,true);assert.equal(warm.artifact.directory,first.artifact.directory);
  for(const change of [{value:43},{salt:1},{algorithmVersion:'2'},{model:'2'},{runtime:'2'}]){const result=await fixture(p,{value:42,...change}).start().wait();assert.equal(result.cacheHit,false);assert.notEqual(result.artifact.manifest.cacheKey,first.artifact.manifest.cacheKey);}
});
test('corrupt manifest, result bytes, missing result and unknown versions are rejected',async()=>{
  for(const kind of ['manifest','bytes','missing','version','extra']){
    const p=await root(),result=await fixture(p).start().wait(),dir=result.artifact.directory;
    if(kind==='manifest')await writeFile(join(dir,'manifest.json'),'{}');
    if(kind==='bytes')await writeFile(join(dir,'value.json'),'changed');
    if(kind==='missing')await unlink(join(dir,'value.json'));
    if(kind==='extra')await writeFile(join(dir,'undeclared'),'unexpected');
    if(kind==='version'){const manifest={...result.artifact.manifest,schemaVersion:2},text=JSON.stringify(manifest);await writeFile(join(dir,'manifest.json'),text);await writeFile(join(dir,'complete.json'),JSON.stringify({schemaVersion:1,cacheKey:manifest.cacheKey,manifestSha256:createHash('sha256').update(text).digest('hex')}));}
    await assert.rejects(fixture(p).start().wait(),{code:'E_ANALYSIS_CACHE'});await noStaging(p);
  }
});
test('same-key concurrent writers reuse the first complete publication without overwriting it',async()=>{
  const p=await root(),barrier=join(p,'barrier'),input:Input={value:20,barrier};const a=fixture(p,input),b=fixture(p,input);a.start();b.start();await Promise.all([waitPhase(a,'work'),waitPhase(b,'work')]);await writeFile(barrier,'go');const [x,y]=await Promise.all([a.wait(),b.wait()]);assert.deepEqual([x.publication,y.publication].sort(),['concurrent-winner','created']);assert.equal(x.artifact.directory,y.artifact.directory);assert.deepEqual(x.artifact.manifest,y.artifact.manifest);await noStaging(p);
});
test('new independent parent processes reuse persistent results after restart',async()=>{
  const p=await root(),exec=promisify(execFile),run=async()=>JSON.parse((await exec(process.execPath,['--import','tsx','tests/fixtures/analysis-client.ts',p],{cwd:process.cwd(),windowsHide:true})).stdout);
  const a=await run(),b=await run();assert.equal(a.cacheHit,false);assert.equal(b.cacheHit,true);assert.equal(a.key,b.key);assert.equal(b.value,42);
});
test('artifact path traversal, deletion boundaries, unlisted files and disk budgets are enforced',async()=>{
  const p=await root(),store=new AnalysisArtifactStore(p,{maxResultBytes:32,maxFiles:2}),stage=await store.begin();await writeFile(join(stage,'value'),'a');
  for(const path of ['../outside','/absolute','C:/outside','sub/../value','sub\\value','manifest.json'])await assert.rejects(store.prepare(stage,identity,{},[{path,format:'test'}]));
  await assert.rejects(store.discard(p));await assert.rejects(store.discard(join(p,'a'.repeat(64))));
  await writeFile(join(stage,'extra'),'b');await assert.rejects(store.prepare(stage,identity,{},[{path:'value',format:'test'}]));
  await unlink(join(stage,'extra'));await writeFile(join(stage,'value'),'x'.repeat(33));await assert.rejects(store.prepare(stage,identity,{},[{path:'value',format:'test'}]));await store.discard(stage);await noStaging(p);
});
test('symbolic directory results cannot escape the declared artifact boundary',async()=>{
  const p=await root(),outside=await root(),store=new AnalysisArtifactStore(p),stage=await store.begin();await writeFile(join(outside,'value'),'outside');await symlink(outside,join(stage,'link'),'junction');await assert.rejects(store.prepare(stage,identity,{},[{path:'link/value',format:'test'}]));await store.discard(stage);assert.equal(await readFile(join(outside,'value'),'utf8'),'outside');
});
test('real P6 image brightness uses the same task, cache, cancellation and artifact contracts',async()=>{
  const p=await root(),imagePath=join(p,'image.ppm'),pixels=Buffer.from([0,0,0,255,255,255,255,0,0,0,255,0]);await writeFile(imagePath,Buffer.concat([Buffer.from('P6\n2 2\n255\n'),pixels]));
  const executor=createNodeAnalysisExecutor<BrightnessInput,BrightnessOutput>({module:resolve('examples/analysis/brightness-task.ts'),exportName:'brightnessTask',cacheRoot:join(p,'cache')});
  const a=await createAnalysisTask({input:{imagePath,batchRows:1},executor}).start().wait();assert.equal(a.output.pixels,4);assert.ok(Math.abs(a.output.meanLuma-(0+255+54.213+182.376)/4)<1e-9);assert.equal(a.artifact.manifest.identity.models.length,0);assert.equal(a.artifact.manifest.kind,'frameweave.analysis-artifact');
  const warm=await createAnalysisTask({input:{imagePath,batchRows:1},executor}).start().wait();assert.equal(warm.cacheHit,true);
  const cancel=createAnalysisTask({input:{imagePath,batchRows:2},executor});cancel.subscribe(s=>{if(s.phase==='pixels')cancel.cancel();});await assert.rejects(cancel.start().wait(),{code:'E_CANCELLED'});assert.equal(cancel.status().cleanup?.complete,true);
  await writeFile(imagePath,'bad image');await assert.rejects(createAnalysisTask({input:{imagePath},executor}).start().wait(),{code:'E_BRIGHTNESS_INPUT'});
});
