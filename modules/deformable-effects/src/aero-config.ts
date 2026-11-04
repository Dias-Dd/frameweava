import {evaluate} from '../../../src/core/animation.ts';import type {FrameContext,Signal} from '../../../src/core/types.ts';
import {object,array,finite,integer,signal,deformableError} from './config.ts';
import {aerodynamicConfiguration,forceCapacity} from './aero-codec.ts';import type {Vec3} from './types.ts';
export function normalizeAerodynamics(input:unknown,rest:Vec3[],context:FrameContext,maxFaces:number){
 const o=object(input,'aerodynamics',['triangles','wind','density','normalDrag','tangentialDrag','pressure']),seen=new Set<string>(),triangles=array(o.triangles,'aerodynamic triangles',maxFaces).map(f=>{
  const ids=array(f,'triangle',3).map(i=>integer(i,'aerodynamic vertex',0,rest.length-1));if(ids.length!==3||new Set(ids).size!==3)deformableError('E_DEFORM_PARAMETER','Three distinct face vertices required');const key=[...ids].sort((a,b)=>a-b).join(',');if(seen.has(key))deformableError('E_DEFORM_TOPOLOGY','Duplicate aerodynamic face');seen.add(key);
  const [a,b,c]=ids.map(i=>rest[i]),u=b.map((x,k)=>finite(x-a[k],'face edge')),v=c.map((x,k)=>finite(x-a[k],'face edge')),area=finite(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])*.5,'rest face area',Number.MIN_VALUE);return ids as [number,number,number];
 });if(!triangles.length)deformableError('E_DEFORM_PARAMETER','Aerodynamics needs at least one triangle');
 const scalar=(value:unknown,fallback:number,name:string,min:number):Signal<number>=>{const s=signal([value===undefined?fallback:value,0,0],name,context)[0];finite(evaluate(s,context),name,min);return s;};
 return {triangles,wind:signal(o.wind??[0,0,0],'wind',context),density:scalar(o.density,1.225,'air density',0),normalDrag:scalar(o.normalDrag,1,'normal drag',0),tangentialDrag:scalar(o.tangentialDrag,0,'tangential drag',0),pressure:scalar(o.pressure,0,'surface pressure',-Number.MAX_VALUE),native:aerodynamicConfiguration(triangles),capacity:forceCapacity(rest.length),work:rest.length+triangles.length*256};
}
