import {Composition,Stage,Layer,Resource,ref,expr} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createEditingStage,timeline,image,clip,at,effect,withEffects,editEffectNames,transition,sequenceWithTransitions} from '../index.ts';
import {createProfessionalFilters} from '../../gpu-image-effects/resident/filters.ts';import {createPaFilters} from '../../native-effects/pa/filters.ts';
import {crossDissolve,fadeThroughColor,directionalWipe,irisWipe,pushTransition} from '../../pro-animation/src/native-transitions/index.ts';
import {constantImage,publishImage,textureQuad,placement} from '../../spatial-creation/composition-core.ts';
import {linear709} from '../../../src/media/surface.ts';import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import {createGpuPixelEffects} from '../../gpu-effects/pixel-effects.ts';
const first=image('first','./input.surface.json',{width:8,height:4,decode:'surface-v2',alpha:'straight'}),second=image('second','./second.surface.json',{width:8,height:4,decode:'surface-v2',alpha:'straight'});
const transitions={crossDissolve,fadeThroughColor,directionalWipe,irisWipe,pushTransition};
// Separate from the descriptor processor: call the original algorithms directly for reference.
export const verify=defineNativeStage(async init=>{
 const format='rgba16float' as const,g=init.gpu,base=clip(first,{duration:24,fit:'stretch',sampling:'nearest'}),stages:Awaited<ReturnType<typeof createEditingStage>>[]=[];
 for(const name of editEffectNames)stages.push(await createEditingStage(init,{plan:timeline({fps:24,duration:24,format,background:[0,0,0,0],tracks:[[at(0,withEffects(base,effect(name)))]]})}));
 const chain=[effect('exposure',{stops:expr.time}),effect('blur',{radius:.7,boundary:'transparent'}),effect('glow',{radius:.8,intensity:.3,threshold:.4})];
 const chains:Awaited<ReturnType<typeof createEditingStage>>[]=[];for(const name of Object.keys(transitions)as (keyof typeof transitions)[])chains.push(await createEditingStage(init,{plan:timeline({fps:24,duration:24,format,background:[0,0,0,0],tracks:[sequenceWithTransitions([withEffects(clip(first,{duration:20,fit:'stretch',sampling:'nearest'}),...chain),withEffects(clip(second,{duration:20,fit:'stretch',sampling:'nearest'}),effect('tint',{amount:.2}))],transition(name,{duration:16}))],effects:[effect('channelMix',{offset:[.02,-.01,.03]})]})}));
 const failureStage=await createEditingStage(init,{plan:timeline({fps:24,duration:24,format,background:[0,0,0,0],tracks:[[at(0,withEffects(base,effect('exposure',{stops:.2}),effect('blur',{radius:expr.sub(expr.frame,1)})))]]})});
 const quad=await textureQuad(init);let last:any,checkedFailure=false;
 return {async renderAt(c){last=c;const owned=new Set<GpuPixelImage>(),keep=(v:GpuPixelImage)=>{owned.add(v);return v;},track=(v:GpuPixelImage)=>keep(v),fx=createProfessionalFilters(g,c,track),pa=createPaFilters(g,c,track),source=async(asset:typeof first)=>{
  const raw=keep(await g.importResource({version:1,id:asset.id,decode:'surface-v2',output:{width:8,height:4,format:'rgba32float',alpha:'straight',color:linear709}}));const pm=keep(await publishImage(init,raw,'rgba32float'));return keep(await quad.render(pm,placement({},c,16,8),'stretch','rgba32float','nearest'));
 },publish=async(name:string,v:GpuPixelImage)=>{const view=await g.imageToBuffer!(v,{version:1});try{const copy=await g.cloneBuffer(view);try{await g.publishBuffer(name,copy,{version:1});}finally{await g.releaseBuffer(copy);}}finally{await g.releaseBuffer(view);}};
 let result:GpuPixelImage|undefined;
 try{
  if(!checkedFailure){let rejected=false;try{await failureStage.renderAt({...c,frame:0,time:0},{},{});}catch(e:any){rejected=e.code==='E_PA_PARAMETER';}if(!rejected)throw Error('Missing original parameter diagnostic');const retried=await failureStage.renderAt({...c,frame:2,time:2/24},{},{});await g.release(retried);checkedFailure=true;}
  const index=c.frame%20,name=editEffectNames[index],actual=keep(await stages[index].renderAt(c,{},{})),input=await source(first),f={...fx,...pa}as any,options=name==='blur'?{radius:2,alpha:'premultiplied'}:name==='glow'?{radius:6,intensity:.5,threshold:1,alpha:'premultiplied'}:{};
  const filtered=keep(await f[name](input,{...options,format:'rgba32float'})),clear=keep(await constantImage(init,[0,0,0,0],'rgba32float'));
  // Original source-over is exercised too: the edit track is composited over transparent.
  const over=createGpuPixelEffects(g);
  const expected=keep(await over.over(filtered,clear,{format}));await publish('effectActual',actual);await publish('effectReference',expected);
  const which=c.frame%5,actualChain=keep(await chains[which].renderAt(c,{},{}));let left=await source(first),right=await source(second);
  if(c.frame<20){left=keep(await fx.exposure(left,{stops:c.time,format:'rgba32float'}));left=keep(await pa.blur(left,{radius:.7,boundary:'transparent',alpha:'premultiplied',format:'rgba32float'}));left=keep(await pa.glow(left,{radius:.8,intensity:.3,threshold:.4,alpha:'premultiplied',format:'rgba32float'}));}
  if(c.frame>=4)right=keep(await fx.tint(right,{amount:.2,format:'rgba32float'}));
  let merged=c.frame<4?left:c.frame>=20?right:keep(await Object.values(transitions)[which](g,left,right,{progress:(c.frame-4)/15,format:'rgba32float'},c));
  merged=keep(await over.over(merged,clear,{format:'rgba32float'}));merged=keep(await fx.channelMix(merged,{offset:[.02,-.01,.03],format:'rgba32float'}));
  const expectedChain=(format as string)==='rgba32float'?merged:keep(await publishImage(init,merged,format));await publish('chainActual',actualChain);await publish('chainReference',expectedChain);
  // Independent simple exposure reference data, checked in Node without GPU filter code.
  const exposure=keep(await fx.exposure(input,{stops:1,format:'rgba32float'}));await publish('input',input);await publish('doubleExposure',exposure);
  result=actualChain;owned.delete(result);return result;
 }finally{for(const v of [...owned].reverse())await g.release(v);}
 },async dispose(){for(const s of [...stages,...chains,failureStage]){await s.dispose?.();await s.dispose?.();if(last){let closed=false;try{await s.renderAt(last,{},{});}catch(e:any){closed=e.code==='E_EDIT_CLOSED';}if(!closed)throw Error('Missing closed guard');}}await quad.dispose();}};
});
export default Composition({id:'editing-filters',width:16,height:8,fps:24,durationInFrames:24,background:'transparent',children:[Resource({id:'first',src:'./input.surface.json',kind:'file'}),Resource({id:'second',src:'./second.surface.json',kind:'file'}),Stage({id:'verify',factory:verify}),Layer({source:ref('verify')})]});
