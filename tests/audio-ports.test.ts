import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputTypeAccepts,inputValueMatches,assertStageInputs} from '../src/core/ports.ts';
import {assertValidTVG,validateTVG,validatePortValue} from '../src/core/graph.ts';
import {audioBlock} from '../src/audio/block.ts';
import {renderStageInterval,stageAudioRequest} from '../src/audio/execution.ts';
import type {AudioStageMetadata,IntervalRequest} from '../src/audio/contract.ts';
import type {TVG,StageAdapter} from '../src/core/types.ts';
import {planPipeline} from '../src/plugins/plan.ts';
const meta:AudioStageMetadata={schemaVersion:1,sampleRate:48000,layout:'mono',durationSamples:48000,seek:'stateless',lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0};
const scene=():TVG=>({schemaVersion:'0.1',composition:{id:'audio',width:1,height:1,fps:{num:12,den:1},durationInFrames:12,background:'transparent',seed:1},stages:[{id:'a',engine:'audio',entry:'./a.ts',audio:meta,inputs:{},outputs:{audio:'audio'},props:{},time:{start:0,duration:12,offset:0,rate:{num:1,den:1}},seek:'stateless'},{id:'b',engine:'audio',entry:'./b.ts',audio:meta,inputs:{input:{$ref:'a',port:'audio'}},inputTypes:{input:'audio'},outputs:{stats:'json'},props:{},time:{start:0,duration:12,offset:0,rate:{num:1,den:1}},seek:'stateless'}],layers:[],resources:[],effects:[]});
test('audio is a distinct typed runtime port, never scalar Json/Surface or persistent TVG bytes',()=>{
  const block=audioBlock(new Float32Array([2,-3]),{sampleRate:48000,layout:'mono'});assert.equal(inputValueMatches('audio',block),true);assert.equal(validatePortValue('audio',block),true);assert.equal(inputValueMatches('json',block),false);assert.equal(validatePortValue('json',block),false);assert.equal(inputTypeAccepts('json','audio'),false);assert.equal(inputValueMatches('surface',block),false);
  assert.equal(inputValueMatches('json',{kind:'audio',codec:'wav'}),true);assert.equal(validatePortValue('json',{kind:'audio',codec:'wav'}),true);
  assert.doesNotThrow(()=>assertStageInputs(scene().stages[1],{input:block}));assert.throws(()=>assertStageInputs(scene().stages[1],{input:{...block,storage:{...block.storage,byteLength:1}}}),{code:'E_INPUT_TYPE'});
  const tvg=scene();tvg.stages[1].inputs.input=block as never;assert.ok(validateTVG(tvg).some(d=>d.code==='E_SERIALIZE'));
});
test('same TVG/DAG validates versioned audio refs, rejects wrong consumer types and unsupported remapping',()=>{
  const tvg=scene();assertValidTVG(tvg);tvg.stages[1].inputTypes={input:'json'};assert.ok(validateTVG(tvg).some(d=>d.code==='E_INPUT_TYPE'&&d.stageId==='b'));
  const bad=scene();bad.stages[0].audio={...meta,lookaheadSamples:10} as never;assert.ok(validateTVG(bad).some(d=>d.code==='E_AUDIO_DSP_CAPABILITY'&&d.stageId==='a'));
  const reverse=scene();reverse.stages[0].time.rate={num:-1,den:1};assert.ok(validateTVG(reverse).some(d=>d.code==='E_AUDIO_TIME_MAPPING'));const unknown=scene();unknown.stages[0].audio={...meta,schemaVersion:2} as never;assert.ok(validateTVG(unknown).some(d=>d.code==='E_AUDIO_VERSION'));
});
test('old adapters are not silently granted interval execution',{timeout:3000},async()=>{
  const adapter:StageAdapter={engine:'legacy',async init(){},async renderAt(){return {outputs:{},diagnostics:[]};},async dispose(){}};
  const interval={unit:'samples' as const,sampleRate:48000 as const,start:0,endExclusive:16},request:IntervalRequest={local:interval,global:interval,fps:{num:12,den:1},seed:1};await assert.rejects(renderStageInterval(adapter,scene().stages[0],request,{},{}),{code:'E_AUDIO_CAPABILITY',stageId:'a'});
});
test('P4 visual ABI explicitly refuses audio inputs instead of granting an implicit plugin extension',()=>{
  assert.throws(()=>planPipeline([],()=>{throw Error('No plugin needs loading');},{id:'visual',inputs:{clip:{$ref:'audio',port:'audio'}},inputTypes:{clip:'audio'}}),{code:'E_PLUGIN_IO'});
});
test('explicit sample requests cannot straddle a finite Stage activation boundary',()=>{
  const tvg=scene(),stage=tvg.stages[0];stage.time={...stage.time,start:2,duration:1};
  assert.throws(()=>stageAudioRequest(tvg,stage,2,{unit:'samples',sampleRate:48000,start:8000,endExclusive:12001}),{code:'E_AUDIO_STAGE_RANGE',stageId:'a'});
  assert.throws(()=>stageAudioRequest(tvg,stage,1,{unit:'samples',sampleRate:48000,start:7999,endExclusive:9000}),{code:'E_AUDIO_STAGE_RANGE',stageId:'a'});
  assert.equal(stageAudioRequest(tvg,stage,2,{unit:'samples',sampleRate:48000,start:8000,endExclusive:12000})?.local.start,0);
});
