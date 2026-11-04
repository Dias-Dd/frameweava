// Independent F64 analytic planes/sphere and Snell references; never a runtime fallback.
export const camera={projection:'perspective',position:[0,0,4],target:[0,0,0],near:.1,far:10,verticalFov:90} as const;
const ortho={projection:'orthographic',position:[0,0,4],target:[0,0,0],near:.1,far:10,viewHeight:4} as const;
const W=5,H=5,plane=Array.from({length:W*H},(_,i)=>[(2*(i%W+.5)/W-1)*2,(1-2*(Math.floor(i/W)+.5)/H)*2,2,1]);
const normal=plane.map(()=>[0,0,1,1]),depth=plane.map(()=>[2,0,0,1]),flat=(v:number[][])=>Array.from(Float32Array.from(v.flat()));
export function spatialFixtures(){const list:any[]=[];const input=(kind:string,data:number[][],cam:any=camera)=>({kind,data:flat(data),camera:cam});const add=(name:string,inputs:any[],options:any,expected:number[][]|number[][][],tolerance=8e-6)=>list.push({name,inputs,options,expected:Array.isArray(expected[0][0])?(expected as number[][][]).map(v=>v.flat()):(expected as number[][]).flat(),tolerance,width:W,height:H});
 const interior=(i:number)=>i%W>0&&i%W<W-1&&Math.floor(i/W)>0&&Math.floor(i/W)<H-1;
 const device=depth.map(()=>[10*(2-.1)/(2*(10-.1)),0,0,1]);
 add('deviceDepthToViewDepth',[input('device-depth',device)],{camera},depth,3e-5);
 add('deviceDepthToViewDepth',[input('axial-depth',depth)],{camera,inverse:true},device,2e-6);
 add('deviceDepthToViewDepth',[input('device-depth',depth.map(()=>[(2-.1)/(10-.1),0,0,1]),ortho)],{camera:ortho},depth,3e-6);
 const rays=plane.map(([x,y])=>[Math.hypot(x,y,2),0,0,1]);add('viewDepthToRayDistance',[input('axial-depth',depth)],{camera},rays);add('viewDepthToRayDistance',[input('ray-distance',rays)],{camera,inverse:true},depth);add('viewDepthToRayDistance',[input('axial-depth',depth,ortho)],{camera:ortho},depth);
 add('reconstructWorldPositions',[input('axial-depth',depth)],{camera},plane);add('reconstructWorldPositions',[input('axial-depth',depth,ortho)],{camera:ortho},plane);
 const projected=plane.map((_,i)=>[i%W,Math.floor(i/W),2,1]);add('projectWorldPositions',[input('world-position',plane)],{camera},projected);
 add('reconstructNormals',[input('axial-depth',depth)],{camera},normal.map((n,i)=>interior(i)?n:[0,0,0,0]));add('reconstructNormals',[input('axial-depth',depth,ortho)],{camera:ortho,space:'view'},normal.map((n,i)=>interior(i)?n:[0,0,0,0]));
 const previousCamera={...camera,position:[-.1,0,4],target:[-.1,0,0]};add('cameraMotionFromDepth',[input('axial-depth',depth)],{camera,reference:{camera:previousCamera,context:{frame:0,time:0,fps:{num:24,den:1}}}},depth.map(()=>[-.125,0,1,1]),5e-6);add('cameraMotionFromDepth',[input('axial-depth',depth)],{camera,reference:{camera,context:{frame:0,time:0,fps:{num:24,den:1}}}},depth.map(()=>[0,0,1,1]),0);
 const old=depth.map(v=>v.slice()),mapped=projected.map(v=>v.slice());old[12]=[1,0,0,1];old[13]=[0,0,0,0];mapped[0]=[-2,0,2,1];add('reprojectionVisibility',[input('projected-position',mapped),input('axial-depth',old)],{},plane.map((_,i)=>i===0?[0,0,0,1]:i===12?[0,1,1,1]:i===13?[0,0,1,1]:[1,0,1,1]));
 add('distanceToPointField',[input('world-position',plane)],{point:[.1,.2,0]},plane.map(([x,y,z])=>[Math.hypot(x-.1,y-.2,z),0,0,1]));add('distanceToPlaneField',[input('world-position',plane)],{normal:[0,2,0],offset:.25},plane.map(([x,y])=>[y-.25,0,0,1]));
 add('surfaceCurvatureField',[input('world-position',plane),input('world-normal',normal)],{},plane.map((_,i)=>interior(i)?[0,0,0,1]:[0,0,0,0]));
 const sphere=plane.map((_,i)=>{const x=(i%W-2)*.2,y=(2-Math.floor(i/W))*.2;return [x,y,Math.sqrt(4-x*x-y*y),1];}),sphereNormals=sphere.map(([x,y,z])=>[x/2,y/2,z/2,1]);add('surfaceCurvatureField',[input('world-position',sphere),input('world-normal',sphereNormals)],{},plane.map((_,i)=>interior(i)?[.5,0,0,1]:[0,0,0,0]),3e-5);
 add('surfaceGradientField',[input('scalar',plane.map(([x,y])=>[.3*x-.2*y,0,0,1])),input('world-position',plane)],{},plane.map((_,i)=>interior(i)?[.3,-.2,0,1]:[0,0,0,0]));
 add('reflectionDirectionField',[input('world-position',plane),input('world-normal',normal)],{camera},plane.map(([x,y])=>{const d=Math.hypot(x,y,2);return [x/d,y/d,2/d,1];}));add('reflectionDirectionField',[input('world-position',plane),input('world-normal',normal)],{camera:ortho},normal);
 const refract=plane.map(([x,y])=>{const d=Math.hypot(x,y,2),eta=1/1.5,cos=-2/d,k=1-eta*eta*(1-cos*cos);return [eta*x/d,eta*y/d,-Math.sqrt(k),1];});add('refractionDirectionField',[input('world-position',plane),input('world-normal',normal)],{camera},refract);add('refractionDirectionField',[input('world-position',plane.map(()=>[Math.sqrt(3),0,5,1])),input('world-normal',normal)],{camera},plane.map(()=>[0,0,0,0]));
 const bounds:number[][]=[];for(let y=0;y<3;y++)for(let x=0;x<3;x++){const count=Math.min(2,W-2*x)*Math.min(2,H-2*y);bounds.push([2,2,count,1]);}add('reduceDepthBounds',[input('axial-depth',depth)],{},bounds);
 add('surfaceTangentFrame',[input('world-position',plane),input('world-normal',normal)],{},[plane.map((_,i)=>interior(i)?[1,0,0,1]:[0,0,0,0]),plane.map((_,i)=>interior(i)?[0,1,0,1]:[0,0,0,0])]);
 return list;
}
