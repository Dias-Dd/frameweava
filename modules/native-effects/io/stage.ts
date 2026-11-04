import {EngineError} from '../../../src/core/errors.ts';
import {linear709,type AlphaMode} from '../../../src/media/surface.ts';
import {defineNativeStage,type NativeStageInit,type NativeGpuScope} from '../../native-gpu/authoring.ts';
import {borrowNativeScope} from '../../native-gpu/borrow.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {createNativeProfessionalEffects} from '../extended.ts';
import {inputSurface,redGain} from './input.ts';
interface Props {mode?:'inline'|'surface'|'png';reference?:boolean;checks?:boolean;resource?:string;resourceWidth?:number;resourceHeight?:number}
async function publish(g:NativeGpuScope,id:string,image:GpuPixelImage){const view=await g.imageToBuffer!(image,{version:1});await g.publishBuffer(id,view,{version:1});await g.releaseBuffer(view);}
async function make(init:NativeStageInit,borrowed=false){const g=init.gpu,loan=borrowed?borrowNativeScope(g):undefined,effects=createNativeProfessionalEffects({gpu:loan?.scope??g});let failed=false;
 return {async renderAt(c:FrameContext,_i:Record<string,never>,p:Props){const mode=p.mode??'inline',format=mode==='inline'&&c.globalFrame%2===1?'rgba16float':'rgba32float',alpha:AlphaMode=['premultiplied','straight','opaque'][Math.floor(c.globalFrame/2)%3] as AlphaMode;
  if(p.checks&&mode==='inline'){
   if(!failed){failed=true;return effects.generateImage(async f=>{await f.importImage(inputSurface(17,13));throw new EngineError('E_NATIVE_IO_FIXTURE','Failure after explicit input recording before GPU acceptance');});}
   const before=g.stats().runs,bad=structuredClone(inputSurface(1,1));bad.storage.data='!';for(const [request,code]of [[()=>effects.generateImage(f=>f.importImage(inputSurface(129,128))),'E_NATIVE_UPLOAD_LIMIT'],[()=>effects.generateImage(f=>f.importImage(bad)),'E_MEDIA_BYTES'],[()=>effects.generateImage(f=>f.importImage(inputSurface(1,1)),{signal:AbortSignal.abort()}),'E_RENDER_CANCELLED']] as const){try{await request();throw Error('Expected '+code);}catch(e){if((e as {code?:string}).code!==code)throw e;}}if(g.stats().runs!==before)throw Error('Invalid input recorded a pass');
  }
  const wrongResource=p.checks&&mode!=='inline'&&!failed;if(wrongResource)failed=true;
  const source=mode==='inline'?await effects.generateImage(f=>f.importImage(inputSurface(17,13,alpha,format,c.globalFrame%7*.01)),{context:c}):await g.importResource({version:1,id:wrongResource?'undeclared-test-resource':p.resource??'source',decode:mode==='png'?'icc-sdr':'surface-v2',output:{width:p.resourceWidth??160,height:p.resourceHeight??128,format:'rgba32float',alpha:'premultiplied',color:linear709}});
  try{
   if(p.reference)await publish(g,'input',source);
   const result=await effects.processImage(source,async(i,f)=>{i=await f.channelMix(i,{matrix:[[1,.125,0],[0,1,0],[0,0,.5]],format});return f.levels(i,{outputWhite:[redGain,1,1],format});},{context:c});
   if(p.reference){await publish(g,'result',result);const s=effects.stats(),owner=g.stats(),counter=await g.createField({type:'u32',dimensions:[5,1,1],components:1,semantic:'generic',channels:['recorded-counter']});await g.writeBuffer(counter,Uint32Array.of(owner.uploads,owner.uploadBytes,s.createdImages,s.releasedImages,s.retainedImages));await g.publishBuffer('authoring',counter,{version:1});await g.releaseBuffer(counter);}
   return result;
  }finally{if(mode!=='inline')await g.release(source);}
 },async dispose(){await effects.dispose();await effects.dispose();await loan?.dispose();await loan?.dispose();}};
}
export const imageInputStage=defineNativeStage<Record<string,never>,Props>(init=>make(init));
export const borrowedImageInputStage=defineNativeStage<Record<string,never>,Props>(init=>make(init,true));
