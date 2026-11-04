import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import type {CreationInit,CreationOptions} from './types.ts';
import {creationStage,validateCreation,fail} from './lifecycle.ts';
import {children,childImage,imageCheck,constantImage,publishImage,interpolateImages,placement,textureQuad,type CreationSource,type ChildOwnership} from './composition-core.ts';
import {stackCreations} from './composition.ts';
import {assetNumber} from './physics-assets.ts';
import {prepareMotion,sampleMotion,motionPhaseFields,motionIdleFields,type MotionRecipe,type CreationPhase,type PhaseTiming,type SlideControls,type PopControls,type SpinControls,type SpringControls,type CreationIdle,type FloatControls,type PulseControls,type SwingControls} from './motion-recipes.ts';
export type {MotionRecipe,CreationPhase,CreationIdle,MotionDirection,PhaseTiming,SlideControls,PopControls,SpinControls,SpringControls,FloatControls,PulseControls,SwingControls} from './motion-recipes.ts';
export interface CreationMotionOptions extends CreationOptions {ownership?:ChildOwnership;sampling?:'linear'|'nearest'}
export interface AnimateCreationOptions extends CreationMotionOptions,MotionRecipe {}
export type FadeCreationMotionOptions=CreationMotionOptions&PhaseTiming;
export type SlideCreationMotionOptions=FadeCreationMotionOptions&SlideControls;
export type PopCreationMotionOptions=FadeCreationMotionOptions&PopControls;
export type SpinCreationMotionOptions=FadeCreationMotionOptions&SpinControls;
export type SpringCreationMotionOptions=FadeCreationMotionOptions&SpringControls;
export type FloatCreationOptions=CreationMotionOptions&FloatControls;
export type PulseCreationOptions=CreationMotionOptions&PulseControls;
export type SwingCreationOptions=CreationMotionOptions&SwingControls;
const common=['ownership','sampling'];
function mode(o:CreationMotionOptions){if(o.sampling!==undefined&&!['linear','nearest'].includes(o.sampling))fail('Unknown motion sampling');if(o.ownership!==undefined&&!['owned','borrowed'].includes(o.ownership))fail('Expected owned or borrowed motion source policy');}
/** Spatial image animation, over the existing Core curves/Native textured quad.
 * Child FrameContext is unchanged, even when invisible. One reusable quad and
 * one image resampling boundary for combined entrance/exit/idle controls. */
