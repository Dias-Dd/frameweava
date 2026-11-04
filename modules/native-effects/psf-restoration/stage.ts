import {defineNativeStage} from '../../native-gpu/authoring.ts';
import {linear709} from '../../../src/media/surface.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import {publish} from '../composite/stage.ts';
import {createNativePsfRestorationEffects} from './filters.ts';
import {calibration,numericOptions} from './cases.ts';
import type {SpatialPsf,JointObservation} from './types.ts';
import * as C from './compute.ts';
import {EngineError} from '../../../src/core/errors.ts';
const imageShader={abiVersion:1 as const,id:'fixture/psf-restoration/source',version:'1.0.0',inputCount:0,parameterWords:4,code:`fn pixel(p:vec2u)->vec4f{let uv=(vec2f(p)+.5)/vec2f(outputSize());var c=vec3f(.1+uv.x*.8,uv.y*.4-.2,1.8-uv.x*.6);if(paramU32(1u)!=0u){let gx=f32(p.x%2u)*2.-1.;let gy=f32(p.y%2u)*2.-1.;c+=vec3f(.35*gx,.3*gy,.2*(gx+gy));}else{c+=vec3f(sin(f32(p.x)*.7),cos(f32(p.y)*.8),sin(f32(p.x+p.y)*.31))*.3;}var a=f32((p.x+2u*p.y)%5u)/4.;if(paramU32(0u)==2u){a=1.;}if(paramU32(0u)==0u&&a>0.){c*=a;}c+=vec3f(.03*sin(f32(paramU32(3u))*.3+uv.x*4.));if(paramU32(2u)!=0u){c*=100000.;}return vec4f(c,a);}`};
const maskShader={abiVersion:1 as const,id:'fixture/psf-restoration/confidence',version:'1.0.0',inputCount:0,parameterWords:1,code:`fn pixel(p:vec2u)->vec4f{if(paramU32(0u)==1u){return vec4f(0.);}return vec4f(0.,0.,0.,f32((p.x+p.y*3u)%5u)/4.);}`};
interface Props{capture?:boolean;format?:'rgba16float'|'rgba32float';scene?:boolean;single?:boolean;checks?:boolean;wide?:boolean;performance?:boolean;iterations?:number}
export const psfRestorationStage=defineNativeStage<Record<string,never>,Props>(init=>{
 const g=init.gpu;let label='',capture=false,failed=false;
 const fx=createNativePsfRestorationEffects(init,{async inspect(name,b){if(capture&&!label.startsWith('single')){const snapshot=await g.cloneBuffer(b);try{await g.publishBuffer(label+'-'+name,snapshot,{version:1});}finally{await g.releaseBuffer(snapshot);}}}});
 return {async renderAt(c,_inputs,p){capture=p.capture===true&&!p.checks;const index=Math.floor(c.globalFrame),alpha=p.scene?2:Math.floor(index/4)%3,boundary=(['zero','clamp','mirror','wrap'] as const)[p.scene?1:index%4],format=p.format??'rgba32float',source=await g.run(await g.compile(imageShader),[],{output:{width:init.width,height:init.height,format,color:linear709,alpha:(['premultiplied','straight','opaque'] as const)[alpha]},parameters:Uint32Array.of(alpha,Number(p.scene),Number(p.wide),index)}),mask=p.scene?undefined:await g.run(await g.compile(maskShader),[],{output:{...source.info,format:'rgba32float',alpha:'premultiplied'},parameters:Uint32Array.of(0)});
  if(capture){await publish(g,'truth',source);if(mask)await publish(g,'confidence',mask);}
  return fx.processImage(source,async(image,f)=>{
   const psfs:SpatialPsf[]=[],anchor=p.scene||index>=4?'input':'output';for(let j=0;j<(p.single?1:3);j++)psfs.push(await f.prepareSpatialPsf(image,calibration(j,anchor)));
   if(p.checks){for(const call of [()=>f.prepareSpatialPsf(image,{...calibration(),schemaVersion:2} as never),()=>f.convolveSpatialPsf(image,{} as never),()=>f.convolveSpatialPsf(image,psfs[0],{boundary:'unknown'} as never),()=>f.jointDeblur(image,[]),()=>f.jointDeblur(image,[{id:'missing',time:{num:0,den:1},observed:false}]),()=>f.spatialDeblur(image,psfs[0],{step:2}),()=>f.spatialDeblur(image,psfs[0],{iterations:0})]){let caught=false;try{await call();}catch{caught=true;}if(!caught)throw Error('Bad PSF input accepted');}await f.convolveSpatialPsf(image,psfs[0]);if(!failed){failed=true;throw new EngineError('E_PSF_FIXTURE','Intentional authored PSF failure');}return image;}
   const blurred:GpuPixelImage[]=[];for(let j=0;j<(p.single?1:3);j++){label='blur'+j;blurred.push(await f.convolveSpatialPsf(image,psfs[j],{boundary,format:'rgba32float'}));if(capture)await publish(g,'observation'+j,blurred[j]);}
   // Independent raw transpose probe, with associated source values.
   if(capture&&!p.scene){const raw=await g.imageToBuffer!(image,{version:1}),associated=await g.createBuffer({type:'f32',length:init.width*init.height*4}),transposed=await g.createBuffer({type:'f32',length:associated.info.length}),words=new Uint32Array(128);words.set([init.width,init.height,3,3,2,2,alpha]);await g.dispatch(await g.compileCompute(C.pack),[raw,associated],{parameters:words,workItems:[init.width,init.height,1]});words[6]=index%4;words[7]=Number(psfs[0].anchor==='input');await g.dispatch(await g.compileCompute(C.transpose),[associated,psfs[0].weights,transposed],{parameters:words,workItems:[init.width,init.height,1]});await g.publishBuffer('transpose',transposed,{version:1});for(const b of [raw,associated,transposed])await g.releaseBuffer(b);}
   const samples:JointObservation[]=blurred.map((v,j)=>({id:'camera-'+j,time:{num:j*1001,den:30000},alignment:'registered-reference',image:v,psf:psfs[j],...p.scene?{}:{mask:mask!},weight:j===2?.5:1}));samples.push({id:'missing',time:{num:1001,den:10000},observed:false});
   const options={...numericOptions,...p.scene?{iterations:p.iterations??12,step:1,regularization:1e-5,smoothness:0}:{},boundary,format,alpha:(!p.scene&&index%2?'restore':'preserve-reference') as 'restore'|'preserve-reference'};
   label='joint';const result=await f.jointDeblur(blurred[0],[...samples].reverse(),options);if(result.missingObservations!==1)throw Error('Missing observation interpolated');if(capture){await publish(g,'restored',result.image);await g.publishBuffer('result-diagonal',result.normalDiagonal,{version:1});}
   if(p.scene&&capture&&!p.performance&&!p.single){for(let j=0;j<3;j++){label='single'+j;const single=await f.spatialDeblur(blurred[j],psfs[j],options);await publish(g,'single'+j,single.image);}}
   return result.image;
  },{context:c});
 },async dispose(){await fx.dispose();await fx.dispose();}};
});
