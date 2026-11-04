import {evaluate} from '../../src/core/animation.ts';
import {assertJson,checkSignals} from '../../src/core/graph.ts';
import type {FrameContext} from '../../src/core/types.ts';
import type {GpuDataBuffer,GpuFieldDescriptor} from '../gpu-effects/index.ts';
import type {Axis,DeformOptions} from './types.ts';
export function fail(code:string,message:string):never {throw Object.assign(new Error(message),{code:'E_MESH_DEFORM_'+code});}
export function num(v:unknown,name:string,min=-1e8,max=1e8):number {if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0)fail('PARAMETER',name+' outside qualified f32 domain');return v;}
export function vec(v:unknown,name:string):number[]{if(!Array.isArray(v)||v.length!==3||Reflect.ownKeys(v).length!==4)fail('PARAMETER',name+' needs three plain values');for(let i=0;i<3;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!('value'in d))fail('PARAMETER','Vector accessors unsupported');}return v.map(x=>num(x,name));}
export function unit(v:number[]){const n=Math.hypot(...v);if(n<1e-8)fail('PARAMETER','Direction must be nonzero');return v.map(x=>x/n);}
export function axis(v:unknown='y'):number{if(!['x','y','z'].includes(v as string))fail('PARAMETER','Unknown axis');return ['x','y','z'].indexOf(v as Axis);}
export function scalar(v:unknown,d:number,c:FrameContext,name:string,min=-1e4,max=1e4){return num(evaluate(v??d,c),name,min,max);}
export function animated(v:unknown,d:number[],c:FrameContext,name:string){const out=evaluate(v??d,c);return vec(out,name);}
export function position(v:GpuDataBuffer,semantic='position'){const i=v?.info;if(!i||i.kind!=='data'||i.type!=='f32'||i.components!==3||i.semantic!==semantic||!i.space||i.units!==(semantic==='normal'?'dimensionless':'meter')||i.dimensions[1]!==1||i.dimensions[2]!==1||i.origin.some(x=>x!==0)||i.domain.some((x,k)=>x!==i.dimensions[k]))fail('FIELD','Expected full resident f32 XYZ '+semantic+' field with explicit space and units');return i.dimensions[0];}
export function compatible(a:GpuDataBuffer,b:GpuDataBuffer,semantic='position'){const n=position(a);if(position(b,semantic)!==n||a.info.space!==b.info.space)fail('LAYOUT','Vertex count/order and coordinate space must match');return n;}
export function like(v:GpuDataBuffer):GpuFieldDescriptor{const {type,dimensions,components,semantic,space,units,channels,metadata}=v.info;return {type,dimensions,components,semantic,space,units,...channels?{channels}:{},...metadata!==undefined?{metadata}:{}};}
export function prepare(o:DeformOptions,keys:string[],c:FrameContext,n:number,cost=48){if(!o||![Object.prototype,null].includes(Object.getPrototypeOf(o)))fail('PARAMETER','Options must be plain data');for(const k of Reflect.ownKeys(o)){const d=Object.getOwnPropertyDescriptor(o,k)!;if(typeof k!=='string'||!['signal','maxWork','maxCoordinate','center',...keys].includes(k)||!('value'in d)||!d.enumerable)fail('PARAMETER','Unknown/accessor option');}
 const {signal,...data}=o;assertJson(data);checkSignals(data);if(signal!==undefined&&!(signal instanceof AbortSignal))fail('PARAMETER','Expected local AbortSignal');if(signal?.aborted)throw Object.assign(new Error('Cancelled before GPU work'),{code:'E_RENDER_CANCELLED'});
 if(!Number.isSafeInteger(c.frame)||!c.fps||!Number.isSafeInteger(c.fps.num)||!Number.isSafeInteger(c.fps.den)||c.fps.num<=0||c.fps.den<=0||!Number.isFinite(c.time)||Math.abs(c.time-c.frame*c.fps.den/c.fps.num)>1e-9*Math.max(1,Math.abs(c.time)))fail('TIME','FrameContext frame/time disagree');
 const budget=num(o.maxWork??1e9,'maxWork',1,Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(budget)||n*cost>budget)fail('BUDGET','Complete geometry exceeds maxWork; no automatic reduction');
 const p=new Float32Array(48);p.set(vec(o.center??[0,0,0],'center'),0);p[3]=num(o.maxCoordinate??1e4,'maxCoordinate',1e-4,1e8);return p;
}
