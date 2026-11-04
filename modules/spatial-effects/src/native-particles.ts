// SPDX-License-Identifier: Apache-2.0
import {evaluate} from '../../../src/core/animation.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {GpuPixelScope,GpuPixelImage,GpuPixelKernel} from '../../gpu-effects/pixel-types.ts';
import type {SpatialCamera,SpatialField} from '../../spatial-fields/types.ts';
import {camera,layout,number as f32,time as checkTime} from '../../spatial-fields/parameters.ts';
import {finite,integer,spatialError,vector} from './checks.ts';
import {prepareParticleLife} from './appearance.ts';
import type {ParticleFrame,ParticleStyle,Vec3} from './types.ts';
import {nativeAtlas,nativeAtlasCode,type NativeSpriteAtlas,type NativeAtlasLayout} from './native-atlas.ts';
export type {NativeSpriteAtlas} from './native-atlas.ts';
export interface NativeParticleOptions {
 width:number;height:number;camera:SpatialCamera;format?:'rgba16float'|'rgba32float';
 tileSize?:number;maxBufferBytes?:number;maxWork?:number;
 /** Painter order of complete billboard/capsule primitives, stable on ties. */
 sort?:'back-to-front'|'source';
}
export interface NativeParticleInputs {background?:GpuPixelImage;depth?:SpatialField;softDistance?:number;spriteAtlas?:NativeSpriteAtlas;signal?:AbortSignal}
export interface NativeParticlePlan {records:Float32Array;tiles:Uint32Array;frames?:Uint32Array;primitives:number;references:number;work:number;tileSize:number;tilesX:number;cameraKey:string;perspective:boolean}
type Primitive={record:number[];depth:number;order:number;frame:number};
const cache=new WeakMap<GpuPixelScope,Map<string,Promise<GpuPixelKernel>>>();
const sameColor=(image:GpuPixelImage)=>(['primaries','whitePoint','transfer','reference','range','referenceWhiteNits','peakNits','hlgSystemGamma'] as const).every(k=>image.info.color[k]===linear709[k])&&['premultiplied','opaque'].includes(image.info.alpha);

