import type {TVG} from '../../src/core/types.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {Renderer} from '../../src/render/renderer.ts';
import type {NativePreviewInput} from './client.ts';
import {NativeFrameScheduler} from './scheduler.ts';
import type {PreviewAudio} from './preview-audio.ts';
import type {PreviewQuality,PreviewQualityPolicy} from './preview-quality.ts';

type PreviewRenderer = Pick<Renderer,'nativePreviewEvents'|'updateNativePreviewState'> & {
 submitNativeFrame(frame:number,options:{previewRevision:number;isCurrent:()=>boolean;previewQuality?:PreviewQuality;previewCacheLookup?:boolean}):ReturnType<Renderer['submitNativeFrame']>;
};
type Composition = TVG['composition'];
type AudioClock = Pick<PreviewAudio,'state'|'connect'|'stop'|'play'|'frame'>;
type Request = {frame:number;quality?:PreviewQuality;scrubbing:boolean;resolve:()=>void;reject:(reason:unknown)=>void};
type Source = {renderer:PreviewRenderer;composition:Composition;scheduler:NativeFrameScheduler;input:number;audio?:AudioClock;quality?:PreviewQualityPolicy};

const cancelled = () => new EngineError('E_RENDER_CANCELLED','A newer preview request replaced this frame');

/** Presentation is cancellable independently of Stage execution. Recording may
 * mutate JS or GPU state, so a submitted frame always finishes on its owner. */
export class PreviewPlayback {
 private source?:Source;
 private revision=0;
 private shown?:number;
 private shownRevision?:number;
 private shownQuality?:PreviewQuality;
 private timing?:{wallMs:number;gpuMs?:number};
 private frameQuality=new Map<number,PreviewQuality>();
 private next=0;
 private lastAudioFrame?:number;
 private audioOrigin?:number;
 private playing=true;
 private stopped=false;
 private suspended=false;
 private drained?:()=>void;
 private recording=false;
 private queued?:Request;
 private current?:Request;
 private inFlight=0;
 private nextAt=0;
 private timer?:ReturnType<typeof setTimeout>;
 private fence:Promise<boolean>=Promise.resolve(true);

 constructor(private width:number|undefined,private onError:(reason:unknown)=>void,private onPresented?:()=>void){}

 get position(){return this.queued?.frame??this.current?.frame??this.shown??0;}
 get state(){return {playing:this.playing,displayedFrame:this.shown,revision:this.revision,audio:this.source?.audio?.state,quality:this.shownQuality,timing:this.timing};}
 audioChanged(){this.schedule();}
 audioEnded(){
  if(this.stopped||this.suspended||!this.playing)return;
  this.supersede();
  this.audioOrigin=0;
  this.next=0;
  this.nextAt=performance.now();
  this.updateFence('Playing');
  this.schedule();
 }
 get inputSequence(){return this.source?.input??0;}
 replayProgress(step:number,target:number){this.updateFence(`Replaying ${step}/${target}`);}
 replayFinished(){this.updateFence(this.playing?'Playing':'Paused');}

 suspend():Promise<void>{
  this.suspended=true;
  this.source?.audio?.stop();
  clearTimeout(this.timer);
  this.timer=undefined;
  if(!this.recording&&!this.inFlight)return Promise.resolve();
  return new Promise(resolve=>{this.drained=resolve;});
 }
 resume(){
  this.suspended=false;
  if(this.stopped||!this.source)return;
  this.nextAt=performance.now();
  this.audioOrigin=undefined;
  this.lastAudioFrame=this.shown;
  this.updateFence(this.queued?'Seeking':this.playing?'Playing':'Paused');
  this.schedule();
 }

