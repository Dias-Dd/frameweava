import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {openRenderSession} from '../modules/render-session/index.ts';
import {stageRef} from '../modules/stage-orchestration/types.ts';
import {Renderer} from '../src/render/renderer.ts';
import {engineRoot} from '../src/compiler/build.ts';
const example=join(engineRoot,'examples/stage-orchestration/project.tsx');
test('formal Session.run loop, explicit dependencies, call commits and ordinary DAG cache epochs',{timeout:120000},async()=>{
 const s=await openRenderSession(example);try{
  let value=0;const ids=new Set<string>();
  for(let n=0;n<100;n++){const a=await s.run(stageRef<{value:number},{score:number;calls:number;frame:number;time:number}>('A'),{inputs:{value}});ids.add(a.callId);assert.equal(a.context.globalFrame,0);assert.equal(a.outputs.time,0);if(a.outputs.score>5)break;const b=await s.run('B',{inputs:{value:a.outputs.score}});ids.add(b.callId);value=b.outputs.value as number;}
  assert.equal(value,6);assert.equal(ids.size,13);
  const snapshot=await s.run('A',{inputs:{value:0}}),fps=snapshot.context.fps.num;snapshot.context.fps.num=1;
  assert.equal((await s.run('A',{inputs:{value:0}})).context.fps.num,fps);
  await assert.rejects(s.run('dependent'),{code:'E_INPUT_MISSING'});
  assert.equal((await s.run('dependent',{inputs:{source:44}})).outputs.value,44);
  for(let n=1;n<=4;n++)assert.equal((await s.run('writer',{inputs:{step:1}})).outputs.value,n);
  await assert.rejects(s.run('writer',{inputs:{step:1,fail:true}}));
  assert.equal((await s.run('reader')).outputs.value,4);
  const first=await s.evaluateFrame(1),cached=await s.evaluateFrame(1);assert.ok(cached.cacheHits>=5);
  const upstream=await s.run('upstream');const next=await s.evaluateFrame(1);assert.equal(next.stageOutputs.upstream.value,(upstream.outputs.value as number)+1);
  const b=next.stageOutputs.B.calls as number;await assert.rejects(s.run('B',{inputs:{value:-1}}));const after=await s.evaluateFrame(1);assert.equal(after.stageOutputs.B.calls,b+2);
  await assert.rejects(s.run('A',{inputs:{value:1},frame:0,time:1}),{code:'E_TIME_POSITION'});
  await assert.rejects(s.run('reader',{inputs:{vSharedRuntime:'forged'}}));
  assert.equal(s.status().hostStarts,1);assert.ok(first.shared);assert.ok(after.shared);
 }finally{await s.close();}
 await assert.rejects(s.run('A',{inputs:{value:0}}),{code:'E_RENDER_SESSION_CLOSED'});
});
test('formal calls move explicit numeric values across Web and a registered Adapter',{timeout:60000},async()=>{
 const root=join(engineRoot,'artifacts/main-all');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'cross-engine-')),project=join(dir,'project.tsx');let initialized=0,disposed=0;
 await writeFile(project,"import {Composition,Stage,ref} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';export const web=defineWebStage(()=>({renderAt(_c,i:{value:number}){return {value:i.value+1};}}));export default Composition({width:1,height:1,fps:12,durationInFrames:1,children:[Stage({id:'web',factory:web,inputs:{value:0},outputs:{value:'number'}}),Stage({id:'double',engine:'main-arithmetic',inputs:{source:ref('web','value')},inputTypes:{source:'number'},outputs:{value:'number'}})]});");
 Renderer.registerAdapter('main-arithmetic',()=>({engine:'main-arithmetic',async init(){initialized++;},async renderAt(_s,_c,i){return {outputs:{value:Number(i.source)*2},diagnostics:[]};},async dispose(){disposed++;}}));
 const s=await openRenderSession(project);try{const a=await s.run('web',{inputs:{value:2}});assert.equal(a.outputs.value,3);await assert.rejects(s.run('double'),{code:'E_INPUT_MISSING'});const b=await s.run('double',{inputs:{source:a.outputs.value}});assert.equal(b.outputs.value,6);assert.equal((await s.run('web',{inputs:{value:b.outputs.value}})).outputs.value,7);}finally{await s.close();}
 assert.equal(initialized,1);assert.equal(disposed,1);
});
test('formal Session rejects run reentry from both explicit calls and automatic DAG',{timeout:60000},async()=>{
 const root=join(engineRoot,'artifacts/main-all');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'reentry-')),project=join(dir,'project.tsx');
 await writeFile(project,"import {Composition,Stage} from '@frameweave/engine';export default Composition({width:1,height:1,fps:12,durationInFrames:1,children:Stage({id:'r',engine:'main-owned',outputs:{value:'number'}})});");
 let s:Awaited<ReturnType<typeof openRenderSession>>;
 Renderer.registerAdapter('main-owned',()=>({engine:'main-owned',async init(){},async renderAt(){await s.run('r');return {outputs:{value:1},diagnostics:[]};},async dispose(){}}));
 s=await openRenderSession(project);try{await assert.rejects(s.run('r'),{code:'E_STAGE_CALL_REENTRANT'});await assert.rejects(s.evaluateFrame(0),{code:'E_STAGE_CALL_REENTRANT'});}finally{await s.close();}
});
test('formal call cancellation releases backend and prevents late shared publication',{timeout:60000},async()=>{
 const root=join(engineRoot,'artifacts/main-all');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'cancel-')),project=join(dir,'project.tsx');
 await writeFile(project,"import {Composition,Stage} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';export const wait=defineWebStage(()=>({async renderAt(){await new Promise(()=>{});return {value:1};}}));export default Composition({width:1,height:1,fps:12,durationInFrames:1,children:Stage({id:'wait',factory:wait,outputs:{value:'number'}})});");
 const controller=new AbortController(),s=await openRenderSession(project,{timeoutMs:10000,onProfile:e=>{if(e.phase==='stage.init'&&e.outcome==='ok')setTimeout(()=>controller.abort(),100);}});
 try{await assert.rejects(s.run('wait',{signal:controller.signal}),{code:'E_RENDER_CANCELLED'});assert.equal(s.status().cancelled,true);}finally{await s.close();}
});
