import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {box3D,sphere3D,torus3D,cylinder3D,cone3D,capsule3D,knot3D,icosahedron3D,mesh3D,sculptureScene} from 'spatial-creation-candidate';
const copper={material:'copper' as const,rotation:[20,30,12] as const,spin:[0,15,0] as const};
export const box=defineNativeStage(()=>box3D(copper));
export const sphere=defineNativeStage(()=>sphere3D({material:'ceramic',detail:2}));
export const torus=defineNativeStage(()=>torus3D(copper));
export const cylinder=defineNativeStage(()=>cylinder3D({material:'chrome',rotation:[15,0,-20]}));
export const cone=defineNativeStage(()=>cone3D({material:'copper'}));
export const capsule=defineNativeStage(()=>capsule3D({material:'ceramic',rotation:[0,0,-20]}));
export const knot=defineNativeStage(()=>knot3D({material:'copper',rotation:[20,0,0],spin:[0,15,0]}));
export const crystal=defineNativeStage(()=>icosahedron3D({material:'chrome',spin:[0,20,0]}));
// An ordinary, editable Graphics-v1 asset; advanced users retain the original contract.
const asset={schema:'frameweave.mesh' as const,version:1 as const,id:'author.tetra',coordinates:{spaceId:'author.world',unit:'meter' as const,origin:'local' as const,x:'right' as const,y:'up' as const,z:'toward-viewer' as const,handedness:'right' as const},topology:'triangles' as const,vertexIds:['a','b','c','d'],restPositions:[[0,.9,0],[-.8,-.6,.6],[.8,-.6,.6],[0,-.6,-.8]] as [number,number,number][],indices:[0,1,2,0,2,3,0,3,1,1,3,2]};
export const custom=defineNativeStage(()=>mesh3D({asset,material:'ceramic',normals:'flat',spin:[0,25,0]}));
export const scene=defineNativeStage(()=>sculptureScene());
export default Composition({id:'primitive-gallery',width:1600,height:480,fps:24,durationInFrames:24,seed:37,background:'#091423',children:[...Object.entries({box,sphere,torus,cylinder,cone,capsule,knot,crystal,custom,scene}).flatMap(([id,factory],i)=>[Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*320,y:Math.floor(i/5)*240})])]});
