// SPDX-License-Identifier: Apache-2.0
import type {FrameContext} from '../../src/core/types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {seededRandom} from '../../src/core/time.ts';
import {linear709} from '../../src/media/surface.ts';
import {createUtilityFilters} from '../gpu-image-effects/resident/foundations/utility.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createNativeReplay} from '../spatial-compute/native-replay.ts';
import type {GradientBackgroundOptions} from './composition.ts';
import {constantImage} from './composition-core.ts';
import {creationColor} from './colors.ts';
import {creationStage,validateCreation,requireInput} from './lifecycle.ts';
import {assetOptions,assetNumber,assetError} from './physics-assets.ts';
import {createGpuParticleState,mapParticleProperties,copyParticleProperties,integrateGpuParticles,renderGpuParticles,particlePropertyMap,type GpuParticleState,type ParticlePropertyRule,type ParticleMapOptions} from './particle-mapping.ts';
import type {CreationInit,CreationInputs,CreationOptions,CreationImageResource,CameraOptions,AnimatedVec3} from './types.ts';
import type {Signal} from '../../src/core/types.ts';
export interface ParticleMapImage {image:GpuPixelImage;ownership:'owned'|'borrowed'}
export type ParticleMapSource=
 | {input:string}
 | {gradient:Pick<GradientBackgroundOptions,'center'|'edge'|'start'|'end'|'kind'>}
 | {resource:CreationImageResource}
 /** Explicit historical evaluator. It receives the requested logical context,
  * including subframes, never a cached/current upstream input in its place. */
 | {sample:(context:FrameContext)=>ParticleMapImage|Promise<ParticleMapImage>};
export interface ParticlePropertyLayer {source:ParticleMapSource;rules:readonly ParticlePropertyRule[];sampling?:Omit<ParticleMapOptions,'signal'|'maxWork'>}
export interface MappedParticleFieldOptions extends CreationOptions,CameraOptions {
 count?:number;size?:readonly [number,number];radius?:number;
 color?:readonly [number,number,number,number];velocity?:readonly [number,number,number];
 acceleration?:AnimatedVec3;drag?:Signal<number>;radiusScale?:Signal<number>;
 persistent?:readonly ParticlePropertyLayer[];ephemeral?:readonly ParticlePropertyLayer[];
 substeps?:number;maxReplaySteps?:number;maxStateBytes?:number;maxWork?:number;
}
let nextInstance=0;
/** Source sampling reuses the ORIGINAL utility-gradient implementation and the
 * admitted resource/input contracts. It does not render a Stage at a fake time. */
