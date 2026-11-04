// SPDX-License-Identifier: Apache-2.0
import {keyframes, keyframesAt} from '../../../src/core/animation.ts';
import type {Easing, Keyframes} from '../../../src/core/types.ts';
import {finite, spatialError, vector} from './checks.ts';
import type {Vec3} from './types.ts';

/** Normalized particle age, not a replacement for Stage time or Signals. */
export interface ParticleLifeKey<T> {age:number;value:T;easing?:Easing}
export interface ParticleLifeCurves {
  radiusScale?:readonly ParticleLifeKey<number>[];
  opacity?:readonly ParticleLifeKey<number>[];
  ink?:readonly ParticleLifeKey<Vec3>[];
  rotation?:readonly ParticleLifeKey<number>[];
  spriteFrame?:readonly ParticleLifeKey<number>[];
}
export interface ParticleLifeValue {radiusScale:number;opacity:number;ink:Vec3;rotation:number;spriteFrame:number}

function track<T>(keys:readonly ParticleLifeKey<T>[], read:(v:T)=>number):Keyframes<number> {
  if(!Array.isArray(keys)||!keys.length)spatialError('E_SPATIAL_PARAMETER','A life curve needs at least one key');
  return keyframes(keys.map(key=>{
    if(!key||Object.keys(key).some(k=>!['age','value','easing'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown life key');
    return {frame:finite(key.age,'normalized life key age',0,1),value:read(key.value),easing:key.easing};
  }));
}

/** Internal preparation uses Core keyframe validation/easing/interpolation unchanged. */
export function prepareParticleLife(curves:ParticleLifeCurves={}) {
  if(!curves||typeof curves!=='object'||Array.isArray(curves)||Object.keys(curves).some(k=>!['radiusScale','opacity','ink','rotation','spriteFrame'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown particle life curves');
  const tracks={
    radiusScale:curves.radiusScale&&track(curves.radiusScale,v=>finite(v,'life radius scale',0)),
    opacity:curves.opacity&&track(curves.opacity,v=>finite(v,'life opacity',0,1)),
    rotation:curves.rotation&&track(curves.rotation,v=>finite(v,'life rotation')),
    spriteFrame:curves.spriteFrame&&track(curves.spriteFrame,v=>finite(v,'life sprite frame',0)),
    ink:curves.ink&&[0,1,2].map(c=>track(curves.ink!,v=>vector(v,'life ink')[c]))
  };
  return (age:number):ParticleLifeValue=>{
    finite(age,'normalized particle age',0,1);
    const sample=(t:Keyframes<number>|undefined,fallback:number)=>t?keyframesAt(t,age) as number:fallback;
    return {radiusScale:finite(sample(tracks.radiusScale,1),'evaluated life radius',0),opacity:finite(sample(tracks.opacity,1),'evaluated life opacity',0,1),rotation:finite(sample(tracks.rotation,0),'evaluated life rotation'),spriteFrame:finite(sample(tracks.spriteFrame,0),'evaluated life sprite frame',0),ink:vector(tracks.ink?tracks.ink.map(t=>sample(t,1)) as Vec3:[1,1,1],'evaluated life ink')};
  };
}

/** Inspect the exact CPU attributes used by the renderer; signed linear RGB is retained. */
export function evaluateParticleLife(curves:ParticleLifeCurves,age:number):ParticleLifeValue {
  return prepareParticleLife(curves)(age);
}
