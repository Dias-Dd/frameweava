/** @jsxImportSource react */
import {useMemo} from 'react';
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage,linear709} from '@frameweave/engine/native';
import {defineNativeReactStage,NativePass,useNativeFrame} from '@frameweave/engine/native/react';
import {createNativeProfessionalEffects} from '../../modules/native-effects/extended.ts';

/** Ordinary JS and React record a resident Native GPU chain. No DOM pixels. */
export const nativeOnlyChain=defineNativeStage(async init=>{
 const effects=createNativeProfessionalEffects(init);
 const source=await init.gpu.compile({abiVersion:1,id:'native-only/source',version:'1.0.0',inputCount:0,parameterWords:1,
  code:'fn pixel(p:vec2u)->vec4f{return vec4f(-.25+paramF32(0u),2.,.5,.5);}'});
 function Scene(){
  const {context,props}=useNativeFrame();
  const offsets=useMemo(()=>Array.from({length:4},(_,i)=>i*.0025),[]);
  let offset=0;for(const value of offsets)offset+=value;
  if(context.frame===0)offset=0;else offset*=context.frame/1.5;
  const format=props.format==='rgba16float'?'rgba16float':'rgba32float';
  return <NativePass render={async gpu=>{
   const input=await gpu.run(source,[],{parameters:Float32Array.of(offset),output:{width:init.width,height:init.height,format,alpha:'premultiplied',color:linear709}});
   try{return await effects.processImage(input,async(image,fx)=>{
    image=await fx.exposure(image,{stops:1});
    image=await fx.channelMix(image,{matrix:[[1,.125,0],[0,1,0],[0,0,1]],offset:[-.25,0,0]});
    return fx.curves(image);
   },{context});}finally{await gpu.release(input);}
  }}/>;
 }
 const react=await defineNativeReactStage(Scene)(init);
 return {...react,async dispose(){try{await react.dispose?.();}finally{await effects.dispose();}}};
});
export default Composition({width:160,height:90,fps:{num:30000,den:1001},durationInFrames:12,background:'transparent',children:[Stage({id:'image',factory:nativeOnlyChain}),Layer({source:ref('image')})]});
