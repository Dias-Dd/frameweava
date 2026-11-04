import {defineNativeStage} from '../../native-gpu/authoring.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuDataBuffer,GpuFieldDescriptor} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelKernelSourceV2} from '../../gpu-effects/pixel-types.ts';
import type {SpatialField,FieldKind,SpatialCamera} from '../../spatial-fields/types.ts';
import {linear709} from '../../../src/media/surface.ts';
import {nativeSpatialFrame} from './frame.ts';
import {meshCalls,computeCalls,fieldCalls,camera} from './cases.ts';
import {layout} from '../../spatial-fields/parameters.ts';
interface Seed {descriptor:GpuFieldDescriptor;values:number[]}
interface FieldSeed {kind:FieldKind;data:number[];camera?:SpatialCamera}
interface Props {group:'mesh'|'compute'|'fields'|'volume'|'depthMatte';seeds?:Seed[][];fields?:FieldSeed[][];expectedScalarCounts?:number[];format?:'rgba16float'|'rgba32float'}
/** Diagnostic fixture only. Exports raw data scalars in R, Alpha1; never a
 * graphics-data contract, professional colour image or public effect. */
async function dump(g:NativeGpuScope,buffers:readonly GpuDataBuffer[],width:number,height:number){
 const count=buffers.length,offset=buffers[0].info.length;
 const source:GpuPixelKernelSourceV2={abiVersion:2,id:'fixture/native-spatial-dump-'+count,version:'1.0.0',inputCount:0,dataInputs:buffers.map(()=>({type:'f32'})),parameterWords:1,code:`fn pixel(p:vec2u)->vec4f{let i=p.y*outputSize().x+p.x;var v=0.;if(i<dataLength0()){v=data0(i);}${count===2?'else if(i<paramU32(0u)+dataLength1()){v=data1(i-paramU32(0u));}':''}return vec4f(v,0.,0.,1.);}`};
 return g.run(await g.compile(source),[],{data:buffers,parameters:Uint32Array.of(offset),output:{width,height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
}
async function dumpFields(g:NativeGpuScope,fields:readonly SpatialField[],width:number,height:number){const count=fields.length,first=fields[0].validity.info.length,components=fields.map(f=>f.data.info.components),buffers=fields.flatMap(f=>[f.data,f.validity]);
 const source:GpuPixelKernelSourceV2={abiVersion:2,id:'fixture/native-spatial-field-dump-'+count,version:'1.0.0',inputCount:0,dataInputs:buffers.map(()=>({type:'f32'})),parameterWords:3,code:`fn pixel(p:vec2u)->vec4f{let index=p.y*outputSize().x+p.x;let second=index>=paramU32(0u)*4u;var i=index;var n=paramU32(1u);${count===2?'if(second){i-=paramU32(0u)*4u;n=paramU32(2u);}':''}let cell=i/4u;let c=i%4u;var v=0.;if(!second&&cell<dataLength1()){if(c==3u){v=data1(cell);}else if(c<n){v=data0(cell*n+c);}}${count===2?'else if(second&&cell<dataLength3()){if(c==3u){v=data3(cell);}else if(c<n){v=data2(cell*n+c);}}':''}return vec4f(v,0.,0.,1.);}`};
 return g.run(await g.compile(source),[],{data:buffers,parameters:Uint32Array.of(first,components[0],components[1]??0),output:{width,height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
}
export const numericSpatial=defineNativeStage<Record<string,never>,Props>(init=>({async renderAt(context,_inputs,props){
 const g=init.gpu,fx=nativeSpatialFrame(init,context),i=context.globalFrame;
 if(props.group==='fields'||props.group==='depthMatte'){
  const fixture=props.fields![i%props.fields!.length],inputs:SpatialField[]=[];const outputs:SpatialField[]=[];
  try{for(const seed of fixture)inputs.push(await fx.fields.uploadSpatialField(seed.kind,Float32Array.from(seed.data),5,5,{camera:seed.camera}));
   if(props.group==='depthMatte')return await fx.fields.depthRangeMatte(inputs[0],{camera,near:1,far:3,softness:.5,format:props.format});
   outputs.push(...await fieldCalls[i%fieldCalls.length](fx.fields,inputs));for(const field of outputs){layout(field,undefined,context);if(field.data.info.kind!=='data'||field.validity.info.components!==1||'color'in field.data.info||'alpha'in field.data.info)throw Error('Spatial data was converted to colour');}if(outputs.reduce((n,f)=>n+f.validity.info.length*4,0)!==props.expectedScalarCounts![i%fieldCalls.length])throw Error('Spatial output size differs from reference');
   return await dumpFields(g,outputs,init.width,init.height);
  }finally{for(const f of [...outputs,...inputs])await fx.fields.releaseSpatialField(f);}
 }
 const seeds=props.seeds![i%props.seeds!.length],inputs:GpuDataBuffer[]=[],outputs:GpuDataBuffer[]=[];
 try{for(const seed of seeds)inputs.push(await g.createField(seed.descriptor,Float32Array.from(seed.values)));
  if(props.group==='volume')return await fx.compute.renderVolume(inputs[0],{width:init.width,height:init.height,steps:16,position:[0,0,5],target:[0,0,0],color:[2,.5,.25],far:10,format:props.format});
  outputs.push(...props.group==='mesh'?[await meshCalls[i%meshCalls.length](fx.mesh,inputs)]:await computeCalls[i%computeCalls.length](fx.compute,inputs));
  for(const b of outputs)if(b.info.kind!=='data'||'color'in b.info||'alpha'in b.info)throw Error('Compute data was converted to colour');if(outputs.reduce((n,b)=>n+b.info.length,0)!==props.expectedScalarCounts![i%(props.group==='mesh'?meshCalls.length:computeCalls.length)])throw Error('Data output size differs from reference');
  return await dump(g,outputs,init.width,init.height);
 }finally{for(const b of [...outputs,...inputs])await g.releaseBuffer(b);}
}}));
