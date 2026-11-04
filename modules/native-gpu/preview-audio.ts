import type {BuiltProject} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import {Renderer} from '../../src/render/renderer.ts';
import {describeAudioLayers,mixAudioLayers} from '../../src/audio/layers.ts';
import {frameToSample} from '../../src/audio/time.ts';
import {intervalFrame} from '../../src/audio/execution.ts';
import type {AudioSampleRate} from '../../src/audio/block.ts';
import type {NativePreviewAudioClock,NativePreviewAudioPort} from './client.ts';

type Stream={revision:number;start:number;sample:number;queued:number;opened:boolean;busy:boolean};

/** AU-1 renders only a short lookahead. A revision change invalidates both
 * the queued device buffers and any block whose Stage is still evaluating. */
export class PreviewAudio {
 private stream?:Stream;
 private mixer?:Promise<Renderer>;
 private unavailable=false;
 private closed=false;
 private readonly end:number;
 private readonly framesPerBlock:number;
 private readonly ahead:number;

 static forProject(build:BuiltProject,port:NativePreviewAudioPort,changed:()=>void,ended:()=>void,failed:(error:unknown)=>void){
  const {layers,stages}=build.manifest;
  const source=stages.find(stage=>layers.some(layer=>layer.source?.$ref===stage.id&&stage.outputs[layer.source.port]==='audio'));
  if(!source)return undefined;
  const rate=source.audio?.sampleRate;
  if(!rate)throw new EngineError('E_AUDIO_METADATA','Placed audio requires a declared sample rate');
  describeAudioLayers(build.manifest,rate);
  return new PreviewAudio(build,port,rate,changed,ended,failed);
 }

 private constructor(private build:BuiltProject,private port:NativePreviewAudioPort,private rate:AudioSampleRate,
  private changed:()=>void,private ended:()=>void,private failed:(error:unknown)=>void){
  this.end=frameToSample(build.manifest.composition.durationInFrames,rate,build.manifest.composition.fps);
  this.framesPerBlock=rate/50; // 20 ms PCM writes.
  this.ahead=rate*2/25; // Bound playback ahead of the device clock to 80 ms.
 }

 connect(){
  this.port.listen({
   clock:clock=>this.clock(clock),
   failed:(revision,error)=>{const stream=this.stream;if(stream?.revision===revision)this.fail(stream,error);},
  });
 }

 get state(){
  const stream=this.stream;
  return {sampleRate:this.rate,sample:stream?.sample,status:this.unavailable?'unavailable':!stream?'paused':stream.opened&&stream.sample>stream.start?'playing':'priming'};
 }

 frame(revision:number):number|null|undefined{
  if(this.unavailable)return undefined;
  const stream=this.stream;
  if(!stream||stream.revision!==revision||stream.sample===stream.start)return null;
  if(stream.sample>=this.end)return this.build.manifest.composition.durationInFrames-1;
  return intervalFrame(this.build.manifest,{unit:'samples',sampleRate:this.rate,start:stream.sample,endExclusive:stream.sample+1});
 }

 play(revision:number,input:number,frame:number){
  if(this.closed||this.unavailable||this.stream?.revision===revision)return;
  this.stop();
  const start=frameToSample(frame,this.rate,this.build.manifest.composition.fps);
  const stream={revision,start,sample:start,queued:start,opened:false,busy:false};
  this.stream=stream;
  void this.port.start({revision,input,rate:this.rate,start,end:this.end}).then(accepted=>{
   if(this.stream!==stream||!accepted)return;
   stream.opened=true;
   this.fill(stream);
  }).catch(error=>this.fail(stream,error));
 }

 stop(){
  const stream=this.stream;
  this.stream=undefined;
  if(stream)void this.port.stop(stream.revision).catch(()=>{});
 }

 async close(){
  this.closed=true;
  this.stop();
  await this.mixer?.then(renderer=>renderer.close(),()=>{});
 }

 private clock(clock:NativePreviewAudioClock){
  const stream=this.stream;
  if(!stream||clock.revision!==stream.revision||clock.sample<stream.sample||clock.sample>this.end)return;
  stream.sample=clock.sample;
  if(clock.ended)this.ended();
  else{
   this.fill(stream);
   this.changed();
  }
 }

 private fail(stream:Stream,error:unknown){
  if(this.stream!==stream)return;
  this.unavailable=true;
  this.stop();
  this.failed(error);
  this.changed();
 }

 private fill(stream:Stream){
  if(stream.busy||stream.queued>=this.end||stream.queued-stream.sample>=this.ahead)return;
  stream.busy=true;
  void (async()=>{
   this.mixer??=Renderer.createAudio(this.build);
   const renderer=await this.mixer;
   while(this.stream===stream&&stream.queued<this.end&&stream.queued-stream.sample<this.ahead){
    const start=stream.queued,endExclusive=Math.min(this.end,start+this.framesPerBlock);
    const block=await mixAudioLayers(this.build.manifest,{unit:'samples',sampleRate:this.rate,start,endExclusive},
     {layout:'stereo',gap:'silence',evaluate:(interval,stage)=>renderer.evaluateInterval(interval,stage)});
    if(this.stream!==stream)return;
    if(!await this.port.queue(stream.revision,start,block.sampleCount,block.storage.data))return;
    stream.queued=endExclusive;
   }
  })().catch(error=>this.fail(stream,error)).finally(()=>{stream.busy=false;});
 }
}
