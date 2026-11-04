import {Composition,Stage,Layer,ref,linear709,surfaceFromPixels} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {createFoamSimulation,renderFoamBubbles,type FoamOptions} from '../../foam.ts';
import {shatterImage,shatterMesh} from '../../shatter.ts';
import {geometryData} from '../../geometry.ts';import {BoxGeometry} from 'three';
const W=96,H=64;
export const foamCases:FoamOptions[]=[
 {initialCount:1,rate:0,lifetime:2,frailty:0,area:[1,1],velocity:[.2,-.1],windResponse:0,viscosity:0,turbulence:0,repulsion:0},
 {initialCount:1,rate:0,lifetime:2,frailty:0,area:[1,1],velocity:[.2,-.1],wind:[.4,.2],windResponse:3,viscosity:2,turbulence:0,repulsion:0},
 {initialCount:1,rate:0,lifetime:2,frailty:0,area:[2,2],velocity:[0,0],windResponse:0,viscosity:0,turbulence:0,repulsion:0,flow:{gradient:{kind:'linear',center:[0,0,0],edge:[1,1,1]}},flowStrength:.4},
 {initialCount:2,rate:0,lifetime:2,frailty:0,area:[.05,.05],size:.2,sizeVariation:0,growth:1000000,windResponse:0,viscosity:0,turbulence:0,repulsion:1,stickiness:0,popVelocity:0},
 {initialCount:2,rate:0,lifetime:.7,frailty:.7,area:[.05,.05],size:.2,sizeVariation:0,growth:1000000,windResponse:0,viscosity:0,turbulence:0,repulsion:0,popVelocity:.8},
 {initialCount:0,rate:8,lifetime:.5,frailty:0,area:[1,1],windResponse:0,viscosity:0,turbulence:0,repulsion:0},
];
import {sourcePixels} from './cases.ts';

export const verify=defineNativeStage(async init=>{
 const g=init.gpu,sims:Awaited<ReturnType<typeof createFoamSimulation>>[]=[];for(const o of foamCases)sims.push(await createFoamSimulation(init,o));
 const staticOptions={image:'source',pattern:'triangles' as const,size:[3,2] as const,cell:.75,thickness:0,amount:0,camera:{projection:'orthographic' as const,position:[0,0,5] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:30,viewHeight:2}};
 const cut32=await shatterImage(init,{...staticOptions,format:'rgba32float'}),cut16=await shatterImage(init,{...staticOptions,format:'rgba16float'}),mesh=await shatterMesh(init,{image:'source',asset:geometryData('fracture-box',new BoxGeometry(1,1,1),true),thickness:.03,gravity:[0,0,0],amount:.25});
 return {async renderAt(c){for(let i=0;i<sims.length;i++){const f=await sims[i].record(c);await g.publishBuffer('foam'+i,f.buffer,{version:1});}
  for(const [name,stage,format]of [['cut32',cut32,'rgba32float'],['cut16',cut16,'rgba16float']] as const){const source=await g.upload(surfaceFromPixels(W,H,sourcePixels(),{format,alpha:'premultiplied',color:linear709}));try{const image=await stage.renderAt(c,{source},{});try{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,view,{version:1});}finally{await g.releaseBuffer(view);}}finally{await g.release(image);}}finally{await g.release(source);}}
  if(c.frame===12){const source=await g.upload(surfaceFromPixels(W,H,sourcePixels(),{format:'rgba32float',alpha:'premultiplied',color:linear709}));try{const image=await mesh.renderAt(c,{source},{});try{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer('mesh',view,{version:1});}finally{await g.releaseBuffer(view);}}finally{await g.release(image);}}finally{await g.release(source);}}
  let result:Awaited<ReturnType<typeof renderFoamBubbles>>|undefined;
  for(const format of ['rgba32float','rgba16float'] as const){const image=await renderFoamBubbles(init,sims[0],c,{color:[1.5,-.2,.7],opacity:.6,style:(['bubble','spit','bubblegum','dishwater','milky'] as const)[c.frame%5],format});const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer('bubbles-'+format,view,{version:1});}finally{await g.releaseBuffer(view);}if(format==='rgba32float')result=image;else await g.release(image);}
  if(c.frame===12){const source=await g.upload(surfaceFromPixels(W,H,sourcePixels(),{format:'rgba32float',alpha:'premultiplied',color:linear709}));try{const image=await renderFoamBubbles(init,sims[0],c,{}, {texture:source,environment:source});try{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer('textured-bubbles',view,{version:1});}finally{await g.releaseBuffer(view);}}finally{await g.release(image);}}finally{await g.release(source);}}
  return result!;
 },async dispose(){await Promise.all([...sims.map(s=>s.dispose()),cut32.dispose?.(),cut16.dispose?.(),mesh.dispose?.()]);}};
});
export default Composition({id:'foam-shatter-verify',width:W,height:H,fps:24,durationInFrames:24,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
