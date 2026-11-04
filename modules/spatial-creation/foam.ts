// SPDX-License-Identifier: MIT
// EffectCraft-derived physics; see licenses/effectcraft-simulation-MIT.txt.
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuDataBuffer,GpuComputeKernel} from '../gpu-effects/compute-types.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import type {NativeGpuScope} from '../native-gpu/authoring.ts';
import {linear709} from '../../src/media/surface.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createNativeReplay} from '../spatial-compute/native-replay.ts';
import {sampleParticleMapSource,prepareParticleMapSource,type ParticleMapSource} from './mapped-particle-field.ts';
import {foamAdvanceCode,foamPairCode,foamDrawCode} from './foam-kernels.ts';
import {creationStage,validateCreation,scalar,fail} from './lifecycle.ts';
import {assetNumber,assetOptions} from './physics-assets.ts';
import {creationColor,type CreationColor} from './colors.ts';
import type {CreationInit,CreationOptions} from './types.ts';

export interface FoamOptions extends CreationOptions {
 initialCount?:number;rate?:number;lifetime?:number;frailty?:number;size?:number;sizeVariation?:number;growth?:Signal<number>;
 area?:readonly [number,number];velocity?:readonly [number,number];wind?:readonly [Signal<number>,Signal<number>];windResponse?:Signal<number>;
 viscosity?:Signal<number>;stickiness?:Signal<number>;repulsion?:Signal<number>;popVelocity?:Signal<number>;turbulence?:Signal<number>;
 /** Historical map is sampled on GPU. Luminance is PM (transparent means no height). */
 flow?:ParticleMapSource;flowStrength?:Signal<number>;flowDistance?:number;
 texture?:ParticleMapSource;environment?:ParticleMapSource;reflection?:Signal<number>;convergence?:Signal<number>;
 style?:'bubble'|'spit'|'bubblegum'|'dishwater'|'milky';color?:CreationColor;opacity?:Signal<number>;highlight?:Signal<number>;fade?:number;viewHeight?:number;
 substeps?:number;maxReplaySteps?:number;maxStateBytes?:number;maxWork?:number;
}
export interface FoamGpuFrame {buffer:GpuDataBuffer;count:number;area:readonly [number,number]}
const number=(v:number,name:string,min=-Infinity,max=Infinity)=>{assetNumber(v,name,min,max);if(!Number.isFinite(Math.fround(v)))fail(name+' is not representable by GPU F32');return v;};
/** EffectCraft frailty distribution, expressed in seconds and unit randomness. */
export function foamPopTime(lifetime:number,frailty:number,random:number){return number(lifetime,'lifetime',Number.MIN_VALUE)*(1-number(frailty,'frailty',0,1)*number(random,'unit random',0,1));}
export function foamBubbleRadius(size:number,age:number,growth:number){return number(size,'size',0)*Math.min(1,Math.max(0,number(age,'age'))*number(growth,'growth',0));}
/** Per-pair positional correction, not an extra integrator or a pixel fallback. */
export function foamPairForce(a:readonly [number,number],b:readonly [number,number],ra:number,rb:number,repulsion=1,stickiness=0):[number,number]{
 [...a,...b].forEach(x=>number(x,'position'));number(ra,'radius',0);number(rb,'radius',0);number(repulsion,'repulsion',0);number(stickiness,'stickiness',0,1);
 const dx=a[0]-b[0],dy=a[1]-b[1],d=Math.hypot(dx,dy),k=Math.max(0,ra+rb-d)*.5*Math.min(repulsion,4)*(1-stickiness*.5);return d>1e-6?[dx/d*k,dy/d*k]:[k,0];
}
const programs=new WeakMap<NativeGpuScope,Map<string,Promise<GpuComputeKernel|GpuPixelKernel>>>();
function program(g:NativeGpuScope,name:string,make:()=>Promise<GpuComputeKernel|GpuPixelKernel>){let m=programs.get(g);if(!m){m=new Map;programs.set(g,m);}if(!m.has(name))m.set(name,make().catch(e=>{m!.delete(name);throw e;}));return m.get(name)!;}
const keys=['initialCount','rate','lifetime','frailty','size','sizeVariation','growth','area','velocity','wind','windResponse','viscosity','stickiness','repulsion','popVelocity','turbulence','flow','flowStrength','flowDistance','texture','environment','reflection','convergence','style','color','opacity','highlight','fade','viewHeight','substeps','maxReplaySteps','maxStateBytes','maxWork'];
let instances=0;
/** Existing Native state leases + Core planner. No global cache or second clock.
 * GPU candidates are disjoint; copy-back is ordered in the managed state step.
 * Exact simultaneous pair interactions cost O(active capacity²) per substep. */
