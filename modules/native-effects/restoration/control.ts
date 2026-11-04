import {EngineError} from '../../../src/core/errors.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {controls,number} from '../grading/control.ts';
import type {RestorationOutput,NativeDepthField} from './types.ts';
export function fail(effect:string,path:string,expected:string,unit?:string):never{throw new EngineError('E_NATIVE_RESTORE_PARAMETER',`${effect}.${path}: expected ${expected}${unit?' ('+unit+')':''}`,{details:{effect,path,expected,...unit?{unit}:{}}});}
function checked<T>(run:()=>T):T{try{return run();}catch(error){const e=error as {code?:string;message:string;details?:unknown};if(e.code==='E_NATIVE_GRADE_PARAMETER')throw new EngineError('E_NATIVE_RESTORE_PARAMETER',e.message,{details:e.details});throw error;}}
/** Reuse the existing strict Signal/normal-number/option policy, with this
 * module's diagnostics. No new expression or animation evaluator. */
export function parameters(effect:string,context?:FrameContext,signal?:AbortSignal){const p=controls(effect,context,signal);return {
 active:(s?:AbortSignal)=>p.active(s),
 fields:(o:RestorationOutput,extra:readonly string[])=>checked(()=>p.fields(o,extra)),
 scalar:(...args:Parameters<typeof p.scalar>)=>checked(()=>p.scalar(...args)),
 triple:(...args:Parameters<typeof p.triple>)=>checked(()=>p.triple(...args)),
 choice:<T extends string>(v:T|undefined,d:T,values:readonly T[],path:string)=>checked(()=>p.choice(v,d,values,path)),
 };}
export function integer(v:number,effect:string,path:string,min=0,max=0x3fffffff){if(!Number.isSafeInteger(v)||v<min||v>max)fail(effect,path,`integer in [${min},${max}]`);return v;}
const depths=new WeakSet<NativeDepthField>();
/** Descriptor validation is pure. The existing owner still proves provenance,
 * permissions, expiry and buffer identity when a consumer records GPU work. */
export function depthField(buffer:GpuDataBuffer):NativeDepthField{const i=buffer?.info,m=i?.metadata;if(!i||i.kind!=='data'||i.version!==1||i.type!=='f32'||i.semantic!=='depth'||i.components!==1||!Array.isArray(i.dimensions)||i.dimensions.length!==3||[0,1,2].some(j=>!Number.isSafeInteger(i.dimensions[j])||i.dimensions[j]<1)||!Array.isArray(i.origin)||i.origin.length!==3||!Array.isArray(i.domain)||i.domain.length!==3||!Array.isArray(i.channels)||i.dimensions[2]!==1||i.units!=='metres'||i.space!=='camera'||i.channels?.join(',')!=='z'||[0,1,2].some(j=>i.origin[j]!==0)||[0,1,2].some(j=>i.domain[j]!==i.dimensions[j])||i.length!==i.dimensions[0]*i.dimensions[1])fail('depthField','buffer','local f32 camera depth field [width,height,1], one z channel, metres; 0 is missing');if(!m||typeof m!=='object'||Array.isArray(m)||Object.keys(m).some(k=>k!=='rangeM'))fail('depthField','metadata','{rangeM:[minimumMetres,maximumMetres]}');const r=(m as {rangeM?:unknown}).rangeM;if(!Array.isArray(r)||r.length!==2)fail('depthField','rangeM','two positive finite camera distances');const a=checked(()=>number(r[0],'rangeM[0]','depthField',2**-126)),b=checked(()=>number(r[1],'rangeM[1]','depthField',a));const result=Object.freeze({kind:'native-depth' as const,version:1 as const,width:i.dimensions[0],height:i.dimensions[1],rangeM:Object.freeze([a,b]) as readonly [number,number],buffer});depths.add(result);return result;}
export function checkedDepth(field:NativeDepthField,width?:number,height?:number){if(!field||!depths.has(field))fail('restoration','depth','a typed field returned by depthField');if(width!==undefined&&(field.width!==width||field.height!==height))fail('restoration','depth.dimensions','matching physical image dimensions','pixels');}
export interface AperturePlan {spans:Int32Array;count:number;population:number}
const away=(v:number)=>Math.sign(v)*Math.floor(Math.abs(v)+.5);
/** EffectCraft blur2.rs iris_spans, retaining F64 geometry and Rust ties-away
 * integer scan conversion. No image data is examined on CPU. */
export function aperturePlan(radius:number,blades:number,rotation:number,roundness:number,maxWords:number):AperturePlan{
 const reach=Math.ceil(radius);integer(reach,'bokehBlur','radius');integer(blades,'bokehBlur','blades',0);if(blades!==0&&blades<3)fail('bokehBlur','blades','0 for circle or integer >=3');if((reach*2+1)*3>maxWords||blades*2>maxWords)fail('bokehBlur','aperture','control spans/vertices fitting actual storage budget');
 const vertices=Array.from({length:blades},(_,j)=>{const a=(rotation%360)*Math.PI/180-Math.PI/2+j*2*Math.PI/blades;return [radius*Math.cos(a),radius*Math.sin(a)];}),out=new Int32Array((reach*2+1)*3);let count=0,population=0;
 for(let y=-reach;y<=reach;y++){const circle=Math.abs(y)<=radius?Math.sqrt(Math.max(0,radius*radius-y*y)):undefined;let lo=Infinity,hi=-Infinity;if(blades){for(let j=0;j<blades;j++){const [x0,y0]=vertices[j],[x1,y1]=vertices[(j+1)%blades];if((y0-y)*(y1-y)<=0&&Math.abs(y1-y0)>1e-12){const x=x0+(y-y0)/(y1-y0)*(x1-x0);lo=Math.min(lo,x);hi=Math.max(hi,x);}}}else if(circle!==undefined){lo=-circle;hi=circle;}if(lo<=hi&&circle!==undefined){lo+=(-circle-lo)*roundness;hi+=(circle-hi)*roundness;}else if(lo>hi&&circle!==undefined&&roundness>.5){lo=-circle;hi=circle;}if(lo<=hi){const l=away(lo),r=away(hi);if(l<=r){out.set([y,l,r],count*3);count++;population+=r-l+1;}}}
 if(!count){out.set([0,0,0]);count=1;population=1;}if(!Number.isSafeInteger(population))fail('bokehBlur','aperture.population','safe integer normalization');return {spans:out.subarray(0,count*3),count,population};
}
export function lensScale(width:number,focalLengthMm:number,fStop:number,focusDistanceM:number,sensorWidthMm:number){if(focusDistanceM*1000<=focalLengthMm)fail('circleOfConfusion','focusDistanceM','focus beyond focal length','metres');const value=focalLengthMm*focalLengthMm/(fStop*(focusDistanceM*1000-focalLengthMm))*width/(2*sensorWidthMm);return checked(()=>number(value,'scale','circleOfConfusion',0));}
