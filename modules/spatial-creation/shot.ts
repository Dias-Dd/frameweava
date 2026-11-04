import type {CreationColor,StaticCreationColor} from './colors.ts';
import {creationColor} from './colors.ts';
import {linear709} from '../../src/media/surface.ts';
import {createUtilityFilters} from '../gpu-image-effects/resident/foundations/utility.ts';
import {createGpuPixelEffects} from '../gpu-effects/pixel-effects.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {silkRibbon,type SilkRibbonOptions} from './objects.ts';
import {particles,type ParticlesOptions} from './particles.ts';
import type {CreationInit,CreationOptions,AnimatedVec3} from './types.ts';
import {creationStage,validateCreation} from './lifecycle.ts';

export interface RibbonSceneOptions extends CreationOptions {
 ribbon?:Omit<SilkRibbonOptions,'post'|'signal'|'format'>;
 particles?:false|Omit<ParticlesOptions,'post'|'signal'|'format'|'backgroundInput'>;
 background?:{center?:CreationColor;edge?:CreationColor};
}
/** A complete art-directed shot, assembled from existing geometry, lighting,
 * particle simulation, gradient and Over operators on ONE borrowed owner. */
export async function ribbonScene(init:CreationInit,options:RibbonSceneOptions={}){
 validateCreation(init,options,['ribbon','particles','background']);
 const {post,signal,...raw}=options,o=structuredClone(raw),format=o.format??'rgba32float',ribbon=await silkRibbon(init,{strands:3,width:.36,...o.ribbon,format,signal});
 let dust:ReturnType<typeof particles>|undefined;
 try{dust=o.particles===false?undefined:particles(init,{style:{ink:[.25,.8,1.4],opacity:.45,radiusScale:.55,fadeWithAge:false},...o.particles,simulation:{rate:0,bursts:[{time:0,count:85}],lifetime:120,origin:[0,0,-1],positionJitter:[3,1.7,.2],velocity:[.025,.018,0],velocityJitter:[.025,.025,.01],radius:.018,forces:[],trailPoints:0,...(o.particles||{}).simulation},format,signal});}catch(e){await ribbon.dispose?.();throw e;}
 // Extent carrier only; actual background is the existing typed radialGradient.
 const blank=init.gpu.compile({abiVersion:1,id:'frameweave/spatial-creation/opaque-extent',version:'0.1.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,0.,0.,1.);}'});
 return creationStage(init,{...o,post,signal},async c=>withGpuResources(init.gpu,async a=>{
  const extent=a.image(await init.gpu.run(await blank,[],{output:{width:init.width,height:init.height,format,alpha:'premultiplied',color:linear709},signal})),fx=createGpuPixelEffects(init.gpu);
  let image=a.image(await createUtilityFilters(init.gpu,c).radialGradient(extent,{start:[init.width*.48,init.height*.43],end:[init.width*.98,init.height*.9],colorA:creationColor(o.background?.center??[.022,.048,.085],c,'ribbon background center'),colorB:creationColor(o.background?.edge??[.0015,.003,.009],c,'ribbon background edge'),format,signal}));
  if(dust){const ink=a.image(await dust.renderAt(c,{},{}));image=a.image(await fx.over(ink,image,{format,signal}));}
  const fabric=a.image(await ribbon.renderAt(c,{},{}));return a.keep(a.image(await fx.over(fabric,image,{format,signal})));
 }),async()=>{const results=await Promise.allSettled([ribbon.dispose?.(),dust?.dispose?.()]);const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Shot disposal failed');},()=>({kind:'ribbon-scene',ribbon:ribbon.inspect(),particles:dust?.inspect(),color:'scene-linear Rec709, premultiplied, no SDR intermediate'}));
}
