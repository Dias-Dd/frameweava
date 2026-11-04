import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Composition} from '../src/core/authoring.ts';
import {defineNativeStage} from '../modules/native-gpu/authoring.ts';
import {SharedStage,sharedVariable,sharedFrame} from '../src/shared-state/authoring.ts';
import {sharedPlan} from '../modules/shared-state/plan.ts';
import {SharedSessionAdapter} from '../modules/shared-state/session-adapter.ts';
import {captureFrameExecution,frameStageProps} from '../src/render/frame-execution.ts';
import {assertSharedExecution} from '../modules/shared-state/execution-host.ts';
import {frameContext} from '../src/core/time.ts';
import {EngineError} from '../src/core/errors.ts';
import type {BuiltProject} from '../src/core/types.ts';
const count=sharedVariable({id:'count',writer:'writer',kind:'number',initial:0});
const factory=defineNativeStage(()=>({renderAt(){throw Error('not executed by protocol tests');}}));
function fixture(){return {manifest:Composition({width:2,height:2,fps:30,durationInFrames:120,children:[
  SharedStage({id:'writer',factory,writes:[count],outputs:{}}),
  SharedStage({id:'reader',factory,reads:[count],outputs:{surface:'surface'}}),
]}),dir:'.',hash:'native-shared-protocol',assets:{},stageBundles:{}} as BuiltProject;}
function execute(build:BuiltProject,execution:any){
  const stages=build.manifest.stages,frame=JSON.parse(execution.stageProps.writer.vSharedRuntime).frame;
  const a=stages[0],writer=sharedFrame(frameContext(build.manifest,a,frame),{},frameStageProps(a.props,a.id,execution));
  writer.set(count,writer.get(count)+1);const written=writer.outputs({});
  const b=stages[1],reader=sharedFrame(frameContext(build.manifest,b,frame),{vSharedInput0:written.sharedState},frameStageProps(b.props,b.id,execution));
  return {stageOutputs:{writer:written,reader:{seen:reader.get(count)}}};
}
const active={assertActive(){}},code=(name:string)=>(e:any)=>e?.code===name;
test('Native shared plan retains explicit typed writer-to-reader dependencies',()=>{
  const b=fixture(),plan=sharedPlan(b);assert.equal(plan.variables.length,1);assert.equal(b.manifest.stages[1].inputTypes?.vSharedInput0,'json');
  b.manifest.stages[0].engine='audio';assert.throws(()=>sharedPlan(b),code('E_SHARED_DECLARATION'));
});
test('Native commit follows accepted request history, including repeated and out-of-order frames',async()=>{
  const b=fixture(),host=new SharedSessionAdapter('native-history');host.bind(b,'verified');
  for(const [i,frame]of [100,0,100].entries()){const result=await host.render(frame,async e=>execute(b,e),active);assert.equal(result.stageOutputs.reader.seen,i+1);assert.equal(result.shared?.cells.count.version,i+1);}
  assert.deepEqual(host.read(count),{value:3,version:3,revision:3});
});
test('Failure after writer publication discards draft; retry receives a new transaction',async()=>{
  const b=fixture(),host=new SharedSessionAdapter('native-rollback');host.bind(b,'verified');let first=0;
  await assert.rejects(host.render(0,async e=>{first=JSON.parse(String(e?.stageProps?.writer.vSharedRuntime)).transaction;execute(b,e);throw Error('downstream failed');},active),/downstream failed/);
  assert.equal(host.read(count).version,0);const next=await host.render(0,async e=>execute(b,e),active);assert.ok(next.shared!.transaction>first);assert.equal(host.read(count).value,1);
});
test('Frame overrides are immutable snapshots and no-host entry rejects before execution',()=>{
  const b=fixture(),host=new SharedSessionAdapter('native-capture');host.bind(b,'verified');assert.throws(()=>assertSharedExecution(b.manifest.stages),code('E_SHARED_HOST_REQUIRED'));
  const original={stageProps:{writer:{vSharedRuntime:'original'}}},snapshot=captureFrameExecution(original,b.manifest.stages.map(s=>s.id));original.stageProps.writer.vSharedRuntime='changed';assert.equal(snapshot?.stageProps?.writer.vSharedRuntime,'original');assert.ok(Object.isFrozen(snapshot?.stageProps?.writer));
});
test('Native closure/disconnect errors invalidate managed state and require a new Session',async()=>{
  for(const reason of ['E_NATIVE_LOGIC_CLOSED','E_RENDERER_DISCONNECTED','E_SPIDERMONKEY_EXIT','E_NATIVE_PROCESS']){const b=fixture(),host=new SharedSessionAdapter(reason);host.bind(b,'verified');await assert.rejects(host.render(0,async()=>{throw new EngineError(reason,'closed');},active),code(reason));assert.throws(()=>host.read(count),code('E_SHARED_SESSION_REOPEN'));host.dispose();}
});
test('Reader cannot write a declared writer cell and disposal seals reads',async()=>{
  const b=fixture(),host=new SharedSessionAdapter('native-access');host.bind(b,'verified');await host.render(0,async e=>{const result=execute(b,e);const reader=sharedFrame(frameContext(b.manifest,b.manifest.stages[1],0),{vSharedInput0:result.stageOutputs.writer.sharedState},frameStageProps(b.manifest.stages[1].props,'reader',e));assert.throws(()=>reader.set(count,99),code('E_SHARED_WRITER'));return result;},active);host.dispose();assert.throws(()=>host.read(count),code('E_SHARED_CLOSED'));
});
