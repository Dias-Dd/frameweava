import type {RigidWorldOptions,RigidBody,Vec3} from 'rigid-body-effects';import {bowl,hull} from './geometry.ts';
export function world():RigidWorldOptions{
  const bodies:RigidBody[]=[{id:'environment',kind:'fixed',colliders:[{id:'bowl-shape',shape:{kind:'trimesh',mesh:bowl()},friction:.7,groups:{memberships:1,filter:2}}]}];
  for(let i=0;i<6;i++)bodies.push({id:'body-'+i,kind:'dynamic',position:[(i%3-1)*.95,1.15+Math.floor(i/3)*1.5,(i%2-.5)*1.2],linearVelocity:[(i%2?1:-1)*.3,0,.1],angularVelocity:[.2+i*.1,.4,.2],rotation:[0,Math.sin(i*.13),0,Math.cos(i*.13)],ccd:true,canSleep:false,colliders:[{id:'hull-'+i,position:[.02,0,0],shape:{kind:'convexHull',mesh:hull('source-'+i,.27+i*.015)},density:500,restitution:.32,friction:.6,groups:{memberships:2,filter:7}}]});
  bodies.push({id:'trigger',kind:'fixed',position:[0,.5,0],colliders:[{id:'trigger-shape',shape:{kind:'convexHull',mesh:hull('trigger-source',.8)},sensor:true,groups:{memberships:4,filter:2}}]});
  return {fps:24,seed:51,substeps:4,gravity:[0,-9.81,0],bodies:bodies,budgets:{checkpointInterval:12,maxCheckpoints:5,maxGeometryVertices:2000,maxGeometryTriangles:2000,maxQueryResults:100},solver:{iterations:8,contactRecycling:false}};
}
