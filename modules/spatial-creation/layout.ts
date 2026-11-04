import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {CreationInit,CreationOptions} from './types.ts';
import {creationStage,validateCreation,fail} from './lifecycle.ts';
import {children,childImage,imageCheck,constantImage,placement,textureQuad,interpolateImages,type CreationSource,type ChildOwnership} from './composition-core.ts';
import {prepareLayout,checkLayoutControls,sampleLayout,fitLayoutBox,layoutFields,type CreationLayout,type LayoutControls} from './layout-recipes.ts';
export type {CreationLayout,LayoutControls,LayoutOrientation,GridLayout,RadialLayout,ArcLayout,SpiralLayout,ScatterLayout,CascadeLayout,FanLayout} from './layout-recipes.ts';
export interface ArrangeCreationOptions extends CreationOptions,LayoutControls {layout?:CreationLayout;ownership?:ChildOwnership;fit?:'contain'|'stretch';sampling?:'linear'|'nearest';maxLayoutBytes?:number}
export type LayoutCreationOptions=Omit<ArrangeCreationOptions,'layout'>;
export type GridCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').GridLayout,'kind'>;
export type RadialCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').RadialLayout,'kind'>;
export type ArcCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').ArcLayout,'kind'>;
export type SpiralCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').SpiralLayout,'kind'>;
export type ScatterCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').ScatterLayout,'kind'>;
export type CascadeCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').CascadeLayout,'kind'>;
export type FanCreationOptions=LayoutCreationOptions&Omit<import('./layout-recipes.ts').FanLayout,'kind'>;
export const layoutControlKeys=['ownership','fit','sampling','maxLayoutBytes','padding','gap','itemSize','scale','rotation','opacity','center'];
const common=layoutControlKeys;
/** Original single textured quad, reused sequentially for every child. Stack
 * is the original Native PM Over with streaming logical release, not a graph. */