/** CPU geometry/control only. No image sampling, rasterization or hidden readback. */
export function prepareNativeParticles(frame:ParticleFrame,c:FrameContext,o:NativeParticleOptions,style:ParticleStyle={},atlas?:NativeAtlasLayout):NativeParticlePlan {
 checkTime(c);if(frame.frame!==c.frame||frame.time!==c.time)spatialError('E_SPATIAL_TIME','Particle frame must match render context');
 if(atlas&&(integer(atlas.count,'atlas count')>0xffffffff||!Number.isSafeInteger(atlas.tileWidth)||!Number.isSafeInteger(atlas.tileHeight)||atlas.tileWidth<1||atlas.tileHeight<1))spatialError('E_SPATIAL_PARAMETER','Expected bounded integer atlas layout');
 const width=integer(o.width,'width'),height=integer(o.height,'height'),tile=integer(o.tileSize??16,'tileSize'),tilesX=Math.ceil(width/tile),tilesY=Math.ceil(height/tile),tileCount=tilesX*tilesY;
 if(width>16384||height>16384||width*height*16>512*1024*1024)spatialError('E_MEDIA_LAYOUT','Native particle output exceeds the existing Surface dimensions/value budget');
 const cam=camera(o.camera,width,height),life=prepareParticleLife(style.overLife),primitives:Primitive[]=[];
 if(frame.appearanceColor&&JSON.stringify(frame.appearanceColor)!==JSON.stringify(linear709))spatialError('E_SPATIAL_COLOR','Native particle ink requires explicit scene-linear Rec709/D65');
 if(!atlas&&(style.spriteFrame!==undefined||style.overLife?.spriteFrame!==undefined))spatialError('E_SPATIAL_NATIVE_RESOURCE_REQUIRED','Sprite selection requires an explicit borrowed Native atlas');
 const opacity=finite(evaluate(style.opacity??1,c),'opacity',0,1),radiusScale=finite(evaluate(style.radiusScale??1,c),'radiusScale',0),trailAlpha=finite(evaluate(style.trailOpacity??.35,c),'trailOpacity',0,1),trailWidth=finite(evaluate(style.trailWidth??.5,c),'trailWidth',0),rotation=finite(evaluate(style.rotation??0,c),'rotation'),aspect=finite(evaluate(style.aspectRatio??1,c),'aspectRatio',Number.MIN_VALUE),globalInk=vector(style.ink??[3,.8,.2],'ink');
 const sprite=finite(evaluate(style.spriteFrame??0,c),'spriteFrame',0),spriteAspect=atlas?atlas.tileWidth/atlas.tileHeight:1;
 const project=(p:Vec3)=>{const d=p.map((v,i)=>v-cam.pos[i]);const z=d.reduce((s,v,i)=>s+v*cam.forward[i],0),scale=height/(2*cam.half*(cam.ortho?1:z));return {x:width/2+d.reduce((s,v,i)=>s+v*cam.right[i],0)*scale,y:height/2-d.reduce((s,v,i)=>s+v*cam.up[i],0)*scale,z,scale};};
 const add=(a:Vec3,b:Vec3,radius:number,ink:number[],alpha:number,angle:number,ratio:number,head:boolean,spriteFrame=0)=>{
  a=vector(a,'primitive start');b=vector(b,'primitive end');
  let A=project(a),B=project(b);if(head){if(A.z<cam.near||A.z>cam.far)return;}else{let lo=0,hi=1;const dz=B.z-A.z;if(dz===0){if(A.z<cam.near||A.z>cam.far)return;}else{const x=(cam.near-A.z)/dz,y=(cam.far-A.z)/dz;lo=Math.max(0,Math.min(x,y));hi=Math.min(1,Math.max(x,y));if(lo>hi)return;}const original=a;a=a.map((v,i)=>v+(b[i]-v)*lo) as Vec3;b=original.map((v,i)=>v+(b[i]-v)*hi) as Vec3;A=project(a);B=project(b);}
  if(radius<=0||alpha<=0)return;const index=Math.floor(spriteFrame);if(atlas&&(index>=atlas.count||spriteFrame>atlas.count-1))spatialError('E_SPATIAL_PARAMETER','Sprite frame is outside the admitted atlas');const record=[A.x,A.y,B.x,B.y,radius*A.scale,A.z,B.z,Number(head),...ink,alpha,angle,ratio,spriteFrame-index,radius*B.scale];record.forEach((v,i)=>f32(v,'particle attribute '+i));primitives.push({record,depth:(A.z+B.z)/2,order:primitives.length,frame:index});
 };
 for(const p of frame.particles){integer(p.id,'particle ID',0);finite(p.birthTime,'birthTime');finite(p.lifetime,'lifetime',Number.MIN_VALUE);finite(p.radius,'radius',0);if(p.birthTime>c.time)spatialError('E_SPATIAL_TIME','Particle precedes its birth');vector(p.position,'particle position');vector(p.velocity,'particle velocity');if(p.ink&&!frame.appearanceColor)spatialError('E_SPATIAL_COLOR','Particle ink requires its declared working color');const age=Math.min(1,Math.max(0,(c.time-p.birthTime)/p.lifetime)),v=life(age),fade=style.fadeWithAge===false?1:1-age,alpha=opacity*finite(p.opacity??1,'particle opacity',0,1)*v.opacity*fade,r=p.radius*radiusScale*v.radiusScale,ink=vector(p.ink??globalInk,'particle ink').map((x,i)=>finite(x,'ink')*(p.ink&&style.ink!==undefined?globalInk[i]:1)*v.ink[i]);
  for(let i=1;i<p.trail.length;i++)add(p.trail[i-1],p.trail[i],r*trailWidth,ink,alpha*trailAlpha*i/p.trail.length,0,1,false);
  add(p.position,p.position,r,ink,alpha,rotation+v.rotation,aspect*spriteAspect,true,sprite+v.spriteFrame);
 }
 const sort=o.sort??'back-to-front';if(!['back-to-front','source'].includes(sort))spatialError('E_SPATIAL_PARAMETER','Invalid depth sorting mode');if(sort!=='source')primitives.sort((a,b)=>b.depth-a.depth||a.order-b.order);
 const maxBytes=integer(o.maxBufferBytes??128*1024*1024,'maxBufferBytes'),maxWork=integer(o.maxWork??2e9,'maxWork'),outputBytes=width*height*16,wordsPerPrimitive=atlas?17:16;if(outputBytes+(primitives.length*wordsPerPrimitive+tileCount*2)*4>maxBytes)spatialError('E_SPATIAL_GPU_BUDGET','Output/primitive/tile headers exceed maxBufferBytes');
 const bins:number[][]=Array.from({length:tileCount},()=>[]);let references=0;
 primitives.forEach(({record:r},i)=>{const radius=Math.max(r[4],r[15])*(atlas&&r[7]===1?Math.hypot(r[13],1):Math.max(1,r[13])),x0=Math.max(0,Math.floor((Math.min(r[0],r[2])-radius)/tile)),x1=Math.min(tilesX-1,Math.floor((Math.max(r[0],r[2])+radius)/tile)),y0=Math.max(0,Math.floor((Math.min(r[1],r[3])-radius)/tile)),y1=Math.min(tilesY-1,Math.floor((Math.max(r[1],r[3])+radius)/tile));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){references++;if(outputBytes+(references+tileCount*2+primitives.length*wordsPerPrimitive)*4>maxBytes||references*tile*tile>maxWork)spatialError('E_SPATIAL_GPU_BUDGET','Full-resolution particle tiling exceeds configured work/storage budget');bins[y*tilesX+x].push(i);}});
 const tiles=new Uint32Array(Math.max(1,tileCount*2+references));let at=tileCount*2;bins.forEach((bin,i)=>{tiles[2*i]=at;tiles[2*i+1]=bin.length;tiles.set(bin,at);at+=bin.length;});
 return {records:Float32Array.from(primitives.length?primitives.flatMap(p=>p.record):Array(16).fill(0)),tiles,...atlas?{frames:Uint32Array.from(primitives.length?primitives.map(p=>p.frame):[0])}:{},primitives:primitives.length,references,work:references*tile*tile,tileSize:tile,tilesX,cameraKey:cam.key,perspective:!cam.ortho};
}
function shader(background:boolean,depth:boolean,atlas:boolean){const depthIndex=atlas?3:2;return (atlas?nativeAtlasCode(background?1:0):'')+/* wgsl */`
fn pixel(p:vec2u)->vec4f{
 var color=${background?'read0(vec2i(p))':'vec4f(0.)'};
 let tile=(p.y/paramU32(0u))*paramU32(1u)+p.x/paramU32(0u);let start=data1(tile*2u);let count=data1(tile*2u+1u);let q=vec2f(p)+vec2f(.5);
 for(var i=0u;i<count;i++){
  let base=data1(start+i)*16u;let a=vec2f(data0(base),data0(base+1u));let b=vec2f(data0(base+2u),data0(base+3u));let delta=b-a;let squared=dot(delta,delta);var t=0.;if(squared>0.){t=clamp(dot(q-a,delta)/squared,0.,1.);}
  let radius=mix(data0(base+4u),data0(base+15u),t);var offset=q-mix(a,b,t);
  if(data0(base+7u)==1.){let angle=data0(base+12u);let cs=cos(angle);let sn=sin(angle);offset=${atlas?'vec2f(cs*offset.x-sn*offset.y,sn*offset.x+cs*offset.y)':'vec2f(cs*offset.x+sn*offset.y,-sn*offset.x+cs*offset.y)'};offset.x/=data0(base+13u);}
  let distance=length(offset)/radius;var alpha=data0(base+11u)*(1.-smoothstep(.65,1.,distance));
  let ink=vec3f(data0(base+8u),data0(base+9u),data0(base+10u));var src=vec4f(ink*alpha,alpha);
  ${atlas?`if(data0(base+7u)==1.){let uv=offset/radius*.5+vec2f(.5);if(any(uv<vec2f(0.))||any(uv>vec2f(1.))){continue;}let tex=atlasSample(data2(base/16u),data0(base+14u),uv);src=vec4f(tex.rgb*ink,tex.a)*data0(base+11u);}`:''}
  ${depth?`let index=p.y*outputSize().x+p.x;let valid=data${depthIndex+1}(index);if(valid!=0.){let scene=data${depthIndex}(index);if(valid!=1.||(bitcast<u32>(scene)&0x7f800000u)==0x7f800000u||scene<=0.||abs(scene)>1e30){return vec4f(0.,0.,0.,2.);}var z=mix(data0(base+5u),data0(base+6u),t);if(paramU32(3u)==1u){z=1./mix(1./data0(base+5u),1./data0(base+6u),t);}let difference=scene-z;let soft=paramF32(2u);if(soft>0.){src*=clamp(difference/soft,0.,1.);}else if(difference<0.){src=vec4f(0.);}}`:''}
  color=vec4f(src.rgb+color.rgb*(1.-src.a),src.a+color.a*(1.-src.a));
 }return color;
}`;}
/** The supplied Scope owns the device and completion. Inputs are borrowed;
 * output is caller-owned. Releases are logical, never a claimed GPU fence. */
