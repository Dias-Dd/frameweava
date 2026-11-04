import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {PerspectiveCamera,Matrix4,WebGPUCoordinateSystem} from 'three';
import {geometry} from '../../../mesh-deformation/examples/geometry.ts';
import {wavePositions,twistPositions,attractPositions,starfield} from '../../native-library.ts';
import {linear709} from '../../../../src/media/surface.ts';
import {withGpuResources} from '../../../gpu-effects/resource-arena.ts';
import {createGpuPixelEffects} from '../../../gpu-effects/pixel-effects.ts';
export const sculpture=defineNativeStage(async init=>{
 const g=init.gpu,mesh=geometry(),positions=await g.createField({type:'f32',dimensions:[mesh.restPositions.length,1,1],components:3,semantic:'position',space:'deformation.local',units:'meter'},Float32Array.from(mesh.restPositions.flat())),indices=await g.createBuffer({type:'u32',length:mesh.meshes[0].indices.length},Uint32Array.from(mesh.meshes[0].indices));
 const camera=new PerspectiveCamera(42,init.width/init.height,.01,20);camera.coordinateSystem=WebGPUCoordinateSystem;camera.position.set(2.5,1.4,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();camera.updateProjectionMatrix();const matrix=new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).toArray();
 return {async renderAt(c){return withGpuResources(g,async a=>{
  const wave=a.buffer(await wavePositions(g,positions,c,{amplitude:.15,frequency:5,phase:c.time*5})),twist=a.buffer(await twistPositions(g,wave,c,{rate:.7+Math.sin(c.time*4)*.35})),result=a.buffer(await attractPositions(g,twist,c,{target:[.5,.5,0],radius:1.5,strength:.2+.1*Math.sin(c.time*6)}));
  await g.publishBuffer('sculpture-positions',result,{version:1});
  const foreground=a.image(await g.drawMesh({positions:result,indices,matrix,color:[.1,1.5,2.5,.9],output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}})),sky=a.image(await starfield(g,c,{width:init.width,height:init.height,starRadius:.035,starDensity:.1,steps:48,color:[.08,.16,.3]}));
  return a.keep(a.image(await createGpuPixelEffects(g).over(foreground,sky)));
 });},async dispose(){await g.releaseBuffer(indices);await g.releaseBuffer(positions);}};
});
export default Composition({id:'native-procedural-sculpture',width:640,height:360,fps:24,durationInFrames:24,background:'#02040a',children:[Stage({id:'sculpture',factory:sculpture,outputs:{surface:'surface'}}),Layer({source:ref('sculpture')})]});
