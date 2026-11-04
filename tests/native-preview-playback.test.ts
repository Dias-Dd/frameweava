import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import type {TVG} from '../src/core/types.ts';
import type {NativePreviewEvents} from '../modules/native-gpu/client.ts';
import {PreviewPlayback} from '../modules/native-gpu/preview-playback.ts';
import {PreviewQualityPolicy,type PreviewQuality} from '../modules/native-gpu/preview-quality.ts';

function setup(audio?:Parameters<PreviewPlayback['attach']>[5],quality?:PreviewQualityPolicy,fps:TVG['composition']['fps']={num:30,den:1}){
 const composition={width:1920,height:1080,fps,durationInFrames:4000} as TVG['composition'];
 const calls:{frame:number;revision:number;quality?:PreviewQuality;finish:()=>void}[]=[];
 const errors:unknown[]=[];
 const playback=new PreviewPlayback(960,error=>errors.push(error));
 let events!:NativePreviewEvents;
 playback.attach({
  nativePreviewEvents(value){events=value;},
  async updateNativePreviewState(){return true;},
  async submitNativeFrame(frame,{previewRevision,previewQuality}){
   const revision=previewRevision!;
   let complete!:()=>void;
   const completed=new Promise<void>(resolve=>{complete=resolve;});
   calls.push({frame,revision,quality:previewQuality,finish(){events.presented({frame,revision});complete();}});
   return {version:1,frame,slot:0,completion:'submitted',completed};
  },
 },composition,100,1,0,audio,quality);
 if(!audio)events.input({input:1,action:'toggle'});
 return {playback,events,calls,errors};
}

async function waitFor(predicate:()=>boolean){
 const deadline=performance.now()+2000;
 while(!predicate()){
  assert.ok(performance.now()<deadline,'preview request did not start');
  await delay(1);
 }
}

test('paused preview coalesces queued seeks and ignores outdated completions',async()=>{
 const {playback,calls,errors}=setup();
 try{
  assert.equal(playback.state.playing,false);
  const first=playback.seek(1000);
  const firstRejected=assert.rejects(first,{code:'E_RENDER_CANCELLED'});
  await waitFor(()=>calls.length===1);
  const replaced=playback.seek(2000);
  const replacedRejected=assert.rejects(replaced,{code:'E_RENDER_CANCELLED'});
  const latest=playback.seek(3000);
  await Promise.all([firstRejected,replacedRejected]);
  calls[0].finish();
  assert.equal(playback.state.displayedFrame,100);
  await waitFor(()=>calls.length===2);
  assert.deepEqual(calls.map(call=>call.frame),[1000,3000]);
  calls[1].finish();
  await latest;
  assert.equal(playback.state.displayedFrame,3000);
  assert.equal(playback.state.playing,false);
  assert.deepEqual(errors,[]);
 }finally{playback.close();}
});

test('window commands step, scrub and release at the latest target',async()=>{
 const {playback,events,calls}=setup();
 try{
  events.input({input:2,action:'next'});
  await waitFor(()=>calls.length===1);
  assert.equal(calls[0].frame,101);
  calls[0].finish();
  events.input({input:3,action:'seek',frame:200});
  events.input({input:4,action:'seek',frame:2500});
  events.input({input:5,action:'scrubEnd',frame:3100});
  await waitFor(()=>calls.length===2);
  assert.equal(calls[1].frame,3100);
  calls[1].finish();
  assert.equal(playback.state.displayedFrame,3100);
 }finally{playback.close();}
});


test('window time jumps use rational fps, accumulate rapid inputs and clamp at both ends',async()=>{
 const {playback,events,calls}=setup(undefined,undefined,{num:30000,den:1001});
 try{
  events.input({input:2,action:'nextSecond'});
  events.input({input:3,action:'nextMinute'});
  await waitFor(()=>calls.length===1);
  assert.equal(calls[0].frame,1928);
  calls[0].finish();
  events.input({input:4,action:'previousMinute'});
  events.input({input:5,action:'previousSecond'});
  await waitFor(()=>calls.length===2);
  assert.equal(calls[1].frame,100);
  calls[1].finish();
  events.input({input:6,action:'previousMinute'});
  await waitFor(()=>calls.length===3);
  assert.equal(calls[2].frame,0);
  calls[2].finish();
  events.input({input:7,action:'last'});
  await waitFor(()=>calls.length===4);
  assert.equal(calls[3].frame,3999);
  calls[3].finish();
  events.input({input:8,action:'nextMinute'});
  assert.equal(playback.position,3999);
  assert.equal(playback.state.playing,false);
 }finally{playback.close();}
});

