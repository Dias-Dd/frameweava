import type {CreationColor,StaticCreationColor} from './colors.ts';
import {creationColor} from './colors.ts';
import type {Signal,Transform} from '../../src/core/types.ts';
import {linear709} from '../../src/media/surface.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import {createUtilityFilters} from '../gpu-image-effects/resident/foundations/utility.ts';
import type {CreationInit,CreationOptions,CreationStage,AnimatedVec3,CreationImageResource} from './types.ts';
import {creationStage,validateCreation,scalar,vector,requireInput,fail} from './lifecycle.ts';
import {assetOptions} from './physics-assets.ts';
import {children,childImage,imageCheck,constantImage,publishImage,interpolateImages,placement,textureQuad,type ChildOwnership,type CreationSource} from './composition-core.ts';
export type {ChildOwnership,CreationSource};
export interface CompositionOptions extends CreationOptions {/** Owned children are also closed when another child constructor fails. */ownership?:ChildOwnership}
const format=(o:CreationOptions)=>o.format??'rgba32float';
function snapshot<T extends CreationOptions>(o:T){const {post,signal,...data}=o;try{return {data:structuredClone(data),post,signal};}catch{fail('Creator options require static data/Core Signals');}}
function signalCopy(value:Signal<number>){try{return structuredClone(value);}catch{fail('Use a static number or Core Signal');}}
export async function stackCreations(init:CreationInit,objects:readonly CreationSource[],o:CompositionOptions={}){
 validateCreation(init,o,['ownership']);const {data,post,signal}=snapshot(o),f=format(data),fx=createGpuPixelEffects(init.gpu);
 return withGpuResources(init.gpu,async construction=>{const owner=construction.adopt(await children(objects,data.ownership),s=>s.dispose());const stage=creationStage(init,{...data,post,signal},async(c,inputs,props={})=>withGpuResources(init.gpu,async a=>{
  let current:Awaited<ReturnType<typeof constantImage>>|undefined;
  for(const [index,child]of owner.items.entries()){
   if(signal?.aborted)fail('Creator stack cancelled','E_RENDER_CANCELLED');
   const image=a.image(await childImage(child,index,init,c,inputs,props));imageCheck(image,init);
   if(!current){current=image;continue;}
   const next=a.image(await fx.over(image,current,{format:f,signal}));
   await init.gpu.release(a.keep(image));await init.gpu.release(a.keep(current));current=next;
  }
  current??=a.image(await constantImage(init,[0,0,0,0],f,signal));
  if(current.info.format!==f){const converted=a.image(await publishImage(init,current,f,signal));await init.gpu.release(a.keep(current));current=converted;}
  return a.keep(current);
 }),()=>owner.dispose(),()=>({kind:'creator-stack',children:owner.items.length,order:'authored sequential; exact same FrameContext; no Session queue',ownership:data.ownership??'owned',release:'streaming logical release after last recorded use; not a GPU fence'}));construction.keep(owner);return stage;});
}
export async function crossfadeCreations(init:CreationInit,from:CreationSource,to:CreationSource,amount:Signal<number>,o:CompositionOptions={}){
 validateCreation(init,o,['ownership']);const {data,post,signal}=snapshot(o),f=format(data),value=signalCopy(amount);
 return withGpuResources(init.gpu,async construction=>{const owner=construction.adopt(await children([from,to],data.ownership),s=>s.dispose());const stage=creationStage(init,{...data,post,signal},async(c,inputs,props={})=>withGpuResources(init.gpu,async a=>{const t=scalar(value,c,'crossfade',0,1),first=a.image(await childImage(owner.items[0],0,init,c,inputs,props));imageCheck(first,init);const second=a.image(await childImage(owner.items[1],1,init,c,inputs,props));imageCheck(second,init);return a.keep(a.image(await interpolateImages(init,first,second,t,f,signal)));}),()=>owner.dispose(),()=>({kind:'creator-crossfade',ownership:data.ownership??'owned',evaluation:'both creators at every request, including endpoints'}));construction.keep(owner);return stage;});
}
export async function fadeCreation(init:CreationInit,object:CreationSource,opacity:Signal<number>,o:CompositionOptions={}){
 validateCreation(init,o,['ownership']);const {data,post,signal}=snapshot(o),f=format(data),value=signalCopy(opacity);
 return withGpuResources(init.gpu,async construction=>{const owner=construction.adopt(await children([object],data.ownership),s=>s.dispose());const stage=creationStage(init,{...data,post,signal},async(c,inputs,props={})=>withGpuResources(init.gpu,async a=>{const alpha=scalar(value,c,'opacity',0,1),image=a.image(await childImage(owner.items[0],0,init,c,inputs,props));imageCheck(image,init);if(alpha===1&&image.info.format===f)return a.keep(image);const clear=a.image(await constantImage(init,[0,0,0,0],f,signal));return a.keep(a.image(await interpolateImages(init,clear,image,alpha,f,signal)));}),()=>owner.dispose(),()=>({kind:'creator-fade',ownership:data.ownership??'owned',evaluation:'child still runs at opacity0; PM RGB and Alpha scale together'}));construction.keep(owner);return stage;});
}
export interface PlaceCreationOptions extends CompositionOptions,Transform {sampling?:'nearest'|'linear'}
const transformKeys=['x','y','scale','scaleX','scaleY','rotation','opacity','originX','originY','sampling'];
export async function placeCreation(init:CreationInit,object:CreationSource,o:PlaceCreationOptions={}){
 validateCreation(init,o,['ownership',...transformKeys]);if(o.sampling!==undefined&&!['linear','nearest'].includes(o.sampling))fail('Unknown creator sampling');const {data,post,signal}=snapshot(o),f=format(data);
 return withGpuResources(init.gpu,async construction=>{const owner=construction.adopt(await children([object],data.ownership),s=>s.dispose()),quad=construction.adopt(await textureQuad(init),q=>q.dispose());const stage=creationStage(init,{...data,post,signal},async(c,inputs,props={})=>withGpuResources(init.gpu,async a=>{
  const image=a.image(await childImage(owner.items[0],0,init,c,inputs,props));imageCheck(image,init);const t=placement(data,c,init.width,init.height);
  if(t.identity&&t.opacity===1&&image.info.format===f)return a.keep(image);
  if(t.collapsed||t.opacity===0)return a.keep(a.image(await constantImage(init,[0,0,0,0],f,signal)));
  const moved=a.image(await quad.render(image,t,'stretch',f,data.sampling??'linear',signal));if(t.opacity===1)return a.keep(moved);
  const clear=a.image(await constantImage(init,[0,0,0,0],f,signal));return a.keep(a.image(await interpolateImages(init,clear,moved,t.opacity,f,signal)));
 }),async()=>{const r=await Promise.allSettled([owner.dispose(),quad.dispose()]);const e=r.filter((x):x is PromiseRejectedResult=>x.status==='rejected');if(e.length)throw new AggregateError(e.map(x=>x.reason),'Placed creator cleanup failed');},()=>({kind:'creator-placement',ownership:data.ownership??'owned',transform:'original Core Transform/matrix; pixels/degrees; center anchor default',sampling:data.sampling??'linear'}));construction.keep(owner);construction.keep(quad);return stage;});
}
export interface ImageCreationOptions extends CreationOptions,Transform {image:string|CreationImageResource;fit?:'contain'|'cover'|'stretch';sampling?:'linear'|'nearest'}
export async function imageCreation(init:CreationInit,o:ImageCreationOptions){
 validateCreation(init,o,['image','fit',...transformKeys]);if(o.fit!==undefined&&!['contain','cover','stretch'].includes(o.fit)||o.sampling!==undefined&&!['nearest','linear'].includes(o.sampling))fail('Unknown creator image fit/sampling');
 if(typeof o.image==='string'){if(!o.image)fail('Image input name required');}else{assetOptions(o.image,['resource','size','decode','missingProfile'],'creator image resource');if(!o.image.resource||!Array.isArray(o.image.size)||o.image.size.length!==2||o.image.size.some(n=>!Number.isSafeInteger(n)||n<1))fail('Declared image resource and positive dimensions required');if(o.image.decode!==undefined&&!['surface-v2','icc-sdr'].includes(o.image.decode)||o.image.missingProfile!==undefined&&!['error','assume-srgb'].includes(o.image.missingProfile))fail('Unknown image decoding policy');}
 const {data,post,signal}=snapshot(o),f=format(o),quad=await textureQuad(init);
 try{return creationStage(init,{...data,post,signal},async(c,inputs)=>withGpuResources(init.gpu,async a=>{
  const source=typeof data.image==='string'?requireInput(inputs,data.image):a.image(await init.gpu.importResource({version:1,id:data.image.resource,decode:data.image.decode??'icc-sdr',missingProfile:data.image.missingProfile??'error',output:{width:data.image.size[0],height:data.image.size[1],format:f,alpha:'premultiplied',color:linear709}},{signal}));imageCheck(source,init,false,true);
  const t=placement(data,c,init.width,init.height);if(t.collapsed||t.opacity===0)return a.keep(a.image(await constantImage(init,[0,0,0,0],f,signal)));
  const input=source.info.alpha==='straight'?a.image(await publishImage(init,source,f,signal)):source;
  const image=a.image(await quad.render(input,t,data.fit??'contain',f,data.sampling??'linear',signal));if(t.opacity===1)return a.keep(image);
  const clear=a.image(await constantImage(init,[0,0,0,0],f,signal));return a.keep(a.image(await interpolateImages(init,clear,image,t.opacity,f,signal)));
 }),()=>quad.dispose(),()=>({kind:'image-creation',source:typeof data.image==='string'?'borrowed input':'owned declared resource',fit:data.fit??'contain',sampling:data.sampling??'linear'}));}catch(error){await quad.dispose();throw error;}
}
export interface SolidBackgroundOptions extends CreationOptions {color?:CreationColor;opacity?:Signal<number>}
export function solidBackground(init:CreationInit,o:SolidBackgroundOptions={}){
 validateCreation(init,o,['color','opacity']);const {data,post,signal}=snapshot(o);return creationStage(init,{...data,post,signal},async c=>constantImage(init,[...creationColor(data.color??[.006,.012,.025],c,'background color'),scalar(data.opacity??1,c,'background opacity',0,1)],format(data),signal),()=>{},()=>({kind:'solid-background',color:'scene-linear Rec709; RGB premultiplied on GPU'}));
}
export interface GradientBackgroundOptions extends CreationOptions {center?:CreationColor;edge?:CreationColor;start?:readonly [Signal<number>,Signal<number>];end?:readonly [Signal<number>,Signal<number>];kind?:'radial'|'linear'}
export function gradientBackground(init:CreationInit,o:GradientBackgroundOptions={}){
 validateCreation(init,o,['center','edge','start','end','kind']);if(o.kind!==undefined&&!['radial','linear'].includes(o.kind))fail('Unknown creator gradient');const {data,post,signal}=snapshot(o),f=format(data);
 return creationStage(init,{...data,post,signal},async c=>withGpuResources(init.gpu,async a=>{const extent=a.image(await constantImage(init,[0,0,0,1],f,signal)),fx=createUtilityFilters(init.gpu,c),options={format:f,signal,start:data.start??[init.width*.48,init.height*.43] as const,end:data.end??[init.width*.98,init.height*.9] as const,colorA:creationColor(data.center??[.022,.048,.085],c,'gradient center'),colorB:creationColor(data.edge??[.0015,.003,.009],c,'gradient edge')};return a.keep(a.image(await(data.kind==='linear'?fx.linearGradient(extent,options):fx.radialGradient(extent,options))));}),()=>{},()=>({kind:'gradient-background',operator:'original GPU utility gradient; opaque scene-linear'}));
}
