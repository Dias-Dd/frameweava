/** @jsxImportSource @frameweave/engine */
import {Composition,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {SharedStage,sharedVariable,sharedFrame} from '@frameweave/engine/shared-state';

export const count=sharedVariable({id:'count',writer:'writer',kind:'number',initial:0});
export const document=sharedVariable({id:'document',writer:'writer',kind:'json',initial:{items:[0],$expr:'literal shared data'}});

// Ordinary JavaScript call counters are deliberately separate from managed cells.
export const writer=defineNativeStage(()=>{
  let calls=0;
  return {renderAt(context,inputs,props){
    calls++;const draft=sharedFrame(context,inputs,props),next=draft.get(count)+1;
    draft.set(count,next);draft.set(document,{items:[next],$expr:'literal shared data'});
    if(context.globalFrame===props.writerFailureFrame)throw Error('NATIVE_SHARED_WRITER_FAILURE');
    return draft.outputs({calls});
  }};
});
export const reader=defineNativeStage(async init=>{
  const kernel=await init.gpu.compile({abiVersion:1,id:'example/native-shared',version:'1.0.0',inputCount:0,parameterWords:1,
    code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u)*.1,-.25,2.,.75);}'});
  return {async renderAt(context,inputs,props){
    const draft=sharedFrame(context,inputs,props),seen=draft.get(count);
    if(context.globalFrame===props.readerFailureFrame)throw Error('NATIVE_SHARED_READER_FAILURE');
    if(props.illegalWrite===true)draft.set(count,99);
    const surface=await init.gpu.run(kernel,[],{parameters:Float32Array.of(seen),output:{width:init.width,height:init.height,
      format:props.format==='rgba16float'?'rgba16float':'rgba32float',alpha:'premultiplied',color:linear709}});
    return draft.outputs({surface,seen});
  }};
});
export function sharedProject(props:Record<string,unknown>={}){
  return <Composition id="native-shared" width={64} height={36} fps={30} durationInFrames={120} background="transparent">
    <SharedStage id="writer" factory={writer} writes={[count,document]} outputs={{calls:'number'}} props={props}/>
    <SharedStage id="reader" factory={reader} reads={[count,document]} outputs={{surface:'surface',seen:'number'}} props={props}/>
    <Layer source={ref('reader')}/>
  </Composition>;
}
export default sharedProject();
