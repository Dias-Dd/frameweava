// SPDX-License-Identifier: Apache-2.0
// Extended spatial controls, same native owner and existing Pixel ABI.
// Polygon-ray intersection and block subsampling adapt fixed EffectCraft
// transition.rs (MIT, provenance archive). No CPU rasterization or second timeline.
import {EngineError} from '../../../../src/core/errors.ts';
import {evaluate} from '../../../../src/core/animation.ts';
import {rational} from '../../../../src/core/time.ts';
import {gamutMatrix} from '../../../../src/media/color.ts';
import {linear709} from '../../../../src/media/surface.ts';
import type {FrameContext,Signal} from '../../../../src/core/types.ts';
import type {NativeGpuScope} from '../../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSource} from '../../../gpu-effects/pixel-types.ts';
import {arithmetic} from '../../../gpu-image-effects/resident/arithmetic.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {samePixelColor} from '../../../gpu-effects/pixel-shader.ts';
import type {TransitionName} from './kernels.ts';
import type {NativeMaskBlur} from './types.ts';
import {shutterSamples} from '../shutter-sampling.ts';

const extra:Partial<Record<TransitionName,readonly string[]>>={
 directionalWipe:['angleDegrees','featherPixels','edgeSamples'],clockWipe:['wipe','angularFeatherDegrees','edgeSamples'],
 irisWipe:['outerRadius','innerRadius','points','rotationDegrees','featherPixels','edgeSamples'],
 randomBlocksWipe:['blockSize','softEdges','featherPixels','edgeSamples'],venetianWipe:['angleDegrees','width','featherPixels','edgeSamples'],
 lumaWipe:['placement','invert'],alphaWipe:['placement','invert'],imageWipe:['placement','blur','borderSoftness','autoSoftness','temporalSamples'],glassWipe:['placement','invert','mapBlur'],warpTransition:['placement','invert','smoothness','reactor','reactorSource','blendSpan'],
 gridWipe:['tiles','borderPixels'],jawsWipe:['toothWidth','heightPercent'],lightWipe:['center','shape','rotationDegrees','reverse','colorFromSource'],
 lineSweepWipe:['rotationDegrees','thickness','slantPixels','overlap'],scaleWipe:['center','stretchOnly','angleDegrees','featherPixels','edgeSamples'],
 cardFlipWipe:['transitionWidth','cardScale','columnsFollowRows','order','gradient','timingRandomness','seed'],
};
export function hasExtendedControls(name:TransitionName,o:unknown){return !!o&&typeof o==='object'&&((extra[name]??[]).some(k=>Object.hasOwn(o,k))||name==='cardFlipWipe'&&(o as Record<string,unknown>).axis==='random');}
const fail:(message:string)=>never=message=>{throw new EngineError('E_PA_TRANSITION',message);};
const checked=(v:unknown,d:number,name:string,c?:FrameContext,min=-Infinity,max=Infinity):number=>{
 const raw=v??d;if(typeof raw!=='number'&&!c)fail(name+': Signal requires FrameContext');const n=typeof raw==='number'?raw:evaluate(raw as Signal<number>,c!);
 if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||!Number.isFinite(Math.fround(n))||n!==0&&Math.abs(Math.fround(n))<2**-126)fail(name+': finite representable value required');return n;
};
const old:Partial<Record<TransitionName,readonly string[]>>={
 directionalWipe:['direction','softness'],clockWipe:['center','startAngleDegrees','softness'],irisWipe:['center','softness'],
 randomBlocksWipe:['cells','seed','softness'],venetianWipe:['axis','count','softness'],lumaWipe:['range','softness'],alphaWipe:['range','softness'],
 imageWipe:['range','softness','channel','invert'],glassWipe:['range','softness','displacement','boundary'],warpTransition:['range','softness','amount','direction','boundary'],
 gridWipe:['cells','center','rotationDegrees','shape','reverse','softness'],jawsWipe:['center','teeth','amplitude','rotationDegrees','shape'],
 lightWipe:['color','softness','direction','intensity'],lineSweepWipe:['strips','slant','flip','softness'],scaleWipe:['direction','softness','stretch'],
 cardFlipWipe:['cells','axis','stagger','shading'],
};
const support=arithmetic+`
fn associate(v:vec4f,alpha:u32)->vec4f{if(alpha==1u){return vec4f(v.rgb*v.a,v.a);}return v;}
fn blend(a:vec4f,b:vec4f,t:f32)->vec4f{return rounded(add(multiply(pair(a),pair(vec4f(1.-t))),multiply(pair(b),pair(vec4f(t)))));}
fn smooth01(x:f32)->f32{let t=clamp(x,0.,1.);return t*t*(3.-2.*t);}
fn coverage(rank:f32,t:f32,soft:f32)->f32{if(soft==0.){return select(0.,1.,rank<=t);}return smooth01((t*(1.+soft)-rank)/soft);}
fn noise(x:u32,y:u32,seed:u32)->f32{var h=(x*0x8da6b343u)^(y*0xd8163841u)^(seed*0xcb1ab31fu);h^=h>>13u;h*=0x5bd1e995u;h^=h>>15u;return f32(h&0xffffffu)/16777216.;}
fn cross2(a:vec2f,b:vec2f)->f32{return a.x*b.y-a.y*b.x;}
fn cs(a:f32)->vec2f{if(a==0.){return vec2f(1.,0.);}return vec2f(cos(a),sin(a));}
fn polygonRadius(d:vec2f,outer:f32,inner:f32,n:u32,rotation:f32)->f32{
 let distance=length(d);if(distance==0.){return min(outer,inner);}let star=inner!=outer;let m=n*select(1u,2u,star);let step=6.283185307179586/f32(m);
 var angle=atan2(d.x,-d.y)-rotation;angle=angle-floor(angle/6.283185307179586)*6.283185307179586;
 let index=min(u32(floor(angle/step)),m-1u);let a=rotation+f32(index)*step;let b=a+step;
 let r0=select(outer,inner,star&&(index&1u)!=0u);let r1=select(outer,inner,star&&((index+1u)&1u)!=0u);
 let ca=cs(a);let cb=cs(b);let p=vec2f(ca.y,-ca.x)*r0;let q=vec2f(cb.y,-cb.x)*r1;let edge=q-p;let den=cross2(d/distance,edge);
 if(den==0.){return 0.;}return max(0.,cross2(p,edge)/den);
}
`;
const imageSampling=`
fn sourceAt(q:vec2i,which:u32)->vec4f{var p=q;if(paramU32(22u)!=0u){p=clamp(q,vec2i(0),vec2i(size0())-1);}if(which==0u){return associate(read0(p),alpha0());}return associate(read1(p),alpha1());}
fn sourceSample(q:vec2f,which:u32)->vec4f{var p=q;if(paramU32(22u)!=0u){p=clamp(q,vec2f(0.),vec2f(size0())-1.);}if(any(p<vec2f(-1.))||any(p>=vec2f(size0()))){return vec4f(0.);}let b=vec2i(floor(p));let f=fract(p);return blend(blend(sourceAt(b,which),sourceAt(b+vec2i(1,0),which),f.x),blend(sourceAt(b+vec2i(0,1),which),sourceAt(b+vec2i(1),which),f.x),f.y);}
`;
const maskSupport=`
fn maskTexel(p:vec2i)->vec4f{var q=p;let mode=paramU32(23u);if(mode==2u){let size=vec2i(size2());q=((p%size)+size)%size;}else if(mode==0u){q=clamp(p,vec2i(0),vec2i(size2())-1);}return read2(q);}
fn maskFloor(v:Pair)->f32{var base=floor(v.hi.x);let d=subtract(v,pair(vec4f(base)));if(greater(pair(vec4f(0.)),d)){base-=1.;}else if(!greater(pair(vec4f(1.)),d)){base+=1.;}return base;}
fn maskAt(p:vec2f)->vec4f{
 let mode=paramU32(23u);var qx=pair(vec4f(p.x));var qy=pair(vec4f(p.y));let half=pair(vec4f(.5));
 if(mode==0u){if(all(size2()==size0())){return read2(vec2i(p));}
  qx=subtract(divide(multiply(add(qx,half),pair(vec4f(f32(size2().x)))),pair(vec4f(f32(size0().x)))),half);
  qy=subtract(divide(multiply(add(qy,half),pair(vec4f(f32(size2().y)))),pair(vec4f(f32(size0().y)))),half);
 }else if(mode==1u){qx=add(qx,pair(vec4f((f32(size2().x)-f32(size0().x))*.5)));qy=add(qy,pair(vec4f((f32(size2().y)-f32(size0().y))*.5)));}
 let ix=maskFloor(qx);let iy=maskFloor(qy);let tx=subtract(qx,pair(vec4f(ix)));let ty=subtract(qy,pair(vec4f(iy)));let one=pair(vec4f(1.));let base=vec2i(i32(ix),i32(iy));
 let upper=add(multiply(pair(maskTexel(base)),subtract(one,tx)),multiply(pair(maskTexel(base+vec2i(1,0))),tx));
 let lower=add(multiply(pair(maskTexel(base+vec2i(0,1))),subtract(one,tx)),multiply(pair(maskTexel(base+vec2i(1))),tx));
 return rounded(add(multiply(upper,subtract(one,ty)),multiply(lower,ty)));
}
fn maskValue(p:vec2f)->f32{let raw=maskAt(p);var rgb=raw.rgb;if(alpha2()==0u){if(raw.a>0.){rgb/=raw.a;}else{rgb=vec3f(0.);}}let channel=paramU32(24u);var luminance=pair(vec4f(0.));for(var c=0u;c<3u;c++){luminance=add(luminance,multiply(pair(vec4f(rgb[c])),pair(vec4f(paramF32(25u+c)))));}var v=rounded(luminance).x;
 if(channel<3u){v=rgb[channel];}else if(channel==3u){v=raw.a;}else if(channel>=5u){let high=max(max(rgb.r,rgb.g),rgb.b);let low=min(min(rgb.r,rgb.g),rgb.b);let chroma=high-low;v=(high+low)*.5;if(channel==6u){v=0.;if(chroma>0.){if(high==rgb.r){v=(rgb.g-rgb.b)/chroma;}else if(high==rgb.g){v=(rgb.b-rgb.r)/chroma+2.;}else{v=(rgb.r-rgb.g)/chroma+4.;}v=fract(v/6.);}}else if(channel==7u){v=0.;let scale=max(max(abs(rgb.r),abs(rgb.g)),abs(rgb.b));if(scale>0.){v=chroma/scale;}}}
 var rank=clamp((v-paramF32(28u))/(paramF32(29u)-paramF32(28u)),0.,1.);if(paramU32(30u)!=0u){rank=1.-rank;}return rank;
}
fn maskGrad(p:vec2f)->vec2f{return vec2f(maskValue(p+vec2f(1.,0.))-maskValue(p-vec2f(1.,0.)),maskValue(p+vec2f(0.,1.))-maskValue(p-vec2f(0.,1.)))*.5;}
`;
const bodies:Partial<Record<TransitionName,string>>={
 directionalWipe:`let q=point-vec2f(size0())*.5;let projection=dot(q,vec2f(paramF32(4u),paramF32(5u)));return coverage(projection/paramF32(6u)+.5,t,paramF32(2u));`,
 clockWipe:`let d=point-vec2f(paramF32(7u),paramF32(8u));var angle=0.;if(all(d==vec2f(0.))){return 1.;}if(d.x==0.){angle=select(-.25,.25,d.y>0.);}else if(d.y==0.){angle=select(.5,0.,d.x>0.);}else{angle=atan2(d.y,d.x)/6.283185307179586;}var rank=fract(angle-paramF32(3u));if(paramU32(9u)==1u){rank=fract(1.-rank);}else if(paramU32(9u)==2u){rank=2.*min(rank,1.-rank);}return coverage(rank,t,paramF32(2u));`,
 irisWipe:`let d=point-vec2f(paramF32(7u),paramF32(8u));let outer=paramF32(10u);let inner=paramF32(11u);if(outer==0.||inner==0.){return 0.;}let radius=polygonRadius(d,outer,inner,paramU32(12u),paramF32(3u));let distance=length(d);if(paramF32(13u)==0.){return select(0.,1.,distance<radius);}return smooth01((radius-distance)/paramF32(13u)+.5);`,
 venetianWipe:`let projection=dot(point,vec2f(paramF32(4u),paramF32(5u)));return coverage(fract(projection/paramF32(14u)),t,paramF32(2u));`,
 randomBlocksWipe:`let cell=vec2u(floor(point/vec2f(paramF32(15u),paramF32(16u))));return coverage(noise(cell.x,cell.y,paramU32(17u)),t,paramF32(2u));`,
 lumaWipe:`return coverage(maskValue(point-.5),t,paramF32(2u));`,alphaWipe:`return coverage(maskValue(point-.5),t,paramF32(2u));`,imageWipe:`return coverage(maskValue(point-.5),t,paramF32(2u));`,
 gridWipe:`let d=point-vec2f(paramF32(7u),paramF32(8u));let q=vec2f(d.x*paramF32(4u)+d.y*paramF32(5u),-d.x*paramF32(5u)+d.y*paramF32(4u));let size=vec2f(paramF32(15u),paramF32(16u));let cell=(floor(q/size)+.5)*size;var rank=length(cell)/paramF32(6u);if(paramU32(9u)==0u){rank=abs(cell.x)/paramF32(6u);}else if(paramU32(9u)==2u){rank=max(abs(cell.x),abs(cell.y))/paramF32(6u);}rank=clamp(rank,0.,1.);if(paramU32(10u)!=0u){rank=1.-rank;}let progress=clamp((t*1.25-rank)/.25,0.,1.);if(progress==0.){return 0.;}let half=size*.5*(1.-progress);let inset=half-abs(q-cell);let distance=min(inset.x,inset.y);if(paramF32(20u)==0.){return select(1.,0.,distance>0.);}return 1.-clamp(distance/paramF32(20u)+.5,0.,1.);`,
 lineSweepWipe:`let projection=dot(point,vec2f(paramF32(4u),paramF32(5u)));let u=select(projection,-projection,paramU32(21u)!=0u);let v=dot(point,vec2f(-paramF32(5u),paramF32(4u)));let strips=paramF32(16u);let k=floor((v-paramF32(8u))/paramF32(15u));let stagger=select(strips-1.-k,k,paramF32(20u)>=0.);let front=paramF32(7u)+t*paramF32(6u)-abs(paramF32(20u))*stagger;let feather=paramF32(2u)*paramF32(6u);if(feather==0.){return select(0.,1.,u<front);}return smooth01((front-u)/feather+.5);`,
};
/** Explicit analytic extension of the existing affine FrameContext contract.
 * Only the mask parameter is resampled; no source Stage or simulation is sought. */
