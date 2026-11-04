// SPDX-License-Identifier: Apache-2.0
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {MeshData,Vec2} from '../graphics-contracts/types.ts';
import type {PuppetConstraints} from '../puppet-effects/src/types.ts';
import {scalar} from './lifecycle.ts';
import {assetOptions,assetNumber} from './physics-assets.ts';

type XY=readonly [number,number];
type AnimatedXY=readonly [Signal<number>,Signal<number>];
interface Region {at:XY;extent?:Signal<number>;falloff?:'smooth'|'linear'|'constant'}
export interface PositionPin {kind:'position';at:XY;to?:AnimatedXY;offset?:AnimatedXY}
export interface OverlapPin extends Region {kind:'overlap';inFront?:Signal<number>}
export interface StarchPin extends Region {kind:'starch';amount?:Signal<number>}
export interface BendPin extends Region {kind:'bend';rotation?:Signal<number>;scale?:Signal<number>;strength?:Signal<number>}
export interface AdvancedPin extends Omit<BendPin,'kind'> {kind:'advanced';to?:AnimatedXY;offset?:AnimatedXY}
export type PuppetPin=PositionPin|OverlapPin|StarchPin|BendPin|AdvancedPin;
export interface EvaluatedPuppetPin {kind:PuppetPin['kind'];at:XY;to:XY;extent:number;falloff:'smooth'|'linear'|'constant';inFront:number;amount:number;rotation:number;scale:number;strength:number}
const keys={position:['at','to','offset'],overlap:['at','extent','falloff','inFront'],starch:['at','extent','falloff','amount'],bend:['at','extent','falloff','rotation','scale','strength'],advanced:['at','extent','falloff','rotation','scale','strength','to','offset']};
function error(message:string):never {throw Object.assign(new Error(message),{code:'E_CREATION_PUPPET_CONTROL'});}
function xy(value:unknown,name:string,normalized=false):asserts value is XY {
 if(!Array.isArray(value)||value.length!==2)error(name+' requires two components');
 for(const v of value)assetNumber(v,name,normalized?0:-Infinity,normalized?1:Infinity);
}
function pin<K extends PuppetPin['kind']>(kind:K,value:Omit<Extract<PuppetPin,{kind:K}>,'kind'>):Extract<PuppetPin,{kind:K}> {
 assetOptions(value,keys[kind],kind+' pin');xy(value.at,'pin rest UV',true);
 const raw=value as any;if(raw.falloff!==undefined&&!['smooth','linear','constant'].includes(raw.falloff))error('Unknown Puppet pin falloff');
 let copy;try{copy=structuredClone(value);}catch{error('Puppet pins require serializable Core Signals');}
 return {...copy,kind} as Extract<PuppetPin,{kind:K}>;
}
/** Rest attachments and targets use source top-left normalized UV. */
export function puppetPositionPin(o:Omit<PositionPin,'kind'>):PositionPin{return pin('position',o);}
/** Signed In Front contributions add; negative pins cancel positive pins. */
export function puppetOverlapPin(o:Omit<OverlapPin,'kind'>):OverlapPin{return pin('overlap',o);}
/** Positive regional stiffness augments the original ARAP triangle weights. */
export function puppetStarchPin(o:Omit<StarchPin,'kind'>):StarchPin{return pin('starch',o);}
/** Rotation is degrees CCW in the image's XY-up world; scale is positive. */
export function puppetBendPin(o:Omit<BendPin,'kind'>):BendPin{return pin('bend',o);}
/** Position plus regional rotation/scale, solved by the existing ARAP kernel. */
export function puppetAdvancedPin(o:Omit<AdvancedPin,'kind'>):AdvancedPin{return pin('advanced',o);}

