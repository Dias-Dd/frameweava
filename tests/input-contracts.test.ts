import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { Composition, Stage, Text, Rect, Circle, Group, Layer, Resource } from '../src/core/authoring.ts';
import { assertValidTVG, validateTVG } from '../src/core/graph.ts';
import { assertStageInputs, inputTypeAccepts, inputValueMatches, normalizeInputPort, validateInputSchema } from '../src/core/ports.ts';
import { diagnostic } from '../src/core/errors.ts';
import type { BuiltProject, InputPortTypes, Json, PortType, PortValue, StageSpec, Surface, TVG } from '../src/core/types.ts';
import { Renderer } from '../src/render/renderer.ts';
import { engineRoot } from '../src/compiler/build.ts';

const stage=(id:string,extra:Partial<StageSpec>={}):StageSpec=>({id,engine:'input-contract-test',inputs:{},outputs:{out:'number'},props:{},time:{start:0,duration:10,offset:0,rate:{num:1,den:1}},seek:'stateless',...extra});
const tvg=(stages:StageSpec[]):TVG=>({schemaVersion:'0.1',composition:{id:'input-contracts',width:32,height:32,fps:{num:10,den:1},durationInFrames:10,background:'transparent',seed:99},stages,layers:[],resources:[],effects:[]});
const codes=(graph:TVG,options?:{allowUnresolvedInputContracts?:boolean})=>validateTVG(graph,options).map(item=>item.code);
const contractError=(code:string,stageId?:string,frame?:number)=>(error:unknown)=>{const d=diagnostic(error);return d.code===code && (stageId===undefined || d.stageId===stageId) && (frame===undefined || d.frame===frame);};

test('nonempty inputs require complete executable consumer schemas; precheck only postpones absent maps',()=>{
  const missing=stage('consumer',{inputs:{v:3}});
  assert.ok(codes(tvg([missing])).includes('E_INPUT_SCHEMA'));
  assert.equal(validateInputSchema(missing)[0].stageId,'consumer');
  assert.deepEqual(validateTVG(tvg([missing]),{allowUnresolvedInputContracts:true}),[]);
  assert.throws(()=>assertValidTVG(tvg([missing])),{code:'E_TVG'});
  assertValidTVG(tvg([missing]),{allowUnresolvedInputContracts:true});
  const partial=stage('partial',{inputs:{a:1,b:2},inputTypes:{a:'number'}});
  assert.ok(codes(tvg([partial]),{allowUnresolvedInputContracts:true}).includes('E_INPUT_SCHEMA'));
  const unknown=stage('unknown',{inputs:{v:3},inputTypes:{v:'vector'} as unknown as InputPortTypes});
  assert.ok(codes(tvg([unknown]),{allowUnresolvedInputContracts:true}).includes('E_INPUT_SCHEMA'));
  const otherwiseBad=tvg([missing]);otherwiseBad.composition.durationInFrames=0;
  assert.ok(codes(otherwiseBad,{allowUnresolvedInputContracts:true}).includes('E_COMPOSITION'));
  assertValidTVG(tvg([stage('no-inputs')]));
});

test('input descriptors reject malformed contracts and missing required bindings; optional ports may be absent',()=>{
  assert.deepEqual(normalizeInputPort('number'),{type:'number',optional:false});
  assert.deepEqual(normalizeInputPort({type:'string',optional:true}),{type:'string',optional:true});
  for(const descriptor of [null,[],{},'vector',{type:'number',optional:'yes'},{type:'number',default:0}])
    assert.throws(()=>normalizeInputPort(descriptor),{code:'E_INPUT_SCHEMA'});
  const required=stage('required',{inputTypes:{v:'number'}});
  assert.ok(codes(tvg([required])).includes('E_INPUT_MISSING'));
  const optional=stage('optional',{inputTypes:{label:{type:'string',optional:true}}});
  assertValidTVG(tvg([optional]));assertStageInputs(optional,{});
  assert.throws(()=>assertStageInputs(optional,{label:undefined},{frame:4}),contractError('E_INPUT_TYPE','optional',4));
  assert.throws(()=>assertStageInputs(optional,{unlisted:1}),contractError('E_INPUT_SCHEMA','optional'));
  const bound=stage('bound',{inputs:{v:1},inputTypes:{v:'number'}});
  assert.throws(()=>assertStageInputs(bound,{}, {frame:7}),contractError('E_INPUT_MISSING','bound',7));
  const authored=Composition({width:32,height:32,fps:10,durationInFrames:10,children:Stage({id:'authored',engine:'mock',inputs:{v:1},inputTypes:{v:'number'},outputs:{out:'number'}})});
  assert.deepEqual(authored.stages[0].inputTypes,{v:'number'});assertValidTVG(authored);
});

