// SPDX-License-Identifier: MIT
// Producer weights and shoaling adaptation: EffectCraft sim2/surfaces.rs.
import type {Signal,FrameContext} from '../../src/core/types.ts';
import {assetOptions,assetNumber} from './physics-assets.ts';
import {scalar,fail} from './lifecycle.ts';
import {prepareParticleMapSource,type ParticleMapSource} from './mapped-particle-field.ts';
export type WaterXY=readonly [Signal<number>,Signal<number>];
export interface WaveSource {kind:'point'|'line'|'ring';position?:WaterXY;radius?:readonly [number,number];angle?:Signal<number>;amplitude?:Signal<number>;frequency?:Signal<number>;phase?:Signal<number>;start?:number;end?:number}
export interface WaveObstacle {kind:'circle'|'box';position?:WaterXY;size:readonly [number,number];angle?:Signal<number>}
export interface WaveTerrain {kind?:'flat'|'shore'|'island';level?:number;elevation?:number;center?:readonly [number,number];radius?:readonly [number,number];slope?:readonly [number,number];map?:ParticleMapSource;mapScale?:number;waveStrength?:number}
export interface WaveImpulse {position:readonly [number,number];radius:number;amplitude:number;velocity?:number}
const n=(v:number,name:string,min=-Infinity,max=Infinity)=>{assetNumber(v,name,min,max);if(!Number.isFinite(Math.fround(v)))fail(name+' must be representable in F32');return v;};
function xy(v:readonly number[],name:string,min=-Infinity){if(!Array.isArray(v)||v.length!==2)fail(name+' requires XY');v.forEach(x=>n(x,name,min));return [...v] as [number,number];}
export function waveSource(o:WaveSource):WaveSource{assetOptions(o,['kind','position','radius','angle','amplitude','frequency','phase','start','end'],'wave source');if(!['point','line','ring'].includes(o.kind))fail('Unknown wave source');xy(o.radius??[.12,.12],'source radius',Number.MIN_VALUE);if(o.position&&(!Array.isArray(o.position)||o.position.length!==2))fail('Source position requires scalar XY Signals');n(o.start??0,'source start',0);if(o.end!==undefined&&o.end<= (o.start??0))fail('Source end must follow start');if(o.end!==undefined)n(o.end,'source end',0);return structuredClone(o);}
export function wavePointSource(o:Omit<WaveSource,'kind'>={}):WaveSource{return waveSource({kind:'point',radius:[.12,.12],...o});}
export function waveLineSource(o:Omit<WaveSource,'kind'>={}):WaveSource{return waveSource({kind:'line',radius:[.65,.06],...o});}
export function waveRingSource(o:Omit<WaveSource,'kind'>={}):WaveSource{return waveSource({kind:'ring',radius:[.4,.4],...o});}
export function waveSourceWeight(source:WaveSource,point:readonly [number,number],c:FrameContext){const s=waveSource(source),p=s.position??[0,0],r=s.radius??[.12,.12],angle=scalar(s.angle??0,c,'source angle')*Math.PI/180,dx=n(point[0],'point X')-scalar(p[0],c,'source X'),dy=n(point[1],'point Y')-scalar(p[1],c,'source Y'),u=(dx*Math.cos(angle)+dy*Math.sin(angle))/r[0],v=(-dx*Math.sin(angle)+dy*Math.cos(angle))/r[1],d=s.kind==='line'?Math.max(Math.abs(u),Math.abs(v)):s.kind==='ring'?Math.abs(Math.hypot(u,v)-1)*8:Math.hypot(u,v);return Math.max(0,1-d);}
export function waveObstacle(o:WaveObstacle):WaveObstacle{assetOptions(o,['kind','position','size','angle'],'wave obstacle');if(!['circle','box'].includes(o.kind))fail('Unknown wave obstacle');xy(o.size,'obstacle size',Number.MIN_VALUE);if(o.position&&(!Array.isArray(o.position)||o.position.length!==2))fail('Obstacle position requires XY Signals');return structuredClone(o);}
/** Static terrain is evaluated at logical zero on every reset/replay. */
export function waveTerrain(o:WaveTerrain={}):WaveTerrain{assetOptions(o,['kind','level','elevation','center','radius','slope','map','mapScale','waveStrength'],'wave terrain');if(o.kind!==undefined&&!['flat','shore','island'].includes(o.kind))fail('Unknown terrain');n(o.level??1,'water level',Number.MIN_VALUE);n(o.elevation??1.4,'terrain elevation');xy(o.center??[0,0],'terrain center');xy(o.radius??[.5,.5],'terrain radius',Number.MIN_VALUE);xy(o.slope??[.7,0],'terrain slope');n(o.mapScale??1,'map scale');n(o.waveStrength??1,'wave strength',0,1);const {map,...data}=o;return {...structuredClone(data),...map?{map:prepareParticleMapSource(map,true)}:{}};}
export function waveImpulse(o:WaveImpulse):WaveImpulse{assetOptions(o,['position','radius','amplitude','velocity'],'wave impulse');xy(o.position,'impulse position');n(o.radius,'impulse radius',Number.MIN_VALUE);n(o.amplitude,'impulse amplitude');n(o.velocity??0,'impulse velocity');return structuredClone(o);}
/** Explicit CFL qualification. No hidden frame-time or resolution changes. */
export function waveCfl(speed:number,dt:number,spacing:readonly [number,number]){n(speed,'speed',0);n(dt,'dt',0);xy(spacing,'spacing',Number.MIN_VALUE);return speed*speed*dt*dt*(1/spacing[0]**2+1/spacing[1]**2);}
