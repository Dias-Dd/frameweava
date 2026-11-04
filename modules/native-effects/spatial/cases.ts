// Acceptance-only typed invocations. Numeric expected values live in the
// existing independent F64 helpers and never enter a production effect.
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {NativeSpatialFrame} from './frame.ts';
import type {SpatialField,SpatialCamera} from '../../spatial-fields/types.ts';
const corners=Array.from({length:8},(_,i):[number,number,number]=>{const x=i&1?1:-1,y=i&2?1:-1,z=i&4?1:-1;return [x+.2*y*z,y+.1*x,z*.8];});
type MeshCall=(f:NativeSpatialFrame['mesh'],b:GpuDataBuffer[])=>Promise<GpuDataBuffer>;
export const meshCalls:readonly MeshCall[]=[
 (f,b)=>f.transformPositions(b[0],{scale:[1.2,.8,-.9],rotation:[.2,-.3,.4],translation:[.1,-.2,.3]}),
 (f,b)=>f.twistPositions(b[0],{rate:.7,offset:.2}),
 (f,b)=>f.bendPositions(b[0],{axis:'y',toward:'x',curvature:.6}),
 (f,b)=>f.taperPositions(b[0],{slope:.3}),
 (f,b)=>f.shearPositions(b[0],{axis:'y',toward:'x',amount:.4}),
 (f,b)=>f.stretchPositions(b[0],{factor:1.7}),
 (f,b)=>f.bulgePositions(b[0],{amplitude:.5,length:2}),
 (f,b)=>f.spherifyPositions(b[0],{radius:.8,amount:.7}),
 (f,b)=>f.cylindrifyPositions(b[0],{radius:.7,amount:.8}),
 (f,b)=>f.wavePositions(b[0],{frequency:2.5,phase:.3,amplitude:.2}),
 (f,b)=>f.ripplePositions(b[0],{axis:'z',frequency:4,phase:.2,amplitude:.3,decay:.5}),
 (f,b)=>f.noiseDisplacePositions(b[0],b[1],{frequency:2,offset:[.125,.25,.5],amplitude:.2,seed:91}),
 (f,b)=>f.morphPositions(b[0],b[1],{amount:.35}),
 (f,b)=>f.cageDeformPositions(b[0],{corners,outside:'preserve'}),
 (f,b)=>f.attractPositions(b[0],{target:[.5,.8,-.2],radius:2,strength:.7}),
 (f,b)=>f.bendPositions(b[0],{curvature:0}),
 (f,b)=>f.bendPositions(b[0],{curvature:1e-7}),
 (f,b)=>f.stretchPositions(b[0],{factor:2,preserveVolume:false}),
 (f,b)=>f.spherifyPositions(b[0],{amount:0}),
 (f,b)=>f.wavePositions(b[0],{center:[0,.5,0],phase:{$keyframes:[{frame:0,value:0},{frame:12,value:1}]}}),
 (f,b)=>f.cageDeformPositions(b[0],{corners:Array.from({length:8},(_,i):[number,number,number]=>[i&1?1:-1,i&2?1:-1,i&4?1:-1]),outside:'extend'}),
];
type ComputeCall=(f:NativeSpatialFrame['compute'],b:GpuDataBuffer[])=>Promise<readonly GpuDataBuffer[]>;
export const computeCalls:readonly ComputeCall[]=[
 async f=>[await f.cellularVolume({dimensions:[3,2,2],spacing:[.5,.5,.5],origin:[-.75,-.5,-.5],frequency:.75,sharpness:3,strength:2,seed:17})],
 async f=>[await f.vortexField({dimensions:[3,2,2],spacing:[.5,.5,.5],origin:[-.75,-.5,-.5],radius:1,strength:2,lift:.25})],
 async f=>[await f.curlNoiseField({dimensions:[3,2,2],spacing:[.5,.5,.5],origin:[-.75,-.5,-.5],frequency:1,epsilon:.125,amplitude:.25,seed:17})],
 async(f,b)=>[await f.advectField(b[0],b[1],{dt:.5})],
 async(f,b)=>[await f.diffuseField(b[0],{dt:.5,coefficient:.2,iterations:8})],
 async(f,b)=>[await f.projectVelocity(b[0],{iterations:64})],
 async(f,b)=>[await f.vorticityConfinement(b[0],{dt:.125,strength:.25})],
 async(f,b)=>[await f.reactionDiffusion(b[0],{dt:.125,diffusionU:.16,diffusionV:.08,feed:.035,kill:.062})],
 async(f,b)=>[await f.waveStep(b[0],b[1],{dt:.125,speed:.75,damping:.25})],
 async(f,b)=>[await f.thermalErosion(b[0],{dt:.125,rate:.8,talusSlope:.5})],
 async(f,b)=>[await f.approximateDistance(b[0],{threshold:.5,refine:2})],
 async(f,b)=>[await f.advectParticles(b[0],b[1],{dt:.5})],
 async(f,b)=>{const v=await f.flockParticles({positions:b[0],velocities:b[1]},{dt:.25,radius:2,separation:0,alignment:0,cohesion:1,maxSpeed:10,maxAcceleration:10});return [v.positions,v.velocities];},
 async(f,b)=>[await f.splatParticles(b[0],{dimensions:[5,5,5],origin:[-2,-2,-2],spacing:[1,1,1],area:.5})],
];
export const camera:SpatialCamera={projection:'perspective',position:[0,0,4],target:[0,0,0],near:.1,far:10,verticalFov:90};
const ortho:SpatialCamera={projection:'orthographic',position:[0,0,4],target:[0,0,0],near:.1,far:10,viewHeight:4};
type FieldCall=(f:NativeSpatialFrame['fields'],b:SpatialField[])=>Promise<readonly SpatialField[]>;
export const fieldCalls:readonly FieldCall[]=[
 async(f,b)=>[await f.deviceDepthToViewDepth(b[0],{camera})],
 async(f,b)=>[await f.deviceDepthToViewDepth(b[0],{camera,inverse:true})],
 async(f,b)=>[await f.deviceDepthToViewDepth(b[0],{camera:ortho})],
 async(f,b)=>[await f.viewDepthToRayDistance(b[0],{camera})],
 async(f,b)=>[await f.viewDepthToRayDistance(b[0],{camera,inverse:true})],
 async(f,b)=>[await f.viewDepthToRayDistance(b[0],{camera:ortho})],
 async(f,b)=>[await f.reconstructWorldPositions(b[0],{camera})],
 async(f,b)=>[await f.reconstructWorldPositions(b[0],{camera:ortho})],
 async(f,b)=>[await f.projectWorldPositions(b[0],{camera})],
 async(f,b)=>[await f.reconstructNormals(b[0],{camera})],
 async(f,b)=>[await f.reconstructNormals(b[0],{camera:ortho,space:'view'})],
 async(f,b)=>[await f.cameraMotionFromDepth(b[0],{camera,reference:{camera:{...camera,position:[-.1,0,4],target:[-.1,0,0]},context:{frame:0,time:0,fps:{num:24,den:1}}}})],
 async(f,b)=>[await f.cameraMotionFromDepth(b[0],{camera,reference:{camera,context:{frame:0,time:0,fps:{num:24,den:1}}}})],
 async(f,b)=>[await f.reprojectionVisibility(b[0],b[1])],
 async(f,b)=>[await f.distanceToPointField(b[0],{point:[.1,.2,0]})],
 async(f,b)=>[await f.distanceToPlaneField(b[0],{normal:[0,2,0],offset:.25})],
 async(f,b)=>[await f.surfaceCurvatureField(b[0],b[1])],
 async(f,b)=>[await f.surfaceCurvatureField(b[0],b[1])],
 async(f,b)=>[await f.surfaceGradientField(b[0],b[1])],
 async(f,b)=>[await f.reflectionDirectionField(b[0],b[1],{camera})],
 async(f,b)=>[await f.reflectionDirectionField(b[0],b[1],{camera:ortho})],
 async(f,b)=>[await f.refractionDirectionField(b[0],b[1],{camera})],
 async(f,b)=>[await f.refractionDirectionField(b[0],b[1],{camera})],
 async(f,b)=>[await f.reduceDepthBounds(b[0])],
 async(f,b)=>{const v=await f.surfaceTangentFrame(b[0],b[1]);return [v.tangent,v.bitangent];},
];
