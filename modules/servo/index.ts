import type {NativeGpuScope} from '../native-gpu/authoring.ts';
import type {NativeModuleSource,NativeModuleRunOptions} from '../native-gpu/module.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {EngineError} from '../../src/core/errors.ts';
export type ServoOptions=Omit<NativeModuleSource,'version'|'id'|'moduleVersion'>;
/** Persistent DOM/layout effect on the existing native owner. SDR8 is explicit:
 * the input is encoded/clipped for Servo; the original float image is retained.
 * This first profile accepts reviewed local content, not untrusted browsing. */
export async function createServo(gpu:NativeGpuScope,options:ServoOptions){
 const module=await gpu.createModule({...options,version:1,id:'frameweave.servo',moduleVersion:'0.1.0'});let disposed=false;
 return {
  render(input:GpuPixelImage|undefined,options:NativeModuleRunOptions){if(disposed)throw new EngineError('E_NATIVE_MODULE_CLOSED','Servo effect is disposed');return gpu.runModule(module,input?[input]:[],options);},
  async dispose(){if(disposed)return;disposed=true;await gpu.releaseModule(module);},
 };
}

export {servoStage} from './stage.ts';
export type {ServoStageOptions} from './stage.ts';
export type {ServoDocument} from './document.ts';
