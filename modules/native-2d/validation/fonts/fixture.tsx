import {Composition,Stage,Layer,ref,expr} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {scene2D,group,rect,text,solid} from 'native-2d-candidate';
export const verify=defineNativeStage(async init=>{
 const scene=await scene2D(init,group({id:'root',children:[
  rect({id:'panel',x:4,y:4,width:246,height:116,radius:12,fill:solid([.04,.08,.15],.7),stroke:{paint:solid([.1,.9,1.5]),width:2}}),
  text({id:'title',text:'Native 中文',x:14,y:12,fontSize:28,fill:solid([2,-.05,.3])}),
  text({id:'detail',text:'Aa ffi a\u0301',x:14,y:62,fontSize:24,letterSpacing:1,fill:solid([.3,1.2,.6]),stroke:{paint:solid([1,.6,.1]),width:.7}}),
 ]}),{format:'rgba32float'});
 scene.update('title',{x:expr.add(14,expr.mul(expr.frame,.05))});
 return {async renderAt(c){if(c.frame===101)throw Error('CONTROLLED_FONT_FAILURE');const output=await scene.renderAt(c,{},{}),buffer=await init.gpu.imageToBuffer!(output,{version:1});try{await init.gpu.publishBuffer('rgba',buffer,{version:1});}finally{await init.gpu.releaseBuffer(buffer);}const info=JSON.stringify({...scene.inspect(),globalAbortController:typeof (globalThis as any).AbortController,globalAbortSignal:typeof (globalThis as any).AbortSignal}),stats=await init.gpu.createBuffer({type:'u32',length:info.length},Uint32Array.from(info,c=>c.charCodeAt(0)));try{await init.gpu.publishBuffer('stats',stats,{version:1});}finally{await init.gpu.releaseBuffer(stats);}return output;},dispose:()=>scene.dispose?.()};
});
export default Composition({id:'native2d-fonts',width:256,height:128,fps:24,durationInFrames:102,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
