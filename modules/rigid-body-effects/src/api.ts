import {createStaticCollisionEnvironment} from './static-environment.ts';
import type {ModuleLoader} from '../../../src/plugins/sdk.ts';
import {createModuleClient} from '../runtime/client.ts';
import {encode,decode} from '../runtime/physics.ts';
import {normalizeWorld,rigidError,sampleContext,queryInput} from './config.ts';
import type {RigidWorldOptions,RigidClientOptions,RigidSimulation,RigidDiagnostics,RigidFrame} from './types.ts';
export function createRigidBodyTools(load:ModuleLoader){
  return {createCollisionEnvironment:(input:RigidWorldOptions,options?:import('./types.ts').StaticCollisionClientOptions)=>createStaticCollisionEnvironment(load,input,options),async createRigidBodies(input:RigidWorldOptions,options:RigidClientOptions={}):Promise<RigidSimulation>{
    const prepared=normalizeWorld(input),source=structuredClone(input);
    if(!options||Object.keys(options).some(k=>!['worker','signal','initializationTimeoutMs'].includes(k))||options.worker!==undefined&&typeof options.worker!=='boolean')rigidError('E_RIGID_PARAMETER','Invalid client options');
    const signal=options.signal,client=await createModuleClient(load,{...options,worker:options.worker??true});
    try{await client.call(100,encode(source),64);}catch(error){await client.dispose();throw error;}
    let active:Promise<unknown>|undefined,busy=false,disposed=false,closing:Promise<{remainingBuffers:number}>|undefined;
    async function invoke(op:number,value:unknown){
      if(disposed||closing)rigidError('E_RIGID_DISPOSED','Rigid simulation is disposed');if(signal?.aborted)rigidError('E_RIGID_CANCELLED','Simulation signal aborted');if(busy)rigidError('E_RIGID_BUSY','Await the active sample/reset; calls are not silently reordered');busy=true;
      const call=(async()=>{try{const result=decode(await client.call(op,encode(value),prepared.budgets.maxOutputBytes));if(signal?.aborted)rigidError('E_RIGID_CANCELLED','Cancelled result is not published');return result;}catch(error){if((error as {code?:string}).code==='E_WASM_CANCELLED')rigidError('E_RIGID_CANCELLED','Simulation Worker cancelled');throw error;}})().finally(()=>{busy=false;});active=call;return call;
    }
    return {
      sample:async context=>invoke(101,sampleContext(context,prepared.fps,prepared.substeps)) as Promise<RigidFrame>,
      colliderMeshes:async()=>invoke(103,{}) as ReturnType<RigidSimulation['colliderMeshes']>,
      castRay:async query=>{queryInput('ray',query,prepared);return invoke(104,query) as ReturnType<RigidSimulation['castRay']>;},
      castShape:async query=>{queryInput('cast',query,prepared);return invoke(105,query) as ReturnType<RigidSimulation['castShape']>;},
      intersections:async query=>{queryInput('overlap',query,prepared);return invoke(106,query) as ReturnType<RigidSimulation['intersections']>;},
      async reset(){await invoke(102,{});},
      async diagnostics(){if(disposed)return {disposed:true,buffers:0,worlds:0,failed:false,currentStep:0,checkpointSteps:[],snapshotBytes:0,plannedCheckpointBytes:0,physicalPeakBytes:null,backend:'rapier3d-f64-wasm',rapier:'0.36.1',precision:'f64',determinism:'enhanced'};if(busy||closing)rigidError('E_RIGID_BUSY','Await the active sample/close before diagnostics');return await client.diagnostics() as RigidDiagnostics;},
      dispose(){return closing??=(async()=>{await active?.catch(()=>{});disposed=true;return client.dispose();})();}
    };
  }};
}