export async function sampleParticleMapSource(init:CreationInit,source:ParticleMapSource,c:FrameContext,inputs:CreationInputs,o:CreationOptions):Promise<ParticleMapImage>{
 if('input'in source)return {image:requireInput(inputs,source.input),ownership:'borrowed'};
 if('sample'in source){const result=await source.sample(c);if(!result?.image?.info||!['owned','borrowed'].includes(result.ownership))assetError('Map evaluator must return a real image with explicit ownership');return result;}
 if('resource'in source){const r=source.resource;return {image:await init.gpu.importResource({version:1,id:r.resource,decode:r.decode??'icc-sdr',missingProfile:r.missingProfile??'error',output:{width:r.size[0],height:r.size[1],format:o.format??'rgba32float',alpha:'premultiplied',color:linear709}},{signal:o.signal}),ownership:'owned'};}
 const data=source.gradient,format=o.format??'rgba32float';
 return {image:await withGpuResources(init.gpu,async a=>{
  const extent=a.image(await constantImage(init,[0,0,0,1],format,o.signal)),fx=createUtilityFilters(init.gpu,c),options={format,signal:o.signal,start:data.start??[0,init.height/2] as const,end:data.end??[init.width,init.height/2] as const,colorA:creationColor(data.center??[0,0,0],c,'property gradient start'),colorB:creationColor(data.edge??[1,1,1],c,'property gradient end')};
  return a.keep(a.image(await(data.kind==='radial'?fx.radialGradient(extent,options):fx.linearGradient(extent,options))));
 }),ownership:'owned'};
}
function layers(values:readonly ParticlePropertyLayer[]|undefined,persistent:boolean):ParticlePropertyLayer[]{
 if(values===undefined)return [];if(!Array.isArray(values))assetError('Property layers must be arrays');
 return values.map(v=>{
  assetOptions(v,['source','rules','sampling'],'particle property layer');assetOptions(v.source,['input','gradient','resource','sample'],'particle property source');
  const keys=Object.keys(v.source);if(keys.length!==1||!['input','gradient','resource','sample'].includes(keys[0]))assetError('Exactly one explicit property-map source required');
  if('input'in v.source){if(persistent)assetError('A persistent map needs a replayable source: gradient, sealed resource or sample(context). A current-frame input cannot stand in for historical images.');if(typeof v.source.input!=='string'||!v.source.input)assetError('Map input must name a declared current-frame input');}
  if('sample'in v.source&&typeof v.source.sample!=='function')assetError('Historical source must be an explicit evaluator');
  if('gradient'in v.source){assetOptions(v.source.gradient,['center','edge','start','end','kind'],'property gradient');if(v.source.gradient.kind!==undefined&&!['linear','radial'].includes(v.source.gradient.kind))assetError('Unknown property gradient kind');}
  if('resource'in v.source){const r=v.source.resource;assetOptions(r,['resource','size','decode','missingProfile'],'property resource');if(typeof r.resource!=='string'||!r.resource||!Array.isArray(r.size)||r.size.length!==2||r.size.some((n:unknown)=>typeof n!=='number'||!Number.isSafeInteger(n)||n<1))assetError('Property resource needs a declared ID and positive dimensions');if(r.decode!==undefined&&!['icc-sdr','surface-v2'].includes(r.decode)||r.missingProfile!==undefined&&!['error','assume-srgb'].includes(r.missingProfile))assetError('Unknown property-resource interpretation');}
  if(!Array.isArray(v.rules))assetError('Property mapping needs explicit rules');
  // Author functions remain normal functions. Data is independently snapshotted.
  const source='sample'in v.source?{sample:v.source.sample}:structuredClone(v.source);
  return {source,rules:v.rules.map(particlePropertyMap),sampling:v.sampling?structuredClone(v.sampling):undefined};
 });
}
/** @internal Shared admission of an explicit historical/current image provider. */
export function prepareParticleMapSource(source:ParticleMapSource,historical:boolean){return layers([{source,rules:[]}],historical)[0].source;}
/** Ready-to-render resident particles with separate historical and per-output
 * property layers. Common sources are ordinary typed data, not a scene DSL.
 * Persistent sampling resets/replays existing Native leases with the ONE Core
 * FixedStepRunner adapter. Ephemeral layers never modify historical state. */
