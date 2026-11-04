import type {FrameContext} from '../../../src/core/types.ts';
import type {RigidWorldOptions,RigidJoint} from '../src/types.ts';
export const context=(frame:number):FrameContext=>({frame,time:frame/24,globalFrame:frame,globalTime:frame/24,dt:1/24,fps:{num:24,den:1},durationInFrames:240,progress:frame/239,seed:51});
export function falling(sensor=false):RigidWorldOptions {
  return {fps:24,seed:51,substeps:4,gravity:[0,-10,0],bodies:[
    {id:'floor',kind:'fixed',position:[0,-.1,0],colliders:[{id:'ground',shape:{kind:'cuboid',halfExtents:[5,.1,5]},friction:.6}]},
    {id:'ball',kind:'dynamic',position:[0,2,0],ccd:true,canSleep:false,colliders:[{id:'ball-shape',shape:{kind:'ball',radius:.2},restitution:.5,friction:.5}]},
    ...(sensor?[{id:'trigger',kind:'fixed' as const,position:[0,1,0] as [number,number,number],colliders:[{id:'zone',shape:{kind:'cuboid' as const,halfExtents:[1,.05,1] as [number,number,number]},sensor:true}]}]:[])
  ],budgets:{checkpointInterval:12,maxCheckpoints:5}};
}
export function jointFixture(kind:RigidJoint['kind']):RigidWorldOptions {
  const base={id:'joint',bodyA:'anchor',bodyB:'bob',anchorA:[0,0,0] as [number,number,number],anchorB:kind==='prismatic'?[0,0,0] as [number,number,number]:[-1,0,0] as [number,number,number]};
  const joint:RigidJoint=kind==='revolute'?{...base,kind,axis:[0,0,1],limits:[-.3,.3]}:kind==='prismatic'?{...base,kind,axis:[1,0,0],limits:[-.5,.5],motor:{velocity:1,maxForce:10}}:kind==='spring'?{...base,kind,anchorB:[0,0,0],restLength:1,stiffness:50,damping:2}:{...base,kind};
  return {fps:24,seed:51,substeps:4,gravity:kind==='spring'||kind==='prismatic'?[0,0,0]:[0,-10,0],bodies:[{id:'anchor',kind:'fixed',colliders:[]},{id:'bob',kind:'dynamic',position:kind==='prismatic'?[0,0,0]:kind==='spring'?[1.5,0,0]:[1,0,0],canSleep:false,colliders:[{id:'bob-shape',shape:{kind:'ball',radius:.2}}]}],joints:[joint],budgets:{checkpointInterval:12,maxCheckpoints:5}};
}
