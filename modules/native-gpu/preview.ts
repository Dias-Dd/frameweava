import {watch,type FSWatcher} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {buildProject} from '../../src/compiler/build.ts';
import {Renderer,type NativePreviewCheckpoint,type RendererOptions} from '../../src/render/renderer.ts';
import {diagnostic,EngineError} from '../../src/core/errors.ts';
import type {BuiltProject,RenderOptions,TVG,Diagnostic} from '../../src/core/types.ts';
import type {NativeFrameTicket} from './client.ts';
import {nativeExecutable} from './executable.ts';
import {NativeFrameScheduler} from './scheduler.ts';
import {assertWasmOption} from '../../src/runtime/execution-policy.ts';
import {writeCLIResult} from '../../src/cli-output.ts';
import {createCLIProgress} from '../../src/cli-progress.ts';
import {reportProgress,type ProgressSink} from '../../src/core/progress.ts';
import {PreviewPlayback} from './preview-playback.ts';
import {PreviewAudio} from './preview-audio.ts';
import {stageDefinitions} from '../stage-orchestration/composite-types.ts';
import {PreviewQualityPolicy,type PreviewQuality,type PreviewQualityOptions} from './preview-quality.ts';

const fixedStep = (build:BuiltProject) => stageDefinitions(build.manifest).some(({stage})=>stage.engine==='native-gpu'&&stage.seek==='fixed-step');
const replaced = () => new EngineError('E_RENDER_CANCELLED','A newer preview request replaced this replay');

async function replayFrames(renderer:Renderer,first:number,target:number,revision:number|undefined,isCurrent:()=>boolean,onFrame?:(step:number)=>void|Promise<void>,previewQuality?:PreviewQuality){
 let ticket:NativeFrameTicket|undefined;
 for(let step=first;step<=target;step++){
  if(!isCurrent())throw replaced();
  ticket=await renderer.submitNativeFrame(step,step===target?{previewRevision:revision,previewQuality}:{previewAdvance:true,previewQuality});
  await ticket.completed;
  await onFrame?.(step);
 }
 return ticket!;
}

export interface PreviewOptions extends Pick<RenderOptions,'allowWasm'>{quality?:PreviewQualityOptions;onProgress?:ProgressSink;allowRayQuery?:boolean;open?:boolean;port?:number;width?:number;timeoutMs?:number;watch?:boolean;accelerated?:boolean;direct?:boolean;nativeExecutable?:string;maxBytes?:number;maxConcurrency?:number;frames?:number;checkpointInterval?:number;checkpointBytes?:number}
/** Native media window. There is intentionally no HTTP preview server, image
 * endpoint, browser player, screenshot fallback or legacy PNG transport. */
