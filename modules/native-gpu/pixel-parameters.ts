import {EngineError} from '../../src/core/errors.ts';
import type {StageSpec} from '../../src/core/types.ts';
import type {NativePixelDescription} from './program.ts';
function fail(message:string):never{throw new EngineError('E_NATIVE_ELIGIBILITY',message);}
export function nativeParameters(stage:StageSpec,props:Record<string,unknown>,description:NativePixelDescription):number[] {
 const values=props.parameters??[];
 if(!Array.isArray(values)||values.length!==description.parameterTypes.length)fail('Stage '+stage.id+' has an invalid parameter count');
 const words=new Uint32Array(values.length),floats=new Float32Array(words.buffer);
 values.forEach((v,i)=>{
  if(typeof v!=='number'||!Number.isFinite(v))fail('Stage '+stage.id+' parameters must be finite numbers');
  if(description.parameterTypes[i]==='f32'){floats[i]=v;if(!Number.isFinite(floats[i]))fail('Stage '+stage.id+' parameter exceeds Float32');}
  else{if(!Number.isInteger(v)||v<0||v>0xffffffff)fail('Stage '+stage.id+' needs unsigned integer parameters');words[i]=v;}
 });
 return Array.from(words);
}
