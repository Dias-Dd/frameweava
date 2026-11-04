import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext,Signal} from '../../../src/core/types.ts';
import type {KeyingOutput} from './types.ts';
export function parameterError(effect:string,path:string,expected:string,unit?:string):never {throw new EngineError('E_NATIVE_KEY_PARAMETER',`${effect}.${path}: expected ${expected}${unit?' ('+unit+')':''}`,{details:{effect,path,expected,...unit?{unit}:{}}});}
export function keyingParameters(effect:string,context?:FrameContext,outerSignal?:AbortSignal){
 const active=(signal?:AbortSignal)=>{if(signal?.aborted||outerSignal?.aborted)throw new EngineError('E_RENDER_CANCELLED',effect+': cancelled before recording',{details:{effect}});};
 function fields(o:KeyingOutput,extra:readonly string[]){if(!o||typeof o!=='object'||Array.isArray(o))parameterError(effect,'options','an options object');for(const path of Object.keys(o))if(!['format','signal',...extra].includes(path))parameterError(effect,path,'a documented option; allocation budgets belong to the Native Stage/session');if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))parameterError(effect,'format','rgba16float or rgba32float');if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))parameterError(effect,'signal','AbortSignal');active(o.signal);}
 function number(value:Signal<number>|undefined,fallback:number,path:string,unit:string,min=-Infinity,max=Infinity){const raw=value===undefined?fallback:value;if(typeof raw!=='number'&&!context)parameterError(effect,path,'number, or Signal with FrameContext',unit);const v=typeof raw==='number'?raw:evaluate(raw,context!);if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||!Number.isFinite(Math.fround(v))||v!==0&&Math.abs(Math.fround(v))<2**-126)parameterError(effect,path,`zero or normal finite Float32-representable value in [${min},${max}]`,unit);return v;}
 function flag(value:boolean|undefined,fallback:boolean,path:string){if(value!==undefined&&typeof value!=='boolean')parameterError(effect,path,'boolean');return value??fallback;}
 function choice<T extends string>(value:T|undefined,fallback:T,values:readonly T[],path:string):T{if(value!==undefined&&!values.includes(value))parameterError(effect,path,values.join(' | '));return value??fallback;}
 return {fields,number,flag,choice,active,error:(path:string,expected:string,unit?:string)=>parameterError(effect,path,expected,unit)};
}
