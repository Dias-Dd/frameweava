import {test} from 'node:test';
import assert from 'node:assert/strict';
import { Composition,Stage,Layer,Group,Text,Rect,Circle,Resource,ref,keyframes,spring,expr,evaluate,easingAt,parseColor,
  frameContext,compositionContext,frameToSeconds,secondsToFrame,seededRandom,isActive,topologicalLevels,validateTVG,assertValidTVG,
  EffectRegistry,builtinEffects,resolveEffectParameters,registerEffect,FixedStepRunner,EngineError,assertJson } from '../src/index.js';
import {jsx,jsxs,Fragment} from '../src/jsx-runtime.js';
import type {FrameContext,StageSpec,TVG} from '../src/core/types.js';

function project():TVG {
  return Composition({width:1920,height:1080,fps:60,durationInFrames:600,seed:8,children:[
    Stage({id:'background',entry:'./background.ts',outputs:{surface:'surface',energy:'number'}}),
    Stage({id:'titles',inputs:{energy:ref('background','energy')},inputTypes:{energy:'number'},children:Text({content:'FUTURE MOTION',fontSize:96,x:keyframes([{frame:0,value:-300},{frame:120,value:120,easing:'easeOut'}])})}),
    Layer({id:'bg',source:ref('background')}),Layer({id:'titles-layer',source:ref('titles')})]});
}
const context=(frame:number):FrameContext=>compositionContext(project(),frame);
test('custom JSX produces video nodes and refuses DOM intrinsics',()=> {
  const root=jsxs(Composition,{width:320,height:180,fps:30,duration:10,children:[
    jsx(Stage,{id:'text',children:jsx(Text,{children:'HELLO'})})]}) as TVG;
  assert.equal(root.composition.durationInFrames,300);
  assert.equal(root.stages[0].nodes?.[0].content,'HELLO');
  assert.equal(root.layers[0].source?.$ref,'text');
  assert.throws(()=>jsx('div',{}),{code:'E_JSX_INTRINSIC'});
  assert.throws(()=>Stage({id:'bad',entry:'./x.ts',children:Text({content:'bad'})}),{code:'E_STAGE_ENTRY'});
});
test('ordinary JS loops, conditions, helper functions and fragments remain usable at build time',()=> {
  const make=(i:number)=>Circle({radius:10,x:i*30,fill:i%2?'#fff':'#000'});
  const nodes=Array.from({length:4},(_,i)=>make(i));
  const root=Composition({width:320,height:180,fps:30,duration:1,children:jsx(Fragment,{children:Stage({id:'shapes',children:nodes})})});
  assert.equal(root.stages[0].nodes?.length,4);
  assert.equal(root.stages[0].nodes?.[3].x,90);
});
test('nested layers record explicit parents and ordered surface references',()=> {
  const root=Composition({width:320,height:180,fps:30,duration:1,children:[Stage({id:'a',children:Rect({width:10,height:10})}),
    Layer({id:'parent',x:40,rotation:15,children:Layer({id:'child',source:ref('a'),x:20})})]});
  assert.equal(root.layers.length,2);assert.equal(root.layers[1].parent,'parent');assertValidTVG(root);
});
test('numeric independent tracks clamp outside keys and use destination easing',()=> {
  const track=keyframes([{frame:10,value:0},{frame:30,value:100,easing:'easeIn'}]);
  assert.equal(evaluate(track,context(0)),0);assert.equal(evaluate(track,context(20)),25);assert.equal(evaluate(track,context(80)),100);
  const independent={x:track,opacity:keyframes([{frame:0,value:0},{frame:20,value:1}]),rotation:expr.mul(expr.frame,2)};
  assert.deepEqual(evaluate(independent,context(10)),{x:0,opacity:.5,rotation:20});
});
test('linear, step, ease in/out, and cubic Bezier follow known values',()=> {
  assert.equal(easingAt('linear',.3),.3);assert.equal(easingAt('step',.99),0);assert.equal(easingAt('step',1),1);
  assert.equal(easingAt('easeIn',.5),.25);assert.equal(easingAt('easeOut',.5),.75);assert.equal(easingAt('easeInOut',.5),.5);
  assert.ok(Math.abs(easingAt({bezier:[.42,0,.58,1]},.5)-.5)<1e-7);
  assert.ok(easingAt({bezier:[0,0,1,1]},.1)>.09999999);
});
test('color interpolation includes alpha and discrete text can use step',()=> {
  const color=keyframes([{frame:0,value:'#ff0000'},{frame:60,value:'#0000ff80'}]);
  assert.equal(evaluate(color,context(30)),'rgba(128, 0, 128, 0.75098)');
  assert.deepEqual(parseColor('#0fc8'),[0,255,204,136/255]);
  assert.equal(evaluate(keyframes([{frame:0,value:'A'},{frame:10,value:'B',easing:'step'}]),context(9)),'A');
});
test('invalid keyframe timing, values and curves fail early',()=> {
  assert.throws(()=>keyframes([]),{code:'E_KEYFRAMES'});
  assert.throws(()=>keyframes([{frame:0,value:1},{frame:0,value:2}]),{code:'E_KEYFRAMES'});
  assert.throws(()=>keyframes([{frame:-1,value:1}]),{code:'E_KEYFRAMES'});
  assert.throws(()=>keyframes([{frame:0,value:NaN}]),{code:'E_KEYFRAMES'});
  assert.throws(()=>keyframes([{frame:0,value:1,easing:{bezier:[-1,0,1,1]}}]),{code:'E_EASING'});
});
test('all spring damping regimes start exactly and converge with absolute time',()=> {
  for (const damping of [8,20,40]) {
    const signal=spring({from:10,to:100,stiffness:100,damping,mass:1});
    assert.ok(Math.abs(evaluate(signal,context(0))-10)<1e-10);
    assert.ok(Math.abs(evaluate(signal,context(599))-100)<.001);
    const first=evaluate(signal,context(80));evaluate(signal,context(400));assert.equal(evaluate(signal,context(80)),first);
  }
  assert.throws(()=>spring({from:0,to:1,mass:0}),{code:'E_SPRING'});
});
test('expression ASTs are JSON, deterministic, and reject unsupported/nonfinite operations',()=> {
  const signal=expr.add(120,expr.mul(40,expr.sin(expr.mul(expr.time,Math.PI))));
  assert.ok(Math.abs(evaluate(signal,context(30))-160)<1e-10);
  assert.deepEqual(JSON.parse(JSON.stringify(signal)),signal);
  assert.equal(evaluate(expr.random(5),context(40)),evaluate(expr.random(5),context(40)));
  assert.notEqual(evaluate(expr.random(5),context(40)),evaluate(expr.random(5),context(41)));
  assert.throws(()=>evaluate(expr.div(1,0),context(20)),{code:'E_EXPRESSION'});
  assert.throws(()=>evaluate({$expr:'eval',args:[]},context(20)),{code:'E_EXPRESSION'});
});
test('rational FPS and explicit stage remapping preserve global/local distinction',()=> {
  const root=project();root.composition.fps={num:30000,den:1001};
  const stage=root.stages[0];stage.time={start:20,duration:100,offset:60,rate:{num:-1,den:2}};
  const ctx=frameContext(root,stage,40);
  assert.equal(ctx.frame,50);assert.equal(ctx.globalFrame,40);assert.equal(ctx.time,50*1001/30000);
  assert.equal(ctx.globalTime,40*1001/30000);assert.equal(ctx.dt,-.5*1001/30000);
  assert.equal(isActive(stage,19),false);assert.equal(isActive(stage,119),true);assert.equal(isActive(stage,120),false);
  assert.equal(secondsToFrame(frameToSeconds(600,root.composition.fps),root.composition.fps),600);
  assert.throws(()=>frameContext(root,stage,600),{code:'E_FRAME_RANGE'});
  assert.throws(()=>frameContext(root,stage,1.5),{code:'E_FRAME_RANGE'});
});
test('seeded random isolates stage identities and repeated frame requests',()=> {
  assert.equal(seededRandom(12,20,'particles'),seededRandom(12,20,'particles'));
  assert.notEqual(seededRandom(12,20,'particles'),seededRandom(12,21,'particles'));
  assert.notEqual(frameContext(project(),project().stages[0],20).seed,frameContext(project(),project().stages[1],20).seed);
});
test('DAG forks and joins have stable parallel levels',()=> {
  const p=project(),a=p.stages[0];
  const b={...p.stages[1],id:'b',inputs:{a:ref(a.id,'energy')}};
  const c={...b,id:'c'};
  const d={...b,id:'d',inputs:{b:ref('b'),c:ref('c')}};
  assert.deepEqual(topologicalLevels([a,b,c,d]).map(level=>level.map(s=>s.id)),[['background'],['b','c'],['d']]);
});
test('DAG cycle diagnostic reports real path and catches unknown dependencies',()=> {
  const a=project().stages[0],b={...a,id:'b',inputs:{a:ref(a.id)}};
  a.inputs={b:ref('b')};
  assert.throws(()=>topologicalLevels([a,b]),(error:unknown)=>error instanceof EngineError&&error.code==='E_DAG_CYCLE'&&error.message.includes('background -> b -> background'));
  assert.throws(()=>topologicalLevels([{...a,inputs:{missing:ref('missing')}}]),{code:'E_STAGE_REF'});
});
test('valid TVG passes and missing ports / incompatible layer types are diagnosed',()=> {
  assert.deepEqual(validateTVG(project()),[]);
  const p=project();p.stages[1].inputs.energy=ref('background','missing');p.layers[0].source=ref('background','energy');
  const codes=validateTVG(p).map(d=>d.code);assert.ok(codes.includes('E_PORT_REF'));assert.ok(codes.includes('E_PORT_TYPE'));
});
test('timeline, inactive producer, parent cycle, and duplicate ids are diagnosed',()=> {
  const p=project();p.stages[0].time.duration=300;p.layers[0].parent='titles-layer';p.layers[1].parent='bg';
  let codes=validateTVG(p).map(d=>d.code);assert.ok(codes.includes('E_INACTIVE_INPUT'));assert.ok(codes.includes('E_LAYER_CYCLE'));
  p.stages[1].id=p.stages[0].id;p.layers[0].end=601;
  codes=validateTVG(p).map(d=>d.code);assert.ok(codes.includes('E_STAGE_DUPLICATE'));assert.ok(codes.includes('E_TIME_RANGE'));
});
test('closures and live runtime objects cannot silently become JSON signals or port values',()=> {
  const p=project();p.stages[0].props={x:()=>2};
  assert.ok(validateTVG(p).some(d=>d.code==='E_SERIALIZE'));
  assert.throws(()=>assertJson(new Date()),{code:'E_SERIALIZE'});
  const cyclic:any={};cyclic.self=cyclic;assert.throws(()=>assertJson(cyclic),{code:'E_SERIALIZE'});
  const shared={a:2};assert.doesNotThrow(()=>assertJson([shared,shared]));
});
test('raw malformed animation ASTs are checked after graph loading',()=> {
  const p=project();p.stages[0].props={x:{$keyframes:[{frame:3,value:1},{frame:1,value:2}]},y:{$expr:'javascript',args:[]}};
  assert.ok(validateTVG(p).some(d=>d.code==='E_KEYFRAMES'));
  p.stages[0].props={x:{$expr:'sin',args:[]}};assert.ok(validateTVG(p).some(d=>d.code==='E_EXPRESSION'));
});
test('local effect manifests register explicit schemas, defaults and ranges',()=> {
  const custom=registerEffect({id:'soft',name:'Soft',version:'1.0.0',engine:'web',kind:'canvas-filter',parameters:{r:{type:'number',default:4,min:0,max:10}},inputs:{surface:'surface'},outputs:{surface:'surface'},implementation:{filter:'blur',parameter:'r',unit:'px'}});
  const registry=new EffectRegistry([...builtinEffects,custom]);assert.deepEqual(registry.resolve({id:'soft'}).params,{r:4});
  assert.throws(()=>registry.resolve({id:'soft',params:{r:11}}),{code:'E_EFFECT_PARAM'});
  assert.throws(()=>registry.resolve({id:'soft',params:{r:null}}),{code:'E_EFFECT_PARAM'});
  assert.throws(()=>registry.resolve({id:'soft',params:{extra:1}}),{code:'E_EFFECT_PARAM'});
  assert.throws(()=>registry.register(custom),{code:'E_EFFECT_DUPLICATE'});
  const p=project();p.effects.push(custom);p.layers[1].effects=[{id:'soft'}];assertValidTVG(p);
});
test('effect reserved forms are honest extension interfaces, not falsely executable',()=> {
  const p=project();p.effects.push({id:'gpu',name:'GPU',version:'1.0',engine:'gpu',kind:'shader',parameters:{},inputs:{surface:'surface'},outputs:{surface:'surface'}});p.layers[0].effects=[{id:'gpu'}];
  assert.ok(validateTVG(p).some(d=>d.code==='E_EFFECT_BACKEND'));
});
test('resource references retain local paths and reject missing effect resources',()=> {
  const p=Composition({width:320,height:180,fps:30,duration:1,children:[Stage({id:'t',children:Text({content:'a'})}),Resource({id:'font',src:'./font.woff2',kind:'font'})]});
  assert.equal(p.resources[0].src,'./font.woff2');assertValidTVG(p);
  p.effects[0]={...p.effects[0],resources:['missing']};assert.ok(validateTVG(p).some(d=>d.code==='E_RESOURCE_REF'));
});
test('fixed-step checkpoints reproduce history-dependent simulations under arbitrary seeks',()=> {
  let state={position:0,velocity:1};
  const runner=new FixedStepRunner({reset(){state={position:0,velocity:1};},step(dt:number){state.velocity+=9.81*dt;state.position+=state.velocity*dt;},snapshot(){return state;},restore(value){state=value;}},{fps:60,checkpointInterval:10,maxCheckpoints:4});
  const values=new Map<number,{position:number;velocity:number}>();
  for (let frame=0;frame<=100;frame++) values.set(frame,runner.seek(frame));
  for (const frame of [13,88,0,100,47,47]) assert.deepEqual(runner.seek(frame),values.get(frame));
  assert.ok(runner.checkpointFrames.length<=4);assert.ok(runner.checkpointFrames.includes(0));
  const snapshot=runner.seek(47);snapshot.position=10000;assert.notEqual(runner.seek(47).position,10000);
  assert.throws(()=>runner.seek(.5),{code:'E_SIMULATION_FRAME'});
});
test('fixed-step replay limits fail with actionable errors',()=> {
  let value=0;const runner=new FixedStepRunner({reset(){value=0;},step(){value++;},snapshot(){return value;},restore(v){value=v;}},{fps:30,maxSteps:5});
  assert.throws(()=>runner.seek(10),{code:'E_SIMULATION_LIMIT'});assert.equal(runner.seek(5),5);
});
test('malformed input yields diagnostics instead of stack overflow; visual types are checked',()=> {
  const p=project();const cyclic:any={};cyclic.self=cyclic;p.stages[0].props=cyclic;
  assert.deepEqual(validateTVG(p).map(d=>d.code),['E_SERIALIZE']);
  const visual=project();(visual.stages[1].nodes![0] as any).x='wrong';
  assert.ok(validateTVG(visual).some(d=>d.code==='E_VISUAL_VALUE'));
  (visual.stages[1].nodes![0] as any).x=0;(visual.stages[1].nodes![0] as any).fill=12;
  assert.ok(validateTVG(visual).some(d=>d.code==='E_VISUAL_VALUE'));
});
