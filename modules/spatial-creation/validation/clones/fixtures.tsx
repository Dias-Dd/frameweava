/** Original low-level Native instance renderer is the independent image oracle. */
import {Composition,Stage,Layer,ref,seededRandom} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {clones3D,lineClones,gridClones,radialClones,sphereClones,scatterClones,helixClones,spiralClones,honeycombClones,waveClones,cloneScene} from 'spatial-creation-candidate';
import {BoxGeometry,IcosahedronGeometry,Matrix4,Quaternion,Euler} from 'three';
import {geometryData} from '../../geometry.ts';
import {createNativeInstancedMeshRenderer} from '../../../skeletal-effects/native.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],manual:any[]=[],formats=['rgba32float','rgba16float'] as const,camera={projection:'orthographic' as const,position:[0,0,6] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:100,viewHeight:3.5};
 const lighting={ambient:[.16,.18,.23] as [number,number,number],directional:[{direction:[-2,3,4] as [number,number,number],color:[1,.8,.6] as [number,number,number],intensity:3.8},{direction:[3,1,2] as [number,number,number],color:[.25,.65,1] as [number,number,number],intensity:2.2},{direction:[0,2,-2] as [number,number,number],color:[.6,.9,1] as [number,number,number],intensity:3}]},palette=[[.2,.6,.8],[.8,.2,.1]] as const,appearance={color:[1,1,1] as [number,number,number],emissive:[2,.2,.1] as [number,number,number],roughness:.27,metalness:.12,opacity:.65};
 const asset=()=>geometryData('author.box',new BoxGeometry(1.2,1.2,1.2),true);
 for(const format of formats){const common={format,finish:false as const,camera,ink:appearance.color,emissive:appearance.emissive,roughness:.27,metalness:.12,opacity:.65,palette,size:.3,cloneRotation:[0,0,10] as const,cloneSpin:[0,20,0] as const};
  objects.push(await lineClones({...common,count:3,step:[.75,0,0],scale:[-1,1,1]}),await gridClones({...common,grid:[3,2,1],spacing:[.75,.65,1]}),await radialClones({...common,count:6,radius:1}),await sphereClones({...common,count:12,radius:1}),await scatterClones({...common,count:5,bounds:[2.4,1.8,.2]}),await helixClones({...common,count:12,radius:.6,height:1.8}),await spiralClones({...common,count:14,radius:1.1}),await honeycombClones({...common,grid:[3,3],spacing:.6,camera:{projection:'perspective',position:[0,0,6],verticalFov:35}}),await waveClones({...common,grid:[3,3,1],spacing:[.6,.6,.6],amplitude:.2}),await clones3D({...common,asset:asset(),layout:{kind:'grid',grid:[2,2,1],spacing:[.7,.7,1]}}),await cloneScene({...common,background:false,layout:{kind:'wave',grid:[3,2,1]}}));
  for(const [id,mesh]of [['manual.ico',geometryData('manual.ico',new IcosahedronGeometry(.8,0),true)],['manual.box',asset()]] as const){mesh.id=id;manual.push({id,renderer:await createNativeInstancedMeshRenderer(g,[{mesh,capacity:12}],{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double'})});}
 }
 objects.push(await lineClones({count:0,finish:false}),await radialClones({size:0,finish:false}));
 let refused=0;const before=g.stats().activeDataBuffers;try{await lineClones({maxRayTests:1});throw Error('Expected full ray plan refusal');}catch(e){if((e as any).code!=='E_CREATION_BUDGET')throw e;refused++;}if(g.stats().activeDataBuffers!==before)throw Error('Budget refusal allocated a template');
 const publish=async(name:string,image:any)=>{const b=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}};
 return {async renderAt(c){const mode=c.frame%24,kind=mode%11,format=formats[Math.floor(mode/11)]??'rgba32float',result=await objects[mode].renderAt(c,{},{});try{
  await publish('rgba',result);
  if(mode<22&&[0,1,2,4,9].includes(kind)){const m=manual[Math.floor(mode/11)*2+(kind===9?1:0)],count=kind===0?3:kind===1||kind===2?6:kind===4?5:4,positions=new Float64Array(count*3),rotations=new Float64Array(count*4),scales=new Float64Array(count*3).fill(.3),colors=new Float32Array(count*3),q=new Quaternion().setFromEuler(new Euler(0,c.time*20*Math.PI/180,10*Math.PI/180,'XYZ')).normalize();
   for(let i=0;i<count;i++){let p:number[];if(kind===0)p=[(i-1)*.75,0,0];else if(kind===1)p=[(i%3-1)*.75,(Math.floor(i/3)-.5)*.65,0];else if(kind===2)p=[Math.cos(2*Math.PI*i/6),Math.sin(2*Math.PI*i/6),0];else if(kind===4)p=[2.4,1.8,.2].map((v,k)=>(seededRandom(init.seed,i,'creation-clones/1/scatter'+k)-.5)*v);else p=[(i%2-.5)*.7,(Math.floor(i/2)-.5)*.7,0];positions.set(p,i*3);rotations.set(q.toArray(),i*4);colors.set(palette[i%2],i*3);}
   const image=await m.renderer.render({context:c,camera,objects:[{id:m.id,model:new Matrix4().makeScale(kind===0?-1:1,1,1).elements,instances:{count,positions,rotations,scales,colors},appearance}],lighting,format});try{await publish('manual',image);}finally{await g.release(image);}
  }
  const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,g.stats().activeDataBuffers,refused));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}return result;
 }catch(e){await g.release(result);throw e;}},async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));await Promise.all(manual.map(m=>m.renderer.dispose()));}};
});
export default Composition({id:'clones-verify',width:64,height:48,fps:24,durationInFrames:96,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
