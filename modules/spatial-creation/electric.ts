import {createLightningGeometry} from '../skeletal-effects/native.ts';
import type {LightningGeometry,LightningGeometryOptions,Vec3} from '../skeletal-effects/native.ts';
import {seededRandom} from '../../src/core/time.ts';
import type {Signal} from '../../src/core/types.ts';
import type {CreationInit,CreationOptions,AnimatedVec3} from './types.ts';
import {validateCreation,scalar,vector,fail} from './lifecycle.ts';
import {geometryCreator,strokeSnapshot,strokeAppearanceKeys,checkStrokeAppearance,aggregateGeometry,neonFinish,type StrokeAppearance} from './strokes.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
import {starField,type ParticleFieldOptions} from './particle-field.ts';
import {assetOptions} from './physics-assets.ts';
export interface LightningOptions extends StrokeAppearance {
 start?:AnimatedVec3;end?:AnimatedVec3;thickness?:Signal<number>;amplitude?:Signal<number>;phase?:Signal<number>;speed?:Signal<number>;seed?:number;
 topology?:Omit<LightningGeometryOptions,'id'|'seed'|'maxBytes'|'maxWork'>;
}
export interface PlasmaOrbOptions extends Omit<LightningOptions,'start'|'end'> {center?:AnimatedVec3;radius?:Signal<number>;count?:number}
const boltKeys=[...strokeAppearanceKeys,'start','end','thickness','amplitude','phase','speed','seed','topology'];
const defaults={bolt:{start:[-1.4,.6,0],end:[1.4,-.6,0],thickness:.018,amplitude:.12,ink:[.22,1.8,4],speed:3},arc:{start:[-1.2,0,0],end:[1.2,0,0],thickness:.014,amplitude:.23,ink:[.12,3,2.1],speed:4.5},strike:{start:[0,1.25,0],end:[.12,-1.25,0],thickness:.022,amplitude:.14,ink:[1.2,.45,4],speed:5}} as const;
function seed(init:CreationInit,o:LightningOptions){const s=o.seed??init.seed;if(!Number.isInteger(s)||s<0||s>0xffffffff)fail('Lightning seed must be uint32');return s;}
function topology(init:CreationInit,o:LightningOptions,i=0){if(o.topology!==undefined)assetOptions(o.topology,['subdivisions','branchGenerations','branchesPerBolt','roughness','branchLength','branchAngle','branchRadius','tipScale','radialSegments','coordinates','maxVerticesPerMesh'],'lightning topology');return createLightningGeometry({id:'creation.bolt.'+i,subdivisions:4,branchGenerations:1,branchesPerBolt:2,radialSegments:3,...o.topology,seed:(seed(init,o)^i)>>>0,maxBytes:o.maxBytes,maxWork:o.maxWork});}
/** Existing source lightning, not an EffectCraft/Three LightningStrike copy. */
function bolt(init:CreationInit,options:LightningOptions,kind:keyof typeof defaults){
 validateCreation(init,options,boltKeys);checkStrokeAppearance(options);const d=defaults[kind],o=strokeSnapshot({...d,...options,start:options.start??d.start,end:options.end??d.end,ink:options.ink??d.ink,speed:options.speed??d.speed,thickness:options.thickness??d.thickness,amplitude:options.amplitude??d.amplitude,finish:options.finish??neonFinish});const geometry=topology(init,o);try{aggregateGeometry(init,o,1,geometry.describe());}catch(e){geometry.dispose();throw e;}
 return geometryCreator(init,o,[geometry],c=>geometry.sample({start:[...o.start],end:[...o.end],radius:o.thickness,amplitude:o.amplitude,phase:scalar(o.phase??0,c,'phase')+c.time*scalar(o.speed,c,'speed'),context:c}).draws,'lightning-'+kind);
}
export function lightningBolt(init:CreationInit,o:LightningOptions={}){return bolt(init,o,'bolt');}
export function electricArc(init:CreationInit,o:LightningOptions={}){return bolt(init,o,'arc');}
export function lightningStrike(init:CreationInit,o:LightningOptions={}){return bolt(init,o,'strike');}
export async function plasmaOrb(init:CreationInit,options:PlasmaOrbOptions={}){
 validateCreation(init,options,[...boltKeys.filter(k=>!['start','end'].includes(k)),'center','radius','count']);checkStrokeAppearance(options);const o=strokeSnapshot({...options,finish:options.finish??neonFinish}),count=o.count??6,s=seed(init,o),geometries:LightningGeometry[]=[];
 try{geometries.push(topology(init,{...o,topology:{branchGenerations:0,...o.topology}}));aggregateGeometry(init,o,count,geometries[0].describe());for(let i=1;i<count;i++)geometries.push(topology(init,{...o,topology:{branchGenerations:0,...o.topology}},i));}catch(e){for(const g of geometries)g.dispose();throw e;}
 const directions=Array.from({length:count},(_,i)=>{const y=seededRandom(s,i,'plasma-y')*2-1,a=seededRandom(s,i,'plasma-azimuth')*2*Math.PI,r=Math.sqrt(Math.max(0,1-y*y));return [r*Math.cos(a),y,r*Math.sin(a)] as Vec3;});
 return geometryCreator(init,o,geometries,c=>{const center=vector(o.center??[0,0,0],c,'plasma center'),r=scalar(o.radius??1.15,c,'plasma radius',.001),phase=scalar(o.phase??0,c,'phase')+c.time*scalar(o.speed??2.5,c,'speed');return geometries.flatMap((g,i)=>{const d=directions[i],a=phase*.25,end:[number,number,number]=[center[0]+r*(d[0]*Math.cos(a)+d[2]*Math.sin(a)),center[1]+r*d[1],center[2]+r*(-d[0]*Math.sin(a)+d[2]*Math.cos(a))];return g.sample({start:center,end,radius:o.thickness??.014,amplitude:o.amplitude??.16,phase:phase+i*1.37,context:c}).draws;});},'plasma-orb');
}
export interface ElectricSceneOptions extends CreationOptions {
 bolt?:Omit<LightningOptions,'format'|'post'|'signal'|'finish'>;
 stars?:false|Omit<ParticleFieldOptions,'format'|'post'|'signal'|'finish'|'backgroundInput'>;
 background?:Omit<GradientBackgroundOptions,'format'|'post'|'signal'|'finish'>;
}
export async function electricScene(init:CreationInit,options:ElectricSceneOptions={}){
 validateCreation(init,options,['bolt','stars','background']);const o=strokeSnapshot(options),parts:Awaited<ReturnType<typeof lightningBolt>>[]=[];try{
  parts.push(gradientBackground(init,{center:[.022,.01,.065],edge:[.001,.001,.006],...o.background,format:o.format,signal:o.signal}));
  if(o.stars!==false)parts.push(await starField(init,{initialCount:45,rate:0,radius:.018,opacity:.3,...o.stars,format:o.format,signal:o.signal}));
  parts.push(await lightningBolt(init,{start:[-1.45,.85,0],end:[1.25,-.75,0],...o.bolt,format:o.format,signal:o.signal,finish:false}));
  return await stackCreations(init,parts,{format:o.format,post:o.post,signal:o.signal,finish:o.finish??{glow:{radius:4,intensity:.8,threshold:.7},vignette:.18}});
 }catch(e){await Promise.allSettled(parts.map(s=>s.dispose?.()));throw e;}
}
