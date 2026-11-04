// SPDX-License-Identifier: Apache-2.0
import {Matrix4,OrthographicCamera,PerspectiveCamera,Vector3} from 'three';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {NativeGpuScope} from '../native-gpu/authoring.ts';
import type {GpuDataBuffer,GpuComputeKernel} from '../gpu-effects/compute-types.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import type {SpatialCamera} from '../spatial-fields/types.ts';
import {linear709} from '../../src/media/surface.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {scalar} from './lifecycle.ts';
import {assetOptions} from './physics-assets.ts';
import {propertyMapCode,particleIntegrateCode,particleSortCode,particleDrawCode} from './particle-mapping-shaders.ts';

export type ParticleProperty='positionX'|'positionY'|'positionZ'|'radius'|'velocityX'|'velocityY'|'velocityZ'|'alpha'|'red'|'green'|'blue';
export type ParticleMapChannel='r'|'g'|'b'|'a'|'luma';
export interface ParticlePropertyRule {
 property:ParticleProperty;channel?:ParticleMapChannel;operation?:'replace'|'add'|'multiply';
 /** Input channels are normalized map coordinates by default; output may be signed/HDR. */
 range?:readonly [Signal<number>,Signal<number>];strength?:Signal<number>;clampInput?:boolean;
}
export interface ParticleMapOptions {
 bounds?:readonly [number,number,number,number];axes?:'xy'|'xz'|'yz';
 boundary?:'ignore'|'clamp'|'repeat'|'zero';sampling?:'nearest'|'linear';at?:'current'|'birth';
 alphaWeight?:boolean;maxWork?:number;signal?:AbortSignal;
}
/** Stage-local numeric data, not a Stage port or an RGBA disguise. Twelve F32
 * words/particle: position.xyz, radius, velocity.xyz, alpha, ink.rgb, reserved. */
export interface GpuParticleState {readonly buffer:GpuDataBuffer;readonly initial:GpuDataBuffer;readonly count:number}
export interface GpuParticleSeeds {positions:ArrayLike<number>;velocities?:ArrayLike<number>;radii?:number|ArrayLike<number>;colors?:readonly [number,number,number,number]|ArrayLike<number>}
const properties:ParticleProperty[]=['positionX','positionY','positionZ','radius','velocityX','velocityY','velocityZ','alpha','red','green','blue'];
const channels:ParticleMapChannel[]=['r','g','b','a','luma'];
const caches=new WeakMap<NativeGpuScope,Map<string,Promise<GpuComputeKernel|GpuPixelKernel>>>();
function fail(message:string):never{throw Object.assign(new Error(message),{code:'E_PARTICLE_MAP'});}
function number(v:unknown,name:string,min=-Infinity,max=Infinity){if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0||v<min||v>max)fail(name+' must be a finite representable number');return v;}
function integer(v:unknown,name:string,min=0){const n=number(v,name,min);if(!Number.isSafeInteger(n))fail(name+' must be a safe integer');return n;}
function state(s:GpuParticleState){integer(s?.count,'particle count');if(!s.buffer?.info||s.buffer.info.type!=='f32'||s.buffer.info.length!==Math.max(12,s.count*12)||s.initial?.info?.type!=='f32'||s.initial.info.length!==s.buffer.info.length)fail('Explicit packed particle state with aligned immutable initial data required');}
function budget(work:number,max=2e9){if(!Number.isSafeInteger(max)||max<1||!Number.isSafeInteger(work)||work>max)fail('Particle operation exceeds its configurable maxWork');}
async function kernel(g:NativeGpuScope,id:string,make:()=>Promise<GpuComputeKernel|GpuPixelKernel>){let map=caches.get(g);if(!map){map=new Map();caches.set(g,map);}let p=map.get(id);if(!p){p=make();map.set(id,p);p.catch(()=>{if(map!.get(id)===p)map!.delete(id);});}return p;}
/** Describe one property transformation; sampling is performed on the GPU. */
export function particlePropertyMap(o:ParticlePropertyRule):ParticlePropertyRule {
 assetOptions(o,['property','channel','operation','range','strength','clampInput'],'particle property rule');
 if(!properties.includes(o.property)||o.channel!==undefined&&!channels.includes(o.channel)||o.operation!==undefined&&!['replace','add','multiply'].includes(o.operation)||o.clampInput!==undefined&&typeof o.clampInput!=='boolean')fail('Unknown particle property/channel/operation');
 if(o.range!==undefined&&(!Array.isArray(o.range)||o.range.length!==2))fail('Property range needs two scalar Signals');
 try{return structuredClone(o);}catch{fail('Property maps require serializable Core Signals');}
}
export function particleColorMap(o:Omit<ParticlePropertyRule,'property'|'channel'>={}):ParticlePropertyRule[]{return (['red','green','blue','alpha'] as const).map((property,i)=>particlePropertyMap({clampInput:false,...o,property,channel:channels[i]}));}
export function particleSizeMap(o:Omit<ParticlePropertyRule,'property'>={}):ParticlePropertyRule{return particlePropertyMap({channel:'luma',range:[0,.08],...o,property:'radius'});}
export function particlePositionMap(o:Omit<ParticlePropertyRule,'property'|'channel'>={}):ParticlePropertyRule[]{return (['positionX','positionY','positionZ'] as const).map((property,i)=>particlePropertyMap({range:[-1,1],...o,property,channel:channels[i]}));}
export function particleVelocityMap(o:Omit<ParticlePropertyRule,'property'|'channel'>={}):ParticlePropertyRule[]{return (['velocityX','velocityY','velocityZ'] as const).map((property,i)=>particlePropertyMap({range:[-1,1],...o,property,channel:channels[i]}));}

