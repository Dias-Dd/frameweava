import type {NativeStageInit,NativeStageInstance} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {FrameContext} from '../../src/core/types.ts';
import {linear709} from '../../src/media/surface.ts';
import {EngineError} from '../../src/core/errors.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import {constantImage,interpolateImages,placement,textureQuad,imageCheck,publishImage} from '../spatial-creation/composition-core.ts';
import type {EditPlan} from './types.ts';
import {validatePlan,editError,editInteger} from './authoring.ts';
import {activeTracks,sourcePosition} from './sampling.ts';
import {createEditTextPainter} from './text-runtime.ts';
import {createEditEffectProcessor} from './effects-runtime.ts';
import {crossDissolve,fadeThroughColor,directionalWipe,irisWipe,pushTransition} from '../creation-capabilities/transitions.ts';
import type {PlacedClip} from './types.ts';
const transitionFunctions={crossDissolve,fadeThroughColor,directionalWipe,irisWipe,pushTransition};
export interface EditingStage extends NativeStageInstance<Record<string,GpuPixelImage>,Record<string,unknown>>{inspect():Record<string,unknown>}
/** Borrow the admitted scope. Every returned image is caller-owned; imports/temporaries are released
 * after their last recorded use. Scope/Session retains GPU completion and device-loss ownership. */
