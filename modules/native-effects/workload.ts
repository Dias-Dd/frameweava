import type {FrameContext} from '../../src/core/types.ts';
import type {GpuPixelImage,GpuPixelScope,GpuPixelKernelSourceV2} from '../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../gpu-effects/compute-types.ts';
import {linear709} from '../../src/media/surface.ts';
import {twistPositions} from '../mesh-deformation/index.ts';
import type {NativeImageFilters} from './images.ts';
export const geometrySeed=new Float32Array([0,0,0,.3,.5,-.2,-.4,-.8,.6,1,0,0,0,1,0,0,0,1,2,2,2,-.2,.1,.3]);
export const sourceKernel:GpuPixelKernelSourceV2={abiVersion:2,id:'frameweave/native-effects/source',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:3,code:`
fn pixel(p:vec2u)->vec4f{
 let index=((p.x+3u*p.y)%8u)*3u;let position=vec3f(data0(index),data0(index+1u),data0(index+2u));
 if(paramU32(2u)!=0u){return vec4f(position,1.);}
 let u=f32(p.x)/f32(max(outputSize().x-1u,1u));let v=f32(p.y)/f32(max(outputSize().y-1u,1u));
 var a=1.;if(paramU32(1u)!=0u){let coverage=array<f32,4>(0.,.125,.5,1.);a=coverage[(p.x+3u*p.y)%4u];}
 if(a==0.){return vec4f(.2,-.1,.05,0.);}
 return vec4f(vec3f(1.5+u*.7+position.x*.125+paramF32(0u),.2+v*.5+position.y*.125,-.4+position.z*.125)*a,a);
}`};
export async function createGeometrySeed(gpu:GpuPixelScope){return gpu.createField({type:'f32',dimensions:[8,1,1],components:3,semantic:'position',space:'test.local',units:'meter'},geometrySeed);}
export async function geometrySource(gpu:GpuPixelScope,seed:GpuDataBuffer,context:FrameContext,width:number,height:number,format:'rgba16float'|'rgba32float',partial=false,geometryOnly=false){
 const transformed=await twistPositions(gpu,seed,context,{rate:.7,offset:.2+context.frame/600});
 try{const p=Float32Array.of(context.frame/1000,0,0),u=new Uint32Array(p.buffer);u[1]=Number(partial);u[2]=Number(geometryOnly);return await gpu.run(await gpu.compile(sourceKernel),[],{data:[transformed],parameters:p,output:{width,height,format,alpha:'premultiplied',color:linear709}});}finally{await gpu.releaseBuffer(transformed);}
}
/** Twenty original effect algorithms and options, frozen for BOTH layouts. */
export async function applyEffect(index:number,input:GpuPixelImage,original:GpuPixelImage,fx:NativeImageFilters,context:FrameContext):Promise<GpuPixelImage>{switch(index){
 case 0:return fx.brightnessContrast(input,{brightness:.02,contrast:1.01+context.frame/10000});
 case 1:return fx.tint(input,{black:[-.02,.01,.03],white:[1.1,.9,.7],amount:.01});
 case 2:return fx.tritone(input,{shadows:[-.02,.01,.04],midtones:[.5,.4,.2],highlights:[1.2,.9,.6],amount:.01});
 case 3:return fx.colorBalance(input,{shadows:[.01,-.01,.005],midtones:[0,.01,-.005],highlights:[.005,0,-.005]});
 case 4:return fx.blackAndWhite(input,{amount:.02});
 case 5:return fx.filmGrain(input,{amount:.004,seed:37,animated:true,colored:true});
 case 6:return fx.vignette(input,{amount:.12,radius:.75});
 case 7:return fx.sobelEdges(input,{strength:.005,color:[1,.5,.2],mode:'overlay'});
 case 8:return fx.reliefLighting(input,input,{contrast:.002,angle:35});
 case 9:return fx.pixelate(input,{blockSize:[2,2]});
 case 10:return fx.darken(original,input,{opacity:.02});
 case 11:return fx.lighten(original,input,{opacity:.02});
 case 12:return fx.difference(original,input,{opacity:.01});
 case 13:return fx.exclusion(original,input,{opacity:.01});
 case 14:return fx.overlay(original,input,{opacity:.01});
 case 15:return fx.hardLight(original,input,{opacity:.01});
 case 16:return fx.linearBurn(original,input,{opacity:.005});
 case 17:return fx.subtractBlend(original,input,{opacity:.005});
 case 18:return fx.linearLight(original,input,{opacity:.005});
 case 19:return fx.pinLight(original,input,{opacity:.01});
 default:throw Error('Unknown frozen effect index');
}}
