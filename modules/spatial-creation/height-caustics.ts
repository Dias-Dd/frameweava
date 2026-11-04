// SPDX-License-Identifier: MIT
// Refraction/Jacobian focusing and surface lighting adapted from EffectCraft
// sim2/surfaces.rs. Full 2x2 Jacobian; world-unit derivatives; GPU-only sampling.
import type {FrameContext,Signal} from '../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {createPaFilters} from '../native-effects/pa/filters.ts';
import {linear709} from '../../src/media/surface.ts';
import {constantImage,imageCheck} from './composition-core.ts';
import {creationStage,validateCreation,scalar,requireInput,fail} from './lifecycle.ts';
import {creationColor,type CreationColor} from './colors.ts';
import {assetNumber} from './physics-assets.ts';
import type {CreationInit,CreationOptions} from './types.ts';
export interface HeightCausticsOptions extends CreationOptions {
 surface:string;bottom:string;sky?:string;
 interpretation?:'height'|'normal';normalEncoding?:'signed'|'unorm';heightScale?:Signal<number>;smoothing?:Signal<number>;
 size?:readonly [number,number];depth?:Signal<number>;ior?:Signal<number>;strength?:Signal<number>;maxFocus?:number;
 bottomScale?:Signal<number>;boundary?:'clamp'|'repeat'|'mirror'|'zero';
 surfaceColor?:CreationColor;surfaceOpacity?:Signal<number>;skyIntensity?:Signal<number>;convergence?:Signal<number>;
 lightColor?:CreationColor;light?:readonly [number,number,number];lightPosition?:readonly [number,number,number];
 ambient?:Signal<number>;diffuse?:Signal<number>;specular?:Signal<number>;sharpness?:Signal<number>;
}
export function causticFocus(jacobian:readonly [number,number,number,number],maxFocus=5){if(jacobian.length!==4)fail('Full 2x2 Jacobian required');jacobian.forEach(v=>assetNumber(v,'Jacobian'));assetNumber(maxFocus,'maxFocus',1);return 1/Math.max(Math.abs(jacobian[0]*jacobian[3]-jacobian[1]*jacobian[2]),1/maxFocus);}
/** Small-slope refraction displacement, in the height plane's world units. */
export function refractHeightSlope(slope:readonly [number,number],depth:number,ior:number):[number,number]{if(slope.length!==2)fail('Slope requires XY');slope.forEach(v=>assetNumber(v,'slope'));assetNumber(depth,'depth',0);assetNumber(ior,'IOR',1);return slope.map(v=>-v*depth*(1-1/ior)) as [number,number];}
export const heightCausticsCode=/* wgsl */`
fn bottom_tap(q0:vec2i)->vec4f{let size=vec2i(size0());var q=q0;let mode=paramU32(0u);if(mode==0u){q=clamp(q,vec2i(0),size-1);}else if(mode==1u){q=((q%size)+size)%size;}else if(mode==2u){let a=((q%(size*2))+size*2)%(size*2);q=min(a,size*2-1-a);}return read0(q);}
fn bottom(uv:vec2f)->vec4f{let p=uv*vec2f(size0())-.5;let q=vec2i(floor(p));let t=fract(p);return mix(mix(bottom_tap(q),bottom_tap(q+vec2i(1,0)),t.x),mix(bottom_tap(q+vec2i(0,1)),bottom_tap(q+vec2i(1)),t.x),t.y);}
fn water(uv:vec2f)->vec4f{let p=sampleUv1(uv,true);if(p.a>0.){return vec4f(p.rgb/p.a,p.a);}return vec4f(0.);}
fn surface_height(uv:vec2f)->f32{return dot(water(uv).rgb,vec3f(.2126,.7152,.0722))*paramF32(3u);}
fn gradient(uv:vec2f)->vec2f{if(paramU32(1u)==1u){var n=water(uv).rgb;if(paramU32(2u)==1u){n=n*2.-1.;}return -n.xy/max(abs(n.z),.00001);}
 let step=1./vec2f(size1());let world=vec2f(paramF32(4u),paramF32(5u));let dx=(surface_height(uv+vec2f(step.x,0.))-surface_height(uv-vec2f(step.x,0.)))/(2.*step.x*world.x);let dy=(surface_height(uv+vec2f(0.,step.y))-surface_height(uv-vec2f(0.,step.y)))/(2.*step.y*world.y);return vec2f(dx,dy);}
fn displacement(uv:vec2f)->vec2f{return -gradient(uv)*paramF32(6u)*(1.-1./paramF32(7u));}
fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());let world=vec2f(paramF32(4u),paramF32(5u));let step=1./vec2f(size1());let d=displacement(uv);let dx=(displacement(uv+vec2f(step.x,0.))-displacement(uv-vec2f(step.x,0.)))/(2.*step.x*world.x);let dy=(displacement(uv+vec2f(0.,step.y))-displacement(uv-vec2f(0.,step.y)))/(2.*step.y*world.y);let det=(1.+dx.x)*(1.+dy.y)-dx.y*dy.x;let focus=1./max(abs(det),1./paramF32(9u));let source=bottom(.5+(uv+d/world-.5)/paramF32(10u));if(water(uv).a<=0.){return bottom(uv);}
 let normal=normalize(vec3f(-gradient(uv),1.));var light=normalize(vec3f(paramF32(20u),paramF32(21u),paramF32(22u)));if(paramU32(23u)==1u){light=normalize(vec3f(paramF32(20u)-(uv.x-.5)*world.x,paramF32(21u)-(uv.y-.5)*world.y,paramF32(22u)));}
 let nl=max(0.,dot(normal,light));let illumination=max(0.,paramF32(24u)+paramF32(25u)*nl+paramF32(8u)*(focus-1.));let half=normalize(light+vec3f(0.,0.,1.));let spec=pow(max(0.,dot(normal,half)),paramF32(27u))*paramF32(26u);let tint=vec3f(paramF32(16u),paramF32(17u),paramF32(18u));var surface=vec3f(paramF32(12u),paramF32(13u),paramF32(14u));
 if(paramU32(28u)==1u){let sk=sampleUv2(uv+normal.xy*(1.-paramF32(30u))*.5,true);if(sk.a>0.){surface*=sk.rgb/sk.a*paramF32(29u); }else{surface=vec3f(0.);}}
 let a=paramF32(15u);let rgb=surface*a+(source.rgb*illumination*tint+spec*tint*source.a)*(1.-a);return vec4f(rgb,a+source.a*(1.-a));}
`;
const programs=new WeakMap<CreationInit['gpu'],Promise<GpuPixelKernel>>();
/** Screen-space, single-valued geometric refraction with bounded Jacobian
 * focusing (not a photon/path tracer). Source/normal images remain borrowed. */
