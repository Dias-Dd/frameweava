import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTVG} from '../src/core/graph.ts';
import type {TVG,StageSpec} from '../src/core/types.ts';

const stage=(id:string,engine='native-gpu'):StageSpec=>({id,engine,entry:'./stage.ts',inputs:{},outputs:{surface:'surface'},props:{},seek:'stateless',time:{start:0,duration:1,offset:0,rate:{num:1,den:1}}});
const scene=():TVG=>({schemaVersion:'0.1',composition:{id:'large',width:32769,height:1,fps:{num:1,den:1},durationInFrames:1,background:'transparent',seed:1},stages:[stage('n')],layers:[],resources:[],effects:[]});
const dimensions=(t:TVG)=>validateTVG(t).filter(d=>d.code==='E_DIMENSIONS'||d.code==='E_COMPOSITION');

test('pure Native composition and Native Stage sizes use safe integers without the Web ceiling',()=>{
 const t=scene();t.stages[0].width=32769;t.stages[0].height=1;assert.deepEqual(validateTVG(t),[]);
 t.composition.width=1;t.composition.height=32769;t.stages[0].width=1;t.stages[0].height=32769;assert.deepEqual(validateTVG(t),[]);
 t.composition.width=Number.MAX_SAFE_INTEGER;t.composition.height=1;t.stages[0].width=Number.MAX_SAFE_INTEGER;assert.deepEqual(validateTVG(t),[],'backend still must admit actual bytes/u32/dispatch; graph does not allocate');
});
test('Native plus Audio remains Native for visual composition sizing',()=>{
 const t=scene();t.stages.push({...stage('sound','audio'),outputs:{audio:'audio'},audio:{schemaVersion:1,sampleRate:48000,layout:'mono',durationSamples:48000,seek:'stateless',lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0}});
 assert.deepEqual(validateTVG(t),[]);
});
test('Web, mixed, custom, empty and Audio-only compositions retain the existing ceiling',()=>{
 for(const engines of [['web'],['native-gpu','web'],['custom'],[],['audio']]){const t=scene();t.stages=engines.map((e,i)=>stage('s'+i,e));assert.ok(dimensions(t).some(d=>d.message.startsWith('Composition')));}
 const t=scene();t.composition.width=64;t.stages.push({...stage('web','web'),width:32769});assert.ok(dimensions(t).some(d=>d.stageId==='web'));
});
test('Native dimensions still reject fractional, zero, negative and unsafe values',()=>{
 for(const bad of [0,-1,1.5,Number.MAX_SAFE_INTEGER+1]){const t=scene();t.composition.width=bad;t.stages[0].width=bad;const d=dimensions(t);assert.ok(d.some(d=>d.code==='E_COMPOSITION'));assert.ok(d.some(d=>d.stageId==='n'));}
});
