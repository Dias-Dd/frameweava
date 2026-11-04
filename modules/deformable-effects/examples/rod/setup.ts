import {rodOptions,type QuaternionSignal} from 'deformable-effects';
export const stations=25,frames=73;
export function setup(){
 const points=Array.from({length:stations},(_,i)=>[-2+4*i/(stations-1),1.15,0] as [number,number,number]),s=Math.SQRT1_2;
 // Ordinary keyframe data evaluated at existing local substep time. XYZ/W world rotation.
 const pin=Array.from({length:4},(_,component)=>({$keyframes:Array.from({length:frames},(_,frame)=>{const half=.75*Math.PI*frame/(frames-1);return {frame,value:(component===0||component===2?Math.sin(half):Math.cos(half))*s};})})) as QuaternionSignal;
 return rodOptions(points,{fps:24,seed:91,substeps:4,iterations:128,linearDensity:.3,fixedParticles:[0],pins:[{particle:stations-1,target:[{$keyframes:[{frame:0,value:2},{frame:36,value:1.3},{frame:72,value:1}]},{$keyframes:[{frame:0,value:1.15},{frame:36,value:1.4},{frame:72,value:.6}]},{$keyframes:[{frame:0,value:0},{frame:36,value:.5},{frame:72,value:.9}]}]}],fixedSegments:[0],orientationPins:[{segment:stations-2,target:pin}],stretchShearStiffness:[1,1,1],bendTwistStiffness:[.8,.35,.8],gravity:[0,-1.5,0],dampingRate:.3,angularDampingRate:.3,collision:{radii:.025,colliders:[{id:'floor',kind:'plane',normal:[0,1,0],offset:-.7,friction:.25}]},budgets:{checkpointInterval:16,maxCheckpoints:4}});
}
