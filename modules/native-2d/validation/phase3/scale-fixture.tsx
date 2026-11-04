import {Composition,Stage,Layer,ref,expr} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {scene2D,group,rect,solid} from 'native-2d-candidate';
export const scale=defineNativeStage(async init=>{
 const children=Array.from({length:1024},(_,i)=>rect({id:'r'+i,x:(i%32)*24,y:Math.floor(i/32)*24,width:18,height:18,fill:solid([.01+(i%17)*.025,.12+(i%7)*.07,.4])}));
 const scene=await scene2D(init,group({id:'root',x:expr.mul(expr.frame,.01),children}),{maxBytes:1024**3});
 return {async renderAt(c){
  if(c.frame===2)scene.update('r0',{x:1});
  if(c.frame===3)scene.update('r0',{fill:solid([2,-.1,.3])});
  if(c.frame===4)scene.update('r0',{shape:{kind:'rect',width:20,height:18}});
  const output=await scene.renderAt(c,{},{}),value=JSON.stringify(scene.inspect()),data=await init.gpu.createBuffer({type:'u32',length:value.length},Uint32Array.from(value,c=>c.charCodeAt(0)));
  try{await init.gpu.publishBuffer('stats',data,{version:1});}finally{await init.gpu.releaseBuffer(data);}return output;
 },dispose:()=>scene.dispose?.()};
});
export default Composition({id:'native2d-scale',width:1920,height:1080,fps:24,durationInFrames:5,background:'transparent',children:[Stage({id:'scale',factory:scale,outputs:{surface:'surface'}}),Layer({source:ref('scale')})]});
