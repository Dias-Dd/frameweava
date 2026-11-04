/** Only the diagnostic oracle needs this low-level setup. */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stroke3D,neonStroke,neonRing,neonSpiral,orbitRibbons,lightningBolt,electricArc,lightningStrike,plasmaOrb,electricScene} from 'spatial-creation-candidate';
import {createTrailGeometry,createLightningGeometry,createNativeMeshRenderer} from '../../../skeletal-effects/native.ts';
const points=[[-1.3,-.5,0],[-.55,.55,.1],[.3,-.3,0],[1.3,.55,.2]] as const;
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],manual:any[]=[],formats=['rgba32float','rgba16float'] as const,ink=[.2,3,2] as [number,number,number],camera={projection:'orthographic' as const,position:[0,0,6] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:30,viewHeight:Math.max(3.4,4/(init.width/init.height))};
 for(const format of formats){
  const common={format,finish:false as const,ink,opacity:.6};
  objects.push(await stroke3D({...common,points,radialSegments:4,thickness:.04}),await neonStroke({...common,points,radialSegments:4,thickness:.04}),
   await neonRing({...common,finish:{glow:{radius:2,intensity:.4,threshold:1}}}),await neonSpiral(common),await orbitRibbons(common),
   await lightningBolt(common),await electricArc(common),await lightningStrike(common),await plasmaOrb(common),await electricScene({format,finish:false}));
  const trail=createTrailGeometry({id:'reference.stroke',pointCount:4,radialSegments:4}),bolt=createLightningGeometry({id:'reference.bolt',seed:init.seed,subdivisions:4,branchGenerations:1,branchesPerBolt:2,radialSegments:3}),arc=createLightningGeometry({id:'reference.arc',seed:init.seed,subdivisions:4,branchGenerations:1,branchesPerBolt:2,radialSegments:3});
  for(const geometry of [trail,bolt,arc])manual.push({geometry,renderer:await createNativeMeshRenderer(g,geometry.meshes,{width:init.width,height:init.height,shading:'unlit'})});
 }
 const zero=await lightningBolt({thickness:0,finish:false}),bad=await neonRing({maxRayTests:1,finish:false});
 const publish=async(name:string,image:any)=>{const view=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,view,{version:1});}finally{await g.releaseBuffer(view);}};
 let refused=0;
 return {async renderAt(c){const mode=c.frame%20,kind=mode%10,format=formats[Math.floor(mode/10)],result=await objects[mode].renderAt(c,{},{});try{
  await publish('rgba',result);
  if([0,1,5,6].includes(kind)){const m=manual[Math.floor(mode/10)*3+(kind<2?0:kind===5?1:2)],sample=kind<2?m.geometry.sample({points:points.map(p=>[...p]),radius:.04,context:c}):m.geometry.sample({start:kind===5?[-1.4,.6,0]:[-1.2,0,0],end:kind===5?[1.4,-.6,0]:[1.2,0,0],radius:kind===5?.018:.014,amplitude:kind===5?.12:.23,phase:c.time*(kind===5?3:4.5),context:c}),image=await m.renderer.render({context:c,camera,objects:sample.draws.map((d:any)=>({...d,appearance:{color:ink,opacity:.6}})),format});try{await publish('manual',image);}finally{await g.release(image);}}
  if(c.frame===0){const clear=await zero.renderAt(c,{},{});try{await publish('zero',clear);}finally{await g.release(clear);}try{await bad.renderAt(c,{},{});throw Error('Expected original raster budget refusal');}catch(e){if(!(e as any).code?.includes('GPU_BUDGET'))throw e;refused++;}}
  const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,refused,g.stats().activeImages));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}
  return result;
 }catch(e){await g.release(result);throw e;}},async dispose(){for(const o of objects)await o.dispose?.();await zero.dispose?.();await bad.dispose?.();for(const m of manual){await m.renderer.dispose();m.geometry.dispose();}}};
});
export default Composition({id:'electric-verify',width:64,height:48,fps:24,durationInFrames:60,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