/** Pure current-context evaluation. It retains no previous-frame values. */
export function evaluatePuppetPins(values:readonly PuppetPin[],c:FrameContext):EvaluatedPuppetPin[] {
 if(!Array.isArray(values))error('Puppet controls must be an array');
 return values.map(value=>{
  if(!value||!Object.hasOwn(keys,value.kind))error('Unknown Puppet control kind');
  const {kind,...raw}=value;pin(kind,raw as any);const r=raw as any,at=[...r.at] as Vec2;
  const pair=(v:AnimatedXY|undefined,d:XY,name:string):Vec2=>{if(v===undefined)return [...d];if(!Array.isArray(v)||v.length!==2)error(name+' requires two scalar Signals');return [scalar(v[0],c,name+' x'),scalar(v[1],c,name+' y')];};
  const to=pair(r.to,at,'pin target'),offset=pair(r.offset,[0,0],'pin offset');
  const resolved:EvaluatedPuppetPin={kind,at,to:[to[0]+offset[0],to[1]+offset[1]],extent:scalar(r.extent??.3,c,'pin extent',0),falloff:r.falloff??'smooth',inFront:scalar(r.inFront??1,c,'pin In Front'),amount:scalar(r.amount??4,c,'pin stiffness',0),rotation:scalar(r.rotation??0,c,'pin rotation')*Math.PI/180,scale:scalar(r.scale??1,c,'pin scale',Number.MIN_VALUE),strength:scalar(r.strength??10,c,'pin strength',0)};
  if(!resolved.to.every(Number.isFinite)||!Number.isFinite(resolved.rotation))error('Puppet control overflow');return resolved;
 });
}
function influence(uv:XY,p:EvaluatedPuppetPin){
 const distance=Math.hypot(uv[0]-p.at[0],uv[1]-p.at[1]);if(p.extent===0)return Number(distance===0);
 if(distance>=p.extent)return 0;if(p.falloff==='constant')return 1;
 const t=1-distance/p.extent;return p.falloff==='linear'?t:t*t*(3-2*t);
}
function plan(mesh:MeshData,pins:readonly EvaluatedPuppetPin[],size:number,maxWork:number){
 if(!mesh.uv||mesh.uvOrigin!=='top-left'||mesh.uv.length!==mesh.vertexIds.length)error('Explicit aligned top-left mesh UVs required');
 if(!Number.isSafeInteger(maxWork)||maxWork<1||!Number.isSafeInteger(size*pins.length)||size*pins.length>maxWork)error('Puppet control work budget exceeded');
}
/** Per-vertex logical visibility field attached to REST UV, before deformation. */
export function puppetOverlapField(mesh:MeshData,pins:readonly EvaluatedPuppetPin[],maxWork=2e7):number[]{
 const active=pins.filter(p=>p.kind==='overlap');plan(mesh,active,mesh.vertexIds.length,maxWork);
 return mesh.uv!.map(uv=>{const v=active.reduce((sum,p)=>sum+p.inFront*influence(uv,p),0);if(!Number.isFinite(v))error('Overlap field overflow');return v;});
}
/** Triangle stiffness is sampled at rest-UV centroids; existing base weights survive. */
export function puppetStarchWeights(mesh:MeshData,pins:readonly EvaluatedPuppetPin[],base?:readonly number[],maxWork=2e7):number[]{
 const active=pins.filter(p=>p.kind==='starch'),count=mesh.indices.length/3;plan(mesh,active,count,maxWork);
 if(base&&base.length!==count)error('Base stiffness must align with every triangle');
 return Array.from({length:count},(_,i)=>{
  const ids=mesh.indices.slice(i*3,i*3+3),uv:XY=[ids.reduce((s,j)=>s+mesh.uv![j][0],0)/3,ids.reduce((s,j)=>s+mesh.uv![j][1],0)/3];
  const value=(base?.[i]??1)+active.reduce((s,p)=>s+p.amount*influence(uv,p),0);
  if(!Number.isFinite(value)||value<=0||value>1e9)error('Puppet stiffness exceeds the original ARAP domain');return value;
 });
}
/** Unique rest edges become the original kernel's weighted oriented-vector targets. */
export function puppetBendEdges(mesh:MeshData,pins:readonly EvaluatedPuppetPin[],maxWork=2e7):NonNullable<PuppetConstraints['edges']>{
 const active=pins.filter(p=>(p.kind==='bend'||p.kind==='advanced')&&p.strength>0);plan(mesh,active,mesh.indices.length,maxWork);
 const found=new Set<string>(),edges:NonNullable<PuppetConstraints['edges']>=[];
 for(let i=0;i<mesh.indices.length;i+=3)for(const pair of [[0,1],[1,2],[2,0]]){
  const a=mesh.indices[i+pair[0]],b=mesh.indices[i+pair[1]],key=Math.min(a,b)+':'+Math.max(a,b);if(found.has(key))continue;found.add(key);
  const uv:XY=[(mesh.uv![a][0]+mesh.uv![b][0])/2,(mesh.uv![a][1]+mesh.uv![b][1])/2],v:Vec2=[mesh.restPositions[b][0]-mesh.restPositions[a][0],mesh.restPositions[b][1]-mesh.restPositions[a][1]];
  for(const p of active){const weight=p.strength*influence(uv,p);if(weight===0)continue;
   const cos=Math.cos(p.rotation)*p.scale,sin=Math.sin(p.rotation)*p.scale,vector:Vec2=[v[0]*cos-v[1]*sin,v[0]*sin+v[1]*cos];
   if(!Number.isFinite(weight)||!vector.every(Number.isFinite))error('Puppet edge target overflow');
   edges.push({from:mesh.vertexIds[a],to:mesh.vertexIds[b],vector,weight});
  }
 }return edges;
}
/** Build original constraints. Position attachments must be inserted exactly in the rest mesh. */
export function puppetPinConstraints(mesh:MeshData,pins:readonly EvaluatedPuppetPin[],world:(uv:XY)=>Vec2,base:PuppetConstraints,maxWork=2e7):PuppetConstraints{
 plan(mesh,pins,mesh.vertexIds.length,maxWork);const targets=new Map(base.pins.map(p=>[p.vertexId,structuredClone(p)]));
 for(const p of pins)if(p.kind==='position'||p.kind==='advanced'){
  const index=mesh.uv!.findIndex(uv=>uv[0]===p.at[0]&&uv[1]===p.at[1]);if(index<0)error('Position/Advanced pin rest attachment must be inserted in the mesh; no snapping');
  const position=world(p.to);xy(position,'world target');targets.set(mesh.vertexIds[index],{vertexId:mesh.vertexIds[index],position});
 }
 return {...base,pins:[...targets.values()],...(pins.some(p=>p.kind==='starch')?{triangleWeights:puppetStarchWeights(mesh,pins,base.triangleWeights,maxWork)}:{}),...(pins.some(p=>p.kind==='bend'||p.kind==='advanced')?{edges:[...base.edges??[],...puppetBendEdges(mesh,pins,maxWork)]}:{})};
}
