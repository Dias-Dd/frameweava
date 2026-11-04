import {linearColor,type StaticCreationColor} from './colors.ts';
import {seededRandom} from '../../src/core/time.ts';
import {linear709} from '../../src/media/surface.ts';
import type {ParticleEmitter,Vec3} from '../spatial-effects/native.ts';
import {assetOptions,assetNumber,assetVector,assetError} from './physics-assets.ts';

/** Author data only. Positions use existing right-handed, meter, +Y-up space. */
export type FieldEmitter=
 |{shape:'point'}
 |{shape:'line';from:Vec3;to:Vec3}
 |{shape:'box';size:Vec3}
 |{shape:'disk';radius:number;plane?:'xy'|'xz'|'yz'}
 |{shape:'sphere';radius:number;surface?:boolean};
export function fieldEmitter(source:FieldEmitter={shape:'point'},palette:readonly StaticCreationColor[]=[],opacityVariation=0):ParticleEmitter{
 const keys={point:['shape'],line:['shape','from','to'],box:['shape','size'],disk:['shape','radius','plane'],sphere:['shape','radius','surface']} as const;
 const tag=source&&Object.getOwnPropertyDescriptor(source,'shape');if(!tag||!('value'in tag)||typeof tag.value!=='string'||!Object.hasOwn(keys,tag.value))assetError('Unknown particle emitter shape');assetOptions(source,keys[source.shape],'particle emitter');
 if(source.shape==='line'){assetVector(source.from,'emitter start');assetVector(source.to,'emitter end');}
 if(source.shape==='box')assetVector(source.size,'emitter box size',0);
 if(source.shape==='disk'||source.shape==='sphere')assetNumber(source.radius,'emitter radius',Number.MIN_VALUE);
 if(source.shape==='disk'&&source.plane!==undefined&&!['xy','xz','yz'].includes(source.plane))assetError('Disk plane must be xy, xz or yz');
 if(source.shape==='sphere'&&source.surface!==undefined&&typeof source.surface!=='boolean')assetError('Sphere surface must be boolean');
 if(!Array.isArray(palette))assetError('Particle palette must be RGB vectors');const resolved=palette.map(p=>typeof p==='string'?linearColor(p):assetVector(p,'particle palette'));assetNumber(opacityVariation,'opacityVariation',0,1);
 const shape=structuredClone(source),colors=structuredClone(resolved),identity='creation-emitter/1:'+JSON.stringify({shape,colors,opacityVariation});
 return {identity,color:linear709,check(){},sample(seed,ordinal){
  const random=(salt:string)=>seededRandom(seed,ordinal,'creation-emitter/'+salt);let position:Vec3=[0,0,0];
  switch(shape.shape){
   case 'line':{const t=random('line');position=shape.from.map((v,i)=>v+(shape.to[i]-v)*t) as Vec3;break;}
   case 'box':position=shape.size.map((v,i)=>(random('box'+i)-.5)*v) as Vec3;break;
   case 'disk':{const r=shape.radius*Math.sqrt(random('disk-radius')),a=2*Math.PI*random('disk-angle'),x=r*Math.cos(a),y=r*Math.sin(a);position=shape.plane==='xz'?[x,0,y]:shape.plane==='yz'?[0,x,y]:[x,y,0];break;}
   case 'sphere':{const z=2*random('sphere-z')-1,a=2*Math.PI*random('sphere-angle'),r=shape.radius*(shape.surface?1:Math.cbrt(random('sphere-radius'))),d=Math.sqrt(Math.max(0,1-z*z));position=[r*d*Math.cos(a),r*d*Math.sin(a),r*z];break;}
  }
  return {position,...colors.length?{ink:[...colors[Math.min(colors.length-1,Math.floor(random('palette')*colors.length))]] as Vec3}:{},...opacityVariation?{opacity:1-random('opacity')*opacityVariation}:{}};
 }};
}