export async function renderHeightCaustics(init:CreationInit,c:FrameContext,images:{surface:GpuPixelImage;bottom:GpuPixelImage;sky?:GpuPixelImage},o:HeightCausticsOptions){
 for(const image of Object.values(images))if(image)imageCheck(image,init,false);const size=o.size??[3,2];if(!Array.isArray(size)||size.length!==2)fail('Caustic plane requires world XY size');size.forEach(v=>assetNumber(v,'size',Number.MIN_VALUE));
 if(o.interpretation!==undefined&&!['height','normal'].includes(o.interpretation)||o.normalEncoding!==undefined&&!['signed','unorm'].includes(o.normalEncoding)||o.boundary!==undefined&&!['clamp','repeat','mirror','zero'].includes(o.boundary))fail('Unknown caustic input/boundary interpretation');
 const p=new Float32Array(32),u=new Uint32Array(p.buffer);u[0]=['clamp','repeat','mirror','zero'].indexOf(o.boundary??'clamp');u[1]=Number(o.interpretation==='normal');u[2]=Number(o.normalEncoding==='unorm');p[3]=scalar(o.heightScale??1,c,'height scale');p.set(size,4);p[6]=scalar(o.depth??.6,c,'water depth',0);p[7]=scalar(o.ior??1.333,c,'IOR',1);p[8]=scalar(o.strength??1,c,'caustic strength',0);p[9]=assetNumber(o.maxFocus??5,'maxFocus',1);p[10]=scalar(o.bottomScale??1,c,'bottomScale',Number.MIN_VALUE);p.set(creationColor(o.surfaceColor??[.02,.35,.5],c,'surface color'),12);p[15]=scalar(o.surfaceOpacity??0,c,'surfaceOpacity',0,1);p.set(creationColor(o.lightColor??[1,1,1],c,'light color'),16);
 const light=o.lightPosition??o.light??[-.3,-.4,1];if(!Array.isArray(light)||light.length!==3)fail('Light requires XYZ');light.forEach(v=>assetNumber(v,'light'));if(Math.hypot(...light)===0||light[2]<=0)fail('Nondegenerate light above the water plane required');p.set(light,20);u[23]=Number(o.lightPosition!==undefined);p.set([scalar(o.ambient??1,c,'ambient',0),scalar(o.diffuse??0,c,'diffuse',0),scalar(o.specular??0,c,'specular',0),scalar(o.sharpness??60,c,'sharpness',1)],24);u[28]=Number(images.sky!==undefined);p[29]=scalar(o.skyIntensity??1,c,'skyIntensity',0);p[30]=scalar(o.convergence??.5,c,'convergence',0,1);
 let kernel=programs.get(init.gpu);if(!kernel){kernel=init.gpu.compile({abiVersion:1,id:'frameweave/water/height-caustics',version:'0.1.0',inputCount:3,parameterWords:32,code:heightCausticsCode}).catch(e=>{programs.delete(init.gpu);throw e;});programs.set(init.gpu,kernel);}
 const smoothing=scalar(o.smoothing??0,c,'height/normal smoothing sigma pixels',0,64);
 return withGpuResources(init.gpu,async a=>{const sky=images.sky??a.image(await constantImage(init,[0,0,0,0],o.format??'rgba32float',o.signal)),surface=smoothing===0?images.surface:await createPaFilters(init.gpu,c,image=>a.image(image),o.signal).blur(images.surface,{radius:smoothing,boundary:'clamp',format:'rgba32float',alpha:'premultiplied',signal:o.signal});return init.gpu.run(await kernel!,[images.bottom,surface,sky],{parameters:p,output:{width:init.width,height:init.height,format:o.format??'rgba32float',alpha:'premultiplied',color:linear709},signal:o.signal});});
}
export function heightCaustics(init:CreationInit,options:HeightCausticsOptions){
 validateCreation(init,options,['surface','bottom','sky','interpretation','normalEncoding','heightScale','smoothing','size','depth','ior','strength','maxFocus','bottomScale','boundary','surfaceColor','surfaceOpacity','skyIntensity','convergence','lightColor','light','lightPosition','ambient','diffuse','specular','sharpness']);
 for(const key of ['surface','bottom'] as const)if(typeof options[key]!=='string'||!options[key])fail('Explicit '+key+' image input name required');if(options.sky!==undefined&&(typeof options.sky!=='string'||!options.sky))fail('Sky must name a declared input');
 const {post,signal,...raw}=options,o={...structuredClone(raw),post,signal};return creationStage(init,o,(c,inputs)=>renderHeightCaustics(init,c,{surface:requireInput(inputs,o.surface),bottom:requireInput(inputs,o.bottom),sky:o.sky?requireInput(inputs,o.sky):undefined},o),()=>{},()=>({kind:'height-caustics',geometry:'explicit world-unit height/normal plane; full 2x2 refraction Jacobian',input:o.interpretation??'height',focusing:'configurable finite maxFocus',color:'scene-linear Rec709 PM F16/F32; actual bottom and optional sky'}));
}
