import type {StageInit,StageFactory,StageInstance,PortValue} from '../core/types.ts';
import {EngineError} from '../core/errors.ts';
import {deferStageSurfaces} from './surface-storage.ts';
export type ProfessionalStageInit=StageInit&{logicalWidth?:number;logicalHeight?:number;media?:NonNullable<StageInit['media']>&{transport?:'buffer-v1';computeWidth?:number;computeHeight?:number}};
export function assertProfessionalRuntime(init:StageInit){
  if(init.media?.surfaceSchema!=='frameweave.surface/2'||!Array.isArray(init.media.transports)||!init.media.transports.includes('cpu-inline'))throw new EngineError('E_MEDIA_RUNTIME_VERSION','This module requires Surface v2 CPU transport; an older host must not silently screenshot it');
}
/** Opt-in capability negotiation; data-only outputs remain valid. */
export function defineMediaStage<I=Record<string,PortValue>,P=Record<string,unknown>,O=Record<string,PortValue>>(factory:(init:ProfessionalStageInit)=>StageInstance<I,P,O>|Promise<StageInstance<I,P,O>>):StageFactory<I,P,O>{
  return init=>{assertProfessionalRuntime(init);const p=init as ProfessionalStageInit;deferStageSurfaces(p.media?.transport==='buffer-v1');return factory(p.media?.computeWidth?{...p,width:p.media.computeWidth,height:p.media.computeHeight!,pixelRatio:1,logicalWidth:p.width,logicalHeight:p.height}:p);};
}
