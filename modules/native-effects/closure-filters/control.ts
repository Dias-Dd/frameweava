import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {parameters as original} from '../stylize/control.ts';
import type {ClosureOutput,Point} from './types.ts';
export const split=(v:number)=>{const h=Math.fround(v);return [h,Math.fround(v-h)];};
export function fail(effect:string,path:string,expected:string):never{throw new EngineError('E_NATIVE_FILTER_PARAMETER',`${effect}.${path}: expected ${expected}`,{details:{effect,path,expected}});}
function checked<T>(fn:()=>T):T{try{return fn();}catch(error){const e=error as {code?:string;message:string;details?:unknown};if(e.code==='E_NATIVE_STYLE_PARAMETER')throw new EngineError('E_NATIVE_FILTER_PARAMETER',e.message,{details:e.details});throw error;}}
export function parameters(effect:string,context?:FrameContext,signal?:AbortSignal){const p=original(effect,context,signal);const scalar=(...a:Parameters<typeof p.scalar>)=>checked(()=>p.scalar(...a));return {active:p.active,scalar,triple:(...a:Parameters<typeof p.triple>)=>checked(()=>p.triple(...a)),fields:(o:ClosureOutput,extra:readonly string[])=>checked(()=>p.fields(o,extra)),point:(value:Point|undefined,fallback:readonly [number,number],path:string)=>{if(value!==undefined&&(!Array.isArray(value)||value.length!==2||value[0]===undefined||value[1]===undefined))fail(effect,path,'two present numeric/Signal leaves');return (value??fallback).map((v,j)=>scalar(v,0,path+'['+j+']')) as [number,number];}};}
export function integer(v:number,effect:string,path:string,min=0,max=0xffffffff){if(!Number.isSafeInteger(v)||v<min||v>max)fail(effect,path,`integer in [${min},${max}]`);return v;}
