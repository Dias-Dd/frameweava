import type {MeshData,Matrix4,SpatialSample,SpatialCamera} from '../src/types.ts';
export const identity:Matrix4=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export function translation(x=0,y=0,z=0):Matrix4 {return [...identity.slice(0,12),x,y,z,1] as Matrix4;}
export function mesh(id='panel',positions:MeshData['restPositions']=[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],indices=[0,1,2,0,2,3]):MeshData {return {schema:'frameweave.mesh',version:1,id,coordinates:{spaceId:'local.'+id,unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'},topology:'triangles',vertexIds:positions.map((_,i)=>'v'+i),restPositions:positions,indices};}
export const orthographic:SpatialCamera={projection:'orthographic',position:[0,0,5],target:[0,0,0],near:.1,far:100,viewHeight:4};
export const perspective:SpatialCamera={projection:'perspective',position:[0,0,5],target:[0,0,0],near:.1,far:100,verticalFov:90};
export function sample(frame=0,model:Matrix4=identity,camera:SpatialCamera=orthographic,ids=['panel']):SpatialSample {return {context:{frame,time:frame/24,fps:{num:24,den:1}},camera,objects:ids.map(id=>({id,model}))};}
