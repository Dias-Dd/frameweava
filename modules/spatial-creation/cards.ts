import type {Signal} from '../../src/core/types.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import type {CreationInit,CreationOptions} from './types.ts';
import type {CreationColor} from './colors.ts';import {creationColor} from './colors.ts';
import {creationStage,validateCreation,scalar,fail} from './lifecycle.ts';
import {children,childImage,imageCheck,constantImage,placement,textureQuad,type CreationSource,type ChildOwnership} from './composition-core.ts';
import {fitLayoutBox} from './layout-recipes.ts';
import {shadowCreation,type ShadowCreationOptions} from './creator-effects.ts';
import {assetOptions} from './physics-assets.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
import {arrangeCreations,prepareArrangement,layoutControlKeys,type ArrangeCreationOptions} from './layout.ts';
export interface FrameCreationOptions extends CreationOptions {ownership?:ChildOwnership;size?:readonly [Signal<number>,Signal<number>];padding?:Signal<number>;color?:CreationColor;frameOpacity?:Signal<number>;fit?:'contain'|'stretch';sampling?:'linear'|'nearest'}
export interface CardCreationOptions extends FrameCreationOptions {shadow?:false|Omit<ShadowCreationOptions,'format'|'finish'|'post'|'signal'|'ownership'|'includeSource'>}
const frameKeys=['ownership','size','padding','color','frameOpacity','fit','sampling'];
function checkFrame(init:CreationInit,o:FrameCreationOptions,extra:readonly string[]=[]){validateCreation(init,o,[...frameKeys,...extra]);if(o.size!==undefined&&(!Array.isArray(o.size)||o.size.length!==2))fail('Frame size requires two scalar Signals');if(o.ownership!==undefined&&!['owned','borrowed'].includes(o.ownership))fail('Expected owned/borrowed frame ownership');if(o.fit!==undefined&&!['contain','stretch'].includes(o.fit)||o.sampling!==undefined&&!['nearest','linear'].includes(o.sampling))fail('Unknown frame fit/sampling');}
function checkCard(init:CreationInit,o:CardCreationOptions){checkFrame(init,o,['shadow']);if(o.shadow!==undefined&&o.shadow!==false)assetOptions(o.shadow,['radius','offset','color','opacity','maxBufferBytes'],'card shadow');}
/** Rectangular frame only, not an inferred Alpha contour or rounded rectangle.
 * Source dimensions may differ, but ownership/color/Alpha remain admitted. */
