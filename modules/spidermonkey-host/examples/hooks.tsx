/** @jsxImportSource react */
import {useEffect,useMemo,useRef,useState} from 'react';
import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeReactStage,NativePass,useNativeFrame} from '@frameweave/engine/native/react';
import {linear709} from '@frameweave/engine/native';
function Counter(){
 const {context,props,init}=useNativeFrame(),[count,setCount]=useState(0),identity=useRef(Math.random()),memo=useMemo(()=>[17],[]);
 useEffect(()=>{setCount(v=>v+1);},[context.frame]);
 if(props.fail)throw Object.assign(new Error('deterministic hook error'),{code:'E_HOOK_FIXTURE'});
 return <NativePass render={async gpu=>{
  const k=await gpu.compile({abiVersion:1,id:'sm/hooks-counter',version:'1.0.0',inputCount:0,parameterWords:4,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u)/16.,-.1,2.,.5);}'});
  return gpu.run(k,[],{parameters:Float32Array.of(count,context.time,identity.current,memo[0]),output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});
 }}/>;
}
export const hooks=defineNativeReactStage(Counter);
export default Composition({width:160,height:90,fps:24,durationInFrames:120,seed:91,background:'transparent',children:[Stage({id:'hooks',factory:hooks,outputs:{surface:'surface'}}),Layer({source:ref('hooks')})]});