export async function createFoamSimulation(init:CreationInit,options:FoamOptions={}){
 validateCreation(init,options,keys);if(options.signal?.aborted)fail('Foam cancelled','E_RENDER_CANCELLED');const flow=options.flow?prepareParticleMapSource(options.flow,true):undefined;
 const {flow:_f,texture:_t,environment:_e,post,signal,...raw}=options;let o:FoamOptions;try{o={...structuredClone(raw),post,signal};}catch{fail('Foam data requires serializable Core values');}
 const initial=o.initialCount??12,rate=number(o.rate??12,'rate',0),life=number(o.lifetime??3,'lifetime',Number.MIN_VALUE),count=initial+Math.ceil(rate*life)+Number(rate>0);
 if(!Number.isSafeInteger(initial)||initial<0||!Number.isSafeInteger(count))fail('Invalid initialCount or active capacity');
 const area=o.area??[3,1.7];if(!Array.isArray(area)||area.length!==2)fail('area requires width/height');area.forEach(v=>number(v,'area',Number.MIN_VALUE));
 number(o.frailty??.2,'frailty',0,1);number(o.size??.085,'size',0);number(o.sizeVariation??.3,'sizeVariation',0,1);number(o.flowDistance??.01,'flowDistance',Number.MIN_VALUE);
 for(const key of ['substeps','maxReplaySteps'] as const)if(o[key]!==undefined&&(!Number.isSafeInteger(o[key])||o[key]!<1))fail(key+' must be a positive integer');
 if(o.velocity&&(!Array.isArray(o.velocity)||o.velocity.length!==2))fail('velocity requires XY');o.velocity?.forEach(v=>number(v,'velocity'));
 const length=Math.max(16,count*16),bytes=length*8+16,g=init.gpu,limits=g.capabilities().limits;
 if(!Number.isSafeInteger(bytes)||bytes>(o.maxStateBytes??256*1024**2)||length*4>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize))fail('Foam state exceeds configurable or actual device budget','E_CREATION_BUDGET');
 const id='foam-'+instances++;let buffer:GpuDataBuffer|undefined,candidate:GpuDataBuffer|undefined,dummy:GpuDataBuffer|undefined;
 try{buffer=await g.createStateBuffer({type:'f32',length},new Float32Array(length),{version:1,id});candidate=await g.createStateBuffer({type:'f32',length},undefined,{version:1,id:id+'-candidate'});dummy=await g.createBuffer({type:'f32',length:4},new Float32Array(4));}catch(e){await Promise.allSettled([buffer,candidate,dummy].filter((b):b is GpuDataBuffer=>!!b).map(b=>g.releaseBuffer(b)));throw e;}
 const state=buffer,scratch=candidate,empty=dummy,replay=createNativeReplay(g,[state,scratch],{substeps:o.substeps,maxSteps:o.maxReplaySteps});let closed=false,lastSteps=0,pendingRecord:Promise<FoamGpuFrame>|undefined,closing:Promise<void>|undefined;
 let advance:GpuComputeKernel,pair:GpuComputeKernel;try{
 advance=await program(g,'advance',()=>g.compileCompute({abiVersion:1,id:'frameweave/foam/advance',version:'0.1.0',bindings:[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'}],parameterWords:32,workgroupSize:[64,1,1],code:foamAdvanceCode})) as GpuComputeKernel;
 pair=await program(g,'pair',()=>g.compileCompute({abiVersion:1,id:'frameweave/foam/pairs',version:'0.1.0',bindings:[{type:'f32',access:'read'},{type:'f32',access:'read_write'}],parameterWords:12,workgroupSize:[64,1,1],code:foamPairCode})) as GpuComputeKernel;
 }catch(e){await Promise.allSettled([state,scratch,empty].map(b=>g.releaseBuffer(b)));throw e;}
 async function step(c:FrameContext,dt:number){
  const p=new Float32Array(32),u=new Uint32Array(p.buffer);p.set([c.time,dt,0,...area,rate,0,0,life,o.frailty??.2,o.size??.085,o.sizeVariation??.3,...o.velocity??[0,.02]]);u[2]=init.seed;u[6]=initial;u[7]=count;
  p.set([scalar(o.wind?.[0]??0,c,'wind X'),scalar(o.wind?.[1]??.1,c,'wind Y'),scalar(o.windResponse??3,c,'windResponse',0),scalar(o.viscosity??1,c,'viscosity',0),scalar(o.turbulence??.05,c,'turbulence',0)],14);
  p[26]=o.flowDistance??.01;p[27]=scalar(o.flowStrength??.4,c,'flowStrength');
  const q=new Float32Array(12);new Uint32Array(q.buffer)[0]=count;q.set([scalar(o.growth??4,c,'growth',0),scalar(o.repulsion??1,c,'repulsion',0),scalar(o.stickiness??.2,c,'stickiness',0,1),dt,number(o.size??.085,'size',0),scalar(o.popVelocity??.4,c,'popVelocity',0),number((o.size??.085)*2,'correction bound',0),Math.max(1,count*dt)],1);
  await withGpuResources(g,async a=>{let map=empty;let sample:Awaited<ReturnType<typeof sampleParticleMapSource>>|undefined;try{
   if(flow){sample=await sampleParticleMapSource(init,flow,c,{},o);const image=sample.image;if(!g.imageToBuffer||image.info.color.transfer!=='linear'||image.info.color.primaries!=='rec709'||!['premultiplied','opaque'].includes(image.info.alpha))fail('Foam flow requires the admitted scene-linear PM image bridge');map=a.buffer(await g.imageToBuffer(image,{version:1,signal}));u[24]=image.info.width;u[25]=image.info.height;}
   if(count){await g.dispatch(advance,[state,map,scratch],{workItems:[count,1,1],parameters:p,signal});await g.dispatch(pair,[scratch,state],{workItems:[count,1,1],parameters:q,signal});}
  }finally{if(sample?.ownership==='owned')await g.release(sample.image);}});
 }
 return {buffer:state,count,area,record(c:FrameContext){if(pendingRecord)return Promise.reject(Object.assign(new Error('Await the preceding Foam recording'),{code:'E_CREATION_BUSY'}));const task=(async()=>{if(closed)fail('Foam disposed','E_CREATION_CLOSED');const target=c.frame*(o.substeps??1);const work=count*count*(target+1);if(!Number.isSafeInteger(work)||work>(o.maxWork??2e9))fail('Complete Foam replay exceeds configurable maxWork','E_CREATION_BUDGET');if(rate*c.time+count>=16777216)fail('Foam generation identity exceeds exact F32 integer range; split the authored interval explicitly','E_CREATION_BUDGET');
  const result=await replay.record(c,async s=>{if(s.step===1)await step({...s.context,frame:0,time:0,globalTime:s.context.globalTime-s.context.time,globalFrame:s.context.globalFrame-s.context.frame,progress:0},0);await step(s.context,s.dt);},{signal});lastSteps=result.steps;if(!result.steps)await step(c,0);return {buffer:state,count,area} satisfies FoamGpuFrame;
 })();pendingRecord=task;void task.then(()=>{pendingRecord=undefined;},()=>{pendingRecord=undefined;});return task;},inspect:()=>({kind:'foam',capacity:count,lastSteps,time:'Core FixedStepRunner + Native stateStep',physics:'GPU simultaneous pair corrections / viscosity / stickiness / pop impulse / resident flow map'}),dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pendingRecord?.catch(()=>{});const rows=await Promise.allSettled([state,scratch,empty].map(b=>g.releaseBuffer(b)));const errors=rows.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Foam disposal failed');})();}};
}
/** Bubble shading stays on GPU. Input images are borrowed; temporary data views
 * are released after recording, not interpreted as queue completion. */
export async function renderFoamBubbles(init:CreationInit,frame:FoamGpuFrame,c:FrameContext,o:FoamOptions={},images:{texture?:GpuPixelImage;environment?:GpuPixelImage}={}){
 const g=init.gpu,count=frame.count,work=count*init.width*init.height;if(!Number.isSafeInteger(work)||work>(o.maxWork??2e9))fail('Foam raster exceeds configurable maxWork','E_CREATION_BUDGET');
 const style=['bubble','spit','bubblegum','dishwater','milky'].indexOf(o.style??'bubble');if(style<0)fail('Unknown Foam style');
 const p=new Float32Array(24),u=new Uint32Array(p.buffer);u.set([init.width,init.height,count]);p[3]=number(o.viewHeight??2.2,'viewHeight',Number.MIN_VALUE);p[4]=scalar(o.growth??4,c,'growth',0);p[5]=number(o.fade??.15,'fade',Number.MIN_VALUE);u[6]=style;p.set(creationColor(o.color??[.25,.7,1.2],c,'bubble color'),7);p[10]=scalar(o.opacity??.8,c,'opacity',0,1);p[11]=scalar(o.highlight??1.4,c,'highlight',0);p.set(frame.area,16);p[18]=scalar(o.convergence??.3,c,'convergence',0,1);p[19]=scalar(o.reflection??.35,c,'reflection',0);
 const draw=await program(g,'draw',()=>g.compile({abiVersion:2,id:'frameweave/foam/bubbles',version:'0.1.0',inputCount:0,dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],parameterWords:24,code:foamDrawCode})) as GpuPixelKernel;
 return withGpuResources(g,async a=>{const dummy=a.buffer(await g.createBuffer({type:'f32',length:4},new Float32Array(4))),views:GpuDataBuffer[]=[];for(const [index,image]of [images.texture,images.environment].entries()){if(!image){views.push(dummy);continue;}if(!g.imageToBuffer||image.info.color.transfer!=='linear'||image.info.color.primaries!=='rec709'||!['premultiplied','opaque'].includes(image.info.alpha))fail('Foam texture/environment needs admitted scene-linear PM GPU images');views.push(a.buffer(await g.imageToBuffer(image,{version:1,signal:o.signal})));u[12+index*2]=image.info.width;u[13+index*2]=image.info.height;}return g.run(draw,[],{data:[frame.buffer,...views],parameters:p,output:{width:init.width,height:init.height,format:o.format??'rgba32float',alpha:'premultiplied',color:linear709},signal:o.signal});});
}
export async function foamField(init:CreationInit,options:FoamOptions={}){
 validateCreation(init,options,keys);const texture=options.texture?prepareParticleMapSource(options.texture,false):undefined,environment=options.environment?prepareParticleMapSource(options.environment,false):undefined;
 const {flow,texture:_t,environment:_e,post,signal,...raw}=options,o={...structuredClone(raw),post,signal},simulation=await createFoamSimulation(init,{...o,flow});
 try{return creationStage(init,o,async(c,inputs)=>{const state=await simulation.record(c),samples:Awaited<ReturnType<typeof sampleParticleMapSource>>[]=[];try{const images:{texture?:GpuPixelImage;environment?:GpuPixelImage}={};for(const [name,source]of [['texture',texture],['environment',environment]] as const)if(source){const sample=await sampleParticleMapSource(init,source,c,inputs,o);samples.push(sample);images[name]=sample.image;}return await renderFoamBubbles(init,state,c,o,images);}finally{const rows=await Promise.allSettled(samples.filter(s=>s.ownership==='owned').map(s=>init.gpu.release(s.image)));const errors=rows.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Foam image cleanup failed');}},()=>simulation.dispose(),()=>simulation.inspect());}catch(e){await simulation.dispose();throw e;}
}
