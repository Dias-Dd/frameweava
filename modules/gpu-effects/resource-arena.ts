import {EngineError} from '../../src/core/errors.ts';
import type {GpuPixelScope,GpuPixelImage} from './pixel-types.ts';
import type {GpuDataBuffer} from './compute-types.ts';
export interface GpuResourceArena {
 image<T extends GpuPixelImage>(value:T):T;
 buffer<T extends GpuDataBuffer>(value:T):T;
 adopt<T extends object>(value:T,release:(value:T)=>void|Promise<void>):T;
 keep<T extends object>(value:T):T;
}
/** Small try/finally helper, not another owner/Session. Cleanup is sequential
 * through the existing gate; retaining a result is an explicit keep(). */
export async function withGpuResources<T>(scope:GpuPixelScope,run:(arena:GpuResourceArena)=>T|Promise<T>):Promise<T>{
 const releases=new Map<object,()=>void|Promise<void>>();
 const adopt=<V extends object>(value:V,release:(value:V)=>void|Promise<void>)=>{if(releases.has(value))throw new EngineError('E_GPU_RESOURCE_SCOPE','Resource already adopted');releases.set(value,()=>release(value));return value;};
 const arena:GpuResourceArena={image:v=>adopt(v,x=>scope.release(x)),buffer:v=>adopt(v,x=>scope.releaseBuffer(x)),adopt,keep:v=>{if(!releases.delete(v))throw new EngineError('E_GPU_RESOURCE_SCOPE','Only an adopted resource can be kept');return v;}};
 let result:T|undefined,primary:unknown,failed=false;try{result=await run(arena);}catch(e){primary=e;failed=true;}
 const errors:unknown[]=[];for(const release of [...releases.values()].reverse())try{await release();}catch(e){errors.push(e);}
 if(errors.length){const describe=(e:unknown)=>{const x=e as {code?:string;message?:string};return {code:x?.code??'E_GPU_RESOURCE_CLEANUP',message:x?.message??String(e)};};throw new EngineError(primary instanceof EngineError?primary.code:'E_GPU_RESOURCE_CLEANUP',primary instanceof Error?primary.message:'GPU resource cleanup failed',{details:{primary:failed?describe(primary):null,cleanupErrors:errors.map(describe)}});}
 if(failed)throw primary;return result!;
}
