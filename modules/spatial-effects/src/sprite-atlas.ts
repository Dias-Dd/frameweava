// SPDX-License-Identifier: Apache-2.0
import * as THREE from 'three';
import {assertProfessionalSurface,pixelsFromSurface,type ColorEncoding} from '../../../src/media/surface.ts';
import {integer,spatialError} from './checks.ts';

import type {ParticleSpriteAtlas} from './types.ts';

/** Validate before creating a GPU owner or allocating the decoded copy. */
export function prepareSpriteAtlas(options:ParticleSpriteAtlas,working:ColorEncoding) {
  if(!options||Object.keys(options).some(k=>!['source','columns','rows','count','sampling','boundary','frameBlending'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown sprite atlas options');
  const {source}=options;assertProfessionalSurface(source);
  if(!['rgba16float','rgba32float'].includes(source.format)||source.color.transfer!=='linear'||source.color.reference!=='scene'||(['primaries','whitePoint','transfer','reference','range','referenceWhiteNits','peakNits','hlgSystemGamma'] as const).some(k=>source.color[k]!==working[k]))spatialError('E_SPATIAL_COLOR','Atlas requires matching scene-linear float Surface; explicitly convert the source first');
  const columns=integer(options.columns,'atlas columns'),rows=integer(options.rows,'atlas rows'),count=integer(options.count??columns*rows,'atlas frame count');
  if(source.width%columns||source.height%rows||count>columns*rows)spatialError('E_SPATIAL_PARAMETER','Atlas tiles must have integer pixel dimensions and count must fit the grid');
  const sampling=options.sampling??'linear',boundary=options.boundary??'zero',frameBlending=options.frameBlending??false;
  if(!['nearest','linear'].includes(sampling)||!['zero','clamp'].includes(boundary)||typeof frameBlending!=='boolean')spatialError('E_SPATIAL_PARAMETER','Invalid sprite sampling policy');
  return {source,columns,rows,count,sampling,boundary,frameBlending,tileWidth:source.width/columns,tileHeight:source.height/rows,plannedBytes:source.width*source.height*16*3};
}

export function createSpriteTexture(atlas:ReturnType<typeof prepareSpriteAtlas>) {
  const texture=new THREE.DataTexture(Float32Array.from(pixelsFromSurface(atlas.source)),atlas.source.width,atlas.source.height,THREE.RGBAFormat,THREE.FloatType);
  texture.colorSpace=THREE.NoColorSpace;texture.flipY=false;texture.generateMipmaps=false;
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;
  return texture;
}

// Integral part of the instanced particle material, not a general image filter.
// Same PM-before-interpolation rule as the already verified Puppet renderer.
export const spriteVertex=`precision highp float;
#define attribute in
#define varying out
attribute vec3 position;attribute vec3 iStart;attribute vec3 iEnd;
attribute float iRadius;attribute vec4 iInk;attribute vec4 iSprite;in uint iFrame;
uniform mat4 projectionMatrix;uniform mat4 modelViewMatrix;uniform float spriteAspect;
varying vec2 local;varying float halfLength;varying float radius;varying vec4 ink;
varying vec2 spriteUV;flat out uint spriteFrame;flat out float spriteBlend;flat out float spriteKind;
void main(){
 vec3 a=(modelViewMatrix*vec4(iStart,1.0)).xyz,b=(modelViewMatrix*vec4(iEnd,1.0)).xyz;
 radius=iRadius;ink=iInk;spriteKind=iSprite.w;spriteFrame=iFrame;spriteBlend=iSprite.z;
 spriteUV=position.xy*vec2(.5,-.5)+.5;
 if(iSprite.w>.5){vec2 p=position.xy*vec2(iRadius*spriteAspect,iRadius);a.xy+=vec2(iSprite.x*p.x-iSprite.y*p.y,iSprite.y*p.x+iSprite.x*p.y);local=vec2(0.0);halfLength=0.0;gl_Position=projectionMatrix*vec4(a,1.0);}
 else{vec2 delta=b.xy-a.xy;float len=length(delta);vec2 tangent=len>1e-12?delta/len:vec2(1.0,0.0);vec2 side=vec2(-tangent.y,tangent.x);halfLength=len*.5;local=vec2(position.x*(halfLength+radius),position.y*radius);vec3 center=(a+b)*.5;center.xy+=tangent*local.x+side*local.y;gl_Position=projectionMatrix*vec4(center,1.0);}
}`;
export const spriteFragment=`precision highp float;precision highp int;
#define varying in
out vec4 result;
#define gl_FragColor result
uniform sampler2D atlas;uniform ivec2 atlasGrid;uniform ivec2 tileSize;
uniform int frameCount;uniform int linearSampling;uniform int zeroBoundary;
uniform int straightAlpha;uniform int blendFrames;
varying vec2 local;varying float halfLength;varying float radius;varying vec4 ink;
varying vec2 spriteUV;flat in uint spriteFrame;flat in float spriteBlend;flat in float spriteKind;
vec4 tap(ivec2 p,int frame){
 if(zeroBoundary==1&&(any(lessThan(p,ivec2(0)))||any(greaterThanEqual(p,tileSize))))return vec4(0.0);
 ivec2 tile=ivec2(frame%atlasGrid.x,frame/atlasGrid.x);
 vec4 v=texelFetch(atlas,tile*tileSize+clamp(p,ivec2(0),tileSize-1),0);
 if(straightAlpha==1)v.rgb*=v.a;if(v.a==0.0)v.rgb=vec3(0.0);return v;
}
vec4 sampleFrame(int frame){vec2 p=spriteUV*vec2(tileSize)-.5;ivec2 a=ivec2(floor(p));vec2 t=fract(p);
 if(linearSampling==0)return tap(ivec2(floor(p+.5)),frame);
 return mix(mix(tap(a,frame),tap(a+ivec2(1,0),frame),t.x),mix(tap(a+ivec2(0,1),frame),tap(a+ivec2(1,1),frame),t.x),t.y);
}
void main(){if(spriteKind>.5){int a=int(spriteFrame);vec4 v=sampleFrame(a);
 if(blendFrames==1)v=mix(v,sampleFrame(min(a+1,frameCount-1)),spriteBlend);
 gl_FragColor=vec4(v.rgb*ink.rgb*ink.a,v.a*ink.a);if(gl_FragColor.a==0.0)gl_FragColor.rgb=vec3(0.0);
 }else{float d=length(vec2(max(abs(local.x)-halfLength,0.0),local.y))/radius;float coverage=1.0-smoothstep(.65,1.0,d);float alpha=ink.a*coverage;gl_FragColor=vec4(ink.rgb*alpha,alpha);}}
`;
