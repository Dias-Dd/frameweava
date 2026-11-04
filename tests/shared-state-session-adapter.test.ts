import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {EngineError} from '../src/core/errors.ts';
import {buildProject} from '../src/compiler/build.ts';
import {frameContext} from '../src/core/time.ts';
import {SharedSessionAdapter} from '../modules/shared-state/session-adapter.ts';
import {sharedFrame} from '../modules/shared-state/protocol.ts';
import {serializeStageFailure,sharedStageError} from '../modules/shared-state/remote-error.ts';
import {count} from '../examples/shared-state/cells.ts';
import type {BuiltProject} from '../src/core/types.ts';
import type {FrameExecution} from '../src/render/frame-execution.ts';
const proof=resolve('artifacts/v-shared-phase2/adapter'),code=(expected:string)=>(e:any)=>e?.code===expected;
let build:BuiltProject;before(async()=>{await mkdir(proof,{recursive:true});build=await buildProject(resolve('examples/shared-state/project.tsx'));});
const owner={assertActive(){}};
const result=(input:FrameExecution|undefined)=>{
  const stage=build.manifest.stages.find(s=>s.id==='A')!,props={...stage.props,...input?.stageProps?.A},frame=JSON.parse(String(props.vSharedRuntime)).frame,d=sharedFrame(frameContext(build.manifest,stage,frame),{},props);d.set(count,d.get(count)+1);return {stageOutputs:{A:d.outputs({})}};
};

test('adapter unit: ordinary projects stay optional, whole-frame commit, schema seals and local reads',async()=>{
  const a=new SharedSessionAdapter('owner');const ordinary={...build,manifest:{...build.manifest,stages:build.manifest.stages.map(s=>({...s,props:{}}))}};
  assert.equal(a.bind(ordinary,'ordinary'),false);let passed:unknown='unset';await a.render(0,async input=>{passed=input;return {stageOutputs:{}};},owner);assert.equal(passed,undefined);
  assert.equal(a.bind(build,'seal-v1'),true);const f=await a.render(100,async input=>result(input),owner);assert.equal(f.shared?.cells.count.value,1);
  await assert.rejects(a.render(0,async input=>result(input),owner,'B'),code('E_SHARED_PARTIAL_RENDER'));assert.equal(a.read(count).version,1);
  assert.throws(()=>a.bind(build,'seal-v2'),code('E_SHARED_SESSION_REOPEN'));assert.throws(()=>a.read(count),code('E_SHARED_SESSION_REOPEN'));a.dispose();
});

test('adapter unit: end-of-frame failure, invalid publication and lifecycle cancellation cannot commit',async()=>{
  const a=new SharedSessionAdapter('faults');a.bind(build,'seal');
  await assert.rejects(a.render(100,async input=>{result(input);throw Error('FAULT_AT_FRAME_END');},owner),/FAULT_AT_FRAME_END/);assert.equal(a.read(count).version,0);
  await assert.rejects(a.render(100,async()=>({stageOutputs:{}}),owner),code('E_SHARED_PUBLICATION'));assert.equal(a.read(count).version,0);
  let active=true;const guard={assertActive(){if(!active)throw new EngineError('E_RENDER_CANCELLED','Cancelled');}};
  await assert.rejects(a.render(100,async input=>{const f=result(input);active=false;return f;},guard),code('E_RENDER_CANCELLED'));assert.equal(a.read(count).version,0);
  const recovered=await a.render(100,async input=>result(input),owner);assert.equal(recovered.shared?.cells.count.version,1);assert.equal(recovered.shared?.transaction,4);
  await writeFile(join(proof,'unit-barriers.json'),JSON.stringify({rollback:true,version:a.read(count),lastTransaction:recovered.shared?.transaction},null,2));
});

test('adapter unit: timeout/disconnect require reopen, ordinary Stage errors allow retry',async()=>{
  for(const failure of ['E_STAGE_TIMEOUT','E_CHROMIUM_DISCONNECTED','E_STAGE_INIT']){
    const a=new SharedSessionAdapter(failure);a.bind(build,'seal');await assert.rejects(a.render(100,async()=>{throw new EngineError(failure,'backend failure');},owner),code(failure));
    await assert.rejects(a.render(100,async input=>result(input),owner),code('E_SHARED_SESSION_REOPEN'));a.dispose();
  }
  const a=new SharedSessionAdapter('stage-error');a.bind(build,'seal');await assert.rejects(a.render(100,async()=>{throw new EngineError('E_STAGE_RENDER','ordinary frame error');},owner),code('E_STAGE_RENDER'));
  assert.equal((await a.render(100,async input=>result(input),owner)).shared?.cells.count.value,1);a.dispose();
});

test('structured remote error unit: shared codes and bounded cause survive; location is assigned by host',()=>{
  const inner=new EngineError('E_SHARED_VALUE','invalid JSON'),outer=new EngineError('E_SHARED_HOST_REQUIRED','wrong entry') as EngineError&{cause?:unknown};outer.cause=inner;
  const data=serializeStageFailure(outer),e=sharedStageError({...data,stageId:'forged',frame:999},{stageId:'A',frame:100})!;
  assert.equal(e.code,'E_SHARED_HOST_REQUIRED');assert.equal(e.stageId,'A');assert.equal(e.frame,100);assert.equal((e.details as any).cause.cause.code,'E_SHARED_VALUE');
  assert.equal(sharedStageError({code:'E_STAGE_RENDER',message:'E_SHARED_HOST_REQUIRED in ordinary text'},{stageId:'A'}),undefined);
  assert.equal(sharedStageError({get code(){throw Error('getter');}},{stageId:'A'}),undefined);
  const huge:any={code:'E_SHARED_VALUE',message:'é'.repeat(20000),stack:'x'.repeat(20000)};huge.cause=huge;
  assert.ok(Buffer.byteLength(JSON.stringify(serializeStageFailure(huge)))<10000);
});
