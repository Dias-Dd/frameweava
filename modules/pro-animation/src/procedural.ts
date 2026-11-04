import {EngineError} from '../../../src/core/errors.ts';import {evaluate} from '../../../src/core/animation.ts';import type {FrameContext,Signal} from '../../../src/core/types.ts';
import {surfaceFromPixels,pixelsFromSurface,assertColor,type ProfessionalSurface} from '../../../src/media/surface.ts';
import type * as Graphics from '../../graphics-contracts/index.ts';import type {PathData,PathPoint,PathCommand} from '../../graphics-contracts/types.ts';
import {noise1} from './noise.ts';import {applyFloatKernel,type FloatEffectOptions} from './professional.ts';import type {CoverageOptions} from './coverage.ts';
export type VectorField=(position:readonly [number,number],context:FrameContext,pointId?:string)=>readonly [number,number];
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
function number(v:number,name:string,min=-1e6,max=1e6){if(!Number.isFinite(v)||v<min||v>max)fail('E_PA_FIELD',`${name} must be finite [${min},${max}]`);return v;}
/** Two projected smooth 1D fields from the existing audited EffectCraft kernel; not isotropic Perlin/curl/physical turbulence. */
export function noiseField(position:readonly [number,number],options:{frequency:Signal<number>;amplitude:Signal<number>;speed?:Signal<number>;seed?:number},context:FrameContext):[number,number]{
 const x=number(position[0],'x'),y=number(position[1],'y'),f=number(evaluate(options.frequency,context),'frequency',0,1000),a=number(evaluate(options.amplitude,context),'amplitude'),speed=number(evaluate(options.speed??1,context),'speed',-1000,1000),time=number(context.time,'seconds'),seed=options.seed??context.seed;
 if(!Number.isSafeInteger(seed))fail('E_PA_FIELD','Seed must be a safe integer');const s=BigInt(seed);return [noise1(s,(x*.83+y*.53)*f+time*speed)*a,noise1(s^0x9e3779b97f4a7c15n,(-x*.61+y*.79)*f+time*speed)*a];
}
export function createDeformationTools(graphics:Pick<typeof Graphics,'validatePathData'>){
 const validate=(v:unknown)=>{try{return graphics.validatePathData(v);}catch(e){const x=e as {code?:string;message?:string;details?:unknown};throw new EngineError(x.code??'E_PA_GRAPHICS',x.message??'Invalid path',{details:x.details});}};
 return {deformPath(input:PathData,field:VectorField,context:FrameContext):PathData{
  const p=validate(input);if(p.coordinates.unit!=='px')fail('E_PA_SPACE','2D deformation field uses physical pixel coordinates');if(typeof field!=='function')fail('E_PA_FIELD','A synchronous offset field is required');let count=0;
  const point=(a:PathPoint):PathPoint=>{if(++count>4096)fail('E_PA_LIMIT','Deformation is limited to4096 points/controls');const d=field([a.x,a.y],context,a.id);if(!Array.isArray(d)||d.length!==2)fail('E_PA_FIELD','Field must return two finite pixel offsets');return {...a,x:a.x+number(d[0],'dx'),y:a.y+number(d[1],'dy')};};
  const commands=p.commands.map((c):PathCommand=>{if(c.op==='Z')return c;if(c.op==='Q')return {...c,point:point(c.point),control:point(c.control)};if(c.op==='C')return {...c,point:point(c.point),control1:point(c.control1),control2:point(c.control2)};return {...c,point:point(c.point)};});return validate({...p,commands});
 }};
}
export interface DisplacementMapOptions extends Omit<CoverageOptions,'ink'> {field:VectorField}
/** Explicit utility data: R/G contain signed physical-pixel offsets, B=0, opaque A=1. No display encoding/normalization. */
export function createDisplacementMap(options:DisplacementMapOptions,context:FrameContext):ProfessionalSurface{
 const {width,height}=options;assertColor(options.workingColor);if(options.workingColor.transfer!=='linear'||options.workingColor.reference!=='scene')fail('E_PA_WORKING_COLOR','Numerical offset map needs a declared linear scene encoding');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>262144||typeof options.field!=='function')fail('E_PA_LIMIT','Map generation is bounded to262144 pixels and a synchronous field');const format=options.format??'rgba32float';if(format!=='rgba16float'&&format!=='rgba32float')fail('E_PA_PRECISION','Maps require16F/32F');
 const p=new Float32Array(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const d=options.field([x,y],context);if(!Array.isArray(d)||d.length!==2)fail('E_PA_FIELD','Offset field needs two coordinates');p.set([number(d[0],'map dx'),number(d[1],'map dy'),0,1],(y*width+x)*4);}
 return surfaceFromPixels(width,height,p,{format,color:options.workingColor,alpha:'opaque',deferBase64:true});
}
export interface MapWarpOptions extends FloatEffectOptions {encoding:'rg-offset-px';scale?:Signal<number>;boundary?:'transparent'|'clamp'}
/** Map channels are utility offsets, not RGB colors: do not gamut/transfer-convert their numbers. Source colors use PA-1 preparation. */
export function displaceWithMap(input:ProfessionalSurface,map:ProfessionalSurface,options:MapWarpOptions,context:FrameContext):ProfessionalSurface{
 if(options.encoding!=='rg-offset-px')fail('E_PA_MAP_ENCODING','Explicit rg-offset-px map interpretation required');if(map.width!==input.width||map.height!==input.height)fail('E_PA_SIZE','Map must match source physical dimensions');
 if(!['rgba16float','rgba32float'].includes(map.format)||map.color.transfer!=='linear'||map.alpha!=='opaque')fail('E_PA_MAP_ENCODING','Map must be opaque floating linear utility channels');
 const budget=options.maxWorkingBytes??256*1024*1024;if(input.width*input.height*176>budget)fail('E_PA_LIMIT','Map readback plus float workspace exceeds estimate');const data=pixelsFromSurface(map),scale=number(evaluate(options.scale??1,context),'map scale',-1000,1000),edge=options.boundary??'transparent';if(!['transparent','clamp'].includes(edge))fail('E_PA_FIELD','Unknown map boundary');
 for(let i=0;i<data.length;i+=4){number(data[i],'map dx');number(data[i+1],'map dy');}
 const common={workingColor:options.workingColor,format:options.format,alpha:options.alpha,maxWorkingBytes:options.maxWorkingBytes};
 return applyFloatKernel(input,common,({pixels,width,height})=>{const out=new Float32Array(pixels.length),at=(x:number,y:number,c:number)=>{if(edge==='clamp'){x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));}else if(x<0||y<0||x>=width||y>=height)return 0;return pixels[(y*width+x)*4+c];};
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,px=x+data[i]*scale,py=y+data[i+1]*scale,xx=Math.floor(px),yy=Math.floor(py),fx=px-xx,fy=py-yy;for(let c=0;c<4;c++)out[i+c]=at(xx,yy,c)*(1-fx)*(1-fy)+at(xx+1,yy,c)*fx*(1-fy)+at(xx,yy+1,c)*(1-fx)*fy+at(xx+1,yy+1,c)*fx*fy;}return out;
 },context);
}
