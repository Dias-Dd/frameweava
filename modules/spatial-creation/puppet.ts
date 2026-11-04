import {createNativePuppetTools,createNativePuppetRenderer} from '../puppet-effects/native.ts';
import type {Puppet,PuppetOptions,PuppetConstraints,PuppetResult} from '../puppet-effects/src/types.ts';
import type {ModuleLoader} from '../../src/plugins/sdk.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import type {CreationInit,CreationOptions,CreationImageResource} from './types.ts';
import {linear709} from '../../src/media/surface.ts';
import {creationStage,validateCreation,requireInput,scalar,fail} from './lifecycle.ts';
import {assetOptions,assetError} from './physics-assets.ts';
import {imagePuppetLayout,checkImagePins,type ImagePin,type AnimatedXY} from './puppet-layout.ts';
import {evaluatePuppetPins,puppetPinConstraints,puppetOverlapField,type PuppetPin} from './puppet-controls.ts';
export type {ImagePin,AnimatedXY} from './puppet-layout.ts';

export interface PuppetImageResource extends CreationImageResource {
}
export interface PuppetImageOptions extends CreationOptions {
 /** Borrow a named image input (default 'image'), or explicitly import a declared image resource. */
 image?:string|PuppetImageResource;
 pins:Readonly<Record<string,ImagePin>>;
 /** Explicit AE-style controls attached to source UV. They use the original ARAP solver. */
 controls?:readonly PuppetPin[];
 /** Configurable CPU control-field/edge work budget; independent of GPU device budgets. */
 maxControlWork?:number;
 segments?:readonly [number,number];margin?:number;maxValueBytes?:number;maxBufferBytes?:number;
 solver?:Omit<PuppetOptions,'worker'|'signal'>;
 constraints?:Pick<PuppetConstraints,'refine'|'foldovers'>;
 sampling?:'linear'|'nearest';boundary?:'zero'|'clamp';
}
export interface PuppetMotionOptions extends Omit<PuppetImageOptions,'pins'> {
 /** Source-image displacement/factor; bend uses radians. Preset-specific defaults are documented. */
 amount?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>;
}
const keys=['image','pins','controls','maxControlWork','segments','margin','maxValueBytes','maxBufferBytes','solver','constraints','sampling','boundary'];
type Targets=Record<string,readonly [number,number]>;
type Motion=(c:FrameContext)=>Targets;
function sourceCheck(image:PuppetImageOptions['image']){
 if(typeof image==='string'){if(!image)assetError('Image input name must not be empty');return;}
 if(image===undefined)return;
 assetOptions(image,['resource','size','decode','missingProfile'],'Puppet image resource');
 if(typeof image.resource!=='string'||!image.resource)assetError('An explicitly declared Resource ID is required');
 if(!Array.isArray(image.size)||image.size.length!==2||image.size.some(v=>!Number.isSafeInteger(v)||v<1))assetError('Resource size requires positive integer width and height');
 if(image.decode!==undefined&&!['icc-sdr','surface-v2'].includes(image.decode))assetError('Unknown image resource decoding profile');
 if(image.missingProfile!==undefined&&!['error','assume-srgb'].includes(image.missingProfile))assetError('Unknown missing-profile policy');
}
function validate(init:CreationInit,o:PuppetImageOptions){
 validateCreation(init,o,keys);sourceCheck(o.image);checkImagePins(o.pins);
 if(o.maxControlWork!==undefined&&(!Number.isSafeInteger(o.maxControlWork)||o.maxControlWork<1))assetError('maxControlWork must be a positive safe integer');
 if(o.controls!==undefined){if(!Array.isArray(o.controls))assetError('Puppet controls must be an array');for(const p of o.controls){assetOptions(p,['kind','at','to','offset','extent','falloff','inFront','amount','rotation','scale','strength'],'Puppet control');if(!['position','overlap','starch','bend','advanced'].includes(p.kind)||!Array.isArray(p.at)||p.at.length!==2||p.at.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1))assetError('Puppet controls require a known kind and normalized rest UV');}}
 if(o.sampling!==undefined&&!['nearest','linear'].includes(o.sampling))assetError('Puppet sampling must be nearest or linear');
 if(o.boundary!==undefined&&!['zero','clamp'].includes(o.boundary))assetError('Puppet boundary must be zero or clamp');
 if(o.constraints){assetOptions(o.constraints,['refine','foldovers'],'Puppet constraints');if(o.constraints.foldovers!==undefined&&!['allow','reject'].includes(o.constraints.foldovers))assetError('foldovers must be reject or allow');}
 if(o.solver)assetOptions(o.solver,['initializationTimeoutMs','maxSolveWork'],'Puppet solver');
}
async function makePuppetImage(init:CreationInit,options:PuppetImageOptions,load?:ModuleLoader,motion?:Motion){
 validate(init,options);if(!load)fail('Puppet image requires its verified loader and explicit WASM authorization','E_CREATION_SERVICE');
 const {post,signal,...raw}=options;let o:typeof raw;try{o=structuredClone(raw);}catch{assetError('Puppet values must be serializable static values or Core Signals');}const format=o.format??'rgba32float';
 // Exact Position/Advanced attachments join the existing topology; no nearest
 // vertex snapping and no change to ordinary JS or simulation time semantics.
 const layoutPins={...o.pins};
 for(const [i,p]of (o.controls??[]).entries())if(p.kind==='position'||p.kind==='advanced'){
  if(!Object.values(layoutPins).some(old=>old.at[0]===p.at[0]&&old.at[1]===p.at[1])){const name='__control_'+i;if(Object.hasOwn(layoutPins,name))assetError('Reserved generated Puppet control pin name');layoutPins[name]={at:p.at};}
 }
 const layoutOptions={...o,pins:layoutPins};
 // Persistent topology must be recorded during Stage initialization. Creating
 // its UV/index buffers during render would make them frame-epoch resources.
 // Only planar positions depend on source aspect; topology and UV do not.
 const topology=imagePuppetLayout(init.width,init.height,1,1,layoutOptions),renderer=await createNativePuppetRenderer(init.gpu,topology.mesh,{width:init.width,height:init.height,bounds:topology.bounds,maxBufferBytes:o.maxBufferBytes});
 let setup:ReturnType<typeof imagePuppetLayout>|undefined,solver:Puppet|undefined,dimensions:string|undefined,last:PuppetResult['diagnostics']|undefined,lastPins:Targets|undefined;
 return creationStage(init,{...o,post,signal},async(c,inputs)=>{
  let imported:GpuPixelImage|undefined;
  try{
   const src=o.image??'image';const image=typeof src==='string'?requireInput(inputs,src):imported=await init.gpu.importResource({version:1,id:src.resource,decode:src.decode??'icc-sdr',missingProfile:src.missingProfile??'error',output:{width:src.size[0],height:src.size[1],format,alpha:'premultiplied',color:linear709}},{signal});
   if(!['rgba16float','rgba32float'].includes(image.info.format)||!['premultiplied','opaque'].includes(image.info.alpha))fail('Puppet image needs a premultiplied/opaque float image','E_CREATION_INPUT');
   const size=image.info.width+'x'+image.info.height;if(dimensions!==undefined&&dimensions!==size)fail('Puppet source dimensions changed; reopen this instance','E_CREATION_INPUT_SIZE');
   if(!setup){
    const layout=imagePuppetLayout(init.width,init.height,image.info.width,image.info.height,layoutOptions);
    solver=await createNativePuppetTools(load).createPuppet(layout.mesh,{...o.solver,signal});setup=layout;dimensions=size;
   }
   const targets:Targets=motion?motion(c):Object.fromEntries(Object.entries(o.pins).map(([name,p])=>[name,[(p.to?scalar(p.to[0],c,'pin '+name+' x'):p.at[0])+scalar(p.offset?.[0]??0,c,'pin '+name+' offset x'),(p.to?scalar(p.to[1],c,'pin '+name+' y'):p.at[1])+scalar(p.offset?.[1]??0,c,'pin '+name+' offset y')]]));
   const pins=Object.entries(targets).map(([name,p])=>({vertexId:setup!.byName[name],position:setup!.world(p)}));
   const controls=evaluatePuppetPins(o.controls??[],c),constraints=puppetPinConstraints(setup.mesh,controls,setup.world,{...o.constraints,pins},o.maxControlWork);
   const pose=await solver!.solve(constraints);last=pose.diagnostics;lastPins=structuredClone(targets);
   // Explicit GPU display conversion only. Pure solver results remain doubles.
   return await renderer.render(pose.positions.map(p=>p.map(Math.fround) as [number,number,number]),image,{format,sampling:o.sampling,boundary:o.boundary,signal,...(controls.some(p=>p.kind==='overlap')?{overlap:puppetOverlapField(setup.mesh,controls,o.maxControlWork)}:{})});
  }finally{if(imported)await init.gpu.release(imported);}
 },async()=>{const result=await Promise.allSettled([renderer?.dispose(),solver?.dispose()]);const errors=result.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Image Puppet disposal failed');},()=>({kind:'image-puppet',topology:'rectangular UV grid with exact pin insertion; not alpha contours',sourceDimensions:dimensions,vertices:setup?.mesh.vertexIds.length,triangles:setup?setup.mesh.indices.length/3:undefined,lastPins,solver:last,renderer:renderer?.stats()}));
}
/** Image + named normalized pins; no mesh, vertex IDs, camera or GPU lifecycle. */
export function puppetImage(init:CreationInit,o:PuppetImageOptions,load?:ModuleLoader){return makePuppetImage(init,o,load);}

export const puppetMotionDefaults={
 sway:{amount:.13,frequency:.65,phase:0},bend:{amount:.3,frequency:.6,phase:0},stretch:{amount:.12,frequency:.7,phase:0},breathe:{amount:.045,frequency:.7,phase:0},wave:{amount:.11,frequency:1.1,phase:0},jelly:{amount:.075,frequency:.9,phase:0},flutter:{amount:.09,frequency:1.2,phase:0},reach:{amount:.14,frequency:.65,phase:0},squash:{amount:.17,frequency:.8,phase:0},
} as const;
for(const defaults of Object.values(puppetMotionDefaults))Object.freeze(defaults);
Object.freeze(puppetMotionDefaults);
export type PuppetMotion=keyof typeof puppetMotionDefaults;
/** @internal Defaults also used by the direct original-solver numerical check. */
export function puppetMotionPins(kind:PuppetMotion):Record<string,ImagePin>{
 if(kind==='breathe')return {tl:{at:[0,0]},tr:{at:[1,0]},bl:{at:[0,1]},br:{at:[1,1]}};
 if(kind==='flutter')return {tl:{at:[0,0]},ml:{at:[0,.5]},bl:{at:[0,1]},tr:{at:[1,0]},mr:{at:[1,.5]},br:{at:[1,1]}};
 if(kind==='jelly')return {tl:{at:[0,0]},tr:{at:[1,0]},ml:{at:[0,.5]},mr:{at:[1,.5]},bl:{at:[0,1]},br:{at:[1,1]}};
 return {left:{at:[0,1]},right:{at:[1,1]},tl:{at:[0,0]},tr:{at:[1,0]},mid:{at:[.5,.5]}};
}
/** Internal pose recipe uses actual Core FrameContext/Signals. It does not
 * integrate time, retain animation state, change fps or invent an interpreter. */
export function puppetMotionTargets(kind:PuppetMotion,pins:Readonly<Record<string,ImagePin>>,o:PuppetMotionOptions,c:FrameContext):Targets{
 const d=puppetMotionDefaults[kind],a=scalar(o.amount??d.amount,c,'Puppet amount',0,kind==='bend'?1:.35),frequency=scalar(o.frequency??d.frequency,c,'Puppet frequency',0),phase=scalar(o.phase??d.phase,c,'Puppet phase'),t=2*Math.PI*c.time*frequency+phase,s=Math.sin(t),pulse=.5-.5*Math.cos(t);
 if(a===0)return Object.fromEntries(Object.entries(pins).map(([name,p])=>[name,[...p.at] as [number,number]]));
 return Object.fromEntries(Object.entries(pins).map(([name,{at:[x,y]}])=>{
  let u=x,v=y;const h=1-y;
  switch(kind){
   case 'sway':u+=a*s*h;break;
   case 'bend':{const angle=a*s*h;u=.5+(x-.5)*Math.cos(angle)+(1-y)*Math.sin(angle);v=1+(x-.5)*Math.sin(angle)-(1-y)*Math.cos(angle);break;}
   case 'stretch':v-=a*pulse*h;u=.5+(x-.5)/(1+a*pulse*h);break;
   case 'breathe':u=.5+(x-.5)*(1+a*s);v=.5+(y-.5)*(1+a*s);break;
   case 'wave':if(name==='tr'){u+=a*s;v-=a*.6*(1-Math.cos(t));}break;
   case 'jelly':u+=a*Math.sin(t-y*Math.PI*1.5);v+=a*.25*Math.cos(t-x*Math.PI);break;
   case 'flutter':{const f=x;u-=a*.3*f*(1-Math.cos(t+y*Math.PI));v+=a*f*Math.sin(t+y*Math.PI*1.5);break;}
   case 'reach':u+=a*s*h*h;v-=a*.45*pulse*h;break;
   case 'squash':v+=a*pulse*h;u=.5+(x-.5)*(1+a*pulse*h);break;
  }
  return [name,[u,v] as const];
 }));
}
function preset(init:CreationInit,o:PuppetMotionOptions,kind:PuppetMotion,load?:ModuleLoader){
 validateCreation(init,o,[...keys.filter(k=>k!=='pins'),'amount','frequency','phase']);
 const {amount,frequency,phase,...base}=o;let animation:{amount?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>};try{animation=structuredClone({amount,frequency,phase});}catch{assetError('Puppet motion must use serializable Core Signals');}const pins=puppetMotionPins(kind);
 return makePuppetImage(init,{...base,pins},load,c=>puppetMotionTargets(kind,pins,animation,c));
}
export function puppetSway(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'sway',load);}
export function puppetBend(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'bend',load);}
export function puppetStretch(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'stretch',load);}
export function puppetBreathe(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'breathe',load);}
export function puppetWave(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'wave',load);}
export function puppetJelly(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'jelly',load);}
export function puppetFlutter(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'flutter',load);}
export function puppetReach(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'reach',load);}
export function puppetSquash(init:CreationInit,o:PuppetMotionOptions={},load?:ModuleLoader){return preset(init,o,'squash',load);}
