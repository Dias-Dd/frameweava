import {creationColor} from './colors.ts';
import {EngineError} from '../../src/core/errors.ts';
import {evaluate} from '../../src/core/animation.ts';
import {linear709} from '../../src/media/surface.ts';
import {time as checkTime} from '../spatial-fields/parameters.ts';
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import type {CreationInit,CreationInputs,CreationOptions,CreationStage,CreationPost,AnimatedVec3,MaterialOptions} from './types.ts';
import {createCreationFinish,prepareFinish} from './finish.ts';

export function fail(message:string,code='E_CREATION_PARAMETER'):never{throw new EngineError(code,message);}
export function scalar(value:Signal<number>,context:FrameContext,name:string,min=-Infinity,max=Infinity){const result=evaluate(value,context);if(typeof result!=='number'||!Number.isFinite(result)||result<min||result>max)fail(name+' must evaluate to a finite number in ['+min+', '+max+']');return result;}
export function vector(value:AnimatedVec3,context:FrameContext,name:string):[number,number,number]{if(!Array.isArray(value)||value.length!==3)fail(name+' requires three scalar Signals');return value.map((v,i)=>scalar(v,context,name+'['+i+']')) as [number,number,number];}
export function material(o:MaterialOptions,c:FrameContext){return {color:creationColor(o.ink??[.12,.52,.9],c,'ink'),emissive:creationColor(o.emissive??[0,0,0],c,'emissive'),opacity:scalar(o.opacity??1,c,'opacity',0,1),roughness:scalar(o.roughness??.3,c,'roughness',0,1),metalness:scalar(o.metalness??.35,c,'metalness',0,1)};}
export const defaultCamera={projection:'orthographic' as const,position:[0,0,5] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:30,viewHeight:3};
export function requireInput(inputs:CreationInputs,name:string){const image=inputs[name];if(!image)fail('Missing declared Native image input: '+name,'E_CREATION_INPUT');return image;}
export function ownedPost(apply:CreationPost['apply']):CreationPost{return {ownership:'owned',apply};}
export function retainedPost(apply:CreationPost['apply']):CreationPost{return {ownership:'retained',apply};}
export const materialKeys=['ink','opacity','emissive','roughness','metalness'];
/** Validate before allocating immutable geometry or constructing a solver. */
export function validateCreation(init:CreationInit,o:CreationOptions,keys:readonly string[]=[]){
 if(!init?.gpu||init.gpu.capabilities().backend!=='native-wgpu'||init.gpu.capabilities().hardwareVerified!==true)fail('An admitted Native GPU Stage scope is required','E_CREATION_DEVICE');
 if(!Number.isSafeInteger(init.width)||!Number.isSafeInteger(init.height)||init.width<1||init.height<1)fail('Stage dimensions must be positive integers');
 if(!o||!['object'].includes(typeof o)||![Object.prototype,null].includes(Object.getPrototypeOf(o)))fail('Expected plain creation options');
 for(const key of Reflect.ownKeys(o)){const d=Object.getOwnPropertyDescriptor(o,key)!;if(typeof key!=='string'||!['format','finish','post','signal',...keys].includes(key)||!d.enumerable||!('value'in d))fail('Unknown or accessor creation option: '+String(key));}
 if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('Creation output requires F16 or F32');
 if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))fail('signal must be an AbortSignal');
 if(o.post!==undefined&&!Array.isArray(o.post))fail('post must be an array of explicit ownership adapters');
 for(const p of o.post??[])if(!p||!['owned','retained'].includes(p.ownership)||typeof p.apply!=='function')fail('Post requires explicit ownership and apply(input, context)');
 prepareFinish(o.finish);
}

/** Local adapter, not a new public GPU ABI. Original input is always BORROWED.
 * A retained provider result is copied on GPU immediately, before another call
 * can revoke it. Identity returns never transfer ownership. */
