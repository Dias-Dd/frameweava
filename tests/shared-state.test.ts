import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {createAnalysisTask} from '../src/analysis/task.ts';
import {createNodeAnalysisExecutor} from '../src/analysis/node-executor.ts';
import {SharedRenderSession,sharedPlan} from '../modules/shared-state/node.ts';
import {sharedVariable,sharedFrame,bounded,CONFIG,RUNTIME,OUTPUT,type Publication} from '../modules/shared-state/protocol.ts';
import {SharedStage} from '../modules/shared-state/authoring.ts';
import {count,object,left,right,total} from '../examples/shared-state/cells.ts';
import * as hostOrdinary from '../examples/shared-state/scope-module.mjs';
import type {BuiltProject,FrameContext} from '../src/core/types.ts';

const code=(expected:string)=>(error:any)=>error?.code===expected;
const root=resolve('.'),proof=resolve(process.env.FRAMEWEAVE_SHARED_TEST_OUTPUT??join(root,'artifacts/v-shared'));
const project=join(root,'examples/shared-state/project.tsx');
const ctx:FrameContext={frame:100,globalFrame:100,time:4,globalTime:4,dt:.04,progress:1,fps:{num:25,den:1},durationInFrames:111,seed:1};
const strip=(value:Record<string,any>)=>Object.fromEntries(Object.entries(value).map(([id,ports])=>[id,Object.fromEntries(Object.entries(ports).filter(([,v])=>!(v&&typeof v==='object'&&'kind' in v&&v.kind==='surface')))]));
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const rgba=async(b:Buffer)=>sharp(b).ensureAlpha().raw().toBuffer();
async function save(name:string,value:unknown){await mkdir(proof,{recursive:true});await writeFile(join(proof,name),JSON.stringify(value,null,2));}
function changed(build:BuiltProject,id:string,props:Record<string,unknown>){const copy={...build,manifest:structuredClone(build.manifest)};Object.assign(copy.manifest.stages.find(s=>s.id===id)!.props,props);return copy;}

test('V-SHARED bounded JSON, synchronous delivered snapshot, writer conflicts and stale messages',()=>{
  for(const value of [NaN,Infinity])assert.throws(()=>bounded(value,'number'),code('E_SHARED_VALUE'));
  for(const value of [new Date(),new Float32Array(4),()=>1,new(class Example{})(),{get trap(){throw Error('getter must not execute');}}])assert.throws(()=>bounded(value,'json'),code('E_SHARED_VALUE'));
  const cyclic:any={};cyclic.self=cyclic;assert.throws(()=>bounded(cyclic,'json'),code('E_SHARED_VALUE'));assert.throws(()=>bounded(Array(3),'json'),code('E_SHARED_VALUE'));
  const extended:any=[1];extended.length=2;extended.extra=2;assert.throws(()=>bounded(extended,'json'),code('E_SHARED_VALUE'));
  assert.throws(()=>bounded('é'.repeat(10000),'string'),code('E_SHARED_BUDGET'));assert.throws(()=>bounded(Array(1100).fill(0),'json'),code('E_SHARED_BUDGET'));
  let deep:any={};for(let i=0;i<12;i++)deep={deep};assert.throws(()=>bounded(deep,'json'),code('E_SHARED_BUDGET'));
  const encoded=JSON.stringify({stage:'A',writes:[count,object],reads:[]}),runtime=JSON.stringify({session:'session',transaction:1,revision:0,frame:100,cells:{count:{value:0,version:0},object:{value:object.initial,version:0}}});
  assert.throws(()=>sharedFrame(ctx,{}, {[CONFIG]:encoded}),code('E_SHARED_HOST_REQUIRED'));
  const draft=sharedFrame(ctx,{}, {[CONFIG]:encoded,[RUNTIME]:runtime});draft.set(count,2);draft.set(count,3);const copied=draft.get(object);copied.items.push(9);assert.deepEqual(draft.get(object).items,[0]);
  const output=draft.outputs({});assert.equal((output[OUTPUT] as unknown as Publication).writes.count.version,1);assert.throws(()=>draft.get(count),code('E_SHARED_FINALIZED'));
  const reader={stage:'B',writes:[],reads:[{variable:count,input:'input'}]},readerRuntime=JSON.stringify({session:'session',transaction:1,revision:0,frame:100,cells:{count:{value:0,version:0}}});
  const view=sharedFrame(ctx,{input:output[OUTPUT]},{[CONFIG]:JSON.stringify(reader),[RUNTIME]:readerRuntime});assert.equal(view.get(count),3);assert.throws(()=>view.set(count,4),code('E_SHARED_WRITER'));
  const stale=structuredClone(output[OUTPUT]) as unknown as Publication;stale.transaction=0;assert.throws(()=>sharedFrame(ctx,{input:stale as any},{[CONFIG]:JSON.stringify(reader),[RUNTIME]:readerRuntime}),code('E_SHARED_STALE'));
  assert.throws(()=>SharedStage({id:'B',writes:[count],entry:'./unused.ts'}),code('E_SHARED_CONFLICT'));
});