 attach(renderer:PreviewRenderer,composition:Composition,initial:number,capacity:number,input=0,audio?:AudioClock,quality?:PreviewQualityPolicy){
  this.supersede();
  const source:Source={renderer,composition,scheduler:new NativeFrameScheduler({mode:'interactive',capacity,targetLatencyMs:this.interval(composition)}),input,audio,quality};
  this.source=source;
  this.shown=initial;
  this.shownQuality=quality?.exact;
  this.timing=undefined;
  this.lastAudioFrame=initial;
  audio?.connect();
  this.next=(initial+1)%composition.durationInFrames;
  this.nextAt=performance.now()+this.interval(composition);
  renderer.nativePreviewEvents({
   input:event=>{if(this.source===source&&!this.stopped)this.input(source,event);},
   presented:event=>{
    if(this.source!==source||event.revision!==this.revision)return;
    const quality=this.frameQuality.get(event.frame);
    const changed=quality!==this.shownQuality;
    this.shown=event.frame;
    this.shownRevision=event.revision;
    this.shownQuality=quality;
    if(changed&&this.playing)this.updateFence('Playing');
    this.onPresented?.();
   },
  });
  this.updateFence(this.playing?'Playing':'Paused');
  this.schedule();
 }

 seek(frame:number):Promise<void>{
  const source=this.source;
  if(!source||this.stopped)return Promise.reject(new EngineError('E_NATIVE_CLOSED','Preview is closed'));
  if(!Number.isSafeInteger(frame)||frame<0||frame>=source.composition.durationInFrames)
   return Promise.reject(new EngineError('E_FRAME_RANGE','Preview frame is outside the composition',{frame}));
  return this.enqueueSeek(frame,'Seeking');
 }

 close(){
  this.stopped=true;
  this.supersede();
 }

 private interval(composition:Composition){return 1000*composition.fps.den/composition.fps.num;}

 private supersede(){
  this.revision++;
  this.frameQuality.clear();
  this.source?.audio?.stop();
  this.lastAudioFrame=this.shown;
  this.audioOrigin=undefined;
  clearTimeout(this.timer);
  this.timer=undefined;
  this.queued?.reject(cancelled());
  this.current?.reject(cancelled());
  this.queued=undefined;
  this.current=undefined;
 }

 private updateFence(label:string,reportFailure=true){
  if(this.suspended)return;
  const source=this.source!;
  const revision=this.revision;
  const width=Math.round((this.width??source.composition.width)*(this.shownQuality?.resolutionScale??1));
  this.fence=source.renderer.updateNativePreviewState({revision,input:source.input,duration:source.composition.durationInFrames,active:true,label:`${label} | ${width}px`});
  void this.fence.then(accepted=>{
   if(accepted&&this.revision===revision&&this.source===source&&!this.stopped&&!this.suspended&&this.playing)
    source.audio?.play(revision,source.input,this.audioOrigin??this.shown??0);
  }).catch(error=>{if(reportFailure&&!this.stopped&&this.revision===revision)this.fail(error);});
 }

 private input(source:Source,event:NativePreviewInput){
  if(event.input<=source.input)return;
  source.input=event.input;
  if(event.action==='toggle'){
   this.supersede();
   this.playing=!this.playing;
   if(!this.playing&&this.shown!==undefined&&source.quality&&this.shownQuality!==source.quality.exact){
    void this.enqueueSeek(this.shown,'Restoring quality').catch(()=>{});
    return;
   }
   this.nextAt=performance.now();
   this.updateFence(this.playing?'Playing':'Paused');
   this.schedule();
   return;
  }
  const last=source.composition.durationInFrames-1;
  let frame:number;
  if('frame'in event)frame=event.frame;
  else if(event.action==='first'||event.action==='last')frame=event.action==='first'?0:last;
  else{
   const {num,den}=source.composition.fps;
   const seconds=event.action.endsWith('Minute')?60:event.action.endsWith('Second')?1:0;
   const frames=seconds?Math.round(seconds*num/den):1;
   frame=this.position+(event.action.startsWith('next')?frames:-frames);
  }
  void this.enqueueSeek(Math.min(last,Math.max(0,frame)),event.action==='seek'?'Scrubbing':'Seeking',event.action==='seek').catch(()=>{});
 }

