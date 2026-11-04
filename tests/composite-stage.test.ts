import test from 'node:test';
import assert from 'node:assert/strict';
import {Composition,CompositeStage,Stage,ref,stageInput} from '../src/core/authoring.ts';
import {assertValidTVG,validateTVG} from '../src/core/graph.ts';
import {stageDefinitions} from '../modules/stage-orchestration/composite-types.ts';
import {assertNativePorts,childFrameContext} from '../modules/stage-orchestration/native-ports.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {nativeDispatcher} from '../modules/spidermonkey-host/bootstrap.ts';
import {defineNativeStage,defineCompositeStage} from '../modules/native-gpu/authoring.ts';
import {compositionContext} from '../src/core/time.ts';
import {linear709} from '../src/media/surface.ts';

const make=(nodes:any[])=>Composition({width:4,height:4,fps:24,durationInFrames:10,children:nodes});
const leaf=(id:string,inputs:any={})=>Stage({id,inputs,inputTypes:Object.fromEntries(Object.keys(inputs).map(k=>[k,'number'])),outputs:{value:'number'}});
test('SO-2 local automatic DAGs nest without an arbitrary depth ceiling and keep qualified identities',()=>{
 let node=leaf('leaf');for(let i=0;i<110;i++)node=CompositeStage({id:'group'+i,outputs:{value:'number'},publish:{value:ref(node.spec.id,'value')},children:node});
 const tvg=make([node]);assertValidTVG(tvg);assert.equal(tvg.stages.length,1);assert.equal(stageDefinitions(tvg).length,111);
 assert.equal(new Set(stageDefinitions(tvg).map(d=>d.key)).size,111);
});
test('SO-2 boundaries reject hidden outer dependencies, bad publication, local cycles and unknown versions',()=>{
 const wrapped=CompositeStage({id:'group',outputs:{value:'number'},publish:{value:ref('child','value')},children:leaf('child',{value:ref('outside','value')})});
 assert.ok(validateTVG(make([leaf('outside'),wrapped])).some(d=>d.code==='E_STAGE_REF'));
 wrapped.spec.composition!.stages[0].inputs={};wrapped.spec.composition!.stages[0].inputTypes={};wrapped.spec.composition!.publish={value:ref('missing','value')};
 assert.ok(validateTVG(make([wrapped])).some(d=>d.code==='E_STAGE_COMPOSITION_OUTPUT'));
 const cyclic=CompositeStage({id:'cycle',outputs:{value:'number'},publish:{value:ref('a','value')},children:[leaf('a',{value:ref('b','value')}),leaf('b',{value:ref('a','value')})]});
 assert.ok(validateTVG(make([cyclic])).some(d=>d.code==='E_DAG_CYCLE'));
 (cyclic.spec.composition as any).version=2;assert.ok(validateTVG(make([cyclic])).some(d=>d.code==='E_STAGE_COMPOSITION'));
});
test('SO-2 boundary input types, scoped image ownership and data ports are validated',async()=>{
 const node=CompositeStage({id:'auto',inputs:{n:2},inputTypes:{n:'number'},outputs:{value:'number'},publish:{value:ref('child','value')},children:leaf('child',{value:stageInput('n')})});
 assertValidTVG(make([node]));node.spec.composition!.stages[0].inputs.value=stageInput('missing');assert.ok(validateTVG(make([node])).some(d=>d.code==='E_STAGE_INPUT_REFERENCE'));
 assert.throws(()=>assertNativePorts('child',{n:'number'},{images:{},values:{}},[]),{code:'E_INPUT_MISSING'});
 assert.throws(()=>assertNativePorts('child',{n:'number'},{images:{},values:{n:'bad'}},[]),{code:'E_INPUT_TYPE'});
 const scope=new NativeRecordingScope(),foreign=new NativeRecordingScope();scope.sealInitialization();foreign.sealInitialization();scope.beginFrame();foreign.beginFrame();
 const kernel=await scope.api.compile({abiVersion:1,id:'unit/image',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(1.);}'});
 const image=await scope.api.run(kernel,[],{output:{width:1,height:1,format:'rgba32float',alpha:'opaque',color:linear709}});
 assert.throws(()=>foreign.encodePorts({image}),{code:'E_STAGE_CALL_PORTS'});const encoded=scope.encodePorts({image,n:3});assert.equal(encoded.images.image.image,0);assert.equal(scope.takePacket().passes.length,1);assert.equal(scope.takePacket().passes.length,0);
 scope.beginFrame();assert.throws(()=>scope.encodePorts({image}),{code:'E_STAGE_CALL_PORTS'});await scope.api.dispose();await foreign.api.dispose();
});
test('SO-2 child clocks compose locally and preserve global frame/time',()=>{
 const tvg=make([]),parent={...compositionContext(tvg,4),frame:2,time:2/24,dt:2/24};
 const child={...leaf('child').spec,time:{start:1,duration:5,offset:3,rate:{num:-1,den:2}}} as any;
 const c=childFrameContext(parent,child,'qualified',7);assert.equal(c.frame,2.5);assert.equal(c.globalFrame,4);assert.equal(c.globalTime,4/24);assert.equal(c.dt,-1/24);
});
test('SO-2 dispatcher child continuation preserves epoch, rejects caught failures and cleans up',async()=>{
 const factory=defineCompositeStage(({stages})=>({async renderAt(){try{return (await stages.run('child',{inputs:{n:1}})).outputs;}catch{return {n:0};}}}));
 const dispatch=nativeDispatcher(factory,()=>{}),token='1'.repeat(64),next='2'.repeat(64);await dispatch('native.init',{width:1,height:1,seed:1,resources:{},stageCalls:{version:1}});
 const request=await dispatch('native.render',{context:compositionContext(make([]),0),inputs:{images:{},values:{}},props:{},continuation:token}) as any;
 assert.equal(request.kind,'native-stage-call');assert.equal(request.stageId,'child');assert.equal(request.inputs.values.n,1);
 await assert.rejects(dispatch('native.temporal.resume',{version:1,id:request.id,continuation:'3'.repeat(64),nextContinuation:next}),{code:'E_NATIVE_TEMPORAL_EPOCH'});
 await assert.rejects(dispatch('native.temporal.resume',{version:1,id:request.id,continuation:token,nextContinuation:next,error:{code:'E_INPUT_MISSING',message:'missing'}}),{code:'E_INPUT_MISSING'});
 await dispatch('dispose',{});await assert.rejects(dispatch('native.diagnostics',{}),{code:'E_NATIVE_LOGIC_CLOSED'});
});
