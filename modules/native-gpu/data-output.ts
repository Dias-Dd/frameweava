import type {GpuDataBuffer,GpuDataInfo} from '../gpu-effects/compute-types.ts';
export interface NativeBufferOutput {version:1;id:string;buffer:number;info:GpuDataInfo}
export interface NativeDataOutputScope {
 /** Publish a named lease for explicit host export AFTER GPU completion.
  * This does not read pixels, wait, or return CPU values inside renderAt. */
 publishBuffer(id:string,buffer:GpuDataBuffer,options:{version:1}):Promise<void>;
}
