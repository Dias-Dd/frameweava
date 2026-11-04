import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {parameters as original} from '../stylize/control.ts';
import type {CompositeOptions} from './types.ts';
export const split=(v:number)=>{const h=Math.fround(v);return [h,Math.fround(v-h)];};
export function fail(effect:string,path:string,expected:string):never{throw new EngineError('E_NATIVE_COMPOSITE_PARAMETER',`${effect}.${path}: expected ${expected}`,{details:{effect,path,expected}});}
function checked<T>(fn:()=>T):T{try{return fn();}catch(error){const e=error as {code?:string;message:string;details?:unknown};if(e.code==='E_NATIVE_STYLE_PARAMETER')throw new EngineError('E_NATIVE_COMPOSITE_PARAMETER',e.message,{details:e.details});throw error;}}
export function parameters(effect:string,context?:FrameContext,signal?:AbortSignal){const p=original(effect,context,signal);return {active:p.active,scalar:(...a:Parameters<typeof p.scalar>)=>checked(()=>p.scalar(...a)),fields:(o:CompositeOptions,extra:readonly string[])=>{if(!o||typeof o!=='object'||Array.isArray(o))fail(effect,'options','typed composite options');for(const key of Object.keys(o))if(!['format','workingColor','opacity','signal',...extra].includes(key))fail(effect,key,'a documented parameter');checked(()=>p.fields(o,['opacity',...extra]));}};}
export function integer(v:number,effect:string,path:string){if(!Number.isSafeInteger(v)||v<0||v>0xffffffff)fail(effect,path,'uint32 integer');return v;}
