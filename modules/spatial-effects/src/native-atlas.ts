// SPDX-License-Identifier: Apache-2.0
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {integer,spatialError} from './checks.ts';
export interface NativeSpriteAtlas {
 /** Borrowed, frame-local admitted image. No implicit file load or readback. */
 source:GpuPixelImage;columns:number;rows:number;count?:number;
 sampling?:'nearest'|'linear';boundary?:'zero'|'clamp';frameBlending?:boolean;
}
export interface NativeAtlasLayout {count:number;tileWidth:number;tileHeight:number}
export function nativeAtlas(atlas:NativeSpriteAtlas){
 if(!atlas||Object.keys(atlas).some(k=>!['source','columns','rows','count','sampling','boundary','frameBlending'].includes(k)))spatialError('E_SPATIAL_PARAMETER','Unknown Native atlas option');
 const info=atlas.source?.info,c=info?.color;
 if(!info||!c||!['rgba16float','rgba32float'].includes(info.format)||c.transfer!=='linear'||c.reference!=='scene'||c.primaries!=='rec709'||c.whitePoint!=='D65'||c.referenceWhiteNits!==100||c.range!=='full'||c.peakNits!==undefined||c.hlgSystemGamma!==undefined)spatialError('E_SPATIAL_COLOR','Atlas requires explicit float scene-linear Rec709/D65, 100 nit reference white');
 const columns=integer(atlas.columns,'columns'),rows=integer(atlas.rows,'rows'),count=integer(atlas.count??columns*rows,'count');
 if(info.width%columns||info.height%rows||!Number.isSafeInteger(columns*rows)||count>columns*rows||count>0xffffffff)spatialError('E_SPATIAL_PARAMETER','Atlas dimensions/count must fit complete integer tiles');
 if(atlas.sampling!==undefined&&!['nearest','linear'].includes(atlas.sampling)||atlas.boundary!==undefined&&!['zero','clamp'].includes(atlas.boundary)||atlas.frameBlending!==undefined&&typeof atlas.frameBlending!=='boolean')spatialError('E_SPATIAL_PARAMETER','Invalid atlas sampling, boundary or frame blending');
 return {count,tileWidth:info.width/columns,tileHeight:info.height/rows,columns,linear:atlas.sampling!=='nearest',zero:atlas.boundary!=='clamp',straight:info.alpha==='straight',blend:atlas.frameBlending??false};
}
/** Matches the old atlas profile: per-tap straight->PM before filtering,
 * tile-local boundaries, and zero-Alpha RGB canonicalization. */
export function nativeAtlasCode(imageIndex:number){return /* wgsl */`
fn atlasTap(frame:u32,point:vec2i)->vec4f{
 let size=vec2i(i32(paramU32(5u)),i32(paramU32(6u)));var p=point;
 if(paramU32(9u)==1u&&any(p<vec2i(0))||paramU32(9u)==1u&&any(p>=size)){return vec4f(0.);}
 p=clamp(p,vec2i(0),size-vec2i(1));let origin=vec2i(i32(frame%paramU32(4u)),i32(frame/paramU32(4u)))*size;
 var v=read${imageIndex}(origin+p);if(paramU32(10u)==1u){v=vec4f(v.rgb*v.a,v.a);}if(v.a==0.){v=vec4f(0.);}return v;
}
fn atlasFrame(frame:u32,uv:vec2f)->vec4f{
 let p=uv*vec2f(f32(paramU32(5u)),f32(paramU32(6u)))-vec2f(.5);
 if(paramU32(8u)==0u){return atlasTap(frame,vec2i(floor(p+vec2f(.5))));}
 let b=vec2i(floor(p));let f=fract(p);return mix(mix(atlasTap(frame,b),atlasTap(frame,b+vec2i(1,0)),f.x),mix(atlasTap(frame,b+vec2i(0,1)),atlasTap(frame,b+vec2i(1,1)),f.x),f.y);
}
fn atlasSample(index:u32,fraction:f32,uv:vec2f)->vec4f{
 let first=atlasFrame(index,uv);if(paramU32(11u)==0u||fraction==0.){return first;}return mix(first,atlasFrame(min(index+1u,paramU32(7u)-1u),uv),fraction);
}
`;}
