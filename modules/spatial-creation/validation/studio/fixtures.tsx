import {Composition,Stage,Layer,ref,keyframes} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';
import {box3D,lineClones,lightingDefaults,lightingRig,studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting,cameraView,materialPreset,linearColor} from 'spatial-creation-candidate';
import {BoxGeometry,Matrix4,Vector3,Quaternion,Euler} from 'three';import {geometryData} from '../../geometry.ts';import {createNativeMeshRenderer,createNativeInstancedMeshRenderer} from '../../../skeletal-effects/native.ts';
export const verify=defineNativeStage(async init=>{
 const g=init.gpu,objects:any[]=[],names=['studio','soft','dramatic','rim','sunset','moonlight','daylight','neon','warm','cool'] as const,helpers=[studioLighting,softLighting,dramaticLighting,rimLighting,sunsetLighting,moonlightLighting,daylightLighting,neonLighting,warmLighting,coolLighting],views=['front','back','left','right','top','bottom','isometric','hero','perspective','orbit'] as const,materials=['gold','silver','porcelain','plastic','rubber','emissive'] as const,lightValues=names.map(n=>lightingDefaults(n)),materialValues=materials.map(n=>materialPreset(n)),fill=linearColor('#4080ff'),ink=linearColor('#804020');
 const intensity=keyframes([{frame:0,value:.7},{frame:231,value:1.2}]),rotation=keyframes([{frame:0,value:-20},{frame:231,value:20}]);
 for(const format of ['rgba32float','rgba16float'] as const){const common={format,finish:false as const,rotation:[20,30,0] as const,spin:[0,12,0] as const};
  for(let kind=0;kind<29;kind++){
   if(kind<10)objects.push(await box3D({...common,camera:'front',lighting:helpers[kind]({intensity,rotation,fill:'#4080ff'})}));
   else if(kind<20)objects.push(await box3D({...common,camera:kind===19?cameraView('orbit',{azimuth:10,elevation:12,speed:15,viewHeight:3.3}):views[kind-10]}));
   else if(kind<26)objects.push(await box3D({...common,material:materials[kind-20],camera:'front'}));
   else if(kind===26)objects.push(await box3D(common));
   else if(kind===27)objects.push(await lineClones({...common,shape:'box',count:2,step:[1,0,0],size:.6,material:'gold',camera:cameraView('front'),lighting:lightingRig('sunset')}));
   else objects.push(await box3D({...common,...materialPreset('emissive',{ink:'#804020',roughness:.6,opacity:.4}),camera:'front'}));
  }
 }
 const mesh=geometryData('reference.box',new BoxGeometry(1.2,1.2,1.2),true),manual=await createNativeMeshRenderer(g,[mesh],{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double'}),instances=await createNativeInstancedMeshRenderer(g,[{mesh,capacity:2}],{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double'});
 const camera=(kind:number,c:any)=>{const common={target:[0,0,0] as [number,number,number],up:[0,1,0] as [number,number,number],near:.01,far:100},k=kind>=10&&kind<20?kind-10:kind===26?7:0,positions=[[0,0,6],[0,0,-6],[-6,0,0],[6,0,0],[0,6,0],[0,-6,0],[4,4,4],[3,2,6],[3,2,6]];
  if(k===9){const a=(10+c.time*15)*Math.PI/180,e=12*Math.PI/180;return {...common,projection:'orthographic' as const,viewHeight:3.3,position:[7*Math.cos(e)*Math.sin(a),7*Math.sin(e),7*Math.cos(e)*Math.cos(a)] as [number,number,number]};}
  return {...common,up:k===4?[0,0,-1] as [number,number,number]:k===5?[0,0,1] as [number,number,number]:common.up,position:positions[k] as [number,number,number],...(k===8?{projection:'perspective' as const,verticalFov:35}:{projection:'orthographic' as const,viewHeight:3.5})};
 };
 const publish=async(name:string,image:any)=>{const b=await g.imageToBuffer!(image,{version:1});try{await g.publishBuffer(name,b,{version:1});}finally{await g.releaseBuffer(b);}};
 // Original Native renderer is the independent pixel oracle. Pure preset data
 // is queried once; animated rig math/camera mapping/appearance are assembled
 // here without sampleLighting, cameraView or the new material sampler path.
 return {async renderAt(c){const mode=c.frame%58,kind=mode%29,format=mode<29?'rgba32float':'rgba16float',result=await objects[mode].renderAt(c,{},{});try{
  await publish('rgba',result);let lights=structuredClone(lightValues[kind<10?kind:kind===27?4:0]);if(kind<10){const gain=.7+(1.2-.7)*(c.frame/231),a=(-20+40*(c.frame/231))*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);lights.directional=lights.directional!.map((l,i)=>({direction:[l.direction[0]*cos+l.direction[2]*sin,l.direction[1],-l.direction[0]*sin+l.direction[2]*cos],color:i===1?fill:l.color,intensity:l.intensity!*gain}));}
  const profile=kind>=20&&kind<26?materialValues[kind-20]:kind===27?materialValues[0]:kind===28?{ink,emissive:[.15,1.5,2.5],roughness:.6,metalness:0,opacity:.4}:{ink:[.075,.52,.62],roughness:.27,metalness:.12},appearance={color:profile.ink as [number,number,number],emissive:('emissive'in profile?profile.emissive:[0,0,0]) as [number,number,number],roughness:profile.roughness as number,metalness:profile.metalness as number,opacity:('opacity'in profile?profile.opacity:1) as number},model=new Matrix4().compose(new Vector3(),new Quaternion().setFromEuler(new Euler(20*Math.PI/180,(30+c.time*12)*Math.PI/180,0,'XYZ')),new Vector3(1,1,1)).elements;
  const draw={id:mesh.id,model,appearance},cam=camera(kind,c),reference=kind===27?await instances.render({context:c,camera:cam,objects:[{...draw,instances:{count:2,positions:Float64Array.of(-.5,0,0,.5,0,0),rotations:Float64Array.of(0,0,0,1,0,0,0,1),scales:new Float64Array(6).fill(.6)}}],lighting:lights,format}):await manual.render({context:c,camera:cam,objects:[draw],lighting:lights,format});try{await publish('manual',reference);}finally{await g.release(reference);}
  const state=await g.createBuffer({type:'f32',length:3},Float32Array.of(mode,c.time,kind));try{await g.publishBuffer('state',state,{version:1});}finally{await g.releaseBuffer(state);}return result;
 }catch(e){await g.release(result);throw e;}},async dispose(){await Promise.all(objects.map(o=>o.dispose?.()));await manual.dispose();await instances.dispose();}};
});
export default Composition({id:'studio-verify',width:32,height:24,fps:24,durationInFrames:232,seed:37,background:'transparent',children:[Stage({id:'verify',factory:verify,outputs:{surface:'surface'}}),Layer({source:ref('verify')})]});
