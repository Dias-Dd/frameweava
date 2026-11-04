/** Test-only sparse f64 ray/triangle reference. No Three/shader implementation imports.
 * Never used by the production creator or as a CPU image-rendering fallback. */
import type {Vec3,Matrix4,MeshData,SpatialCamera,SpatialSample} from '../src/types.ts';
const sub=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v-b[i]) as Vec3;
const add=(a:Vec3,b:Vec3):Vec3=>a.map((v,i)=>v+b[i]) as Vec3;
const mul=(a:Vec3,s:number):Vec3=>a.map(v=>v*s) as Vec3;
const dot=(a:Vec3,b:Vec3)=>a.reduce((s,v,i)=>s+v*b[i],0);
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:Vec3)=>mul(a,1/Math.hypot(...a));
const identity:Matrix4=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function transform(m:Matrix4,p:Vec3):Vec3 {return [m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function basis(c:SpatialCamera){const forward=unit(sub(c.target,c.position)),right=unit(cross(forward,c.up??[0,1,0])),up=cross(right,forward);return {forward,right,up};}
function project(c:SpatialCamera,p:Vec3,w:number,h:number){const {forward,right,up}=basis(c),d=sub(p,c.position),z=dot(d,forward),vx=dot(d,right),vy=dot(d,up),extent=c.projection==='perspective'?Math.tan(c.verticalFov*Math.PI/360)*z:c.viewHeight/2;return {pixel:[w/2*(1+vx/(extent*w/h)),h/2*(1-vy/extent)] as [number,number],valid:z>=c.near&&z<=c.far};}
export interface ReferenceHit {depth:number;normal:Vec3;motion:[number,number];valid:boolean;margin:number;mesh:string;triangle:number}
export function referenceAt(meshes:MeshData[],current:SpatialSample,previous:SpatialSample,width:number,height:number,x:number,y:number):ReferenceHit|undefined {
  const c=current.camera,{forward,right,up}=basis(c),nx=(x+.5)/width*2-1,ny=1-(y+.5)/height*2,extent=c.projection==='perspective'?Math.tan(c.verticalFov*Math.PI/360):c.viewHeight/2;
  const offset=add(mul(right,nx*extent*width/height),mul(up,ny*extent)),origin=c.projection==='perspective'?c.position:add(c.position,offset),direction=c.projection==='perspective'?unit(add(forward,offset)):forward;
  let nearest=Infinity,result:ReferenceHit|undefined;
  for(const mesh of meshes){const object=current.objects.find(o=>o.id===mesh.id)!,prior=previous.objects.find(o=>o.id===mesh.id)!,points=(object.positions??mesh.restPositions).map(p=>transform(object.model??identity,p)),priorPoints=(prior.positions??mesh.restPositions).map(p=>transform(prior.model??identity,p));
    for(let i=0;i<mesh.indices.length;i+=3){const indices=mesh.indices.slice(i,i+3),a=points[indices[0]],b=points[indices[1]],d=points[indices[2]],e1=sub(b,a),e2=sub(d,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-14)continue;const from=sub(origin,a),u=dot(from,p)/det;if(u<0||u>1)continue;const q=cross(from,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;const distance=dot(e2,q)/det;if(distance<0||distance>=nearest)continue;const point=add(origin,mul(direction,distance)),depth=dot(sub(point,c.position),forward);if(depth<c.near||depth>c.far)continue;
      let normal=unit(cross(e1,e2));if(dot(normal,direction)>0)normal=mul(normal,-1);const priorPoint=add(add(mul(priorPoints[indices[0]],1-u-v),mul(priorPoints[indices[1]],u)),mul(priorPoints[indices[2]],v)),projection=project(previous.camera,priorPoint,width,height);nearest=distance;result={depth,normal,motion:projection.valid?[x+.5-projection.pixel[0],y+.5-projection.pixel[1]]:[0,0],valid:projection.valid,margin:Math.min(1-u-v,u,v),mesh:mesh.id,triangle:i/3};
    }
  }return result;
}
