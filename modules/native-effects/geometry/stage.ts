import {defineNativeStage,type NativeGpuScope} from '../../native-gpu/authoring.ts';
import {linear709,type AlphaMode} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {EngineError} from '../../../src/core/errors.ts';
import {createNativeGeometryEffects,nativeGeometryNames} from './filters.ts';
import {callGeometry} from './cases.ts';
import {geometryVariants,callGeometryVariant} from './variants.ts';
import {sceneSource} from '../pa/scene-options.ts';
async function publish(g:NativeGpuScope,id:string,image:GpuPixelImage){const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(id,view,{version:1});}finally{await g.releaseBuffer(view);}}
interface Props {chain?:boolean;reference?:boolean;format?:'rgba16float'|'rgba32float';alpha?:AlphaMode;checks?:boolean;single?:boolean;only?:number;wide?:boolean;variants?:boolean}
export const geometryStage=defineNativeStage<Record<string,never>,Props>(init=>{const g=init.gpu,processor=createNativeGeometryEffects(init);let failed=false;return {async renderAt(c,_inputs,p){
 const format=p.format??'rgba32float',alpha=p.alpha??(['premultiplied','straight','opaque'] as const)[Math.floor(c.globalFrame/2)%3];const kernel=await g.compile({abiVersion:1,id:'fixture/native-geometry-seed',version:'1.0.0',inputCount:0,parameterWords:2,code:`fn pixel(p:vec2u)->vec4f{let a=select(f32((p.x+3u*p.y)%5u)*.25,1.,paramU32(0u)==2u);var rgb=vec3f(2.5+f32(p.x%3u)*.125,-.25-f32(p.y%3u)*.25,.125);if(paramU32(1u)!=0u){rgb*=10000.;}if(paramU32(0u)==0u&&a!=0.){rgb*=a;}return vec4f(rgb,a);}`});
 const input=p.chain?await sceneSource(g,init.width,init.height,c):await g.run(kernel,[],{parameters:Uint32Array.of(alpha==='straight'?1:alpha==='opaque'?2:0,Number(p.wide)),output:{width:init.width,height:init.height,format,alpha,color:linear709}});
 if(p.checks){
  if(c.globalFrame===0&&!failed){failed=true;return processor.processImage(input,async(i,f)=>{await f.resample(i,{width:21,height:9});throw new EngineError('E_NATIVE_GEOMETRY_FIXTURE','Intentional failure after geometry recording');});}
  const before=g.stats().runs;await processor.processImage(input,async(i,f)=>{const requests=[()=>f.twirl(i,{radius:0}),()=>f.resample(i,{width:0,height:8}),()=>f.resample(i,{width:8,height:8,maxWorkingBytes:1}),()=>f.resample(i,{width:8,height:8,sampling:'nearest'} as never),()=>f.homographyWarp(i,{matrix:[0,0,0,0,0,0,0,0,0]}),()=>f.bulge(i,{radii:[0,1]}),()=>f.lensDistortion(i,{radial:[NaN,0,0]}),()=>f.meshWarp(i,{columns:1,rows:1,destination:[]}),()=>f.liquify(i,{brushes:[{kind:'push',center:[0,0],radius:0,amount:1}]}),()=>f.liquify(i,{brushes:[{radius:1,amount:1} as never]}),()=>f.tiler(i,{boundary:'clamp',mirror:'invalid' as never}),()=>f.twirl(i,{unknown:true} as never)];for(const request of requests){try{await request();throw Error('Invalid geometry accepted');}catch(e){if((e as {code?:string}).code!=='E_NATIVE_GEOMETRY_PARAMETER')throw e;}}return i;});if(g.stats().runs!==before)throw Error('Invalid geometry recorded a GPU pass');
  const identity=await processor.processImage(input,(i,f)=>f.homographyWarp(i,{matrix:[1e-20,0,0,0,1e-20,0,0,0,1e-20]}));if(p.reference)await publish(g,'normalizedIdentity',identity);
 }
 if(p.reference)await publish(g,'source',input);
 let result=input;
 if(p.variants){for(const v of geometryVariants){result=await processor.processImage(input,(i,f)=>callGeometryVariant(v,f,i),{context:c});if(p.reference)await publish(g,v.id,result);}const stats=processor.stats();if(stats.createdDataBuffers!==stats.releasedDataBuffers)throw Error('Variant scratch leaked');return result;}
 if(p.chain){result=await processor.processImage(input,async(i,f)=>{let value=await f.resample(i,{width:init.width,height:init.height,method:'lanczos3'});value=await f.waveWarp(value,{height:4,phase:c.progress*90,wavelength:40});value=await f.twirl(value,{angle:20+c.progress*30});value=await f.lensDistortion(value,{radial:[.025,-.005,0]});return f.magnify(value,{magnification:1.08,feather:4,radius:Math.min(init.width,init.height)*.35});},{context:c});}
 else {for(const index of p.only===undefined?nativeGeometryNames.map((_,i)=>i):[p.only]){result=await processor.processImage(input,(i,f)=>callGeometry(nativeGeometryNames[index],f,i,c.globalFrame),{context:c});if(p.reference)await publish(g,nativeGeometryNames[index],result);if(p.single)break;}}
 if(p.reference&&p.chain)await publish(g,'result',result);
 const stats=processor.stats();if(stats.createdDataBuffers!==stats.releasedDataBuffers)throw Error('Geometry scratch leaked');return result;
 },async dispose(){await processor.dispose();await processor.dispose();}};});