test('Reconstructed variables experiment: two Web realms, real Dedicated Worker, 100→0→100 and cache',{timeout:120000},async()=>{
  const build=await buildProject(join(root,'examples/shared-state/semantics.tsx')),cases=[];hostOrdinary.set(999);
  for(const cache of [false,true]){
    const renderer=await Renderer.create(build,{cache:false===cache?false:true});const rows=[];
    try{for(const frame of [100,0,100,101]){
      const result=await renderer.renderFrame(frame),a=result.stageOutputs.A,b=result.stageOutputs.B;assert.equal(a.value,frame+10);assert.equal(b.local,0);assert.equal(b.fromA,a.value);
      rows.push({frame,cacheHits:result.cacheHits,outputs:strip(result.stageOutputs),rgba:hash(await rgba(result.png))});
    }}finally{await renderer.close();}
    assert.equal(rows[0].outputs.A.calls,1);assert.equal(rows[1].outputs.A.calls,2);assert.equal(rows[2].outputs.A.calls,cache?1:3);assert.equal((rows[2].outputs.A.worker as any).calls,cache?1:3);assert.equal(rows[2].cacheHits,cache?2:0);
    assert.equal(rows[3].outputs.A.calls,cache?3:4);assert.equal(hostOrdinary.get(),999);cases.push({cache,rows});
  }
  await save('ordinary-realms.json',cases);
});

test('Real Node AnalysisTask uses a fresh module realm per execution; C3 cache replays artifact',{timeout:60000},async()=>{
  await mkdir(join(root,'.frameweave/v-shared'),{recursive:true});const cacheRoot=await mkdtemp(join(root,'.frameweave/v-shared/c3-')),rows=[];hostOrdinary.set(999);
  for(const [frame,nonce]of [[100,0],[0,0],[100,0],[100,1]]){
    const task=createAnalysisTask<{frame:number;nonce:number},{frame:number;before:number;after:number;calls:number;pid:number}>({input:{frame,nonce},executor:createNodeAnalysisExecutor({module:join(root,'examples/shared-state/analysis-task.ts'),cacheRoot,cwd:root})});
    const r=await task.start().wait();assert.equal(r.cleanup.complete,true);assert.equal(r.cleanup.processExited,true);assert.equal(r.output.before,0);assert.equal(r.output.calls,1);assert.equal(r.output.after,frame);assert.equal(hostOrdinary.get(),999);rows.push({frame,nonce,...r});
  }
  assert.deepEqual(rows.map(r=>r.cacheHit),[false,false,true,false]);assert.equal(rows[2].output.pid,rows[0].output.pid);assert.notEqual(rows[3].output.pid,rows[0].output.pid);await save('node-analysis-realms.json',rows);
});