export async function startPreview(project:string,options:PreviewOptions={}){
 assertWasmOption(options.allowWasm);if(options.allowRayQuery!==undefined&&typeof options.allowRayQuery!=='boolean')throw new EngineError('E_ARGUMENT','allowRayQuery must be boolean');if(options.port!==undefined||options.accelerated===false)throw new EngineError('E_PREVIEW_MIGRATION','The Web preview was removed; native preview has no HTTP port or CPU accurate-capture mode');
 const checkpointInterval=options.checkpointInterval??30,checkpointBudget=options.checkpointBytes??Math.floor((options.maxBytes??1024**3)/8);
 if(!Number.isSafeInteger(checkpointInterval)||checkpointInterval<1||!Number.isSafeInteger(checkpointBudget)||checkpointBudget<0)
  throw new EngineError('E_PREVIEW_CHECKPOINT','Expected positive interval and nonnegative byte budget for preview checkpoints');
 if(options.quality&&options.open===false)throw new EngineError('E_PREVIEW_QUALITY','Quality profiles require a native preview window');
 reportProgress(options.onProgress,{phase:'initialize'});const entry=resolve(project),executable=await nativeExecutable(options.nativeExecutable);
 let renderer:Renderer|undefined,composition:TVG['composition']|undefined,stopped=false,version=0,error:Diagnostic|undefined,frame=0,buildRunning:Promise<void>|undefined,timer:ReturnType<typeof setTimeout>|undefined,dirty=false;
 let finish!:()=>void;const closed=new Promise<void>(r=>{finish=r;}),watchers=new Map<string,FSWatcher>();let playback:Promise<void>=Promise.resolve();
 let presented=0;
 const checkpointStats={saves:0,restores:0,restoreFailures:0,evictions:0,replaySteps:0,entries:0,bytes:0};
 let audio:PreviewAudio|undefined;
 const controls=options.open!==false?new PreviewPlayback(options.width,reason=>{
   error=diagnostic(reason);writeCLIResult(error,{stream:'stderr',pretty:false});
 },()=>{presented++;if(options.frames!==undefined&&presented>=options.frames)void close();}):undefined;
 const state=()=>({ ...controls?.state,backend:'native-wgpu',ready:!!renderer,building:!!buildRunning,version,presentedFrames:presented,checkpoints:{...checkpointStats},composition,error,accelerated:true,previewWidth:composition?Math.max(1,Math.round((options.width??composition.width)*(controls?.state.quality?.resolutionScale??1))):undefined,allowWasm:options.allowWasm===true,transport:'resident-native',logicHost:'spidermonkey'});
 const close=async()=>{if(stopped)return closed;stopped=true;controls?.close();clearTimeout(timer);for(const w of watchers.values())w.close();watchers.clear();try{await buildRunning?.catch(()=>{});await playback.catch(()=>{});await controls?.suspend();await audio?.close();await renderer?.close();}finally{finish();}};
 function observe(file:string){if(stopped||options.watch===false||watchers.has(file))return;try{watchers.set(file,watch(file,()=>{dirty=true;clearTimeout(timer);timer=setTimeout(()=>{void rebuild().catch(e=>{error=diagnostic(e);writeCLIResult(error,{stream:'stderr',pretty:false});});},60);}));}catch(e){throw new EngineError('E_PREVIEW_WATCH',String(e));}}
 function playbackSource(build:BuiltProject,config:RendererOptions,initial:number){
  let cursor:number|undefined=initial;
  const sequential=fixedStep(build);
  const history=new Map<number,NativePreviewCheckpoint>();
  let nextCharge=0;
  checkpointStats.entries=checkpointStats.bytes=0;
  const save=async(owner:Renderer,step:number)=>{
   if(!checkpointBudget||step%checkpointInterval||history.has(step))return;
   const minimum=owner.previewCheckpointBytes();
   if(minimum===undefined||minimum>=checkpointBudget)return;
   const charge=Math.max(minimum+1,nextCharge);
   while(history.size&&checkpointStats.bytes+charge>checkpointBudget){
    const oldest=history.keys().next().value!;
    const retired=history.get(oldest)!;
    await owner.releasePreviewCheckpoint(retired);
    history.delete(oldest);checkpointStats.bytes-=retired.bytes;checkpointStats.evictions++;
   }
   checkpointStats.entries=history.size;
   const snapshot=await owner.capturePreviewCheckpoint(checkpointBudget-checkpointStats.bytes);
   if(!snapshot)return;
   history.set(step,snapshot);nextCharge=snapshot.bytes;
   checkpointStats.entries=history.size;checkpointStats.bytes+=snapshot.bytes;checkpointStats.saves++;
  };
  return {
   nativePreviewEvents:(events:Parameters<Renderer['nativePreviewEvents']>[0])=>renderer!.nativePreviewEvents(events),
   updateNativePreviewState:(status:Parameters<Renderer['updateNativePreviewState']>[0])=>renderer!.updateNativePreviewState(status),
   async submitNativeFrame(target:number,{previewRevision,isCurrent,previewQuality,previewCacheLookup}:{previewRevision:number;isCurrent:()=>boolean;previewQuality?:PreviewQuality;previewCacheLookup?:boolean}){
    const owner=renderer!;
    if(!sequential)return owner.submitNativeFrame(target,{previewRevision,previewQuality,previewCacheLookup});
    let lastReport=-Infinity;
    const onFrame=(step:number)=>{
     if(step<target&&isCurrent()&&performance.now()-lastReport>=250){
      lastReport=performance.now();
      controls!.replayProgress(step+1,target+1);
     }
    };
    if(!isCurrent())throw replaced();
    let best:number|undefined;
    if(history.size&&cursor!==undefined&&target!==cursor+1&&owner.previewCheckpointBytes()!==undefined){
     for(const step of history.keys())if(step<target&&(target<=cursor||step>cursor)&&(best===undefined||step>best))best=step;
    }
    if(best!==undefined){
     const checkpoint=history.get(best)!;
     try{
      await owner.restorePreviewCheckpoint(checkpoint);
      cursor=best;
      history.delete(best);history.set(best,checkpoint);
      checkpointStats.restores++;
     }catch{
      // An interrupted restore may have changed only part of the Stage state.
      // Recreate the owner through the normal verified replay path.
      cursor=undefined;
      checkpointStats.restoreFailures++;
     }
    }
    if(cursor!==undefined&&target>cursor){
     try{
      if(isCurrent())await save(owner,cursor);
      const ticket=await replayFrames(owner,cursor+1,target,previewRevision,isCurrent,async step=>{
       cursor=step;checkpointStats.replaySteps++;onFrame(step);
       if(isCurrent())await save(owner,step);
      },previewQuality);
      if(isCurrent()&&lastReport!==-Infinity)controls!.replayFinished();
      return ticket;
     }catch(e){if(!(e instanceof EngineError&&e.code==='E_RENDER_CANCELLED'))cursor=undefined;throw e;}
    }
    // A new sealed owner reconstructs JS and GPU state from initialization.
    // The current owner keeps its picture until the replacement target is ready.
    const replacement=await owner.prepareNativePreviewReload(build,config);
    let committed=false;
    try{
     const ticket=await replayFrames(replacement,0,target,undefined,isCurrent,step=>{
      checkpointStats.replaySteps++;onFrame(step);
     },previewQuality);
     if(!isCurrent())throw replaced();
     try{
      await replacement.commitNativePreviewReload(owner,{frame:target,revision:previewRevision,input:controls!.inputSequence,duration:build.manifest.composition.durationInFrames});
     }catch(e){if(e instanceof EngineError&&e.code==='E_NATIVE_PREVIEW_RELOAD_STALE')throw replaced();throw e;}
     committed=true;
     renderer=replacement;
     cursor=target;
     history.clear();nextCharge=0;checkpointStats.entries=checkpointStats.bytes=0;
     await owner.close();
     if(isCurrent()&&lastReport!==-Infinity)controls!.replayFinished();
     return ticket;
    }finally{if(!committed)await replacement.close();}
   },
  };
 }
 async function rebuild(){
  if(buildRunning){dirty=true;return buildRunning;}
  buildRunning=(async()=>{
   do{
    dirty=false;
    reportProgress(options.onProgress,{phase:'compile'});
    const build=await buildProject(entry);
    const sources=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8'));
    if(stopped||dirty)continue;
    const previous=renderer,current=build.manifest.composition,reload=previous&&controls;
    const quality=options.quality?new PreviewQualityPolicy(options.quality,1000*current.fps.den/current.fps.num,fixedStep(build)):undefined;
    const config:RendererOptions={width:options.width,timeoutMs:options.timeoutMs,allowWasm:options.allowWasm,
     nativeGpu:{executable,rayQuery:options.allowRayQuery,window:options.open!==false,dynamic:'interactive',previewQuality:quality?true:undefined,packedF16:options.quality?.allowApproximation===true,slots:options.maxConcurrency,maxBytes:options.maxBytes}};
    const target=()=>{
     const position=controls?.position??frame;
     const time=composition?position*composition.fps.den/composition.fps.num:0;
     return Math.min(Math.round(time*current.fps.num/current.fps.den),current.durationInFrames-1);
    };
    let candidate:Renderer|undefined;
    try{
     if(reload)await reload.suspend();
     if(stopped||dirty)continue;
     reportProgress(options.onProgress,{phase:'initialize'});
     candidate=reload?await previous.prepareNativePreviewReload(build,config):await Renderer.create(build,config);
     const initial=target(),revision=controls?.state.revision??0,input=controls?.inputSequence??0;
     reportProgress(options.onProgress,{phase:'first-frame'});
     if(controls&&!reload)await candidate.updateNativePreviewState({revision:0,input:0,duration:current.durationInFrames,label:'Loading',active:false});
     if(reload&&fixedStep(build)){
      try{await replayFrames(candidate,0,initial,undefined,()=>!stopped&&!dirty&&reload.state.revision===revision,undefined,quality?.exact);}
      catch(e){if(e instanceof EngineError&&e.code==='E_RENDER_CANCELLED'){dirty=true;continue;}throw e;}
     }else{
      const ticket=await candidate.submitNativeFrame(initial,{previewRevision:controls&&!reload?0:undefined,previewQuality:quality?.exact});
      await ticket.completed;
     }
     const capacity=Number((await candidate.nativeStats()).slots);
     if(stopped||dirty)continue;
     if(reload){
      if(reload.state.revision!==revision){dirty=true;continue;}
      try{await candidate.commitNativePreviewReload(previous,{frame:initial,revision,input,duration:current.durationInFrames});}
      catch(e){if(e instanceof EngineError&&e.code==='E_NATIVE_PREVIEW_RELOAD_STALE'){dirty=true;continue;}throw e;}
     }
     const active=candidate,lateTarget=controls?.state.revision!==revision?target():initial;
     const previousAudio=audio;
     renderer=active;candidate=undefined;composition=current;version++;frame=(initial+1)%current.durationInFrames;error=undefined;
     audio=undefined;
     if(controls){
      const audioError=(reason:unknown)=>{error=diagnostic(reason);writeCLIResult(error,{stream:'stderr',pretty:false});};
      try{audio=PreviewAudio.forProject(build,active.nativePreviewAudioPort(),()=>controls.audioChanged(),()=>controls.audioEnded(),audioError);}
      catch(reason){audioError(reason);}
      controls.attach(playbackSource(build,config,initial),current,initial,capacity,controls.inputSequence,audio,quality);
     }
     await previousAudio?.close();
     if(controls&&!controls.state.playing&&lateTarget!==initial)void controls.seek(lateTarget).catch(()=>{});
     await previous?.close();
     for(const file of sources.files??[])if(!file.includes('node_modules')&&!file.includes('.frameweave'))observe(file);
     observe(entry);
     if(!reload)void active.nativeExited().then(()=>{if((controls||renderer===active)&&!stopped)void close();});
    }finally{
     try{await candidate?.close();}finally{reload?.resume();}
    }
   }while(dirty&&!stopped);
   reportProgress(options.onProgress,{phase:'ready'});
  })().catch(e=>{reportProgress(options.onProgress,{phase:'error'});throw e;}).finally(()=>{buildRunning=undefined;});
  return buildRunning;
 }
 const ready=rebuild();await ready;
 if(!controls&&options.frames!==undefined){playback=(async()=>{let rendered=0;let start=performance.now();const scheduler=new NativeFrameScheduler({mode:'interactive',capacity:Number((await renderer!.nativeStats()).slots)}),pending=new Set<Promise<void>>();
  while(!stopped&&renderer&&composition){const active=renderer,c=composition,interval=1000*c.fps.den/c.fps.num,wait=start+rendered*interval-performance.now();if(wait>0)await delay(wait);if(stopped)break;
   while(pending.size>=scheduler.concurrency)await Promise.race(pending);if(stopped)break;
   const begin=performance.now();let ticket;try{ticket=await active.submitNativeFrame(frame);}catch(e){if(active!==renderer)continue;throw e;}let done:Promise<void>;done=ticket.completed.then(()=>{scheduler.observe(1,Math.max(.001,performance.now()-begin));}).catch(e=>{if(active===renderer)throw e;}).finally(()=>{pending.delete(done);});void done.catch(()=>{});pending.add(done);frame=(frame+1)%c.durationInFrames;rendered++;
   if(options.frames!==undefined&&rendered>=options.frames)break;
   if(active!==renderer){rendered=0;start=performance.now();}
  }await Promise.all(pending);
 })();void playback.then(()=>{if(options.frames!==undefined)void close();},e=>{if(!stopped&&(e as any).code!=='E_NATIVE_CLOSED'){error=diagnostic(e);writeCLIResult(error,{stream:'stderr',pretty:false});}void close();});}
 return {url:`native://frameweave/${encodeURIComponent(entry)}`,ready,closed,close,state,async render(frame:number){if(!renderer)throw new EngineError('E_NATIVE_CLOSED','Preview is closed');if(controls){await controls.seek(frame);return {frame,stats:await renderer!.nativeStats()};}const active=renderer,ticket=await active.submitNativeFrame(frame);await ticket.completed;return {frame,stats:await active.nativeStats()};}};
}
export async function previewCLI(args:string[]){
 const [entry,...rest]=args,options:PreviewOptions={};if(!entry)throw new EngineError('E_ARGUMENT','Native preview requires a project');
 for(let i=0;i<rest.length;i++){const a=rest[i];if(a==='--no-open'){options.open=false;continue;}if(a==='--allow-ray-query'){options.allowRayQuery=true;continue;}if(a==='--allow-wasm'){options.allowWasm=true;continue;}if(a==='--no-watch'){options.watch=false;continue;}if(a==='--direct')continue;if(a==='--adaptive'){options.quality={...options.quality,mode:'adaptive',allowApproximation:true};continue;}
  if(a==='--quality-scale'){const resolutionScale=Number(rest[++i]);if(!Number.isFinite(resolutionScale)||resolutionScale<=0||resolutionScale>1)throw new EngineError('E_ARGUMENT','--quality-scale requires a value in (0, 1]');options.quality={...options.quality,resolutionScale,allowApproximation:true};continue;}
  if(!['--width','--timeout','--native','--frames','--memory-mib','--max-concurrency','--checkpoint-interval','--checkpoint-mib'].includes(a)||!rest[i+1])throw new EngineError('E_ARGUMENT',`Invalid native preview option ${a}`);const v=rest[++i];if(a==='--native')options.nativeExecutable=v;else{const n=Number(v);if(!Number.isSafeInteger(n)||n<(a==='--checkpoint-mib'?0:1))throw new EngineError('E_ARGUMENT',a==='--checkpoint-mib'?'--checkpoint-mib requires a nonnegative integer':`${a} requires a positive integer`);if(a==='--checkpoint-interval')options.checkpointInterval=n;else if(a==='--max-concurrency')options.maxConcurrency=n;else if(a==='--width')options.width=n;else if(a==='--frames')options.frames=n;else if(a==='--memory-mib'||a==='--checkpoint-mib'){const bytes=n*1024**2;if(!Number.isSafeInteger(bytes))throw new EngineError('E_ARGUMENT',a+' exceeds safe byte range');if(a==='--memory-mib')options.maxBytes=bytes;else options.checkpointBytes=bytes;}else options.timeoutMs=n;}}
 const progress=createCLIProgress();options.onProgress=progress.update;let preview;try{preview=await startPreview(entry,options);}catch(e){progress.close();throw e;}progress.close();const stop=()=>{void preview.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);writeCLIResult({schemaVersion:1,preview:preview.url,entry:resolve(entry),...preview.state()});try{await preview.closed;}finally{process.off('SIGINT',stop);process.off('SIGTERM',stop);}
}