export function* maskSampleContexts(context:FrameContext,count:number){
 const fps=rational(context.fps);if(!Number.isFinite(context.dt)||context.dt<=0||!Number.isSafeInteger(context.durationInFrames)||context.durationInFrames<1)fail('Auto Softness requires the existing finite affine FrameContext');
 const period=fps.den/fps.num;
 for(const sample of shutterSamples({count,angleDegrees:180},context)){
  const delta=sample.time-context.time,globalDelta=delta/context.dt;
  const sampled={...context,time:sample.time,frame:sample.frame,globalTime:context.globalTime+globalDelta*period,globalFrame:context.globalFrame+globalDelta,progress:context.durationInFrames<=1?0:context.progress+globalDelta/(context.durationInFrames-1)};
  yield {index:sample.index,context:sampled};
 }
}
function progressSamples(o:Record<string,any>,context:FrameContext,count:number){
 const values=new Float32Array(count);for(const sample of maskSampleContexts(context,count)){const value=o.progress===undefined?sample.context.progress:checked(o.progress,0,'sampled completion',sample.context);values[sample.index]=Math.max(0,Math.min(1,value));}
 return values;
}
const imageBodies:Partial<Record<TransitionName,string>>={
 glassWipe:`let q=coverage(maskValue(point),t,paramF32(2u));let offset=maskGrad(point)*paramF32(20u)*4.*q*(1.-q)*10.;return blend(sourceSample(point+offset,0u),sourceSample(point-offset,1u),q);`,
 warpTransition:`var q=coverage(maskValue(point),t,paramF32(2u));if(paramU32(31u)==4u){let span=paramF32(15u);q=select(select(0.,1.,t>=.5),smooth01((t-.5)/max(span,0.00000001)+.5),span>0.);}let offset=maskGrad(point)*paramF32(20u);let outgoing=offset*q;var incoming=offset*(1.-q);if(paramU32(21u)==1u){incoming=-incoming;}else if(paramU32(21u)==2u){incoming=vec2f(-incoming.y,incoming.x);}return blend(sourceSample(point+outgoing,0u),sourceSample(point+incoming,1u),q);`,
 jawsWipe:`let d=point+.5-vec2f(paramF32(7u),paramF32(8u));let u=dot(d,vec2f(paramF32(4u),paramF32(5u)));let v=dot(d,vec2f(-paramF32(5u),paramF32(4u)));let phase=fract(u/paramF32(15u));var tooth=1.-4.*abs(phase-.5);if(paramU32(9u)==1u){tooth=clamp(tooth*2.,-1.,1.);}else if(paramU32(9u)==2u){tooth=select(-1.,1.,phase<.5);}else if(paramU32(9u)==3u){tooth=sin(phase*6.283185307179586);}tooth*=paramF32(20u);let travel=t*paramF32(6u);var sy=v;if(v+travel<tooth){sy+=travel;}else if(v-travel>=tooth){sy-=travel;}else{return associate(read1(vec2i(point)),alpha1());}let mapped=vec2f(u*paramF32(4u)-sy*paramF32(5u),u*paramF32(5u)+sy*paramF32(4u))+vec2f(paramF32(7u),paramF32(8u))-.5;return sourceSample(mapped,0u);`,
 lightWipe:`let d=point+.5-vec2f(paramF32(7u),paramF32(8u));let q=vec2f(dot(d,vec2f(paramF32(4u),paramF32(5u))),dot(d,vec2f(-paramF32(5u),paramF32(4u))));var distance=length(q);if(paramU32(9u)==0u){distance=abs(q.x);}else if(paramU32(9u)==2u){distance=max(abs(q.x),abs(q.y));}let maximum=paramF32(6u);let edge=select(t,1.-t,paramU32(10u)!=0u)*maximum;let visible=select(distance>edge,distance<edge,paramU32(10u)!=0u);if(!visible){return associate(read1(vec2i(point)),alpha1());}let source=associate(read0(vec2i(point)),alpha0());let width=max(maximum*.06,2.);let x=(distance-edge)/width;let energy=exp(-x*x)*paramF32(20u)*min(t*20.,1.)*min((1.-t)*20.,1.);var ink=vec3f(paramF32(12u),paramF32(13u),paramF32(14u))*source.a;if(paramU32(21u)!=0u){ink=source.rgb;}return vec4f(source.rgb+ink*energy,source.a);`,
 scaleWipe:`let axis=vec2f(paramF32(4u),paramF32(5u));let d=point+.5-vec2f(paramF32(7u),paramF32(8u));let distance=dot(d,axis);let stretch=paramF32(20u)*select(t,1.,paramU32(31u)==2u);var mapped=point;if(distance>0.){mapped-=axis*(distance-distance/(1.+stretch));}let source=sourceSample(mapped,0u);if(paramU32(31u)==2u){return source;}let rank=dot(point+.5-vec2f(size0())*.5,axis)/paramF32(6u)+.5;return blend(source,associate(read1(vec2i(point)),alpha1()),coverage(rank,t,paramF32(2u)));`,
 cardFlipWipe:`let counts=vec2f(f32(paramU32(6u)),f32(paramU32(7u)));let uv=(point+.5)/vec2f(size0());let cell=floor(uv*counts);let normalized=cell/max(counts-1.,vec2f(1.));var order=normalized.x;let mode=paramU32(9u);if(mode==1u){order=1.-normalized.x;}else if(mode==2u){order=normalized.y;}else if(mode==3u){order=1.-normalized.y;}else if(mode==4u){order=(normalized.x+normalized.y)*.5;}else if(mode==5u){order=(1.-normalized.x+normalized.y)*.5;}else if(mode==6u){order=(normalized.x+1.-normalized.y)*.5;}else if(mode==7u){order=(2.-normalized.x-normalized.y)*.5;}else if(mode==8u){${'CARD_GRADIENT'}}let seed=paramU32(17u);let random=noise(u32(cell.x),u32(cell.y),seed);order=mix(order,random,paramF32(10u));var phase=select(0.,1.,t>=order);let width=paramF32(16u);if(width>0.){phase=clamp((t-order*(1.-width))/width,0.,1.);}var k=cos(phase*3.141592653589793);if(phase==0.){k=1.;}if(phase==1.){k=-1.;}if(abs(k)<.0001){return vec4f(0.);}var axis=paramU32(11u);if(axis==2u){axis=select(0u,1u,noise(u32(cell.x),u32(cell.y),seed^0x91u)>=.5);}var q=fract(uv*counts)-.5;q[axis]/=abs(k);let scale=paramF32(15u);if(any(abs(q)>vec2f(.5*min(scale,1.)))){return vec4f(0.);}q/=scale;let source=(cell+.5+q)/counts*vec2f(size0())-.5;let v=sourceSample(source,select(0u,1u,k<0.));return vec4f(v.rgb*(1.-paramF32(20u)*(1.-abs(k))),v.a);`,
};

