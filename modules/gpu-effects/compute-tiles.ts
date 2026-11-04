import {EngineError} from '../../src/core/errors.ts';
import {size3,computeFields,computeFail,computeAbort} from './compute-contract.ts';
import {withGpuResources} from './resource-arena.ts';
import type {GpuPixelScope} from './pixel-types.ts';
import type {GpuSize3,GpuDataBuffer,GpuComputeKernel,GpuWords,GpuFieldDescriptor} from './compute-types.ts';
export interface GpuTilePlan {readonly version:1;readonly domain:GpuSize3;readonly tile:GpuSize3;readonly halo:GpuSize3;readonly tileCount:number}
export interface GpuTile {readonly index:number;readonly writeOrigin:GpuSize3;readonly writeSize:GpuSize3;readonly readOrigin:GpuSize3;readonly readSize:GpuSize3;readonly writeOffset:GpuSize3;readonly domain:GpuSize3}
const tuple=(v:number[])=>Object.freeze(v) as unknown as GpuSize3;
export function planGpuTiles(options:{domain:GpuSize3;tile:GpuSize3;halo?:GpuSize3;maxTiles?:number}):GpuTilePlan{
 computeFields(options,['domain','tile','halo','maxTiles']);const domain=size3(options.domain,'tile domain'),tile=size3(options.tile,'tile size'),halo=size3(options.halo??[0,0,0],'halo',true),tileCount=domain.reduce((n,v,i)=>n*Math.ceil(v/tile[i]),1),max=options.maxTiles??65536;
 if(!Number.isSafeInteger(max)||max<1||max>1000000||!Number.isSafeInteger(tileCount)||tileCount>max||!Number.isSafeInteger(domain.reduce((a,b)=>a*b,1)))computeFail('E_GPU_TILE_LIMIT','Tile plan exceeds explicit iteration/size budget');return Object.freeze({version:1,domain,tile,halo,tileCount});
}
export function* gpuTiles(plan:GpuTilePlan):Generator<GpuTile>{
 if(plan.version!==1)computeFail('E_GPU_TILE_CONTRACT','Unsupported tile plan');const validated=planGpuTiles({domain:plan.domain,tile:plan.tile,halo:plan.halo,maxTiles:1000000});if(validated.tileCount!==plan.tileCount)computeFail('E_GPU_TILE_CONTRACT','Tile count mismatch');let index=0;
 for(let z=0;z<plan.domain[2];z+=plan.tile[2])for(let y=0;y<plan.domain[1];y+=plan.tile[1])for(let x=0;x<plan.domain[0];x+=plan.tile[0]){
  const origin=[x,y,z],writeSize=origin.map((n,i)=>Math.min(plan.tile[i],plan.domain[i]-n)),readOrigin=origin.map((n,i)=>Math.max(0,n-plan.halo[i])),readSize=origin.map((n,i)=>Math.min(plan.domain[i],n+writeSize[i]+plan.halo[i])-readOrigin[i]);
  yield Object.freeze({index:index++,writeOrigin:tuple(origin),writeSize:tuple(writeSize),readOrigin:tuple(readOrigin),readSize:tuple(readSize),writeOffset:tuple(origin.map((n,i)=>n-readOrigin[i])),domain:plan.domain});
 }
}
/** Dispatch tiling bounds workgroup counts, not the size of a full resident
 * binding. Use processGpuFieldTiles for a bounded streaming working set. */
export async function dispatchGpuTiles(scope:GpuPixelScope,kernel:GpuComputeKernel,buffers:readonly GpuDataBuffer[],plan:GpuTilePlan,options:{parameters?:Float32Array|Uint32Array;signal?:AbortSignal}={}){
 computeFields(options,['parameters','signal']);for(const tile of gpuTiles(plan)){computeAbort(options.signal);if(scope.stats().pendingPasses>=scope.capabilities().maxPendingPasses)await scope.complete({signal:options.signal});await scope.dispatch(kernel,buffers,{workItems:tile.writeSize,origin:tile.writeOrigin,domain:tile.domain,parameters:options.parameters,signal:options.signal});}
}
type FieldSpec=Omit<GpuFieldDescriptor,'dimensions'|'origin'|'domain'>;
export interface GpuFieldTileProcessor {
 plan:GpuTilePlan;kernel:GpuComputeKernel;input:FieldSpec;output:FieldSpec;
 /** Caller supplies explicit resource-backed bytes; no implicit network/FS. */
 read:(tile:GpuTile)=>GpuWords|Promise<GpuWords>;
 /** Receives owned CPU words. This callback is not an atomic file commit. */
 write:(tile:GpuTile,words:GpuWords)=>void|Promise<void>;
 parameters?:Float32Array|Uint32Array;signal?:AbortSignal;
}
export async function processGpuFieldTiles(scope:GpuPixelScope,options:GpuFieldTileProcessor){
 computeFields(options,['plan','kernel','input','output','read','write','parameters','signal']);if(typeof options.read!=='function'||typeof options.write!=='function')computeFail('E_GPU_TILE_CONTRACT','Explicit tile IO callbacks required');let completed=0;
 try{for(const tile of gpuTiles(options.plan)){
  computeAbort(options.signal);const data=await options.read(tile);computeAbort(options.signal);
  await withGpuResources(scope,async arena=>{
   const input=arena.buffer(await scope.createField({...options.input,dimensions:tile.readSize,origin:tile.readOrigin,domain:tile.domain},data)),output=arena.buffer(await scope.createField({...options.output,dimensions:tile.writeSize,origin:tile.writeOrigin,domain:tile.domain}));
   await scope.dispatch(options.kernel,[input,output],{workItems:tile.writeSize,origin:tile.writeOrigin,domain:tile.domain,parameters:options.parameters,signal:options.signal});const result=await scope.readBuffer(output,{signal:options.signal});await options.write(tile,result);completed++;
  });
 }return Object.freeze({version:1,tilesCompleted:completed,streaming:true});}
 catch(e){const error=e as {code?:string;message?:string;details?:unknown};throw new EngineError(error.code??'E_GPU_TILE_EXECUTION',error.message??String(e),{details:{cause:error.details,tilesCompleted:completed,partialOutput:completed>0,atomicOutput:false}});}
}
