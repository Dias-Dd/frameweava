// SPDX-License-Identifier: Apache-2.0
// Discrete inverse-CDF image sampling; CPU geometry/attributes, never pixel rendering.
import {assertProfessionalSurface,pixelsFromSurface,type ProfessionalSurface} from '../../../src/media/surface.ts';
import {seededRandom} from '../../../src/core/time.ts';
import {spatialError,finite,integer,vector} from './checks.ts';
import type {ImageEmitterOptions,ImageParticleEmitter,Vec3} from './types.ts';
export function createImageEmitter(surface:ProfessionalSurface,source:ImageEmitterOptions):ImageParticleEmitter{
  if(!source||typeof source!=='object'||Object.keys(source).some(k=>!['id','bounds','threshold','weight','inherit','sampling','maxSourcePixels','maxValueBytes'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown image emitter options');
  const o=structuredClone(source);if(typeof o.id!=='string'||!o.id.length)spatialError('E_SPATIAL_PARAMETER','Image emitter id is required');
  const b=o.bounds;if(!b||Object.keys(b).some(k=>!['left','right','bottom','top','z'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Explicit XY meter bounds required');
  for(const v of [b.left,b.right,b.bottom,b.top,b.z??0])finite(v,'image bounds');if(b.left>=b.right||b.bottom>=b.top)spatialError('E_SPATIAL_PARAMETER','Image bounds must have positive area');
  const threshold=finite(o.threshold??0,'threshold',0,1),weight=o.weight??'alpha',inherit=o.inherit??'color',sampling=o.sampling??'pixel-area';
  if(!['alpha','uniform'].includes(weight)||!['none','color','color-alpha'].includes(inherit)||!['center','pixel-area'].includes(sampling))spatialError('E_SPATIAL_PARAMETER','Invalid image emitter policy');
  assertProfessionalSurface(surface);const n=surface.width*surface.height,maxPixels=integer(o.maxSourcePixels??4194304,'maxSourcePixels'),maxBytes=integer(o.maxValueBytes??268435456,'image maxValueBytes'),plannedValueBytes=n*60;
  if(n>maxPixels||plannedValueBytes>maxBytes)spatialError('E_SPATIAL_EMITTER_BUDGET','Image decode/CDF/color value plan exceeds budget');
  if(inherit!=='none'&&(surface.color.transfer!=='linear'||surface.color.reference!=='scene'))spatialError('E_SPATIAL_COLOR','Inherited ink requires an explicit scene-linear Surface; convert before preparing emitter');
  const values=pixelsFromSurface(surface),width=surface.width,height=surface.height,color=inherit==='none'?undefined:structuredClone(surface.color);let count=0;
  for(let i=0;i<n;i++)if(values[i*4+3]>0&&values[i*4+3]>=threshold)count++;
  if(!count)spatialError('E_SPATIAL_EMITTER_EMPTY','Image has no alpha selected by threshold');
  let cdf=new Float64Array(count),pixels=new Uint32Array(count),inks=inherit==='none'?undefined:new Float64Array(count*4),total=0,correction=0,at=0;
  for(let i=0;i<n;i++){const alpha=values[i*4+3];if(!(alpha>0&&alpha>=threshold))continue;const mass=weight==='alpha'?alpha:1,y=mass-correction,next=total+y;correction=(next-total)-y;
    if(next<=total||!Number.isFinite(next))spatialError('E_SPATIAL_EMITTER_PRECISION','A positive alpha mass is not representable in the F64 CDF; choose uniform weights or an explicit threshold');
    total=next;cdf[at]=total;pixels[at]=i;if(inks){const rgb=vector([0,1,2].map(c=>values[i*4+c]/(surface.alpha==='premultiplied'?alpha:1)) as Vec3,'inherited image ink');inks.set([...rgb,inherit==='color-alpha'?alpha:1],at*4);}at++;
  }
  const identity=o.id,metadata=color?structuredClone(color):undefined;let disposed=false;
  const check=()=>{if(disposed)spatialError('E_SPATIAL_EMITTER_DISPOSED','Image emitter disposed');};
  return {identity,...(metadata?{color:Object.freeze(metadata)}:{}),check,
    sample(seed,ordinal){check();integer(seed,'emitter seed',0);integer(ordinal,'birth ordinal',0);const random=(slot:string)=>seededRandom(seed,ordinal,'image-emitter-v1|'+slot),mass=random('mass')*total;
      if(mass===total)spatialError('E_SPATIAL_EMITTER_PRECISION','Random mass reached excluded upper boundary');let lo=0,hi=cdf.length;while(lo<hi){const mid=Math.floor((lo+hi)/2);if(mass<cdf[mid])hi=mid;else lo=mid+1;}if(lo>=cdf.length)spatialError('E_SPATIAL_EMITTER_PRECISION','CDF lookup out of range');
      const index=pixels[lo],x=index%width+(sampling==='center'?.5:random('x')),y=Math.floor(index/width)+(sampling==='center'?.5:random('y'));
      return {position:vector([b.left+x/width*(b.right-b.left),b.top-y/height*(b.top-b.bottom),b.z??0],'image birth position'),...(inks?{ink:[inks[lo*4],inks[lo*4+1],inks[lo*4+2]] as Vec3,opacity:inks[lo*4+3]}:{})};
    },diagnostics(){return {identity,disposed,selectedPixels:count,totalWeight:total,sourceWidth:width,sourceHeight:height,plannedValueBytes,weight,inherit,sampling};},
    dispose(){disposed=true;cdf=new Float64Array();pixels=new Uint32Array();inks=undefined;}
  };
}