export async function frameCreation(init:CreationInit,source:CreationSource,options:FrameCreationOptions={}){
 checkFrame(init,options);const {post,signal,...raw}=options;let o:typeof raw;try{o=structuredClone(raw);}catch{fail('Frame parameters require serializable Core Signals');}const gpu=init.gpu,format=o.format??'rgba32float',fx=createGpuPixelEffects(gpu);
 return withGpuResources(gpu,async construction=>{const owner=construction.adopt(await children([source],o.ownership),x=>x.dispose()),quad=construction.adopt(await textureQuad(init),x=>x.dispose());
  const stage=creationStage(init,{...o,post,signal},async(c,inputs,props)=>withGpuResources(gpu,async a=>{
   const width=scalar(o.size?.[0]??init.width*.9,c,'frame width',Number.MIN_VALUE),height=scalar(o.size?.[1]??init.height*.9,c,'frame height',Number.MIN_VALUE),padding=scalar(o.padding??Math.min(12,Math.min(init.width,init.height)*.035),c,'frame padding',0),opacity=scalar(o.frameOpacity??1,c,'frame opacity',0,1),color=creationColor(o.color??'#f8f3e9',c,'frame color');if(2*padding>=Math.min(width,height))fail('Frame padding consumes its interior');
   const image=a.image(await childImage(owner.items[0],0,init,c,inputs,props));imageCheck(image,init,false);
   const solid=a.image(await constantImage(init,[...color,opacity],format,signal)),back=a.image(await quad.render(solid,placement({scaleX:width/init.width,scaleY:height/init.height},c,init.width,init.height),'stretch',format,o.sampling??'linear',signal));
   const target=fitLayoutBox({x:0,y:0,width:width-2*padding,height:height-2*padding,rotation:0,opacity:1},image.info.width,image.info.height,init.width,init.height,o.fit??'contain'),front=a.image(await quad.render(image,placement(target,c,init.width,init.height),'stretch',format,o.sampling??'linear',signal));
   return a.keep(a.image(await fx.over(front,back,{format,signal})));
  }),async()=>{const r=await Promise.allSettled([owner.dispose(),quad.dispose()]),errors=r.filter((x):x is PromiseRejectedResult=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'Frame cleanup failed');},()=>({kind:'creator-frame',shape:'rectangle; full source canvas fit; no Alpha scan/crop',ownership:o.ownership??'owned',completion:'recorded-only; Session owns completion/recycling'}));construction.keep(owner);construction.keep(quad);return stage;
 });
}
export function cardCreation(init:CreationInit,source:CreationSource,options:CardCreationOptions={}){
 checkCard(init,options);const {shadow,finish,post,signal,...raw}=options;let o:typeof raw,shade:typeof shadow;try{o=structuredClone(raw);shade=structuredClone(shadow);}catch{fail('Card parameters require serializable Core Signals');}
 const frame={...o,size:o.size??[init.width*.82,init.height*.82] as const,padding:o.padding??Math.min(10,Math.min(init.width,init.height)*.03),signal};
 if(shade===false)return frameCreation(init,source,{...frame,finish,post});
 return shadowCreation(init,frameCreation(init,source,frame),{radius:4,offset:[0,5],opacity:.35,...shade,format:o.format,finish,post,signal,ownership:'owned'});
}
export type GalleryCardControls=Omit<CardCreationOptions,'format'|'finish'|'post'|'signal'|'ownership'>;
export interface CreationGalleryOptions extends ArrangeCreationOptions {cards?:false|GalleryCardControls;background?:false|Omit<GradientBackgroundOptions,'format'|'finish'|'post'|'signal'>}
/** Ordinary async composition of existing creators and original Native Over.
 * Original sources use the chosen policy; newly made wrappers are owned. */
export async function creationGallery(init:CreationInit,sources:readonly CreationSource[],options:CreationGalleryOptions={}){
 validateCreation(init,options,[...layoutControlKeys,'layout','cards','background']);if(options.cards!==undefined&&options.cards!==false){assetOptions(options.cards,['size','padding','color','frameOpacity','fit','sampling','shadow'],'gallery cards');checkCard(init,options.cards);}if(options.background!==undefined&&options.background!==false)assetOptions(options.background,['center','edge','start','end','kind'],'gallery background');
 const {post,signal,...raw}=options;let o:typeof raw;try{o=structuredClone(raw);}catch{fail('Gallery parameters require serializable Core Signals');}const {cards,background,finish,...arrangement}=o;prepareArrangement(init,sources,arrangement);
 const parts=[];try{const originals=cards===false?sources:sources.map(s=>cardCreation(init,s,{...cards,format:o.format,signal,ownership:o.ownership}));
  parts.push(await arrangeCreations(init,originals,{gap:Math.min(16,Math.min(init.width,init.height)*.045),padding:Math.min(20,Math.min(init.width,init.height)*.06),...arrangement,signal,ownership:cards===false?o.ownership:'owned'}));
  if(background!==false)parts.unshift(gradientBackground(init,{center:'#24364c',edge:'#040a16',...background,format:o.format,signal}));
  return await stackCreations(init,parts,{format:o.format,finish:finish??{vignette:.12},post,signal,ownership:'owned'});
 }catch(e){await Promise.allSettled(parts.map(p=>p.dispose?.()));throw e;}
}
