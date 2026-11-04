/** @jsxImportSource react */
import {createContext,useContext,useLayoutEffect,createElement,useRef,type ComponentType,type ReactNode} from 'react';
import {nativeReconciler as renderer,nativeCommitRevision,yieldNativeTask} from '../spidermonkey-host/react-renderer.ts';
import {defineNativeStage,type NativeFrameContext,type NativeStageInit} from './authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {EngineError} from '../../src/core/errors.ts';

type Draw=(gpu:NativeStageInit['gpu'],previous:GpuPixelImage|undefined)=>Promise<GpuPixelImage>;
interface NativeReactFrame {context:NativeFrameContext;init:NativeStageInit;inputs:Record<string,GpuPixelImage>;props:Record<string,unknown>;queue:Map<object,Draw>;active:boolean}
const Frame=createContext<NativeReactFrame|null>(null);
export function useNativeFrame(){const frame=useContext(Frame);if(!frame)throw new EngineError('E_NATIVE_REACT_CONTEXT','Use native components inside defineNativeReactStage');return frame;}
/** Real React commits schedule native GPU work. No DOM image is captured. */
export function NativePass({render}:{render:Draw}):ReactNode {
 const frame=useNativeFrame(),key=useRef({}).current;useLayoutEffect(()=>{if(!frame.active)throw new EngineError('E_CLOCK','Native drawing must be committed by renderAt(context)');frame.queue.set(key,render);return ()=>{frame.queue.delete(key);};});return null;
}
export function defineNativeReactStage(Component:ComponentType){return defineNativeStage(init=>{
 const container={};let failure:unknown,failed=false;
 const fail=(error:unknown)=>{failure=error;failed=true;};
 const create=()=>(renderer as any).createContainer(container,1,null,false,null,'',fail,fail,fail,null);
 let root=create();
 const commit=async(element:ReactNode)=>{
  (renderer as any).flushSyncFromReconciler(()=>{(renderer as any).updateContainerSync(element,root,null,null);});
  let stable=0;for(let rounds=0;rounds<100;rounds++){
   const before=nativeCommitRevision();(renderer as any).flushPassiveEffects();(renderer as any).flushSyncWork();await yieldNativeTask();(renderer as any).flushSyncWork();
   stable=nativeCommitRevision()===before?stable+1:0;if(stable>=2)return;
  }throw new EngineError('E_NATIVE_REACT_EFFECT_LOOP','Passive updates exceeded commit budget');
 };
 return {
  async renderAt(context,inputs,props){
   const frame:NativeReactFrame={context,init,inputs,props,queue:new Map(),active:true};
   try{await commit(createElement(Frame.Provider,{value:frame},createElement(Component)));}finally{frame.active=false;}
   if(failed)throw failure;
   let output:GpuPixelImage|undefined;for(const draw of frame.queue.values())output=await draw(init.gpu,output);
   if(!output)throw new EngineError('E_NATIVE_OUTPUT','React frame did not publish native GPU work');return output;
  },
  async reset(){await commit(null);failure=undefined;failed=false;root=create();},
  async dispose(){await commit(null);if(failed)throw failure;},
 };
});}
