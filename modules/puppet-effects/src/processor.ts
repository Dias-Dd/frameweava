// SPDX-License-Identifier: Apache-2.0
import type {ModuleLoader} from '../../../src/plugins/sdk.ts';
import {createModuleClient} from '../runtime/client.ts';
import {encodeMesh,decodeMesh} from './meshing.ts';
import {puppetError,prepareMesh,encodeSolve,decodeSolve} from './solver.ts';
import type {MeshData,PuppetOptions,PuppetProcessor} from './types.ts';
/** Initialize once in Stage init; incoming Surface meshing and ARAP calls reuse C1. */
export function createPuppetProcessorTools(graphics:{validateMeshData(v:unknown):MeshData},load:ModuleLoader){
  return {async createPuppetProcessor(options:PuppetOptions={}):Promise<PuppetProcessor>{
    if(!options||Object.keys(options).some(k=>!['worker','signal','initializationTimeoutMs','maxSolveWork'].includes(k))||options.worker!==undefined&&typeof options.worker!=='boolean'||!Number.isSafeInteger(options.maxSolveWork??256000000)||(options.maxSolveWork??256000000)<1)puppetError('E_PUPPET_PARAMETER','Invalid processor options');
    const client=await createModuleClient(load,{...options,worker:options.worker??true});let closed=false,closing:Promise<{remainingBuffers:number}>|undefined,active:Promise<unknown>|undefined,busy=false;
    function check(){if(closed||closing)puppetError('E_PUPPET_DISPOSED','Processor closed');if(options.signal?.aborted)puppetError('E_PUPPET_CANCELLED','Processor cancelled');if(busy)puppetError('E_PUPPET_BUSY','Await active meshing/solve; calls do not reorder');}
    function run<T>(operation:number,input:Uint8Array,capacity:number,decode:(bytes:Uint8Array)=>T):Promise<T>{busy=true;const result=(async()=>{let bytes:Uint8Array;try{bytes=await client.call(operation,input,capacity);}catch(error){const e=error as Error&{code?:string};puppetError(e.code==='E_WASM_CANCELLED'?'E_PUPPET_CANCELLED':operation===2?/\(-8\)|\(-5\)/.test(e.message)?'E_PUPPET_BUDGET':/\(-10\)/.test(e.message)?'E_PUPPET_HOLES':'E_PUPPET_TOPOLOGY':'E_PUPPET_SOLVE',e.message+'; mesher -8=budget, -9=unrecovered/invalid topology, -10=holes rejected');}if(options.signal?.aborted)puppetError('E_PUPPET_CANCELLED','Cancelled result not published');return decode(bytes);})().finally(()=>{busy=false;});active=result;return result;}
    return {
      generateMesh(source,meshOptions){check();const encoded=encodeMesh(source,meshOptions);return run(2,encoded.bytes,encoded.budget.maxReplyBytes,bytes=>decodeMesh(bytes,encoded,graphics.validateMeshData));},
      solve(mesh,constraints){check();const prepared=prepareMesh(graphics.validateMeshData(mesh)),encoded=encodeSolve(prepared,constraints,options.maxSolveWork??256000000);return run(1,encoded.bytes,16+prepared.mesh.vertexIds.length*16,bytes=>decodeSolve(prepared,encoded,bytes,options.signal));},
      diagnostics:()=>client.diagnostics(),dispose(){return closing??=(async()=>{await active?.catch(()=>{});closed=true;return client.dispose();})();}
    };
  }};
}