export function createNativeParticleRenderer(gpu:GpuPixelScope,options:NativeParticleOptions){
 const o=structuredClone(options);let disposed=false,busy=false,last:Omit<NativeParticlePlan,'records'|'tiles'|'frames'>|undefined;
 return {async render(frame:ParticleFrame,c:FrameContext,style:ParticleStyle={},inputs:NativeParticleInputs={}):Promise<GpuPixelImage>{
  if(disposed||busy)spatialError('E_SPATIAL_DISPOSED','Native particle renderer is disposed or busy');if(inputs.signal?.aborted)throw Object.assign(new Error('Particle render cancelled'),{code:'E_RENDER_CANCELLED'});busy=true;const owned=[] as import('../../gpu-effects/compute-types.ts').GpuDataBuffer[];
  try{const atlas=inputs.spriteAtlas?nativeAtlas(inputs.spriteAtlas):undefined,plan=prepareNativeParticles(frame,c,o,style,atlas),format=o.format??'rgba32float';if(!['rgba16float','rgba32float'].includes(format))spatialError('E_SPATIAL_COLOR','Float output required');if(inputs.background&&(!sameColor(inputs.background)||inputs.background.info.width!==o.width||inputs.background.info.height!==o.height))spatialError('E_SPATIAL_COLOR','Background must match dimensions, PM/opaque linear Rec709');
   if(atlas&&o.width*o.height*16+plan.records.byteLength+plan.tiles.byteLength+(plan.frames?.byteLength??0)+inputs.spriteAtlas!.source.info.width*inputs.spriteAtlas!.source.info.height*16>(o.maxBufferBytes??128*1024**2))spatialError('E_SPATIAL_GPU_BUDGET','Borrowed atlas exceeds maxBufferBytes');
   const soft=finite(inputs.softDistance??0,'softDistance',0);if(soft&&!inputs.depth)spatialError('E_SPATIAL_FIELD','Soft intersections require explicit resident depth');if(inputs.depth){const shape=layout(inputs.depth,['axial-depth'],c);if(shape.width!==o.width||shape.height!==o.height||shape.metadata.camera!==plan.cameraKey)spatialError('E_SPATIAL_FIELD','Particle/depth camera, resolution and time must agree');}
   const key='bg'+Number(!!inputs.background)+'-depth'+Number(!!inputs.depth)+'-atlas'+Number(!!atlas);let table=cache.get(gpu);if(!table){table=new Map();cache.set(gpu,table);}let pending=table.get(key);if(!pending){pending=gpu.compile({abiVersion:2,id:'frameweave/native-particles/'+key,version:'0.7.0',inputCount:Number(!!inputs.background)+Number(!!atlas),dataInputs:[{type:'f32'},{type:'u32'},...atlas?[{type:'u32' as const}]:[],...inputs.depth?[{type:'f32' as const},{type:'f32' as const}]:[]],parameterWords:12,code:shader(!!inputs.background,!!inputs.depth,!!atlas)});table.set(key,pending);pending.catch(()=>table!.delete(key));}
   const records=await gpu.createBuffer({type:'f32',length:plan.records.length},plan.records);owned.push(records);const tiles=await gpu.createBuffer({type:'u32',length:plan.tiles.length},plan.tiles);owned.push(tiles);let frames;if(plan.frames){frames=await gpu.createBuffer({type:'u32',length:plan.frames.length},plan.frames);owned.push(frames);}const parameters=new Float32Array(12),words=new Uint32Array(parameters.buffer);parameters[2]=soft;words[0]=plan.tileSize;words[1]=plan.tilesX;words[3]=Number(plan.perspective);if(atlas)words.set([atlas.columns,atlas.tileWidth,atlas.tileHeight,atlas.count,Number(atlas.linear),Number(atlas.zero),Number(atlas.straight),Number(atlas.blend)],4);
   const result=await gpu.run(await pending,[...inputs.background?[inputs.background]:[],...atlas?[inputs.spriteAtlas!.source]:[]],{data:[records,tiles,...frames?[frames]:[],...inputs.depth?[inputs.depth.data,inputs.depth.validity]:[]],parameters:words,output:{width:o.width,height:o.height,format,alpha:'premultiplied',color:linear709},signal:inputs.signal});const {records:_r,tiles:_t,frames:_f,...stats}=plan;last=stats;return result;
  }finally{await Promise.all(owned.map(b=>gpu.releaseBuffer(b)));busy=false;}
 },stats(){return {disposed,last};},dispose(){if(busy)spatialError('E_SPATIAL_BUSY','Await the active native particle recording');disposed=true;}};
}