/** Explicit managed state. The caller owns its buffers and must include buffer
 * in existing stateStep/reset/replay; initial is immutable and never modified. */
export async function createGpuParticleState(g:NativeGpuScope,seeds:GpuParticleSeeds,o:{id:string;maxStateBytes?:number}){
 assetOptions(o,['id','maxStateBytes'],'particle state');if(typeof o.id!=='string'||!o.id)fail('Explicit unique managed state id required');
 const count=integer(seeds.positions.length/3,'seed XYZ count'),length=Math.max(12,count*12);budget(length*8,o.maxStateBytes??256*1024**2);
 if(length*4>Math.min(g.capabilities().limits.maxBufferSize,g.capabilities().limits.maxStorageBufferBindingSize))fail('Packed particle data exceeds the actual GPU buffer/storage limit');
 if(seeds.velocities&&seeds.velocities.length!==count*3)fail('Seed velocities must align with XYZ positions');
 const radii=seeds.radii??.025,colors=seeds.colors??[1,1,1,1];if(typeof radii!=='number'&&radii.length!==count)fail('Seed radii must align with particles');if(colors.length!==4&&colors.length!==count*4)fail('Seed colors require one RGBA or one per particle');
 const data=new Float32Array(length);for(let i=0;i<count;i++){
  for(let k=0;k<3;k++){data[i*12+k]=number(seeds.positions[i*3+k],'seed position');data[i*12+4+k]=number(seeds.velocities?.[i*3+k]??0,'seed velocity');data[i*12+8+k]=number(colors[(colors.length===4?0:i*4)+k],'seed scene-linear ink');}
  data[i*12+3]=number(typeof radii==='number'?radii:radii[i],'seed radius',0);data[i*12+7]=number(colors[(colors.length===4?0:i*4)+3],'seed alpha',0,1);
 }
 let buffer:GpuDataBuffer|undefined,initial:GpuDataBuffer|undefined;
 try{buffer=await g.createStateBuffer({type:'f32',length},data,{version:1,id:o.id});initial=await g.createBuffer({type:'f32',length},data);const result:GpuParticleState={buffer,initial,count};let disposed=false;return {...result,async dispose(){if(disposed)return;disposed=true;const rows=await Promise.allSettled([g.releaseBuffer(result.buffer),g.releaseBuffer(result.initial)]);const errors=rows.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Particle state release failed');}};
 }catch(e){if(buffer)await g.releaseBuffer(buffer);if(initial)await g.releaseBuffer(initial);throw e;}
}
/** Pure candidate result. It neither mutates the input nor retains map handles.
 * A caller-supplied target is borrowed; otherwise the returned buffer is owned.
 * Persistent maps copy the result into a managed state in its active step. */
export async function mapParticleProperties(g:NativeGpuScope,s:GpuParticleState,image:GpuPixelImage,rules:readonly ParticlePropertyRule[],c:FrameContext,o:ParticleMapOptions={},target?:GpuDataBuffer):Promise<GpuParticleState>{
 state(s);assetOptions(o,['bounds','axes','boundary','sampling','at','alphaWeight','maxWork','signal'],'particle map');
 if(!Array.isArray(rules))fail('Explicit property rules required');budget(s.count*rules.length*12,o.maxWork);
 if(!g.imageToBuffer)fail('The admitted GPU image-to-buffer bridge is required');if(!['premultiplied','opaque'].includes(image.info.alpha)||image.info.color.transfer!=='linear'||image.info.color.primaries!=='rec709')fail('Map images require explicit premultiplied/opaque scene-linear Rec709; convert upstream explicitly');
 const bounds=o.bounds??[-1,-1,1,1];if(bounds.length!==4)fail('bounds requires minX,minY,maxX,maxY');bounds.forEach(v=>number(v,'map bound'));if(bounds[0]>=bounds[2]||bounds[1]>=bounds[3])fail('Map bounds must increase');
 if(o.axes!==undefined&&!['xy','xz','yz'].includes(o.axes)||o.boundary!==undefined&&!['ignore','clamp','repeat','zero'].includes(o.boundary)||o.sampling!==undefined&&!['nearest','linear'].includes(o.sampling)||o.at!==undefined&&!['current','birth'].includes(o.at)||o.alphaWeight!==undefined&&typeof o.alphaWeight!=='boolean')fail('Unknown particle map sampling option');
 if(target&&(target===s.buffer||target===s.initial||target.info.type!=='f32'||target.info.length!==s.buffer.info.length))fail('Candidate target must be aligned and disjoint from source/initial data');
 const data=new Float32Array(Math.max(8,rules.length*8));for(let i=0;i<rules.length;i++){const r=particlePropertyMap(rules[i]),a=scalar(r.range?.[0]??0,c,'map range minimum'),b=scalar(r.range?.[1]??1,c,'map range maximum');number(a,'map minimum');number(b,'map maximum');number(b-a,'map range span');data.set([properties.indexOf(r.property),channels.indexOf(r.channel??'r'),['replace','add','multiply'].indexOf(r.operation??'replace'),a,b,number(scalar(r.strength??1,c,'map strength',0,1),'map strength'),Number(r.clampInput!==false),0],i*8);}
 const p=new Float32Array(16),u=new Uint32Array(p.buffer);u.set([s.count,image.info.width,image.info.height,rules.length]);p.set(bounds,4);const axes=o.axes==='xz'?[0,2]:o.axes==='yz'?[1,2]:[0,1];u.set([...axes,['ignore','clamp','repeat','zero'].indexOf(o.boundary??'ignore'),Number(o.at==='birth'),Number(o.alphaWeight===true),Number(o.sampling!=='nearest')],8);
 const program=await kernel(g,'property-map',()=>g.compileCompute({abiVersion:1,id:'frameweave/particles/property-map',version:'0.1.0',bindings:[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'}],parameterWords:16,workgroupSize:[64,1,1],code:propertyMapCode})) as GpuComputeKernel;
 return withGpuResources(g,async a=>{const map=a.buffer(await g.imageToBuffer!(image,{version:1,signal:o.signal})),properties=a.buffer(await g.createBuffer({type:'f32',length:data.length},data)),out=target??a.buffer(await g.createBuffer({type:'f32',length:s.buffer.info.length}));if(s.count)await g.dispatch(program,[s.buffer,s.initial,map,properties,out],{workItems:[s.count,1,1],parameters:p,signal:o.signal});else await g.copyBuffer(s.buffer,out);return {buffer:target?out:a.keep(out),initial:s.initial,count:s.count};});
}
/** Records a copy into the current managed step, not a JS/V-SHARED transaction.
 * Publication remains provisional until the existing native frame completes. */
export async function copyParticleProperties(g:NativeGpuScope,from:GpuParticleState,to:GpuParticleState){state(from);state(to);if(from.count!==to.count)fail('Particle copies must preserve count');if(from.buffer!==to.buffer)await g.copyBuffer(from.buffer,to.buffer);}
/** One explicit semi-implicit step; no clock advancement or hidden substeps. */
export async function integrateGpuParticles(g:NativeGpuScope,s:GpuParticleState,c:FrameContext,o:{dt?:number;acceleration?:readonly [Signal<number>,Signal<number>,Signal<number>];drag?:Signal<number>;signal?:AbortSignal}={}){
 state(s);assetOptions(o,['dt','acceleration','drag','signal'],'particle integration');const dt=number(o.dt??c.dt,'dt',0),p=Float32Array.of(dt,...[0,1,2].map(i=>number(scalar(o.acceleration?.[i]??0,c,'particle acceleration'),'acceleration')),number(scalar(o.drag??0,c,'particle drag',0),'drag'),0,0,0);new Uint32Array(p.buffer)[5]=s.count;
 const k=await kernel(g,'integrate',()=>g.compileCompute({abiVersion:1,id:'frameweave/particles/integrate',version:'0.1.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:8,workgroupSize:[64,1,1],code:particleIntegrateCode})) as GpuComputeKernel;if(s.count)await g.dispatch(k,[s.buffer],{workItems:[s.count,1,1],parameters:p,signal:o.signal});
}
/** GPU-only billboard rendering of resident mapped state. A stable GPU depth
 * order preserves transparent overlap. Work planning is explicit/configurable;
 * this initial exact-order profile uses N² rank ordering, not a speedup claim. */
export async function renderGpuParticles(g:NativeGpuScope,s:GpuParticleState,c:FrameContext,o:{width:number;height:number;camera?:SpatialCamera;format?:'rgba16float'|'rgba32float';radiusScale?:Signal<number>;maxWork?:number;signal?:AbortSignal}){
 state(s);assetOptions(o,['width','height','camera','format','radiusScale','maxWork','signal'],'GPU particle render');const width=integer(o.width,'width',1),height=integer(o.height,'height',1);budget(width*height*s.count+s.count*s.count,o.maxWork);
 const camera:SpatialCamera=o.camera??{projection:'orthographic',position:[0,0,5],target:[0,0,0],near:.01,far:100,viewHeight:2};
 let view:OrthographicCamera|PerspectiveCamera;if(camera.projection==='orthographic'){const h=number(camera.viewHeight,'view height',Number.MIN_VALUE);view=new OrthographicCamera(-h*width/height/2,h*width/height/2,h/2,-h/2,number(camera.near,'near',Number.MIN_VALUE),number(camera.far,'far',Number.MIN_VALUE));}else view=new PerspectiveCamera(number(camera.verticalFov,'vertical FOV',.01,179),width/height,number(camera.near,'near',Number.MIN_VALUE),number(camera.far,'far',Number.MIN_VALUE));if(camera.near>=camera.far)fail('Camera near/far must increase');
 if(camera.position.length!==3||camera.target.length!==3)fail('Explicit camera XYZ required');camera.position.forEach(v=>number(v,'camera position'));camera.target.forEach(v=>number(v,'camera target'));view.position.set(...camera.position);view.up.set(...camera.up??[0,1,0]);view.lookAt(...camera.target);view.updateMatrixWorld();view.updateProjectionMatrix();const forward=new Vector3().subVectors(new Vector3(...camera.target),view.position);if(forward.length()===0)fail('Camera target must differ from position');forward.normalize();
 const matrix=new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse),p=new Float32Array(32),u=new Uint32Array(p.buffer);matrix.elements.forEach(v=>number(v,'camera projection'));p.set(matrix.elements);u.set([width,height,s.count,Number(camera.projection==='perspective')],16);p.set([view.projectionMatrix.elements[5],camera.near,camera.far],20);p.set(camera.position,24);p.set(forward.toArray(),27);p[30]=number(scalar(o.radiusScale??1,c,'particle radius scale',0),'radius scale');
 const sort=await kernel(g,'depth-order',()=>g.compileCompute({abiVersion:1,id:'frameweave/particles/depth-order',version:'0.1.0',bindings:[{type:'f32',access:'read'},{type:'u32',access:'read_write'}],parameterWords:8,workgroupSize:[64,1,1],code:particleSortCode})) as GpuComputeKernel;
 const draw=await kernel(g,'draw',()=>g.compile({abiVersion:2,id:'frameweave/particles/resident-draw',version:'0.1.0',inputCount:0,dataInputs:[{type:'f32'},{type:'u32'}],parameterWords:32,code:particleDrawCode})) as GpuPixelKernel;
 return withGpuResources(g,async a=>{const order=a.buffer(await g.createBuffer({type:'u32',length:Math.max(1,s.count)})),q=new Float32Array(8);q.set(camera.position);q.set(forward.toArray(),3);new Uint32Array(q.buffer)[6]=s.count;if(s.count)await g.dispatch(sort,[s.buffer,order],{workItems:[s.count,1,1],parameters:q,signal:o.signal});return await g.run(draw,[],{data:[s.buffer,order],parameters:p,output:{width,height,format:o.format??'rgba32float',alpha:'premultiplied',color:linear709},signal:o.signal});});
}