export async function mappedParticleField(init:CreationInit,options:MappedParticleFieldOptions={}){
 validateCreation(init,options,['count','size','radius','color','velocity','acceleration','drag','radiusScale','persistent','ephemeral','substeps','maxReplaySteps','maxStateBytes','maxWork','camera']);
 const persistent=layers(options.persistent,true),ephemeral=layers(options.ephemeral,false);
 const {persistent:_p,ephemeral:_e,post,signal,...raw}=options;let o:Omit<MappedParticleFieldOptions,'persistent'|'ephemeral'>;try{o={...structuredClone(raw),post,signal};}catch{assetError('Particle field data must be serializable Core values; use the explicit sample callback for author logic');}
 const count=o.count??128;
 if(!Number.isSafeInteger(count)||count<0)assetError('Particle count must be a nonnegative safe integer');
 for(const [name,value]of [['substeps',o.substeps],['maxReplaySteps',o.maxReplaySteps]] as const)if(value!==undefined&&(!Number.isSafeInteger(value)||value<1))assetError(name+' must be a positive safe integer');
 const size=o.size??[3,1.8];if(!Array.isArray(size)||size.length!==2)assetError('Field size needs world width/height');size.forEach(v=>assetNumber(v,'field size',Number.MIN_VALUE));
 const plan=Math.max(12,count*12)*12,budget=o.maxStateBytes??256*1024**2;if(!Number.isSafeInteger(plan)||plan>budget)assetError('Managed particle buffers exceed configurable maxStateBytes');
 const renderWork=init.width*init.height*count+count*count;if(!Number.isSafeInteger(renderWork)||renderWork>(o.maxWork??2e9))assetError('Planned particle render exceeds configurable maxWork');
 if(Math.max(12,count*12)*4>Math.min(init.gpu.capabilities().limits.maxBufferSize,init.gpu.capabilities().limits.maxStorageBufferBindingSize))assetError('Particle state exceeds actual device buffer/storage limits');
 const position=new Float32Array(count*3),velocity=new Float32Array(count*3);for(let i=0;i<count;i++)for(let k=0;k<3;k++){position[i*3+k]=k<2?(seededRandom(init.seed,i,k)-.5)*size[k]:0;velocity[i*3+k]=o.velocity?.[k]??0;}
 const id='mapped-particles-'+nextInstance++,g=init.gpu;
 const state=await createGpuParticleState(g,{positions:position,velocities:velocity,radii:o.radius??.025,colors:o.color??[1.5,.65,.12,.8]},{id,maxStateBytes:o.maxStateBytes});
 let scratch:GpuDataBuffer;try{scratch=await g.createStateBuffer({type:'f32',length:state.buffer.info.length},undefined,{version:1,id:id+'-candidate'});}catch(e){await state.dispose();throw e;}
 const replay=createNativeReplay(g,[state.buffer,scratch],{substeps:o.substeps,maxSteps:o.maxReplaySteps});let lastSteps=0;
 async function apply(sourceState:GpuParticleState,list:readonly ParticlePropertyLayer[],c:FrameContext,inputs:CreationInputs,managed:boolean){
  let current:GpuParticleState=sourceState,owned=false;
  try{for(const layer of list){const sample=await sampleParticleMapSource(init,layer.source,c,inputs,o);try{
    const target=managed?(current.buffer===state.buffer?scratch:state.buffer):undefined;
    const next=await mapParticleProperties(g,current,sample.image,layer.rules,c,{bounds:[-size[0]/2,-size[1]/2,size[0]/2,size[1]/2],...layer.sampling,maxWork:o.maxWork,signal:o.signal},target);
    if(owned)await g.releaseBuffer(current.buffer);current=next;owned=!managed;
   }finally{if(sample.ownership==='owned')await g.release(sample.image);}}
   if(managed){await copyParticleProperties(g,current,state);return state;}return current;
  }catch(e){if(owned)await g.releaseBuffer(current.buffer);throw e;}
 }
 const dispose=async()=>{const results=await Promise.allSettled([state.dispose(),g.releaseBuffer(scratch)]),errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Mapped particle disposal failed');};
 try{return creationStage(init,o,async(c,inputs)=>{
  const outcome=await replay.record(c,async step=>{
   if(step.step===1){const zero={...step.context,frame:0,time:0,globalFrame:step.context.globalFrame-step.context.frame,globalTime:step.context.globalTime-step.context.time,progress:0};await apply(state,persistent,zero,{},true);}
   await integrateGpuParticles(g,state,step.context,{dt:step.dt,acceleration:o.acceleration,drag:o.drag,signal:o.signal});await apply(state,persistent,step.context,{},true);
  },{signal:o.signal});lastSteps=outcome.steps;if(outcome.steps===0)await apply(state,persistent,c,{},true);
  const display=await apply(state,ephemeral,c,inputs,false);
  try{return await renderGpuParticles(g,display,c,{width:init.width,height:init.height,camera:o.camera,format:o.format,radiusScale:o.radiusScale,maxWork:o.maxWork,signal:o.signal});}
  finally{if(display.buffer!==state.buffer)await g.releaseBuffer(display.buffer);}
 },dispose,()=>({kind:'mapped-particle-field',count,persistentLayers:persistent.length,ephemeralLayers:ephemeral.length,lastReplaySteps:lastSteps,time:'existing Core FixedStepRunner + Native stateStep reset/replay',render:'resident GPU sorted billboards; configurable exact-order work budget'}));}catch(e){await dispose();throw e;}
}
