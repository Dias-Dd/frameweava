import {seededRandom} from '@frameweave/engine';
import type {RigidWorldOptions} from 'rigid-body-effects';
export function makePhysicsSpec(seed:number):RigidWorldOptions {
  return {fps:24,seed,substeps:4,bodies:[
    {id:'floor',kind:'fixed',position:[0,-2.1,0],colliders:[{id:'ground',shape:{kind:'cuboid',halfExtents:[5,.1,5]}}]},
    ...Array.from({length:8},(_,i)=>({id:'ball'+i,kind:'dynamic' as const,position:[-3+i*.6,1.6+seededRandom(seed,i)*.6,0] as [number,number,number],lockTranslation:[false,false,true] as [boolean,boolean,boolean],lockRotation:[true,true,false] as [boolean,boolean,boolean],ccd:true,colliders:[{id:'shape'+i,shape:{kind:'ball' as const,radius:.18},restitution:.5,friction:.65}]})),
    {id:'anchor',kind:'fixed',position:[2.3,1.5,0],colliders:[]},
    {id:'bob',kind:'dynamic',position:[3.3,1.5,0],colliders:[{id:'bob-shape',shape:{kind:'ball',radius:.22}}],canSleep:false}
  ],joints:[{id:'hinge',kind:'revolute',bodyA:'anchor',bodyB:'bob',anchorB:[-1,0,0],axis:[0,0,1]}],budgets:{checkpointInterval:24,maxCheckpoints:6}};
}