export function createPostChain(init:CreationInit,posts:readonly CreationPost[]=[]){
 const gpu=init.gpu,list=[...posts];let copy:Promise<GpuPixelKernel>|undefined;
 for(const p of list)if(!p||!['owned','retained'].includes(p.ownership)||typeof p.apply!=='function')fail('Post requires explicit ownership and apply(input, context)');
 return async(input:GpuPixelImage,c:FrameContext,signal?:AbortSignal)=>{
  let current=input;const owned=new Set<GpuPixelImage>();
  try{for(const post of list){if(signal?.aborted)fail('Creation cancelled','E_RENDER_CANCELLED');const next=await post.apply(current,c);if(!next?.info)fail('Post must return a Native image','E_CREATION_RESULT');
   if(next===current||next===input||owned.has(next)){current=next;continue;}
   if(post.ownership==='owned'){owned.add(next);current=next;}
   else{copy??=gpu.compile({abiVersion:1,id:'frameweave/spatial-creation/retained-copy',version:'0.1.0',inputCount:1,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return read0(vec2i(p));}'});current=await gpu.run(await copy,[next],{output:{...next.info},signal});owned.add(current);}
  }if(signal?.aborted)fail('Creation cancelled','E_RENDER_CANCELLED');owned.delete(current);return current;
  }finally{const results=await Promise.allSettled([...owned].map(image=>gpu.release(image)));const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Creation post cleanup failed');}
 };
}
/** Per-instance guard. Borrowed scope is NEVER disposed. Session remains the
 * owner of queue completion, frame epochs, device loss and reconstruction. */
export function creationStage(init:CreationInit,o:CreationOptions,render:(c:FrameContext,i:CreationInputs,p:Record<string,unknown>)=>Promise<GpuPixelImage>,dispose:()=>unknown|Promise<unknown>=()=>{},details:()=>Record<string,unknown>=()=>({})):CreationStage{
 if(!init?.gpu||init.gpu.capabilities().backend!=='native-wgpu'||init.gpu.capabilities().hardwareVerified!==true)fail('An admitted Native GPU Stage scope is required','E_CREATION_DEVICE');
 if(!Number.isSafeInteger(init.width)||!Number.isSafeInteger(init.height)||init.width<1||init.height<1)fail('Stage dimensions must be positive integers');
 if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('Creation output requires F16 or F32');
 const post=createPostChain(init,o.post),finish=createCreationFinish(init,o.finish);let closed=false,pending:Promise<GpuPixelImage>|undefined,closing:Promise<void>|undefined,frames=0;
 return {renderAt(c,inputs={},props={}){
  if(closed)return Promise.reject(new EngineError('E_CREATION_CLOSED','Creation Stage disposed'));
  if(pending)return Promise.reject(new EngineError('E_CREATION_BUSY','Await this Stage recording before reusing it'));
  const task=(async()=>{checkTime(c);if(o.signal?.aborted)fail('Creation cancelled','E_RENDER_CANCELLED');let source:GpuPixelImage|undefined,finished:GpuPixelImage|undefined,result:GpuPixelImage|undefined,success=false;
   try{source=await render(c,inputs,props);finished=await finish.apply(source,c,o.signal);result=await post(finished,c,o.signal);if(result.info.width!==init.width||result.info.height!==init.height||result.info.format!==(o.format??'rgba32float')||!['premultiplied','opaque'].includes(result.info.alpha)||(Object.keys(linear709) as (keyof typeof linear709)[]).some(k=>result!.info.color[k]!==linear709[k]))fail('Creation post must preserve Stage dimensions, declared float format, linear Rec709 and PM/opaque alpha','E_CREATION_RESULT');if(o.signal?.aborted)fail('Creation cancelled','E_RENDER_CANCELLED');frames++;success=true;return result;
   }finally{const release=new Set([source,finished,result].filter((x):x is GpuPixelImage=>x!==undefined&&(!success||x!==result)));const results=await Promise.allSettled([...release].map(i=>init.gpu.release(i)));const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Creation output cleanup failed');}
  })();pending=task;void task.then(()=>{pending=undefined;},()=>{pending=undefined;});return task;
 },dispose(){if(closing)return closing;closed=true;return closing=(async()=>{await pending?.catch(()=>{});const results=await Promise.allSettled([finish.dispose(),Promise.resolve().then(dispose)]);const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Creation disposal failed');})();},inspect:()=>({closed,frames,backend:'native-wgpu',completion:'recorded-only',finish:finish.stats(),...details()})};
}
