import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {clones3D,lineClones,gridClones,radialClones,sphereClones,scatterClones,helixClones,spiralClones,honeycombClones,waveClones,cloneScene} from 'spatial-creation-candidate';
const gold={material:'copper' as const,cloneRotation:[15,20,0] as const,cloneSpin:[0,15,0] as const};
export const line=defineNativeStage(()=>lineClones({...gold,count:8,step:[.4,0,0]}));
export const grid=defineNativeStage(()=>gridClones({...gold,shape:'box',grid:[5,3,1],size:.2}));
export const ring=defineNativeStage(()=>radialClones({...gold,orientation:'outward'}));
export const sphere=defineNativeStage(()=>sphereClones({material:'ceramic',orientation:'outward'}));
export const scatter=defineNativeStage(()=>scatterClones({...gold,sizeVariation:.4,rotationJitter:[90,90,90]}));
export const helix=defineNativeStage(()=>helixClones({...gold,radius:.65,turns:1.5,size:.18}));
export const spiral=defineNativeStage(()=>spiralClones({material:'ceramic',size:.16,turns:2}));
export const honeycomb=defineNativeStage(()=>honeycombClones({...gold,shape:'cylinder',geometry:{radius:.4,height:.6},size:.3,cloneRotation:[90,0,0],spacing:.32}));
export const wave=defineNativeStage(()=>waveClones({shape:'box',size:.22,ink:[1,1,1],palette:[[.04,.5,.66],[.9,.25,.06]],amplitude:.4}));
export const custom=defineNativeStage(()=>clones3D({...gold,layout:{kind:'radial',count:6,radius:1},shape:'torus',geometry:{radius:.5,tube:.15},size:.45,cloneRotation:[15,0,0]}));
export const scene=defineNativeStage(()=>cloneScene());
export default Composition({id:'clone-gallery',width:1920,height:480,fps:24,durationInFrames:24,seed:37,background:'#091423',children:[
 ...Object.entries({line,grid,ring,sphere,scatter,helix,spiral,honeycomb,wave,custom,scene}).flatMap(([id,factory],i)=>[Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%6*320,y:Math.floor(i/6)*240})]),
]});
