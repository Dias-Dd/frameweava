/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,Resource,ref,keyframes,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativeTransitions,transitionNames} from '../../src/native-transitions/index.ts';
import {sourceKernel,atlasKernel,transparentKernel} from '../native-transition-scene/fixture.ts';
import {managedGaussian} from './managed-gaussian.ts';

export const controls=defineNativeStage(async init=>{
 const g=init.gpu,fx=createNativeTransitions({...init,blurMask:managedGaussian(init.gpu)}),source=await g.compile(sourceKernel),stamp=await g.compile(atlasKernel),blank=await g.compile(transparentKernel);
 const imageToBuffer=g.imageToBuffer;if(!imageToBuffer)throw Error('Native data interfaces v1 are required for explicit inspection');
 const progress=keyframes([{frame:0,value:0},{frame:15,value:1,easing:'easeInOut'}]);
 const radius=keyframes([{frame:0,value:0},{frame:15,value:220}]),inner=keyframes([{frame:0,value:0},{frame:15,value:80}]);
 return {async renderAt(context,_inputs,props:{format:'rgba16float'|'rgba32float'}){
  const format=props.format,w=80,h=45,output={width:w,height:h,format,alpha:'premultiplied' as const,color:linear709};
  // Real sealed Resources. ICC conversion is explicit, never an effect fallback.
  const a=await g.importResource({version:1,id:'sdr-image',decode:'icc-sdr',output});
  const b=await g.importResource({version:1,id:'hdr-image',decode:'surface-v2',output});
  const mask=await g.run(source,[],{parameters:Uint32Array.of(2,0),output:{...output,width:4,height:3,alpha:'straight'}});
  const displacementMap=await g.run(source,[],{parameters:Uint32Array.of(2,0),output:{...output,alpha:'straight'}});
  let atlas=await g.run(blank,[],{output:{...output,width:640,height:180}});
  for(let i=0;i<transitionNames.length;i++){
   const name=transitionNames[i],options:Record<string,unknown>={progress,format};
   if(name==='directionalWipe')Object.assign(options,{angleDegrees:30,featherPixels:3,edgeSamples:4});
   if(name==='clockWipe')Object.assign(options,{wipe:'both',angularFeatherDegrees:2,edgeSamples:4});
   if(name==='irisWipe')Object.assign(options,{outerRadius:radius,innerRadius:inner,points:7,rotationDegrees:17,featherPixels:1,edgeSamples:4});
   if(name==='venetianWipe')Object.assign(options,{angleDegrees:30,width:11.5,edgeSamples:4});
   if(name==='randomBlocksWipe')Object.assign(options,{blockSize:[9.5,7.25],softEdges:true,featherPixels:1.5,seed:37});
   if(name==='lumaWipe'||name==='alphaWipe')Object.assign(options,{placement:'stretch',invert:true});
   if(name==='cardFlipWipe')Object.assign(options,{cardScale:.85,order:'gradient',gradient:mask,axis:'random',timingRandomness:.2,transitionWidth:.4,seed:37});
   if(name==='glassWipe')Object.assign(options,{mapBlur:2,placement:'stretch'});
   if(name==='gridWipe')Object.assign(options,{tiles:8,borderPixels:1.5,rotationDegrees:15});
   if(name==='imageWipe')Object.assign(options,{blur:1,borderSoftness:1.5,autoSoftness:true,temporalSamples:16});
   if(name==='jawsWipe')Object.assign(options,{toothWidth:13.5,heightPercent:37,rotationDegrees:17,shape:'sine'});
   if(name==='lightWipe')Object.assign(options,{shape:'round',rotationDegrees:17,center:[1.1,.5],intensity:.7,colorFromSource:true});
   if(name==='lineSweepWipe')Object.assign(options,{rotationDegrees:15,thickness:4,overlap:.75});
   if(name==='scaleWipe')Object.assign(options,{stretchOnly:true,stretch:3,angleDegrees:30,center:[.1,.5]});
   if(name==='twisterTransition')Object.assign(options,{shading:true});
   if(name==='warpTransition')Object.assign(options,{reactor:'local',smoothness:1});
   const fn=fx[name] as (...args:any[])=>Promise<import('../../../gpu-effects/pixel-types.ts').GpuPixelImage>;
   const tile=['lumaWipe','alphaWipe','displacementTransition','glassWipe','imageWipe','warpTransition'].includes(name)?await fn(a,b,name==='displacementTransition'?displacementMap:mask,options,context):await fn(a,b,options,context);
   const next=await g.run(stamp,[atlas,tile],{parameters:Uint32Array.of(i%8*w,Math.floor(i/8)*h)});await g.release(atlas);await g.release(tile);atlas=next;
  }
  await g.release(a);await g.release(b);await g.release(mask);await g.release(displacementMap);
  // Explicit test/inspection publication. No read or GPU wait occurs in the Stage.
  const view=await imageToBuffer(atlas,{version:1});await g.publishBuffer('controls.pixels',view,{version:1});
  return atlas;
 }};
});
export function makeScene(format:'rgba16float'|'rgba32float'){
 return <Composition width={640} height={180} fps={24} durationInFrames={16} background="transparent">
  <Resource id="sdr-image" src="./assets/source.png" kind="image"/>
  <Resource id="hdr-image" src="./assets/source.surface.json" kind="file"/>
  <Stage id="controls" factory={controls} props={{format}}/>
  <Layer source={ref('controls')} opacity={.92}/>
 </Composition>;
}