test('Real shared cells: persistent versions, all four kinds, 100→0→100, cache on/off, reopen and concurrent callers',{timeout:180000},async()=>{
  await mkdir(proof,{recursive:true});const build=await buildProject(project),before=JSON.stringify(build.manifest),cases=[];
  for(const cache of [false,true]){
    const session=await SharedRenderSession.fromBuilt(build,{cache}),rows=[];
    try{
      for(const frame of [100,0,100,100]){
        const result=await session.renderFrame(frame),n:number=rows.length+1,b=result.stageOutputs.B;assert.equal(b.value,n);assert.equal(b.version,n);assert.equal(b.ordinaryValue,0);assert.equal(b.scopeCalls,0);assert.equal(b.calls,n);assert.equal(b.on,n%2===1);assert.equal(b.text,`frame-${frame}`);assert.deepEqual(b.data,{items:[n],$expr:'literal-data'});assert.deepEqual(result.diagnostics,[]);
        assert.equal(result.stageOutputs.A.calls,n);rows.push({frame,cacheHits:result.cacheHits,shared:result.shared,outputs:strip(result.stageOutputs),rgba:hash(await rgba(result.png))});
        await writeFile(join(proof,`shared-${cache?'cache':'uncached'}-${n}.png`),result.png);
      }
      assert.equal(rows[2].cacheHits,cache?1:0);assert.notEqual(rows[0].rgba,rows[2].rgba,'State is history-dependent; do not claim same-frame deterministic pixels');
      const calls=[session.renderFrame(100),session.renderFrame(0),session.renderFrame(100)],read=session.read(count),concurrent=await Promise.all(calls);assert.deepEqual(concurrent.map(r=>r.stageOutputs.B.value),[5,6,7]);assert.equal((await read).value,7);
      const detached=await session.read(object);detached.value.items.push(999);assert.deepEqual((await session.read(object)).value.items,[7]);
      await assert.rejects(session.renderFrame(0,{allowWasm:true} as any),code('E_SHARED_ARGUMENT'));
      cases.push({cache,rows,concurrent:concurrent.map(r=>r.shared),readAfterEarlierRequests:await session.read(count)});
    }finally{await session.close();await session.close();}
    await assert.rejects(session.read(count),code('E_SHARED_CLOSED'));
  }
  assert.deepEqual(cases[0].rows.map(r=>r.rgba),cases[1].rows.map(r=>r.rgba),'Same accepted history has identical decoded pixels with cache on/off');
  assert.equal(JSON.stringify(build.manifest),before,'Wrapper must not inject into caller build');
  const [a,b]=await Promise.all([SharedRenderSession.fromBuilt(build,{cache:true}),SharedRenderSession.fromBuilt(build,{cache:true})]);
  try{const [x,y]=await Promise.all([a.renderFrame(100),b.renderFrame(100)]);assert.notEqual(x.shared.session,y.shared.session);assert.equal(x.stageOutputs.B.value,1);assert.equal(y.stageOutputs.B.value,1);assert.deepEqual(await rgba(x.png),await rgba(y.png));}finally{await a.close();await b.close();}
  await save('shared-cache-concurrency.json',cases);
});

test('Real failure rollback: producer throws or downstream throws; retry cannot consume a cached stale publication',{timeout:150000},async()=>{
  const build=await buildProject(project),cases=[];
  for(const [id,key]of [['A','writerFailure'],['B','readerFailure']] as const){
    const session=await SharedRenderSession.fromBuilt(changed(build,id,{[key]:true}),{cache:true});
    try{
      await assert.rejects(session.renderFrame(0),id==='A'?/V_SHARED_WRITER_FAILURE/:/V_SHARED_READER_FAILURE/);assert.deepEqual(await session.read(count),{value:0,version:0,revision:0});
      const recovered=await session.renderFrame(100);assert.equal(recovered.stageOutputs.B.value,1);
      await assert.rejects(session.renderFrame(0),/V_SHARED_.*_FAILURE/);assert.equal((await session.read(count)).version,1);
      const next=await session.renderFrame(100);assert.equal(next.stageOutputs.B.value,2);assert.equal(next.stageOutputs.A.calls,4);cases.push({failedStage:id,recovered:recovered.shared,next:next.shared,ordinarySideEffectsNotRolledBack:next.stageOutputs.A.calls});
    }finally{await session.close();}
  }
  await save('failure-rollback.json',cases);
});

test('Session cancellation after real producer IPC returns is terminal and prevents logical commit; graceful close drains accepted work',{timeout:90000},async()=>{
  const build=await buildProject(project),controller=new AbortController(),events:unknown[]=[];
  const cancelled=await SharedRenderSession.fromBuilt(build,{cache:true,onProfile:e=>{if(e.phase==='web.evaluate-and-paint'&&e.stageId==='A'&&e.outcome==='ok'){events.push(e);controller.abort();}}});
  const pending=await Promise.allSettled([cancelled.renderFrame(100,{signal:controller.signal}),cancelled.renderFrame(0)]);for(const r of pending){assert.equal(r.status,'rejected');if(r.status==='rejected')assert.equal(r.reason.code,'E_SHARED_CANCELLED');}await cancelled.cancel();assert.equal(events.length,1);assert.equal(cancelled.status().lastCommittedRevision,0);await assert.rejects(cancelled.read(count),code('E_SHARED_CANCELLED'));
  const reopened=await SharedRenderSession.fromBuilt(build,{cache:true});try{assert.equal((await reopened.read(count)).version,0);}finally{await reopened.close();}
  const graceful=await SharedRenderSession.fromBuilt(build,{cache:true});const one=graceful.renderFrame(100),two=graceful.renderFrame(0),closing=graceful.close();assert.deepEqual((await Promise.all([one,two])).map(r=>r.stageOutputs.B.value),[1,2]);await closing;await assert.rejects(graceful.renderFrame(0),code('E_SHARED_CLOSED'));
  await save('cancellation-close.json',{events,cancelled:cancelled.status(),graceful:graceful.status()});
});