export async function recordExtended(name:TransitionName,gpu:NativeGpuScope,from:GpuPixelImage,to:GpuPixelImage,options:object,context?:FrameContext,mask?:GpuPixelImage,blurMask?:NativeMaskBlur):Promise<GpuPixelImage>{
 const o=options as Record<string,any>,cap=gpu?.capabilities();if(cap?.backend!=='native-wgpu'||cap.hardwareVerified!==true)throw new EngineError('E_PA_TRANSITION_DEVICE','An admitted native-wgpu scope is required');
 if(!o||typeof o!=='object'||Array.isArray(o))fail('Known transition options required');
 if(name==='cardFlipWipe'&&o.gradient!==undefined)mask=o.gradient;
 if(!o||Object.keys(o).some(k=>!['progress','format','signal',...(old[name]??[]),...(extra[name]??[])].includes(k)))fail(name+': unknown extended option');
 if(o.signal!==undefined&&!(o.signal instanceof AbortSignal))fail('AbortSignal required');if(o.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Transition cancelled');
 if(o.format!==undefined&&!['rgba16float','rgba32float'].includes(o.format))fail('Output remains RGBA16F/32F');
 const inputs=mask?[from,to,mask]:[from,to],base=from?.info;if(!base)fail('Native source required');
 const sourceReactor=name==='warpTransition'&&o.reactorSource==='sources';
 if(sourceReactor&&(mask||o.placement!==undefined))fail('Source reactors do not take a separate mask or placement');
 if(['lumaWipe','alphaWipe','imageWipe','glassWipe','warpTransition'].includes(name)&&!mask&&!sourceReactor)fail('An explicit resident mask image is required');
 for(let i=0;i<inputs.length;i++){const info=inputs[i]?.info;if(!info||!['rgba16float','rgba32float'].includes(info.format)||!info.color||info.color.transfer!=='linear'||info.color.reference!=='scene'||i<2&&(info.width!==base.width||info.height!==base.height)||!samePixelColor(info.color,base.color))fail('Matching scene-linear source images and declared mask required');}
 const n=(v:unknown,d:number,key:string,min=-Infinity,max=Infinity)=>checked(v,d,key,context,min,max),p=new Float32Array(32),u=new Uint32Array(p.buffer);
 const explicitRadius=name==='irisWipe'&&o.outerRadius!==undefined,stretchOnly=name==='scaleWipe'&&o.stretchOnly===true;if(o.progress===undefined&&!context&&!explicitRadius&&!stretchOnly)fail('progress or FrameContext required');
 p[0]=n(o.progress,context?.progress??.5,'progress',0,1);p[2]=n(o.softness,.05,'softness',0,1);
 const center=o.center??[.5,.5];if(!Array.isArray(center)||center.length!==2)fail('center requires two values');p[7]=n(center[0],.5,'center.x')*base.width;p[8]=n(center[1],.5,'center.y')*base.height;if(!Number.isFinite(p[7])||!Number.isFinite(p[8]))fail('Center exceeds F32 pixel coordinate representation');
 const flag=(v:unknown,d:boolean,key:string)=>{if(v!==undefined&&typeof v!=='boolean')fail(key+': boolean required');return v??d;};
 const integer=(v:unknown,d:number,key:string)=>{const k=v??d;if(typeof k!=='number'||!Number.isSafeInteger(k)||k<1||k>0xffffffff)fail(key+': positive uint32 required');return k as number;};
 const samples=integer(o.edgeSamples,flag(o.softEdges,false,'softEdges')?4:1,'edgeSamples');if(samples*samples>0xffffffff)fail('Spatial sample count exceeds uint32 accumulation domain');u[18]=samples;p[19]=1/(samples*samples);u[31]=stretchOnly?2:Number(explicitRadius);
 let temporal:Float32Array|undefined;
 if(name==='imageWipe'){
  const automatic=flag(o.autoSoftness,false,'autoSoftness');if(o.temporalSamples!==undefined&&!automatic)fail('temporalSamples requires autoSoftness');
  if(automatic){if(!context)fail('Auto Softness requires FrameContext');const count=integer(o.temporalSamples,16,'temporalSamples');if(count*4>gpu.capabilities().limits.maxStorageBufferBindingSize)throw new EngineError('E_PA_TRANSITION_LIMIT','Temporal mask samples exceed the actual native storage-binding limit');temporal=progressSamples(o,context,count);u[21]=count;p[20]=Math.fround(1/count);p[22]=1/count-p[20];}
 }
 if(name==='directionalWipe'||name==='venetianWipe'||name==='scaleWipe'){
  if(o.angleDegrees!==undefined&&o.direction!==undefined)fail('Specify angleDegrees or direction');
  let direction:readonly number[]=o.direction??(o.axis==='y'?[0,1]:[1,0]);
  if(o.angleDegrees!==undefined){const angle=n(o.angleDegrees,90,'angleDegrees')%360*Math.PI/180;direction=[Math.sin(angle),-Math.cos(angle)];}
  if(!Array.isArray(direction)||direction.length!==2||direction.some(v=>!Number.isFinite(v))||Math.hypot(...direction)===0)fail('Nonzero finite direction required');
  const length=Math.hypot(...direction);p[4]=direction[0]/length;p[5]=direction[1]/length;p[6]=Math.abs(p[4])*base.width+Math.abs(p[5])*base.height;
  if((name==='directionalWipe'||name==='scaleWipe')&&o.featherPixels!==undefined)p[2]=n(o.featherPixels,0,'featherPixels',0)/p[6];
  if(name==='venetianWipe'){if(o.axis!==undefined&&!['x','y'].includes(o.axis))fail('Unknown strip axis');const count=integer(o.count,8,'count');p[14]=n(o.width,(o.axis==='y'?base.height:base.width)/count,'width',2**-100);if(o.featherPixels!==undefined)p[2]=n(o.featherPixels,0,'featherPixels',0)/p[14];}
 }
 if(['gridWipe','jawsWipe','lightWipe','lineSweepWipe'].includes(name)){
  let angle=n(o.rotationDegrees,0,'rotationDegrees')%360*Math.PI/180;
  if(name==='lightWipe'&&o.direction!==undefined){if(o.rotationDegrees!==undefined)fail('Specify direction or rotationDegrees');const direction=o.direction;if(!Array.isArray(direction)||direction.length!==2||direction.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.hypot(...direction)===0)fail('Nonzero finite light direction required');angle=Math.atan2(direction[1],direction[0]);}
  p[4]=Math.cos(angle);p[5]=Math.sin(angle);
  const corners=[[0,0],[base.width,0],[0,base.height],[base.width,base.height]].map(([x,y])=>{x-=p[7];y-=p[8];return [x*p[4]+y*p[5],-x*p[5]+y*p[4]];});
  if(name==='gridWipe'||name==='lightWipe'){const shapes=name==='gridWipe'?['doors','radial','rectangle']:['doors','round','square'];if(o.shape!==undefined&&!shapes.includes(o.shape))fail('Unknown metric shape');u[9]=shapes.indexOf(o.shape??shapes[1]);u[10]=Number(flag(o.reverse,false,'reverse'));p[6]=Math.max(...corners.map(([x,y])=>u[9]===0?Math.abs(x):u[9]===2?Math.max(Math.abs(x),Math.abs(y)):Math.hypot(x,y)));}
  if(name==='gridWipe'){if(o.tiles!==undefined&&o.cells!==undefined)fail('Specify tiles or cells');if(o.cells!==undefined){if(!Array.isArray(o.cells)||o.cells.length!==2)fail('cells requires columns and rows');p[15]=base.width/integer(o.cells[0],8,'columns');p[16]=base.height/integer(o.cells[1],6,'rows');}else{p[15]=p[16]=Math.sqrt(base.width*base.height/n(o.tiles,10,'tiles',2**-100));}p[20]=n(o.borderPixels,0,'borderPixels',0);}
  if(name==='jawsWipe'){if(o.toothWidth!==undefined&&o.teeth!==undefined||o.heightPercent!==undefined&&o.amplitude!==undefined)fail('Specify toothWidth or teeth, heightPercent or amplitude');p[15]=n(o.toothWidth,base.width/integer(o.teeth,8,'teeth'),'toothWidth',2**-100);p[20]=o.heightPercent===undefined?n(o.amplitude,10,'amplitude',0):n(o.heightPercent,50,'heightPercent',0)*p[15]/200;p[6]=Math.max(...corners.map(p=>Math.abs(p[1])))+2*p[20]+2;const shapes=['triangle','rounded','square','sine'];if(o.shape!==undefined&&!shapes.includes(o.shape))fail('Unknown jaw shape');u[9]=shapes.indexOf(o.shape??'triangle');}
  if(name==='lightWipe'){p[20]=n(o.intensity,2,'intensity',0);u[21]=Number(flag(o.colorFromSource,false,'colorFromSource'));const ink=o.color??[1,1,1,1];if(!Array.isArray(ink)||ink.length!==4)fail('Light color requires RGBA');for(let i=0;i<3;i++)p[12+i]=n(ink[i],1,'light.rgb')*n(ink[3],1,'light.alpha',0,1);}
  if(name==='lineSweepWipe'){if(o.thickness!==undefined&&o.strips!==undefined||o.slantPixels!==undefined&&o.slant!==undefined)fail('Specify thickness or strips, slantPixels or slant');const q=[[0,0],[base.width,0],[0,base.height],[base.width,base.height]].map(([x,y])=>[x*p[4]+y*p[5],-x*p[5]+y*p[4]]),umin=Math.min(...q.map(p=>p[0])),umax=Math.max(...q.map(p=>p[0])),vmin=Math.min(...q.map(p=>p[1])),vmax=Math.max(...q.map(p=>p[1]));p[7]=umin;p[8]=vmin;p[15]=n(o.thickness,(vmax-vmin)/integer(o.strips,6,'strips'),'thickness',2**-100);p[16]=Math.ceil((vmax-vmin)/p[15]);p[20]=o.slantPixels!==undefined?n(o.slantPixels,0,'slantPixels'):n(o.slant,1,'slant')*(umax-umin)/p[16];p[6]=umax-umin+Math.abs(p[20])*p[16]+1;u[21]=Number(flag(o.flip,false,'flip'));}
 }
 if(name==='scaleWipe'){flag(o.stretchOnly,false,'stretchOnly');p[20]=n(o.stretch,8,'stretch',0);u[22]=1;}
 if(name==='cardFlipWipe'){
  const cells=o.cells??[8,6];if(!Array.isArray(cells)||cells.length!==2)fail('cells requires columns and rows');u[7]=integer(cells[1],6,'rows');u[6]=flag(o.columnsFollowRows,false,'columnsFollowRows')?u[7]:integer(cells[0],8,'columns');if(u[6]>2**24||u[7]>2**24)fail('Card cell count exceeds exact F32 phase');
  const axes=['x','y','random'];if(o.axis!==undefined&&!axes.includes(o.axis))fail('Unknown card axis');u[11]=axes.indexOf(o.axis??'x');
  const orders=['left-right','right-left','top-bottom','bottom-top','top-left','top-right','bottom-left','bottom-right','gradient'];if(o.order!==undefined&&!orders.includes(o.order))fail('Unknown card order');u[9]=orders.indexOf(o.order??'left-right');if(u[9]===8&&!mask)fail('Gradient order requires an explicit resident native image');
  const seed=o.seed??0;if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)fail('Card seed requires uint32');u[17]=seed;p[10]=n(o.timingRandomness,0,'timingRandomness',0,1);p[15]=n(o.cardScale,1,'cardScale',2**-100);
  if(o.transitionWidth!==undefined&&o.stagger!==undefined)fail('Specify transitionWidth or stagger');p[16]=n(o.transitionWidth,1/(1+n(o.stagger,.75,'stagger',0)),'transitionWidth',0,1);p[20]=n(typeof o.shading==='boolean'?(o.shading ? .6 :0):o.shading,.4,'shading',0,1);u[31]=3;
 }
 if(name==='clockWipe'){const modes=['clockwise','counterclockwise','both'];if(o.wipe!==undefined&&!modes.includes(o.wipe))fail('Unknown radial wipe direction');u[9]=modes.indexOf(o.wipe??'clockwise');p[3]=n(o.startAngleDegrees,-90,'startAngleDegrees')%360/360;if(o.angularFeatherDegrees!==undefined)p[2]=n(o.angularFeatherDegrees,0,'angularFeatherDegrees',0)/360;}
 if(name==='irisWipe'){
  if(o.innerRadius!==undefined&&!explicitRadius)fail('innerRadius requires explicit outerRadius');
  const outer=n(o.outerRadius,p[0]*Math.hypot(Math.max(p[7],base.width-p[7]),Math.max(p[8],base.height-p[8])),'outerRadius',0),inner=n(o.innerRadius,outer,'innerRadius',0);
  p[10]=outer;p[11]=inner;u[12]=integer(o.points,6,'points');if(u[12]<3||u[12]>2**23)fail('Polygon point count must retain exact F32 vertex phase');p[3]=n(o.rotationDegrees,0,'rotationDegrees')%360*Math.PI/180;p[13]=n(o.featherPixels,0,'featherPixels',0);
 }
 if(name==='randomBlocksWipe'){
  if(o.blockSize!==undefined&&o.cells!==undefined)fail('Specify blockSize or cells');
  const cells=o.cells??[8,6];if(!Array.isArray(cells)||cells.length!==2)fail('cells requires two values');const size=o.blockSize??[base.width/integer(cells[0],8,'columns'),base.height/integer(cells[1],6,'rows')];if(!Array.isArray(size)||size.length!==2)fail('blockSize requires two pixel lengths');p[15]=n(size[0],1,'block.width',2**-100);p[16]=n(size[1],1,'block.height',2**-100);
  const seed=o.seed??0;if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)fail('seed must be uint32');u[17]=seed;
 }
 if(name==='glassWipe'||name==='warpTransition'){p[20]=n(name==='glassWipe'?o.displacement:o.amount,name==='glassWipe'?20:40,'map displacement');if(o.boundary!==undefined&&!['clamp','transparent'].includes(o.boundary))fail('Unknown image boundary');u[22]=Number(o.boundary!=='transparent');const directions=['same','opposite','perpendicular'];if(name==='warpTransition'){if(o.direction!==undefined&&!directions.includes(o.direction))fail('Unknown warp direction');u[21]=directions.indexOf(o.direction??'opposite');}}
 if(mask){const modes=['stretch','center','tile'];if(o.placement!==undefined&&!modes.includes(o.placement))fail('Unknown native mask placement');u[23]=modes.indexOf(o.placement??'stretch');const channels=['red','green','blue','alpha','luma','lightness','hue','saturation'];if(o.channel!==undefined&&!channels.includes(o.channel))fail('Unknown mask channel');u[24]=name==='alphaWipe'?3:channels.indexOf(o.channel??'luma');u[30]=Number(flag(o.invert,false,'invert'));const m=gamutMatrix(mask.info.color,linear709);for(let i=0;i<3;i++)p[25+i]=.2126*m[0][i]+.7152*m[1][i]+.0722*m[2][i];const range=o.range??[0,1];if(!Array.isArray(range)||range.length!==2)fail('range requires two values');p[28]=n(range[0],0,'range.low');p[29]=n(range[1],1,'range.high');if(p[29]<=p[28])fail('Mask range must stay ordered in F32');}
 if(sourceReactor){const range=o.range??[0,1];if(!Array.isArray(range)||range.length!==2)fail('range requires two values');p[28]=n(range[0],0,'range.low');p[29]=n(range[1],1,'range.high');if(p[29]<=p[28])fail('Source range must remain ordered');u[30]=Number(flag(o.invert,false,'invert'));}
 if(name==='lineSweepWipe'&&o.overlap!==undefined){if(o.slant!==undefined||o.slantPixels!==undefined)fail('Specify overlap or slant/slantPixels');const extent=p[6]-Math.abs(p[20])*p[16]-1,overlap=n(o.overlap,0,'overlap',0,1);p[20]=extent*(1-overlap);p[6]=extent+p[20]*Math.max(0,p[16]-1);}
 if(name==='lineSweepWipe'&&o.flip===true){const extent=p[6]-Math.abs(p[20])*(o.overlap===undefined?p[16]:Math.max(0,p[16]-1))-(o.overlap===undefined?1:0);p[7]=-p[7]-extent;}
 if(name==='warpTransition'){if(o.reactorSource!==undefined&&!['mask','sources'].includes(o.reactorSource))fail('Unknown reactor source');if(sourceReactor||o.blendSpan!==undefined){u[31]=4;p[15]=n(o.blendSpan,1,'blendSpan',0,1);}}
 const sigma=mask||sourceReactor?n(name==='glassWipe'?o.mapBlur:name==='imageWipe'?o.blur:name==='warpTransition'?o.smoothness:0,0,'map Gaussian sigma',0):0;
 const feather=name==='randomBlocksWipe'?n(o.featherPixels,0,'block feather',0)*.5:name==='imageWipe'?n(o.borderSoftness,0,'borderSoftness',0):0;
 const reactor=name==='warpTransition'?(o.reactor??'brightness'):'brightness';if(!['brightness','contrast','local','brightness-difference','contrast-difference','local-difference'].includes(reactor)||!sourceReactor&&reactor.endsWith('-difference'))fail('Unknown reactor mode or source combination');
 if(name==='venetianWipe'&&(o.width!==undefined&&o.count!==undefined||o.angleDegrees!==undefined&&o.axis!==undefined))fail('Specify physical width/angle or legacy count/axis');
 const domain=Math.hypot(base.width,base.height);
 const phase=name==='randomBlocksWipe'?Math.max(base.width/p[15],base.height/p[16]):name==='venetianWipe'?domain/p[14]:name==='gridWipe'?domain/Math.min(p[15],p[16]):name==='jawsWipe'?domain/p[15]:name==='lineSweepWipe'?p[16]:0;
 if(!Number.isFinite(phase)||phase>2**24)fail('Cell/strip phase exceeds exact Float32 integer representation');
 for(const at of name==='lineSweepWipe'?[6,7,8,15,16,20]:name==='gridWipe'||name==='jawsWipe'?[6,15,16,20]:name==='venetianWipe'?[6,14]:[]){if(!Number.isFinite(p[at]))fail('Derived geometry exceeds finite Float32 representation');}
 // Reuse the existing admitted Gaussian domain. Larger kernels are a declared
 // shared GPU-library dependency, never a silent approximation or CPU fallback.
 const maxSigma=blurMask?.maxSigma??64;if(typeof maxSigma!=='number'||Number.isNaN(maxSigma)||maxSigma<0)fail('Invalid shared Gaussian domain');
 if(sigma>maxSigma||feather>maxSigma)throw new EngineError('E_PA_TRANSITION_BLUR_DOMAIN','Requested sigma exceeds the explicitly qualified shared Gaussian domain',{details:{requested:Math.max(sigma,feather),qualified:maxSigma}});
 if((sigma>0||feather>0||reactor==='contrast'||reactor==='contrast-difference')&&typeof blurMask!=='function')throw new EngineError('E_PA_TRANSITION_GAUSSIAN_REQUIRED','This profile requires an explicitly bound precision-qualified shared native Gaussian; the old unguarded Gaussian is not a substitute');
 const blur=(image:GpuPixelImage,radius:number)=>blurMask!(image,{radius,boundary:'clamp',format:'rgba32float',signal:o.signal});
 return withGpuResources(gpu,async arena=>{
  const temporalBuffer=temporal?arena.buffer(await gpu.createBuffer({type:'f32',length:temporal.length})):undefined;
  // Per-frame scalar words use the existing ordered writer, keeping changing
  // completion samples out of immutable program seeds and topology identities.
  if(temporalBuffer)await gpu.writeBuffer(temporalBuffer,temporal!);
  let actual=inputs;
  if(sourceReactor){
   const matrix=gamutMatrix(base.color,linear709);for(let i=0;i<3;i++)p[25+i]=.2126*matrix[0][i]+.7152*matrix[1][i]+.0722*matrix[2][i];
   const pairCode=support+`fn gray(v:vec4f,a:u32)->f32{var rgb=v.rgb;if(a==0u){if(v.a==0.){return 0.;}rgb/=v.a;}return dot(rgb,vec3f(paramF32(25u),paramF32(26u),paramF32(27u)));}fn pixel(p:vec2u)->vec4f{return vec4f(gray(read0(vec2i(p)),alpha0()),gray(read1(vec2i(p)),alpha1()),0.,1.);}`;
   const pairImage=arena.image(await gpu.run(await gpu.compile({abiVersion:1,id:'frameweave/pro-animation/controls/source-pair',version:'1.0.0',inputCount:2,parameterWords:32,code:pairCode}),[from,to],{parameters:p,output:{format:'rgba32float',alpha:'opaque'},signal:o.signal}));
   const contrast=reactor==='contrast'||reactor==='contrast-difference',local=reactor==='local'||reactor==='local-difference';
   const means=contrast?arena.image(await blur(pairImage,8)):undefined;
   const expression=contrast?'abs((v.x-read1(q).x)-(v.y-read1(q).y))':local?'length(vec2f(difference(q+vec2i(1,0))-difference(q-vec2i(1,0)),difference(q+vec2i(0,1))-difference(q-vec2i(0,1)))*.5)':reactor==='brightness-difference'?'abs(v.x-v.y)':'(v.x+v.y)*.5';
   const code=`fn difference(p:vec2i)->f32{let v=read0(clamp(p,vec2i(0),vec2i(size0())-1));return v.x-v.y;}fn pixel(p:vec2u)->vec4f{let q=vec2i(p);let v=read0(q);let r=${expression};return vec4f(r,r,r,1.);}`;
   let plane=arena.image(await gpu.run(await gpu.compile({abiVersion:1,id:'frameweave/pro-animation/controls/source-reactor/'+reactor,version:'1.0.0',inputCount:means?2:1,parameterWords:0,code}),means?[pairImage,means]:[pairImage],{output:{format:'rgba32float',alpha:'opaque'},signal:o.signal}));
   if(sigma>0)plane=arena.image(await blur(plane,sigma));
   actual=[from,to,plane];u[23]=0;u[24]=0;
  }else if(mask&&(sigma>0||reactor!=='brightness')){
   // This pass reads ONLY the mask. Declare exactly that resource; source image
   // dimensions are explicit output metadata, not unused native bind entries.
   const mapping=maskSupport.replaceAll('size0()','outputSize()').replaceAll('size2()','size0()').replaceAll('read2(','read0(').replaceAll('alpha2()','alpha0()');
   const code=arithmetic+mapping+'fn pixel(p:vec2u)->vec4f{let v=maskValue(vec2f(p));return vec4f(v,v,v,1.);}';let plane=arena.image(await gpu.run(await gpu.compile({abiVersion:1,id:'frameweave/pro-animation/controls/map-plane',version:'1.0.2',inputCount:1,parameterWords:32,code}),[mask],{parameters:p,output:{width:base.width,height:base.height,color:base.color,format:'rgba32float',alpha:'opaque'},signal:o.signal}));
   if(sigma>0)plane=arena.image(await blur(plane,sigma));
   if(reactor==='contrast'){const mean=arena.image(await blur(plane,8));plane=arena.image(await gpu.run(await gpu.compile({abiVersion:1,id:'frameweave/pro-animation/controls/contrast-reactor',version:'1.0.0',inputCount:2,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let v=min(abs(read0(vec2i(p)).r-read1(vec2i(p)).r)*4.,1.);return vec4f(v,v,v,1.);}'}),[plane,mean],{output:{format:'rgba32float',alpha:'opaque'},signal:o.signal}));}
   if(reactor==='local')plane=arena.image(await gpu.run(await gpu.compile({abiVersion:1,id:'frameweave/pro-animation/controls/local-reactor',version:'1.0.0',inputCount:1,parameterWords:0,code:'fn value(p:vec2i)->f32{return read0(clamp(p,vec2i(0),vec2i(size0())-1)).r;}fn pixel(p:vec2u)->vec4f{let q=vec2i(p);let g=vec2f(value(q+vec2i(1,0))-value(q-vec2i(1,0)),value(q+vec2i(0,1))-value(q-vec2i(0,1)))*.5;let v=min(length(g)*8.,1.);return vec4f(v,v,v,1.);}'}),[plane],{output:{format:'rgba32float',alpha:'opaque'},signal:o.signal}));
   actual=[from,to,plane];u[23]=0;u[24]=0;p[28]=0;p[29]=1;u[30]=0;
  }
  const body=bodies[name];let imageBody=imageBodies[name];if(name==='cardFlipWipe')imageBody=imageBody!.replace('CARD_GRADIENT',mask?'order=maskValue((cell+.5)/counts*vec2f(size0())-.5);':'order=0.;');if(!body&&!imageBody)fail(name+': no spatial control profile');
  const prelude=support+imageSampling+(actual.length>2?maskSupport:'');
  const temporalCode=temporal?`fn completionAt(point:vec2f)->f32{var sum=pair(vec4f(0.));for(var i=0u;i<paramU32(21u);i++){let t=data0(i);var c=0.;if(t>=1.){c=1.;}else if(t>0.){c=reveal(point,t);}sum=add(sum,pair(vec4f(c)));}return rounded(multiply(sum,constant(paramF32(20u),paramF32(22u)))).x;}`:'fn completionAt(point:vec2f)->f32{return reveal(point,paramF32(0u));}';
  const reveal=body?`fn reveal(point:vec2f,t:f32)->f32{${body}}${temporalCode}
   fn amountAt(pos:vec2u)->f32{let t=paramF32(0u);${temporal?'':'if(paramU32(31u)==0u){if(t<=0.){return 0.;}if(t>=1.){return 1.;}}'}let n=paramU32(18u);var sum=pair(vec4f(0.));for(var y=0u;y<n;y++){for(var x=0u;x<n;x++){let point=vec2f(pos)+(vec2f(f32(x),f32(y))+.5)/f32(n);sum=add(sum,pair(vec4f(completionAt(point))));}}return rounded(multiply(sum,pair(vec4f(paramF32(19u))))).x;}`:'';
  const kernel=(suffix:string,code:string,count=actual.length):GpuPixelKernelSource=>({...(temporal?{abiVersion:2 as const,dataInputs:[{type:'f32' as const}]}:{abiVersion:1 as const}),id:'frameweave/pro-animation/controls/'+name+(temporal?'/auto-softness':'')+suffix,version:'1.0.0',inputCount:count,parameterWords:32,code});
  if(feather>0){const count=name==='imageWipe'?1:0;let generator=(support+(count?maskSupport:'')+reveal+'fn pixel(p:vec2u)->vec4f{let v=amountAt(p);return vec4f(v,v,v,1.);}').replaceAll('size0()','outputSize()');if(count)generator=generator.replaceAll('size2()','size0()').replaceAll('read2(','read0(').replaceAll('alpha2()','alpha0()');const coverage=arena.image(await gpu.run(await gpu.compile(kernel('/coverage',generator,count)),count?[actual[2]]:[],{parameters:p,...temporalBuffer?{data:[temporalBuffer]}:{},output:{width:base.width,height:base.height,color:base.color,format:'rgba32float',alpha:'opaque'},signal:o.signal}));
   const blurred=arena.image(await blur(coverage,feather));
   return gpu.run(await gpu.compile({abiVersion:1,id:'frameweave/pro-animation/controls/feather-publish',version:'1.0.0',inputCount:3,parameterWords:0,code:support+'fn pixel(p:vec2u)->vec4f{return blend(associate(read0(vec2i(p)),alpha0()),associate(read1(vec2i(p)),alpha1()),read2(vec2i(p)).r);}'}),[from,to,blurred],{output:{format:o.format??base.format,alpha:'premultiplied'},signal:o.signal});
  }
  const pixel=imageBody?`fn pixel(pos:vec2u)->vec4f{let t=paramF32(0u);if(paramU32(31u)==0u){if(t<=0.){return associate(read0(vec2i(pos)),alpha0());}if(t>=1.){return associate(read1(vec2i(pos)),alpha1());}}let point=vec2f(pos);${imageBody}}`:
   'fn pixel(pos:vec2u)->vec4f{return blend(associate(read0(vec2i(pos)),alpha0()),associate(read1(vec2i(pos)),alpha1()),amountAt(pos));}';
  return gpu.run(await gpu.compile(kernel('',prelude+reveal+pixel)),actual,{parameters:p,...temporalBuffer?{data:[temporalBuffer]}:{},output:{format:o.format??base.format,alpha:'premultiplied'},signal:o.signal});
 });
}
