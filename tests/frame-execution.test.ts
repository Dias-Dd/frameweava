import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureFrameExecution,frameStageProps,FRAME_EXECUTION_LIMITS} from '../src/render/frame-execution.ts';
import {hashValue} from '../src/render/cache.ts';
import {assertSharedExecution} from '../modules/shared-state/execution-host.ts';
const code=(expected:string)=>(e:any)=>e?.code===expected;

test('FrameExecution captures caller data before queueing, keeps literal expressions, and leaves authored props untouched',async()=>{
  const authored={value:3,retained:7},input={stageProps:{A:{value:{$expr:'literal-data'},nested:{list:[1]}}}},snapshot=captureFrameExecution(input,['A'])!;
  input.stageProps.A.nested.list.push(2);await Promise.resolve();
  const merged=frameStageProps(authored,'A',snapshot);assert.deepEqual(merged,{value:{$expr:'literal-data'},retained:7,nested:{list:[1]}});assert.deepEqual(authored,{value:3,retained:7});
  assert.equal(Object.isFrozen(snapshot.stageProps!.A.nested),true);assert.throws(()=>{(snapshot.stageProps!.A as any).changed=2;},TypeError);
  assert.equal(frameStageProps(authored,'B',snapshot),authored);assert.equal(captureFrameExecution(undefined,['A']),undefined);
  assert.notEqual(hashValue(merged),hashValue(frameStageProps(authored,'A',captureFrameExecution({stageProps:{A:{value:4}}},['A']))));
});

test('FrameExecution rejects unknown targets, policy fields, unsupported JSON and getter execution',()=>{
  assert.throws(()=>captureFrameExecution({stageProps:{missing:{x:1}}},['A']),code('E_FRAME_EXECUTION_STAGE'));
  for(const input of [null,[],{permissions:true},{stageProps:[]},{stageProps:{A:1}},{stageProps:{A:{bad:NaN}}},{stageProps:{A:{bad:new Date()}}},{stageProps:{A:{bad:()=>1}}},{stageProps:{A:{bad:new Uint8Array(1)}}}])assert.throws(()=>captureFrameExecution(input as any,['A']),code('E_FRAME_EXECUTION'));
  const input={get stageProps(){throw Error('must not invoke getter');}};assert.throws(()=>captureFrameExecution(input as any,['A']),code('E_FRAME_EXECUTION'));
  const cycle:any={};cycle.self=cycle;assert.throws(()=>captureFrameExecution({stageProps:{A:cycle}},['A']),code('E_FRAME_EXECUTION'));
  assert.throws(()=>captureFrameExecution({stageProps:{A:{sparse:Array(2)}}},['A']),code('E_FRAME_EXECUTION'));
});

test('FrameExecution enforces UTF-8, nesting, node and Stage-count budgets',()=>{
  assert.throws(()=>captureFrameExecution({stageProps:{A:{text:'é'.repeat(FRAME_EXECUTION_LIMITS.bytes/2)}}},['A']),code('E_FRAME_EXECUTION_BUDGET'));
  let deep:any=0;for(let i=0;i<20;i++)deep={deep};assert.throws(()=>captureFrameExecution({stageProps:{A:{deep}}},['A']),code('E_FRAME_EXECUTION_BUDGET'));
  assert.throws(()=>captureFrameExecution({stageProps:{A:{items:Array(FRAME_EXECUTION_LIMITS.nodes).fill(0)}}},['A']),code('E_FRAME_EXECUTION_BUDGET'));
  const ids=Array.from({length:FRAME_EXECUTION_LIMITS.stages+1},(_,i)=>`A${i}`);assert.throws(()=>captureFrameExecution({stageProps:Object.fromEntries(ids.map(id=>[id,{}]))},ids),code('E_FRAME_EXECUTION_BUDGET'));
});

test('unsupported shared entry rejects before invoking Stage work; ordinary entry is unaffected',()=>{
  const stages=[{id:'A',props:{vSharedDefinition:'explicit'}},{id:'B',props:{}}];let work=0;
  assert.throws(()=>{assertSharedExecution(stages);work++;},code('E_SHARED_HOST_REQUIRED'));assert.equal(work,0);
  assert.throws(()=>assertSharedExecution(stages,{stageProps:{B:{vSharedRuntime:'wrong-stage'}}}),code('E_SHARED_HOST_REQUIRED'));
  assertSharedExecution(stages,{stageProps:{A:{vSharedRuntime:'already-validated-host-snapshot'}}});assertSharedExecution([{id:'ordinary',props:{x:1}}]);
});