export async function animateCreation(init:CreationInit,source:CreationSource,options:AnimateCreationOptions={}){
 validateCreation(init,options,[...common,'enter','exit','idle']);mode(options);
 const recipe=prepareMotion(options),{post,signal,...raw}=options;let o:typeof raw;try{o=structuredClone(raw);}catch{fail('Creation motion requires serializable Core Signals');}const format=o.format??'rgba32float';
 return withGpuResources(init.gpu,async construction=>{
  const owner=construction.adopt(await children([source],o.ownership),s=>s.dispose()),quad=construction.adopt(await textureQuad(init),q=>q.dispose());
  const stage=creationStage(init,{...o,post,signal},async(c,inputs,props)=>withGpuResources(init.gpu,async a=>{
   const sampled=sampleMotion(recipe,c,init.width,init.height),image=a.image(await childImage(owner.items[0],0,init,c,inputs,props));imageCheck(image,init);const transform=placement(sampled,c,init.width,init.height);
   if(transform.identity&&transform.opacity===1)return image.info.format===format?a.keep(image):a.keep(a.image(await publishImage(init,image,format,signal)));
   if(transform.collapsed||transform.opacity===0)return a.keep(a.image(await constantImage(init,[0,0,0,0],format,signal)));
   const moved=a.image(await quad.render(image,transform,'stretch',format,o.sampling??'linear',signal));if(transform.opacity===1)return a.keep(moved);
   const clear=a.image(await constantImage(init,[0,0,0,0],format,signal));return a.keep(a.image(await interpolateImages(init,clear,moved,transform.opacity,format,signal)));
  }),async()=>{const r=await Promise.allSettled([owner.dispose(),quad.dispose()]),errors=r.filter((v):v is PromiseRejectedResult=>v.status==='rejected');if(errors.length)throw new AggregateError(errors.map(v=>v.reason),'Motion cleanup failed');},()=>({kind:'creator-motion',recipe:structuredClone(recipe),ownership:o.ownership??'owned',time:'same child FrameContext; local frame for phases; actual FPS for Core spring; local seconds for idle',sampling:o.sampling??'linear',completion:'recorded-only; existing Session owns queue completion and recycling'}));
  construction.keep(owner);construction.keep(quad);return stage;
 });
}
function phase(init:CreationInit,source:CreationSource,o:FadeCreationMotionOptions,kind:CreationPhase['kind'],exit=false){
 const fields=motionPhaseFields(kind);validateCreation(init,o,[...common,...fields]);const {format,finish,post,signal,ownership,sampling,...params}=o;
 return animateCreation(init,source,{format,finish,post,signal,ownership,sampling,enter:exit?false:{kind,...params} as CreationPhase,exit:exit?{kind,...params} as CreationPhase:false});
}
function idle(init:CreationInit,source:CreationSource,o:CreationMotionOptions,kind:CreationIdle['kind']){
 validateCreation(init,o,[...common,...motionIdleFields(kind)]);const {format,finish,post,signal,ownership,sampling,...params}=o;return animateCreation(init,source,{format,finish,post,signal,ownership,sampling,enter:false,idle:{kind,...params} as CreationIdle});
}
export function fadeInCreation(init:CreationInit,s:CreationSource,o:FadeCreationMotionOptions={}){return phase(init,s,o,'fade');}
export function fadeOutCreation(init:CreationInit,s:CreationSource,o:FadeCreationMotionOptions={}){return phase(init,s,o,'fade',true);}
export function slideInCreation(init:CreationInit,s:CreationSource,o:SlideCreationMotionOptions={}){return phase(init,s,o,'slide');}
export function slideOutCreation(init:CreationInit,s:CreationSource,o:SlideCreationMotionOptions={}){return phase(init,s,o,'slide',true);}
export function popInCreation(init:CreationInit,s:CreationSource,o:PopCreationMotionOptions={}){return phase(init,s,o,'pop');}
export function popOutCreation(init:CreationInit,s:CreationSource,o:PopCreationMotionOptions={}){return phase(init,s,o,'pop',true);}
export function spinInCreation(init:CreationInit,s:CreationSource,o:SpinCreationMotionOptions={}){return phase(init,s,o,'spin');}
export function spinOutCreation(init:CreationInit,s:CreationSource,o:SpinCreationMotionOptions={}){return phase(init,s,o,'spin',true);}
export function springInCreation(init:CreationInit,s:CreationSource,o:SpringCreationMotionOptions={}){return phase(init,s,o,'spring');}
export function floatCreation(init:CreationInit,s:CreationSource,o:FloatCreationOptions={}){return idle(init,s,o,'float');}
export function pulseCreation(init:CreationInit,s:CreationSource,o:PulseCreationOptions={}){return idle(init,s,o,'pulse');}
export function swingCreation(init:CreationInit,s:CreationSource,o:SwingCreationOptions={}){return idle(init,s,o,'swing');}
export interface StaggerCreationsOptions extends CreationMotionOptions {interval?:number;reverse?:boolean;enter?:CreationPhase}
/** Delay only the image animation, never the children's simulation time or
 * authored draw order. Uses existing stack/ownership; no new timeline/queue. */
export function staggerCreations(init:CreationInit,sources:readonly CreationSource[],o:StaggerCreationsOptions={}){
 validateCreation(init,o,[...common,'interval','reverse','enter']);mode(o);if(!Array.isArray(sources))fail('Expected an array of creator sources');const interval=assetNumber(o.interval??3,'stagger interval (frames)',0);if(o.reverse!==undefined&&typeof o.reverse!=='boolean')fail('reverse must be boolean');
 const enter=prepareMotion({enter:o.enter===undefined?{kind:'pop'}:o.enter}).enter;if(!enter)fail('Stagger requires an entrance phase');const last=(enter.at??0)+Math.max(0,sources.length-1)*interval;if(!Number.isFinite(last)||sources.length>1&&interval>0&&last===(enter.at??0))fail('Stagger frame positions must be finite and distinct');
 const objects=sources.map((source,index)=>animateCreation(init,source,{format:o.format,signal:o.signal,ownership:o.ownership,sampling:o.sampling,enter:{...enter,at:(enter.at??0)+(o.reverse?sources.length-1-index:index)*interval}}));
 return stackCreations(init,objects,{format:o.format,finish:o.finish,post:o.post,signal:o.signal,ownership:'owned'});
}
