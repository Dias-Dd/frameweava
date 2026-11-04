/** Diagnostic oracle uses original Three/Native APIs independently of the creator adapter. */
import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {box3D,sphere3D,torus3D,cylinder3D,cone3D,capsule3D,knot3D,icosahedron3D,mesh3D,sculptureScene} from 'spatial-creation-candidate';
import {BoxGeometry,SphereGeometry,TorusGeometry,CylinderGeometry,ConeGeometry,CapsuleGeometry,TorusKnotGeometry,IcosahedronGeometry,Matrix4,Vector3,Quaternion,Euler} from 'three';
import {geometryData} from '../../geometry.ts';
import {createNativeMeshRenderer} from '../../../skeletal-effects/native.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],manual:any[]=[],formats=['rgba32float','rgba16float'] as const;
 const camera={projection:'orthographic' as const,position:[0,0,6] as [number,number,number],target:[0,0,0] as [number,number,number],near:.01,far:100,viewHeight:3.5},lighting={ambient:[.16,.18,.23] as [number,number,number],directional:[{direction:[-2,3,4] as [number,number,number],color:[1,.8,.6] as [number,number,number],intensity:3.8},{direction:[3,1,2] as [number,number,number],color:[.25,.65,1] as [number,number,number],intensity:2.2},{direction:[0,2,-2] as [number,number,number],color:[.6,.9,1] as [number,number,number],intensity:3}]};
 const appearance={color:[.12,.4,.7] as [number,number,number],emissive:[2,.2,.1] as [number,number,number],roughness:.27,metalness:.12,opacity:.65};
 const asset=()=>geometryData('manual.custom',new BoxGeometry(1.2,1.2,1.2),true);
 for(const format of formats){
  const common={format,finish:false as const,camera,ink:appearance.color,emissive:appearance.emissive,opacity:.65,position:[.1,0,0] as const,rotation:[15,keyframes([{frame:0,value:0},{frame:24,value:90}]),-10] as const,spin:[0,20,0] as const,scale:.9};
  objects.push(await box3D(common),await sphere3D(common),await torus3D(common),await cylinder3D(common),await cone3D(common),await capsule3D(common),await knot3D(common),await icosahedron3D(common),await mesh3D({...common,asset:asset()}),await sculptureScene({format,finish:false,background:false,camera,spin:[0,5,0],objects:[{shape:'box',geometry:{size:[1.2,1.2,1.2]},ink:[.12,.4,.7],emissive:[2,.2,.1],opacity:.65,position:[-.3,0,.15]},{shape:'sphere',geometry:{radius:.7},ink:[.7,.15,.08],emissive:[.1,.2,2],opacity:.65,position:[.35,.15,0]}]}));
  const geometries=[new BoxGeometry(1.2,1.2,1.2),new SphereGeometry(.7,12,8),new TorusGeometry(.8,.22,8,20),new CylinderGeometry(.8,.8,1.4,12),new ConeGeometry(.8,1.4,12),new CapsuleGeometry(.35,1.4,4,12),new TorusKnotGeometry(.8,.17,32,6),new IcosahedronGeometry(.8,0),new BoxGeometry(1.2,1.2,1.2)];
  const meshes=geometries.map((geometry,i)=>geometryData('manual.'+i,geometry,true));manual.push({meshes,renderer:await createNativeMeshRenderer(g,meshes,{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double'})});
  const shared=[geometryData('shared.box',new BoxGeometry(1.2,1.2,1.2),true),geometryData('shared.sphere',new SphereGeometry(.7,12,8),true)];manual.push({meshes:shared,renderer:await createNativeMeshRenderer(g,shared,{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double'})});
 }
 objects.push(await box3D({scale:0,finish:false}),await torus3D({camera:{projection:'perspective',verticalFov:35,orbit:{radius:7,azimuth:10,elevation:15,speed:20}},emissive:[2,.2,.1],opacity:.65,finish:false}));
 const bad=await sphere3D({maxRayTests:1}),publish=async(name:string,image:any)=>{const b=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}};let refused=0;
 return {async renderAt(c){const mode=c.frame%22,kind=mode%10,format=formats[Math.floor(mode/10)]??'rgba32float',result=await objects[mode].renderAt(c,{},{});try{
  await publish('rgba',result);
  if(mode<20){const m=manual[Math.floor(mode/10)*2+(kind===9?1:0)];let draws:any[];
   if(kind<9){const radians=Math.PI/180,model=new Matrix4().compose(new Vector3(.1,0,0),new Quaternion().setFromEuler(new Euler(15*radians,(Math.min(c.frame,24)*90/24+c.time*20)*radians,-10*radians,'XYZ')),new Vector3(.9,.9,.9)).elements;draws=m.meshes.map((mesh:any,i:number)=>({id:mesh.id,model,visible:i===kind,appearance}));}
   else{const root=new Matrix4().makeRotationY(c.time*5*Math.PI/180);draws=m.meshes.map((mesh:any,i:number)=>({id:mesh.id,model:root.clone().multiply(new Matrix4().makeTranslation(...(i===0?[-.3,0,.15]:[.35,.15,0]) as [number,number,number])).elements,appearance:i===0?appearance:{...appearance,color:[.7,.15,.08],emissive:[.1,.2,2]}}));}
   const image=await m.renderer.render({context:c,camera,objects:draws,lighting,format});try{await publish('manual',image);}finally{await g.release(image);}
  }
  if(c.frame===0){try{const impossible=await bad.renderAt(c,{},{});await g.release(impossible);throw Error('Expected ray budget refusal');}catch(e){if((e as any).code!=='E_MESH_GPU_BUDGET')throw e;refused++;}}
  const state=await g.createBuffer({type:'f32',length:4},Float32Array.of(mode,c.time,refused,g.stats().activeImages));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}return result;
 }catch(e){await g.release(result);throw e;}},async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));await bad.dispose?.();await Promise.all(manual.map(m=>m.renderer.dispose()));}};
});
export default Composition({id:'sculpture-verify',width:64,height:48,fps:24,durationInFrames:88,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
