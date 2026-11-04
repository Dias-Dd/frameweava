import {Composition,Stage,Layer,ref,linear709,surfaceFromPixels} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createNativePuppetRenderer} from '../../../puppet-effects/native.ts';
import {validateMeshData} from '../../../graphics-contracts/validate.ts';
import {puppetOverlapPin,evaluatePuppetPins,puppetOverlapField} from '../../puppet-controls.ts';
const mesh=validateMeshData({schema:'frameweave.mesh',version:1,id:'overlap',coordinates:{spaceId:'overlap',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:Array.from({length:8},(_,i)=>'v'+i),restPositions:[[-1,-.6,0],[-.2,-.6,0],[-.2,.6,0],[-1,.6,0],[.2,-.6,0],[1,-.6,0],[1,.6,0],[.2,.6,0]],uv:[[0,1],[.5,1],[.5,0],[0,0],[.5,1],[1,1],[1,0],[.5,0]],uvOrigin:'top-left',indices:[0,1,2,0,2,3,4,5,6,4,6,7]});
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,draw=await createNativePuppetRenderer(g,mesh,{width:init.width,height:init.height,bounds:{left:-1,right:1,bottom:-1,top:1}});
 const pose=Array.from({length:8},(_,i)=>[[-.6,-.6,0],[.6,-.6,0],[.6,.6,0],[-.6,.6,0]][i%4]) as [number,number,number][];
 return {async renderAt(c){
  const format=c.frame>=6?'rgba16float' as const:'rgba32float' as const,mode=c.frame%3;
  const pixels=Array.from({length:32},(_,i)=>i%8<4?[1,-.125,0,.5]:[0,0,.5,.5]).flat();
  const source=await g.upload(surfaceFromPixels(8,4,pixels,{format,alpha:'premultiplied',color:linear709}));
  try{
   const controls=evaluatePuppetPins([puppetOverlapPin({at:[0,.5],extent:.7,inFront:mode===1?1:-1,falloff:'linear'})],c),field=puppetOverlapField(mesh,controls);
   const result=await draw.render(pose,source,{format,sampling:'nearest',...(mode?{overlap:field}:{})});
   const raw=await g.imageToBuffer!(result,{version:1});try{await g.publishBuffer('rgba',raw,{version:1});}finally{await g.releaseBuffer(raw);}
   const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(c.frame,c.time,mode,format==='rgba16float'?16:32));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}
   return result;
  }finally{await g.release(source);}
 },dispose:()=>draw.dispose()};
});
export default Composition({id:'overlap-verify',width:64,height:48,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
