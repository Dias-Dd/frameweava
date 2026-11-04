import type {FrameContext} from '../../../src/core/types.ts';
import {gamutMatrix} from '../../../src/media/color.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage,GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import {closureRuntime} from '../closure-filters/runtime.ts';
import {split,fail,integer} from '../closure-filters/control.ts';
import {controls,layouts,projections,layoutSize,projectionSize} from './control.ts';
import {specialize,neighborhood,latitudeLookup,effects,glitchNoise} from './kernels.ts';
import type {ClosureOutput} from '../closure-filters/types.ts';
import type {FrameLayout,Projection} from './types.ts';
export interface Geometry {inputLayout:FrameLayout;outputLayout:FrameLayout;inputProjection:Projection;outputProjection:Projection;inputFov:readonly number[];outputFov:readonly number[];rotation:readonly number[];sourceRotation?:readonly number[];subRotation?:readonly number[];width:number;height:number;eye?:number;disparity?:number;feather?:number;boundary:'transparent'|'clamp'}
export const identity=[1,0,0,0,1,0,0,0,1] as const;
export function sphericalRuntime(g:NativeGpuScope,context:FrameContext|undefined,outer:AbortSignal|undefined){const c=closureRuntime(g,context,outer);
 const buffer=async(values:Float32Array)=>{if(!values.length||values.some(v=>!Number.isFinite(v)))fail('spherical','table','present finite control values');c.storage(values.length);return g.createBuffer({type:'f32',length:values.length},values);};
 async function run(source:GpuPixelImage,kernel:GpuPixelKernelSourceV2,o:ClosureOutput,geometry:Geometry,table:Float32Array,effect:readonly number[]=[],flags:Readonly<Record<number,number>>={},guide?:GpuPixelImage){
  const p=controls(kernel.id,context,outer);p.active(o.signal);const working=await c.working(source,o),inEye=layoutSize(working.info.width,working.info.height,geometry.inputLayout),outEye=layoutSize(geometry.width,geometry.height,geometry.outputLayout);projectionSize(inEye.width,inEye.height,geometry.inputProjection);projectionSize(outEye.width,outEye.height,geometry.outputProjection);if(inEye.eyes===2&&outEye.eyes===1&&geometry.eye===undefined)fail('vrConverter','eye','explicit left or right when reducing stereoscopic input to mono');
  const words=new Uint32Array(256),floats=new Float32Array(words.buffer);words[1]=layouts.indexOf(geometry.inputLayout);words[2]=layouts.indexOf(geometry.outputLayout);words[3]=projections.indexOf(geometry.inputProjection);words[4]=projections.indexOf(geometry.outputProjection);words[6]=Number(geometry.boundary==='clamp');words[242]=geometry.eye??0;words[243]=Number(geometry.inputFov[1]===Math.PI);words[244]=Number(geometry.inputFov[0]===Math.PI*2);
  const put=(at:number,values:readonly number[])=>{if(values.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))))fail(kernel.id,'uniforms','finite representable control values');floats.set(values.flatMap(split),8+at*2);};
  put(0,[...geometry.inputFov,...geometry.outputFov]);put(4,geometry.rotation);put(13,[geometry.disparity??0,geometry.feather??0]);put(15,geometry.sourceRotation??identity);put(30,[p.scalar(o.amount,1,'amount',0,1)]);put(31,geometry.subRotation??identity);put(48,effect);
  const m=gamutMatrix(working.info.color,linear709);put(40,[0,1,2].map(j=>.2126390058715104*m[0][j]+.715168678767756*m[1][j]+.0721923153607337*m[2][j]));for(const [at,value]of Object.entries(flags)){integer(Number(at),kernel.id,'flag offset',0,255);integer(value,kernel.id,'flag value',0,0xffffffff);if(Number(at)===7)fail(kernel.id,'flag7','reserved arithmetic guard');words[Number(at)]=value;}
  const data=await buffer(table);let coordinates:Awaited<ReturnType<typeof buffer>>|undefined;
  try{
   if(kernel===neighborhood){const count=words[5];c.storage(inEye.height*count*4);coordinates=await g.createField({type:'f32',dimensions:[count,inEye.height,1],components:4,semantic:'generic',space:'image',units:'radians',channels:['longitude-offset-hi','longitude-offset-lo','latitude-hi','latitude-lo']});words[249]=inEye.height;await g.dispatch(await g.compileCompute(latitudeLookup),[data,coordinates],{parameters:words,workItems:[count,inEye.height,1],signal:o.signal??outer});}
   if(kernel===effects&&flags[0]===4){c.storage(geometry.width*geometry.height*10);coordinates=await g.createField({type:'f32',dimensions:[geometry.width,geometry.height,5],components:2,semantic:'generic',space:'image',units:'noise-value',channels:['hi','lo']});words[250]=geometry.width;words[251]=geometry.height;await g.dispatch(await g.compileCompute(glitchNoise),[data,coordinates],{parameters:words,workItems:[geometry.width,geometry.height,5],signal:o.signal??outer});}
   return await g.run(await g.compile(specialize(kernel,flags[0]??0,words[3],words[4],p.scalar(o.amount,1,'amount',0,1)===1)),guide?[working,await c.working(guide,{workingColor:working.info.color,signal:o.signal??outer})]:[working],{output:{...working.info,width:geometry.width,height:geometry.height,format:o.format??source.info.format,alpha:'premultiplied'},parameters:words,data:coordinates?[data,coordinates]:[data],signal:o.signal??outer});
  }finally{if(coordinates)await g.releaseBuffer(coordinates);await g.releaseBuffer(data);}
 }
 return {run,buffer,working:c.working};
}