test('literal values are validated without coercion and finite JSON excludes live runtime objects',()=>{
  for(const value of ['3',null,false,{},NaN,Infinity]){
    const bad=stage('number',{inputs:{v:value as Json},inputTypes:{v:'number'}});
    assert.ok(validateInputSchema(bad).some(item=>item.code==='E_INPUT_TYPE'));
    assert.ok(codes(tvg([bad])).includes('E_INPUT_TYPE'));
  }
  assert.equal(inputValueMatches('boolean',1),false);
  assert.equal(inputValueMatches('string',4),false);
  assert.equal(inputValueMatches('json',{x:[1,'a',true,null]}),true);
  for(const value of [new Date(),()=>1,{x:undefined},{n:NaN}])assert.equal(inputValueMatches('json',value),false);
  const cyclic:Record<string,unknown>={};cyclic.self=cyclic;assert.equal(inputValueMatches('json',cyclic),false);
  const png:Surface={kind:'surface',format:'png',width:2,height:2,dataUrl:'data:image/png;base64,AA=='};
  assert.equal(inputValueMatches('surface',png),true);
  assert.equal(inputValueMatches('json',png),false);
});

test('graph compares the declared producer promise to the consumer contract, including JSON/Surface separation',()=>{
  const graph=(producer:PortType,consumer:PortType)=>tvg([
    stage('producer',{outputs:{value:producer}}),
    stage('consumer',{inputs:{v:{$ref:'producer',port:'value'}},inputTypes:{v:consumer}})
  ]);
  const wrong=validateTVG(graph('string','number')).find(item=>item.code==='E_INPUT_TYPE');
  assert.ok(wrong);assert.equal(wrong.stageId,'consumer');assert.match(wrong.message,/produces string/);
  for(const producer of ['number','string','boolean','json'] as PortType[])assertValidTVG(graph(producer,'json'));
  assert.ok(codes(graph('surface','json')).includes('E_INPUT_TYPE'));
  assert.ok(codes(graph('json','number')).includes('E_INPUT_TYPE'));
  assertValidTVG(graph('surface','surface'));
  assertValidTVG(graph('number','number'));
  assert.equal(inputTypeAccepts('number','json'),false);
  assert.equal(inputTypeAccepts('json','surface'),false);
});

test('runtime checks actual values and updated contracts before caches and consumer code, preserving independent Stage inspection',async()=>{
  const png=await sharp({create:{width:8,height:8,channels:4,background:'#0000ff'}}).png().toBuffer();
  const image:Surface={kind:'surface',format:'png',width:8,height:8,dataUrl:`data:image/png;base64,${png.toString('base64')}`};
  const calls:string[]=[];
  Renderer.registerAdapter('input-contract-guard',()=>({engine:'input-contract-guard',async init(){},async dispose(){},async renderAt(s,_ctx,inputs){calls.push(s.id);const outputs:Record<string,PortValue>=s.id==='good'?{surface:image}:{out:inputs.v as number};return {outputs,diagnostics:[]};}}));
  const consumer=stage('consumer',{engine:'input-contract-guard',inputs:{v:4},inputTypes:{v:'number'}});
  const good=stage('good',{engine:'input-contract-guard',outputs:{surface:'surface'},width:8,height:8});
  const build:BuiltProject={dir:engineRoot,manifest:tvg([consumer,good]),stageBundles:{},assets:{},hash:'input-contract-guard'};
  const renderer=await Renderer.create(build);
  try{
    const first=await renderer.renderFrame(0);assert.equal(first.stageOutputs.consumer.out,4);
    const count=calls.filter(id=>id==='consumer').length;
    assert.equal((await renderer.renderFrame(0)).cacheHits,2);
    consumer.inputs.v='4';
    await assert.rejects(renderer.renderFrame(0),contractError('E_INPUT_TYPE','consumer',0));
    assert.equal(calls.filter(id=>id==='consumer').length,count);
    const independent=await renderer.renderFrame(1,'good');assert.equal((await sharp(independent.png).metadata()).width,8);
    consumer.inputs.v=4;consumer.inputTypes={v:'string'};
    await assert.rejects(renderer.renderFrame(0),contractError('E_INPUT_TYPE','consumer',0));
    assert.equal(calls.filter(id=>id==='consumer').length,count);
    consumer.inputTypes={v:'number',extra:{type:'string',optional:true}};
    const changed=await renderer.renderFrame(0);
    assert.equal(changed.cacheHits,1,'A compatible but updated consumer contract must invalidate its Stage cache.');
    assert.equal(calls.filter(id=>id==='consumer').length,count+1);
  }finally{await renderer.close();}
});