test('Planner rejects conflicting declarations or missing dependency; ordinary Renderer fails explicitly without a shared host',{timeout:45000},async()=>{
  const build=await buildProject(project),bad={...build,manifest:structuredClone(build.manifest)};delete bad.manifest.stages.find(s=>s.id==='B')!.inputs.vSharedInput0;assert.throws(()=>sharedPlan(bad),code('E_SHARED_DEPENDENCY'));
  const wrong={...build,manifest:structuredClone(build.manifest)},stage=wrong.manifest.stages.find(s=>s.id==='B')!,d=JSON.parse(String(stage.props[CONFIG]));d.reads[0].variable.initial=9;stage.props[CONFIG]=JSON.stringify(d);assert.throws(()=>sharedPlan(wrong),code('E_SHARED_CONFLICT'));
  const renderer=await Renderer.create(build,{cache:true});let actual:unknown;try{await assert.rejects(renderer.renderFrame(100),(error:any)=>{actual={code:error.code,message:error.message};return error.code==='E_SHARED_HOST_REQUIRED';});}finally{await renderer.close();}
  await save('host-required.json',{ordinaryRendererRejected:true,existingAdapterWrapsCustomCode:actual,missingEdgeRejected:true,conflictRejected:true});
});

test('Two independent producers, chained reader/writer, no-write frames and whole-frame atomicity',{timeout:90000},async()=>{
  const build=await buildProject(join(root,'examples/shared-state/two-writers.tsx')),session=await SharedRenderSession.fromBuilt(build,{cache:true}),rows=[];
  try{for(const [frame,l,r,t]of [[100,1,10,11],[0,1,20,21],[100,2,30,32]]){
    const f=await session.renderFrame(frame);assert.equal(f.stageOutputs.B.left,l);assert.equal(f.stageOutputs.B.right,r);assert.equal(f.stageOutputs.D.total,t);rows.push({frame,...f.shared});
  }assert.equal((await session.read(left)).version,2);assert.equal((await session.read(right)).version,3);assert.equal((await session.read(total)).version,3);}finally{await session.close();}
  const failed=await SharedRenderSession.fromBuilt(changed(build,'D',{failure:true}),{cache:true});
  try{await assert.rejects(failed.renderFrame(0),/V_SHARED_LAST_STAGE_FAILURE/);for(const v of [left,right,total])assert.deepEqual(await failed.read(v),{value:0,version:0,revision:0});const f=await failed.renderFrame(100);assert.equal(f.stageOutputs.D.total,11);}finally{await failed.close();}
  const corrupt=await SharedRenderSession.fromBuilt(changed(build,'C',{corrupt:true}),{cache:true});
  try{await assert.rejects(corrupt.renderFrame(0),code('E_SHARED_CONFLICT'));for(const v of [left,right,total])assert.deepEqual(await corrupt.read(v),{value:0,version:0,revision:0});assert.equal((await corrupt.renderFrame(100)).stageOutputs.D.total,11);}finally{await corrupt.close();}
  const inactiveBuild={...build,manifest:structuredClone(build.manifest)};for(const s of inactiveBuild.manifest.stages){s.time.start=10;s.time.duration=100;}
  await assert.rejects(SharedRenderSession.fromBuilt(inactiveBuild),code('E_TVG'),'Existing layer/Stage interval guard remains active');
  for(const layer of inactiveBuild.manifest.layers){layer.start=10;layer.end=110;}
  const inactive=await SharedRenderSession.fromBuilt(inactiveBuild,{cache:true});
  try{const f=await inactive.renderFrame(0);assert.deepEqual(f.stageOutputs,{});assert.equal(f.shared.revision,0);assert.equal((await inactive.read(right)).version,0);assert.equal((await inactive.renderFrame(100)).stageOutputs.D.total,11);}finally{await inactive.close();}
  await save('two-writers-atomic.json',{rows,failedLastStageRolledBackAllThreeCells:true,hostRejectedUndeclaredWriteAndCommittedNothing:true,inactiveStagesDoNotWrite:true});
});