export async function createEditingStage(init:NativeStageInit,options:{signal?:AbortSignal;plan?:EditPlan}={}):Promise<EditingStage>{
 const g=init.gpu,caps=g.capabilities();
 if(caps.backend!=='native-wgpu'||caps.hardwareVerified!==true)throw new EngineError('E_EDIT_GPU','An admitted Native GPU scope is required');
 editInteger(init.width,'Stage width',1);editInteger(init.height,'Stage height',1);
 let plan=options.plan===undefined?undefined:validatePlan(options.plan);
 const resourceCheck=(value:EditPlan)=>{for(const track of value.tracks)for(const p of track)if(p.clip.asset.kind!=='text'&&!Object.hasOwn(init.resources,p.clip.asset.id))throw new EngineError('E_EDIT_RESOURCE','Editing asset is not a declared Resource',{details:{id:p.clip.asset.id}});};
 if(plan)resourceCheck(plan);
 const quad=await textureQuad(init),fx=createGpuPixelEffects(g);
 let textPainter:Awaited<ReturnType<typeof createEditTextPainter>>|undefined;
 try{if(plan?.tracks.some(t=>t.some(p=>p.clip.asset.kind==='text')))textPainter=await createEditTextPainter(init,plan);}catch(e){await quad.dispose();throw e;}
 const processor=createEditEffectProcessor(init);
 let signature:string|undefined,closed=false,closing:Promise<void>|undefined,pending:Promise<GpuPixelImage>|undefined,frames=0,imports=0;
 const checkCancel=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Edit cancelled');};
 const record=async(c:FrameContext,props:Record<string,unknown>)=>{
  checkCancel();if(options.plan!==undefined&&props?.edit!==undefined)throw new EngineError('E_EDIT_PLAN_CHANGED','A resident edit cannot be overridden with frame props; reopen the project');
  const incoming=typeof props?.edit==='string'?props.edit:JSON.stringify(props?.edit);
  if(!plan){let parsed:EditPlan;try{parsed=JSON.parse(incoming!) as EditPlan;}catch{editError('Expected an editing plan or its serialized JSON');}const candidate=validatePlan(parsed!);
   resourceCheck(candidate);if(candidate.tracks.some(t=>t.some(p=>p.clip.asset.kind==='text')))throw new EngineError('E_EDIT_TEXT_INIT','Text geometry must be prepared during Stage initialization; use editingStage() or createEditingStage(init,{plan})');
   plan=candidate;signature=incoming;
  }else if(options.plan===undefined&&signature!==incoming)throw new EngineError('E_EDIT_PLAN_CHANGED','Edit plan changed inside a Session; reopen the project');
  if(c.fps.num!==plan.fps.num||c.fps.den!==plan.fps.den)editError('Stage and edit frame rates must agree');
  const sampled=activeTracks(plan,c.frame),enhanced=!!plan.effects?.length||plan.tracks.some(t=>t.some(p=>p.transition||p.clip.effects?.length)),f=enhanced?'rgba32float':plan.format,signal=options.signal;
  const result=await withGpuResources(g,async a=>{
   const drop=(image:GpuPixelImage)=>g.release(a.keep(image));
   const renderClip=async(placed:PlacedClip)=>{checkCancel();const cl=placed.clip,asset=cl.asset,t=placement(cl.transform,c,init.width,init.height);
    if(t.collapsed||t.opacity===0)return a.image(await constantImage(init,[0,0,0,0],f,signal));
    const output={width:asset.width,height:asset.height,format:f,alpha:asset.kind==='video'?'opaque' as const:asset.kind==='text'?'premultiplied' as const:asset.alpha,color:linear709};
    const source=a.image(asset.kind==='text'?await textPainter!.draw(asset,c):await g.importResource(asset.kind==='video'?{
     version:1,id:asset.id,decode:'video',decoder:asset.decoder,position:sourcePosition(placed,c.frame,plan!.fps,c),boundary:'error',interpretation:asset.interpretation,metadataPolicy:asset.metadataPolicy,output,...asset.cacheBytes===undefined?{}:{cacheBytes:asset.cacheBytes}
    }:{version:1,id:asset.id,decode:asset.decode,missingProfile:asset.missingProfile,output},{signal}));if(asset.kind!=='text')imports++;imageCheck(source,init,false,true);
    const ready=source.info.alpha==='straight'?a.image(await publishImage(init,source,f,signal)):source;
    let foreground=a.image(await quad.render(ready,t,cl.fit,f,cl.sampling,signal));await g.release(a.keep(ready));if(ready!==source)await g.release(a.keep(source));
    if(cl.effects?.length){const processed=a.image(await processor.apply(foreground,cl.effects,c,signal));await drop(foreground);foreground=processed;}
    if(t.opacity!==1){const clear=a.image(await constantImage(init,[0,0,0,0],f,signal)),scaled=a.image(await interpolateImages(init,clear,foreground,t.opacity,f,signal));await g.release(a.keep(clear));await g.release(a.keep(foreground));foreground=scaled;}
    return foreground;
   };
   let current=a.image(await constantImage(init,plan!.background,f,signal));
   // One or two explicitly selected clips per track. No source is synthesized or auto-run.
   for(const sample of sampled){let foreground=await renderClip(sample.clips[0]);
    if(sample.transition){const incoming=await renderClip(sample.clips[1]),t=sample.transition;
     const method=transitionFunctions[t.name] as typeof crossDissolve;
     const merged=a.image(await method(g,foreground,incoming,{...t.options,progress:t.options.progress??sample.progress,format:f,signal},c));await drop(foreground);await drop(incoming);foreground=merged;
    }
    const next=a.image(await fx.over(foreground,current,{format:f,signal}));await drop(foreground);await drop(current);current=next;
   }
   if(plan!.effects?.length){const processed=a.image(await processor.apply(current,plan!.effects,c,signal));await drop(current);current=processed;}
   if(current.info.format!==plan!.format){const published=a.image(await publishImage(init,current,plan!.format,signal));await drop(current);current=published;}
   checkCancel();return a.keep(current);
  });frames++;return result;
 };
 return {renderAt(c,_inputs,props){
  if(closed)return Promise.reject(new EngineError('E_EDIT_CLOSED','Editing Stage is disposed'));
  if(pending)return Promise.reject(new EngineError('E_EDIT_BUSY','Await the previous recording before reusing this Stage'));
  const task=record(c,props);pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pending?.catch(()=>{});const settled=await Promise.allSettled([quad.dispose(),textPainter?.dispose(),processor.dispose()]),errors=settled.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new EngineError('E_EDIT_CLEANUP','Edit cleanup failed: '+errors.map(r=>String(r.reason)).join('; '),{details:{causes:errors.map(r=>String(r.reason))}});})();},inspect:()=>({closed,frames,imports,format:plan?.format,tracks:plan?.tracks.length,residentPlan:options.plan!==undefined,textPainterStarted:!!textPainter,effects:processor.stats(),completion:'recorded-only',decode:'existing sealed Native Resource service',ownership:'scope borrowed; returned image owned; temporaries logically released; owner controls queue retirement'})};
}
