import {EngineError} from '../../../src/core/errors.ts';
import {evaluate} from '../../../src/core/animation.ts';
import type {Signal,FrameContext} from '../../../src/core/types.ts';
import {assertColor,pixelsFromSurface,surfaceFromPixels,linear709,type ProfessionalSurface,type ColorEncoding,type AlphaMode} from '../../../src/media/surface.ts';
import {transformPixels,gamutMatrix} from '../../../src/media/color.ts';

export type FloatFormat='rgba16float'|'rgba32float';
export interface FloatEffectOptions {
 /** Required for encoded input. Linear input defaults to its own explicit scene space. Output stays in this space. */
 workingColor?:ColorEncoding;
 format?:FloatFormat;
 alpha?:AlphaMode;
 /** Owned temporary-array estimate, excluding the caller's storage and eventual wire serialization. */
 maxWorkingBytes?:number;
}
export interface BlurOptions extends FloatEffectOptions {radius:Signal<number>;boundary?:'transparent'|'clamp'}
export interface GlowOptions extends BlurOptions {threshold?:Signal<number>;intensity:Signal<number>}
export interface DisplacementOptions extends FloatEffectOptions {
 amount:Signal<number>;frequency?:Signal<number>;speed?:Signal<number>;seed?:number;
 time?:Signal<number>;offset?:readonly [Signal<number>,Signal<number>];
 boundary?:'transparent'|'clamp';sampling?:'bilinear'|'nearest';
}
/** Call-local owned scratch, already decoded, color-converted and premultiplied by PME. */
export interface FloatKernelImage {pixels:Float32Array;readonly width:number;readonly height:number;readonly color:Readonly<ColorEncoding>;readonly alpha:'premultiplied'}
export type FloatKernel=(image:FloatKernelImage,context?:FrameContext)=>Float32Array;
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
function scalar(value:Signal<number>,context:FrameContext|undefined,name:string,min:number,max:number){
 if(typeof value!=='number'&&!context)fail('E_PA_CONTEXT',`${name} Signal requires FrameContext`);
 const n=typeof value==='number'?value:evaluate(value,context!);
 if(!Number.isFinite(n)||n<min||n>max)fail('E_PA_PARAMETER',`${name} must be finite in [${min},${max}]`);return n;
}
function fields(options:object,allowed:string[]){if(Object.keys(options).some(k=>!['workingColor','format','alpha','maxWorkingBytes',...allowed].includes(k)))fail('E_PA_PARAMETER','Unknown effect option; CPU effects have no GPU/WASM backend selector');}
function boundary(value:unknown){if(value!==undefined&&value!=='transparent'&&value!=='clamp')fail('E_PA_PARAMETER','Unknown sampling boundary');return value??'transparent';}
/** Shared PME validation, stride decode, explicit color conversion and canonical premultiplication. No Canvas bridge. */
function prepare(input:ProfessionalSurface,options:FloatEffectOptions){
 // PME is the authority for wire metadata, byte counts, finite pixels and alpha.
 if(input?.format!=='rgba16float'&&input?.format!=='rgba32float')fail('E_PA_PRECISION','Professional effects require RGBA16F/32F Surface v2');
 const color=options.workingColor??input.color;assertColor(color);
 if(color.transfer!=='linear'||color.reference!=='scene')fail('E_PA_WORKING_COLOR','Choose an explicit scene-linear workingColor for encoded/display input');
 const budget=options.maxWorkingBytes??256*1024*1024;
 if(!Number.isSafeInteger(budget)||budget<1024||budget>512*1024*1024)fail('E_PA_LIMIT','Working budget must be 1 KiB..512 MiB');
 if(input.width*input.height>4194304||input.width*input.height*160>budget)fail('E_PA_LIMIT','Float effect exceeds 4MP or owned working estimate');
 const format=options.format??input.format,alpha=options.alpha??(input.alpha==='opaque'?'premultiplied':input.alpha);
 if(format!=='rgba16float'&&format!=='rgba32float')fail('E_PA_PRECISION','Output must remain RGBA16F/32F');
 if(!['straight','premultiplied','opaque'].includes(alpha))fail('E_MEDIA_ALPHA','Invalid output alpha');
 const decoded=pixelsFromSurface(input),p=transformPixels(decoded,input.color,color,input.alpha).pixels;
 for(let i=0;i<p.length;i+=4){const a=p[i+3];for(let c=0;c<3;c++)p[i+c]=a===0?0:input.alpha==='premultiplied'?p[i+c]:p[i+c]*a;}
 return {p,color,format,alpha,width:input.width,height:input.height};
}
function publish(p:Float32Array,state:ReturnType<typeof prepare>){
 if(state.alpha!=='premultiplied')for(let i=0;i<p.length;i+=4){const a=p[i+3];for(let c=0;c<3;c++)p[i+c]=a===0?0:p[i+c]/a;}
 // Use PME's deferred value storage, not a second image handle. Adjacent calls in one Stage avoid eager Base64.
 return surfaceFromPixels(state.width,state.height,p,{format:state.format,color:state.color,alpha:state.alpha,deferBase64:true});
}
/** Trusted authored CPU kernel extension. Shares the exact validation/color/alpha/publication path used by builtins. */
export function applyFloatKernel(input:ProfessionalSurface,options:FloatEffectOptions,kernel:FloatKernel,context?:FrameContext):ProfessionalSurface{
 fields(options,[]);if(typeof kernel!=='function')fail('E_PA_KERNEL','A synchronous typed CPU kernel is required');
 const state=prepare(input,options),result=kernel({pixels:state.p,width:state.width,height:state.height,color:Object.freeze({...state.color}),alpha:'premultiplied'},context);
 if(!(result instanceof Float32Array)||result.length!==state.p.length)fail('E_PA_KERNEL','CPU kernel must synchronously return width*height*4 Float32 samples');
 // PME checks finite values, alpha, requested format and half overflow. It copies the result into owned Surface storage.
 return publish(result,state);
}
function gaussian(p:Float32Array,width:number,height:number,sigma:number,edge:unknown){
 if(sigma===0)return new Float32Array(p);
 if(width*height*8*(2*Math.ceil(3*sigma)+1)>250000000)fail('E_PA_LIMIT','Gaussian exceeds 250M tap-channel operations; reduce radius/size or use a future approved accelerated implementation');
 const r=Math.ceil(3*sigma),weights=Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum;
 const temp=new Float32Array(p.length),out=new Float32Array(p.length);
 for(let axis=0;axis<2;axis++){const src=axis?temp:p,dst=axis?out:temp;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=(y*width+x)*4;for(let c=0;c<4;c++){let v=0;
   for(let k=-r;k<=r;k++){let xx=x+(axis?0:k),yy=y+(axis?k:0);if(edge==='clamp'){xx=Math.max(0,Math.min(width-1,xx));yy=Math.max(0,Math.min(height-1,yy));}else if(xx<0||xx>=width||yy<0||yy>=height)continue;
    v+=src[(yy*width+xx)*4+c]*weights[k+r];}dst[at+c]=v;
  }}
 }return out;
}
/** CPU reference Gaussian: radius is sigma in physical pixels; finite +/-ceil(3*sigma) normalized kernel. */
export function blur(input:ProfessionalSurface,options:BlurOptions,context?:FrameContext):ProfessionalSurface{
 fields(options,['radius','boundary']);
 const sigma=scalar(options.radius,context,'radius (sigma px)',0,64),edge=boundary(options.boundary),state=prepare(input,options);
 return publish(gaussian(state.p,state.width,state.height,sigma,edge),state);
}
/** Scene-linear bloom. Extract max(0,1-threshold/Y) of signed RGB and coverage, Gaussian, then add energy. */
export function glow(input:ProfessionalSurface,options:GlowOptions,context?:FrameContext):ProfessionalSurface{
 fields(options,['radius','boundary','threshold','intensity']);
 const sigma=scalar(options.radius,context,'radius (sigma px)',0,64),threshold=scalar(options.threshold??1,context,'threshold (working white units)',0,1e6),intensity=scalar(options.intensity,context,'intensity',0,100),edge=boundary(options.boundary),state=prepare(input,options);
 if(intensity===0)return publish(state.p,state);
 // Y is explicitly defined through PME's colorimetric mapping to linear Rec.709.
 const m=gamutMatrix(state.color,{...linear709,referenceWhiteNits:state.color.referenceWhiteNits}),l=[0,1,2].map(c=>.2126*m[0][c]+.7152*m[1][c]+.0722*m[2][c]),high=new Float32Array(state.p.length);
 for(let i=0;i<high.length;i+=4){const a=state.p[i+3],y=a===0?0:(l[0]*state.p[i]+l[1]*state.p[i+1]+l[2]*state.p[i+2])/a,w=y>threshold?1-threshold/y:0;for(let c=0;c<4;c++)high[i+c]=state.p[i+c]*w;}
 const bloom=gaussian(high,state.width,state.height,sigma,edge),out=new Float32Array(state.p.length);
 for(let i=0;i<out.length;i+=4){for(let c=0;c<3;c++)out[i+c]=state.p[i+c]+bloom[i+c]*intensity;out[i+3]=state.p[i+3]+(1-state.p[i+3])*Math.min(1,Math.max(0,bloom[i+3]*intensity));}
 return publish(out,state);
}
/** Float upgrade of the existing deterministic sine field. Physical px, absolute seconds, bilinear premultiplied sampling. */
export function displacement(input:ProfessionalSurface,options:DisplacementOptions,context?:FrameContext):ProfessionalSurface{
 fields(options,['amount','frequency','speed','seed','time','offset','boundary','sampling']);
 const amount=scalar(options.amount,context,'amount (px)',0,100),frequency=scalar(options.frequency??9,context,'frequency',.1,80),speed=scalar(options.speed??.8,context,'speed',-10,10),seed=options.seed??3;
 if(!Number.isInteger(seed)||seed<0||seed>2147483647)fail('E_PA_PARAMETER','seed must be an integer in [0,2147483647]');
 const time=scalar(options.time??context?.time??0,context,'time (seconds)',-1e6,1e6),edge=boundary(options.boundary),sampling=options.sampling??'bilinear';if(!['bilinear','nearest'].includes(sampling))fail('E_PA_PARAMETER','Unknown interpolation');
 if(options.offset&&options.offset.length!==2)fail('E_PA_PARAMETER','offset needs two physical coordinates');
 const ox=scalar(options.offset?.[0]??0,context,'offset x',-1e6,1e6),oy=scalar(options.offset?.[1]??0,context,'offset y',-1e6,1e6),state=prepare(input,options),{width,height,p}=state,out=new Float32Array(p.length),t=time*speed;
 const at=(x:number,y:number,c:number)=>{if(edge==='clamp'){x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));}else if(x<0||y<0||x>=width||y>=height)return 0;return p[(y*width+x)*4+c];};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const waveX=Math.sin(x/width*frequency*6.283+t+seed*.13),waveY=Math.sin(y/height*frequency*4.2-t*.7+seed*.31),sx=x+amount*waveY*waveX+ox,sy=y+amount*waveX*.6+oy,i=(y*width+x)*4;
  for(let c=0;c<4;c++){if(sampling==='nearest')out[i+c]=at(Math.round(sx),Math.round(sy),c);else{const xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy;out[i+c]=at(xx,yy,c)*(1-fx)*(1-fy)+at(xx+1,yy,c)*fx*(1-fy)+at(xx,yy+1,c)*(1-fx)*fy+at(xx+1,yy+1,c)*fx*fy;}}
 }return publish(out,state);
}
