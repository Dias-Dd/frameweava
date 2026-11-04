import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import {stroke3D,neonStroke,neonRing,neonSpiral,orbitRibbons,lightningBolt,electricArc,lightningStrike,plasmaOrb,electricScene} from 'spatial-creation-candidate';
const points=[[-1.3,-.5,0],[-.55,.55,.1],[.3,-.3,0],[1.3,.55,.2]] as const;
export const stroke=defineNativeStage(()=>stroke3D({points,shading:'standard',ink:[.08,.55,.7],thickness:.08}));
export const neon=defineNativeStage(()=>neonStroke({points,ink:[.3,3,1.7]}));
export const ring=defineNativeStage(()=>neonRing({ink:[.3,1.4,4]}));
export const spiral=defineNativeStage(()=>neonSpiral({ink:[3,.3,1.2]}));
export const orbits=defineNativeStage(()=>orbitRibbons({ink:[.3,3,2]}));
export const bolt=defineNativeStage(()=>lightningBolt());
export const arc=defineNativeStage(()=>electricArc());
export const strike=defineNativeStage(()=>lightningStrike());
export const plasma=defineNativeStage(()=>plasmaOrb({ink:[2.2,.35,4]}));
export const scene=defineNativeStage(()=>electricScene());
export default Composition({id:'neon-objects',width:1600,height:480,fps:24,durationInFrames:24,seed:37,background:'#080b16',children:[
 ...Object.entries({stroke,neon,ring,spiral,orbits,bolt,arc,strike,plasma,scene}).flatMap(([id,factory],i)=>[
  Stage({id,factory,width:320,height:240,outputs:{surface:'surface'}}),Layer({source:ref(id),x:i%5*320,y:Math.floor(i/5)*240}),
 ]),
]});