export function prepareArrangement(init:CreationInit,sources:readonly CreationSource[],options:ArrangeCreationOptions={}){
 validateCreation(init,options,['layout',...common]);if(!Array.isArray(sources))fail('Layout requires an array of creator sources');
 if(options.ownership!==undefined&&!['owned','borrowed'].includes(options.ownership))fail('Expected owned or borrowed layout source policy');if(options.fit!==undefined&&!['contain','stretch'].includes(options.fit)||options.sampling!==undefined&&!['linear','nearest'].includes(options.sampling))fail('Unknown creator layout fit/sampling');
 const budget=options.maxLayoutBytes??64*1024**2;if(!Number.isSafeInteger(budget)||budget<128||!Number.isSafeInteger(sources.length*128)||sources.length*128>budget)fail('Layout control plan exceeds maxLayoutBytes','E_CREATION_BUDGET');checkLayoutControls(options);const layout=prepareLayout(options.layout),{post,signal,...raw}=options;let o:typeof raw;try{o=structuredClone(raw);}catch{fail('Layout options require serializable Core Signals');}return {layout,o,post,signal,format:o.format??'rgba32float' as const};
}
export async function arrangeCreations(init:CreationInit,sources:readonly CreationSource[],options:ArrangeCreationOptions={}){
 const {layout,o,post,signal,format}=prepareArrangement(init,sources,options),gpu=init.gpu,fx=createGpuPixelEffects(gpu);
 return withGpuResources(gpu,async construction=>{
  const owner=construction.adopt(await children(sources,o.ownership),x=>x.dispose()),quad=owner.items.length?construction.adopt(await textureQuad(init),x=>x.dispose()):undefined;
  const stage=creationStage(init,{...o,post,signal},async(c,inputs,props)=>withGpuResources(gpu,async a=>{
   const boxes=sampleLayout(layout,o,owner.items.length,c,init.width,init.height,init.seed);let current:GpuPixelImage|undefined;
   for(const [index,child]of owner.items.entries()){
    if(signal?.aborted)fail('Creator layout cancelled','E_RENDER_CANCELLED');const source=a.image(await childImage(child,index,init,c,inputs,props));imageCheck(source,init,false);const transform=placement(fitLayoutBox(boxes[index],source.info.width,source.info.height,init.width,init.height,o.fit??'contain'),c,init.width,init.height);
    let image:GpuPixelImage;
    if(transform.collapsed||transform.opacity===0)image=a.image(await constantImage(init,[0,0,0,0],format,signal));
    else{image=a.image(await quad!.render(source,transform,'stretch',format,o.sampling??'linear',signal));if(transform.opacity!==1){const clear=a.image(await constantImage(init,[0,0,0,0],format,signal)),faded=a.image(await interpolateImages(init,clear,image,transform.opacity,format,signal));await gpu.release(a.keep(clear));await gpu.release(a.keep(image));image=faded;}}
    await gpu.release(a.keep(source));if(!current){current=image;continue;}const next=a.image(await fx.over(image,current,{format,signal}));await gpu.release(a.keep(image));await gpu.release(a.keep(current));current=next;
   }
   return a.keep(current??a.image(await constantImage(init,[0,0,0,0],format,signal)));
  }),async()=>{const r=await Promise.allSettled([owner.dispose(),quad?.dispose()]),errors=r.filter((x):x is PromiseRejectedResult=>x.status==='rejected');if(errors.length)throw new AggregateError(errors.map(x=>x.reason),'Creator layout cleanup failed');},()=>({kind:'creator-layout',layout:structuredClone(layout),children:owner.items.length,ownership:o.ownership??'owned',fit:o.fit??'contain',bounds:'whole source canvas, not inferred Alpha bounds',quadCount:quad?1:0,time:'exact unchanged child FrameContext/input/props; every child executes even when hidden',release:'streaming logical release, not GPU completion; Session owns recycling'}));
  construction.keep(owner);if(quad)construction.keep(quad);return stage;
 });
}
function arrange(init:CreationInit,sources:readonly CreationSource[],o:LayoutCreationOptions,kind:CreationLayout['kind']){
 const fields:readonly string[]=layoutFields(kind);validateCreation(init,o,[...common,...fields]);const selected=Object.fromEntries(fields.filter(k=>Object.hasOwn(o,k)).map(k=>[k,(o as any)[k]])),rest=Object.fromEntries(Object.entries(o).filter(([k])=>!fields.includes(k)));return arrangeCreations(init,sources,{...rest,layout:{kind,...selected} as CreationLayout});
}
export function rowCreations(init:CreationInit,s:readonly CreationSource[],o:LayoutCreationOptions={}){return arrange(init,s,o,'row');}
export function columnCreations(init:CreationInit,s:readonly CreationSource[],o:LayoutCreationOptions={}){return arrange(init,s,o,'column');}
export function gridCreations(init:CreationInit,s:readonly CreationSource[],o:GridCreationOptions={}){return arrange(init,s,o,'grid');}
export function radialCreations(init:CreationInit,s:readonly CreationSource[],o:RadialCreationOptions={}){return arrange(init,s,o,'radial');}
export function arcCreations(init:CreationInit,s:readonly CreationSource[],o:ArcCreationOptions={}){return arrange(init,s,o,'arc');}
export function spiralCreations(init:CreationInit,s:readonly CreationSource[],o:SpiralCreationOptions={}){return arrange(init,s,o,'spiral');}
export function scatterCreations(init:CreationInit,s:readonly CreationSource[],o:ScatterCreationOptions={}){return arrange(init,s,o,'scatter');}
export function cascadeCreations(init:CreationInit,s:readonly CreationSource[],o:CascadeCreationOptions={}){return arrange(init,s,o,'cascade');}
export function fanCreations(init:CreationInit,s:readonly CreationSource[],o:FanCreationOptions={}){return arrange(init,s,o,'fan');}
