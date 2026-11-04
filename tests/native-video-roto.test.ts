import test from 'node:test';import assert from 'node:assert/strict';
import {memoryPlan,validateOptions,parseVideoRotoBundle} from '../modules/native-effects/video-roto/schema.ts';
import type {VideoRotoOptions} from '../modules/native-effects/video-roto/types.ts';
test('unobserved frames do not become memories; the conditioning anchor never expires',()=>{
 const m=[0,100,101,undefined,undefined,undefined,undefined],p=[0,98,100,101,...Array(12).fill(undefined)];
 const w=memoryPlan(103,0,m,p,1000);assert.deepEqual([...w.slice(0,7)],[7,3,2,0,0,0,0]);assert.deepEqual([...w.slice(7,12)],[1,1,1,1,0]);assert.equal(new Float32Array(w.buffer)[24],Math.fround(103/15));
 const expired=memoryPlan(110,0,m,p,1000);assert.deepEqual([...expired.slice(0,7)],[7,0,0,0,0,0,0]);
});
test('memory metadata supports deterministic random/repeated queries',()=>{
 const m=[0,29,30,31,32,33,34],p=[0,...Array.from({length:15},(_,i)=>20+i)];
 const a=memoryPlan(35,0,m,p,10000);memoryPlan(100,0,m,p,10000);assert.deepEqual(memoryPlan(35,0,m,p,10000),a);assert.equal(new Float32Array(a.buffer)[39],Math.fround(1/15));
});
test('no aliases or padded-memory implicit observations in bundle/options',()=>{
 assert.throws(()=>parseVideoRotoBundle({version:2}),{code:'E_VIDEO_ROTO_SCHEMA'});
 assert.throws(()=>parseVideoRotoBundle({version:1,profile:'slimsam-77-uniform-f32-points-v1'}),{code:'E_VIDEO_ROTO_SCHEMA'});
 assert.throws(()=>validateOptions({id:'target',seedFrame:0,frame:400,totalFrames:1000} as VideoRotoOptions),{code:'E_VIDEO_ROTO_BUDGET'});
 assert.doesNotThrow(()=>validateOptions({id:'target',seedFrame:0,frame:400,totalFrames:1000,maxReplayFrames:500} as VideoRotoOptions));
 assert.throws(()=>validateOptions({id:'target',seedFrame:0,frame:0,totalFrames:1,signal:AbortSignal.abort()} as VideoRotoOptions),{code:'E_RENDER_CANCELLED'});
 assert.throws(()=>validateOptions({id:'target',seedFrame:0,frame:1,totalFrames:1} as VideoRotoOptions),{code:'E_VIDEO_ROTO_SCHEMA'});
 assert.throws(()=>validateOptions({id:'target',seedFrame:0,frame:0,totalFrames:1,unreviewed:true} as never),{code:'E_VIDEO_ROTO_SCHEMA'});
 for(const segmentFrames of [-1,.5,NaN,0x100000000])assert.throws(()=>validateOptions({id:'target',seedFrame:0,frame:0,totalFrames:1,segmentFrames} as VideoRotoOptions),{code:'E_VIDEO_ROTO_SCHEMA'});
 for(const segmentFrames of [0,1,8,0xffffffff])assert.doesNotThrow(()=>validateOptions({id:'target',seedFrame:0,frame:0,totalFrames:1,segmentFrames} as VideoRotoOptions));
});