test('reload drains started work and retains the latest queued seek until resume',async()=>{
 const {playback,calls,errors}=setup();
 try{
  const first=assert.rejects(playback.seek(150),{code:'E_RENDER_CANCELLED'});
  await waitFor(()=>calls.length===1);
  const drain=playback.suspend();
  const latest=playback.seek(250);
  await first;
  calls[0].finish();
  await drain;
  assert.deepEqual(calls.map(call=>call.frame),[150]);
  playback.resume();
  await waitFor(()=>calls.length===2);
  assert.deepEqual(calls.map(call=>call.frame),[150,250]);
  calls[1].finish();
  await latest;
  assert.equal(playback.state.displayedFrame,250);
  assert.deepEqual(errors,[]);
 }finally{playback.close();}
});

test('playback follows device samples and drops audio on pause and seek',async()=>{
 let clock:number|null=null,stops=0;
 const starts:{revision:number;frame:number}[]=[];
 const {playback,events,calls}=setup({
  state:{sampleRate:48000,sample:0,status:'playing'},connect(){},
  play(revision,_input,frame){starts.push({revision,frame});},
  stop(){stops++;clock=null;},frame(){return clock;},
 });
 try{
  await waitFor(()=>starts.length===1);
  assert.equal(calls.length,0);
  clock=115;
  playback.audioChanged();
  await waitFor(()=>calls.length===1);
  assert.equal(calls[0].frame,115);
  calls[0].finish();
  events.input({input:1,action:'toggle'});
  assert.equal(playback.state.playing,false);
  const seek=playback.seek(200);
  await waitFor(()=>calls.length===2);
  calls[1].finish();
  await seek;
  assert.equal(playback.state.displayedFrame,200);
  assert.ok(stops>=2);
  assert.equal(starts.length,1);
  events.input({input:2,action:'toggle'});
  await waitFor(()=>starts.length===2);
  assert.equal(starts[1].frame,200);
 }finally{playback.close();}
});

test('preview quality responds to latency and backlog with hysteresis',()=>{
 const policy=new PreviewQualityPolicy({mode:'adaptive',allowApproximation:true,sampleCount:8},16,false);
 assert.equal(policy.playing.resolutionScale,1);
 for(let i=0;i<10;i++)policy.observe(policy.playing,30,true,1);
 assert.equal(policy.playing.resolutionScale,1,'slow host with a light GPU should retain resolution');
 for(let i=0;i<4;i++)policy.observe(policy.playing,25,true);
 assert.equal(policy.playing.resolutionScale,.5);
 assert.equal(policy.playing.sampleCount,4);
 for(let i=0;i<30;i++)policy.observe(policy.playing,5,true);
 assert.equal(policy.playing.resolutionScale,.5);
 for(let i=0;i<16;i++)policy.observe(policy.playing,5,false);
 assert.equal(policy.playing.resolutionScale,1);
 assert.equal(policy.scrubbing.resolutionScale,.25);
 assert.equal(policy.exact.allowApproximation,false);
 assert.equal(new PreviewQualityPolicy({mode:'adaptive',allowApproximation:true},16,true).scrubbing.resolutionScale,1);
});

test('releasing a scrub restores exact quality at the same frame',async()=>{
 const policy=new PreviewQualityPolicy({mode:'adaptive',allowApproximation:true},16,false);
 const {playback,events,calls}=setup(undefined,policy);
 try{
  events.input({input:2,action:'seek',frame:311});
  await waitFor(()=>calls.length===1);
  assert.equal(calls[0].quality?.resolutionScale,.25);
  calls[0].finish();
  assert.equal(playback.state.quality?.resolutionScale,.25);
  events.input({input:3,action:'scrubEnd',frame:311});
  await waitFor(()=>calls.length===2);
  assert.equal(calls[1].frame,311);
  assert.equal(calls[1].quality?.resolutionScale,1);
  calls[1].finish();
  assert.equal(playback.state.quality?.allowApproximation,false);
 }finally{playback.close();}
});