 private enqueueSeek(frame:number,label:string,scrubbing=false):Promise<void>{
  this.supersede();
  this.playing=false;
  const policy=this.source?.quality;
  const quality=scrubbing?policy?.scrubbing:policy?.exact;
  if(!this.suspended&&!this.recording&&!this.inFlight&&frame===this.shown&&quality===this.shownQuality){
   this.next=(frame+1)%this.source!.composition.durationInFrames;
   this.updateFence('Paused');
   return Promise.resolve();
  }
  const request=new Promise<void>((resolve,reject)=>{this.queued={frame,quality,scrubbing,resolve,reject};});
  this.updateFence(label);
  this.schedule();
  return request;
 }

 private schedule(){
  if(this.suspended){
   if(!this.recording&&!this.inFlight){
    this.drained?.();
    this.drained=undefined;
   }
   return;
  }
  if(this.stopped||this.recording||!this.source||this.inFlight>=this.source.scheduler.concurrency||this.timer)return;
  if(!this.queued&&!this.playing)return;
  const clock=this.queued?undefined:this.source.audio?.frame(this.revision);
  if(clock===null||clock!==undefined&&clock===this.lastAudioFrame)return;
  const wait=this.queued||clock!==undefined?0:Math.max(0,this.nextAt-performance.now());
  this.timer=setTimeout(()=>{
   this.timer=undefined;
   void this.submit();
  },wait);
 }

 private async submit(){
  if(this.stopped||this.recording||!this.source||this.inFlight>=this.source.scheduler.concurrency)return;
  const source=this.source,revision=this.revision,request=this.queued;
  if(!request&&!this.playing)return;
  const clock=request?undefined:source.audio?.frame(revision);
  if(clock===null||clock!==undefined&&clock===this.lastAudioFrame)return;
  const frame=request?.frame??clock??this.next;
  const quality=request?request.quality:source.quality?.playing;
  this.recording=true;
  this.queued=undefined;
  this.current=request;
  try{
   if(!await this.fence||this.stopped||revision!==this.revision){
    request?.reject(cancelled());
    return;
   }
   if(clock!==undefined)this.lastAudioFrame=clock;
   this.next=(frame+1)%source.composition.durationInFrames;
   this.nextAt=Math.max(this.nextAt+this.interval(source.composition),performance.now());
   const begin=performance.now();
   if(quality)this.frameQuality.set(frame,quality);
   const ticket=await source.renderer.submitNativeFrame(frame,{previewRevision:revision,previewQuality:quality,previewCacheLookup:request!==undefined,
    isCurrent:()=>!this.stopped&&this.revision===revision&&this.source===source});
   this.inFlight++;
   void ticket.completed.then(()=>{
    if(this.stopped||this.revision!==revision)return;
    const elapsed=Math.max(.001,performance.now()-begin);
    source.scheduler.observe(1,elapsed);
    if(quality)this.timing={wallMs:elapsed,gpuMs:ticket.gpuTimeMs};
    if(!request&&quality)source.quality?.observe(quality,elapsed,this.inFlight-1+Number(this.recording)>=source.scheduler.concurrency,ticket.gpuTimeMs);
    if(request){
     if(this.shown===frame&&this.shownRevision===revision)request.resolve();
     else request.reject(new EngineError('E_NATIVE_DISPLAY','The requested preview frame was rendered but could not be presented'));
     this.updateFence(request.scrubbing?'Scrubbing':'Paused');
    }
   }).catch(error=>{
    if(!this.stopped&&this.revision===revision)this.fail(error);
    request?.reject(error);
   }).finally(()=>{
    this.inFlight--;
    if(this.revision===revision)this.frameQuality.delete(frame);
    if(this.current===request)this.current=undefined;
    this.schedule();
   });
  }catch(error){
   if(this.revision===revision)this.frameQuality.delete(frame);
   if(!this.stopped&&this.revision===revision)this.fail(error);
   request?.reject(error);
  }finally{
   this.recording=false;
   this.schedule();
  }
 }

 private fail(error:unknown){
  this.current?.reject(error);
  this.supersede();
  this.playing=false;
  if(this.source)this.updateFence('Preview error',false);
  this.onError(error);
 }
}