test('resolved data has its own guard even when producer declares broad JSON',async()=>{
  let consumerCalls=0;
  const bytes=await sharp({create:{width:1,height:1,channels:4,background:'#000000'}}).png().toBuffer();
  const disguised:Surface={kind:'surface',format:'png',width:1,height:1,dataUrl:`data:image/png;base64,${bytes.toString('base64')}`};
  Renderer.registerAdapter('broad-json-source',()=>({engine:'broad-json-source',async init(){},async dispose(){},async renderAt(s){if(s.id==='consumer')consumerCalls++;const outputs:Record<string,PortValue>=s.id==='producer'?{data:disguised}:{out:1};return {outputs,diagnostics:[]};}}));
  const build:BuiltProject={dir:engineRoot,manifest:tvg([
    stage('producer',{engine:'broad-json-source',outputs:{data:'json'}}),
    stage('consumer',{engine:'broad-json-source',inputs:{v:{$ref:'producer',port:'data'}},inputTypes:{v:'json'}})
  ]),stageBundles:{},assets:{},hash:'broad-json-source'};
  const renderer=await Renderer.create(build);
  try{await assert.rejects(renderer.renderFrame(3),contractError('E_INPUT_TYPE','consumer',3));assert.equal(consumerCalls,0);}
  finally{await renderer.close();}
});

test('invalid graph contracts fail before adapter initialization or user render',async()=>{
  let initializations=0,renders=0;
  Renderer.registerAdapter('never-invoke-invalid',()=>({engine:'never-invoke-invalid',async init(){initializations++;},async dispose(){},async renderAt(){renders++;return {outputs:{out:1},diagnostics:[]};}}));
  const build:BuiltProject={dir:engineRoot,manifest:tvg([stage('invalid',{engine:'never-invoke-invalid',inputs:{v:1}})]),stageBundles:{},assets:{},hash:'never-invoke-invalid'};
  await assert.rejects(Renderer.create(build),{code:'E_TVG'});assert.equal(initializations,0);assert.equal(renders,0);
});

test('engine DSL rejects unknown authored/raw properties while JSX key and arbitrary Stage props stay supported',()=>{
  for(const make of [()=>Rect({typoWidth:99} as any),()=>Circle({raduis:9} as any),()=>Group({postionX:1} as any),()=>Text({content:'x',fontSzie:4} as any),()=>Layer({source:{$ref:'a',port:'surface'},opactiy:0} as any),()=>Stage({id:'bad',entry:'./a.ts',inptus:{}} as any),()=>Composition({width:32,height:32,fps:10,durationInFrames:10,duraton:3} as any),()=>Resource({id:'f',kind:'file',src:'./a',soruce:'./b'} as any)])
    assert.throws(make,{code:'E_UNKNOWN_PROPERTY'});
  const graph=Composition({width:32,height:32,fps:10,durationInFrames:10,children:Stage({id:'visual',props:{anything:{customPayload:true}},children:Rect({width:3,height:3,key:1} as any)})});
  assertValidTVG(graph);
  (graph.stages[0].nodes![0] as any).widht=20;
  assert.ok(codes(graph).includes('E_UNKNOWN_PROPERTY'));
  delete (graph.stages[0].nodes![0] as any).widht;
  (graph.layers[0] as any).transfrom={};
  assert.ok(codes(graph).includes('E_UNKNOWN_PROPERTY'));
});
