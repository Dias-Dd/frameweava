import {Matrix4,Vector3,Vector4} from 'three';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';import type {SpatialField} from '../../spatial-fields/types.ts';
import {camera,descriptor,validityDescriptor} from '../../spatial-fields/parameters.ts';
import {withGpuResources} from '../../gpu-effects/resource-arena.ts';
import {prepareOptions,prepareSample,dimensions,object,integer,spatialDataError as fail} from './prepare.ts';
import {nativeMeshCode} from '../../skeletal-effects/src/native-mesh-shader.ts';
import type {SpatialRendererOptions,SpatialSample} from './types.ts';
export interface NativeSpatialRendererOptions extends Omit<SpatialRendererOptions,'fenceTimeoutMs'>{maxRayTests?:number}
export interface NativeSpatialCapture {depth:SpatialField;normal:SpatialField;motion:SpatialField;transfer:{path:'native-resident';readback:false;uploadBytes:number}}
// The same fixed Three/MIT ray-intersection port used by Native mesh rendering.
const code=nativeMeshCode.slice(0,nativeMeshCode.indexOf('fn nm_vertex'))+/* wgsl */`
fn ns_v(base:u32)->vec3f{return vec3f(load0(base),load0(base+1u),load0(base+2u));}
fn ns_clip(base:u32)->vec4f{return vec4f(load0(base),load0(base+1u),load0(base+2u),load0(base+3u));}
fn compute(g:vec3u,l:vec3u,w:vec3u){
 let size=vec2u(paramU32(0u),paramU32(1u));let i=g.y*size.x+g.x;let ndc=vec2f((f32(g.x)+.5)/f32(size.x)*2.-1.,1.-(f32(g.y)+.5)/f32(size.y)*2.);
 var ro=vec3f(0.);var rd=normalize(vec3f(ndc.x/paramF32(4u),ndc.y/paramF32(5u),-1.));if(paramU32(3u)==1u){ro=vec3f(ndc.x/paramF32(4u),ndc.y/paramF32(5u),0.);rd=vec3f(0.,0.,-1.);}
 var best=paramF32(7u)/-rd.z;let near=paramF32(6u)/-rd.z;var selected=0xffffffffu;var bary=vec3f(0.);var flip=1.;
 for(var t=0u;t<paramU32(2u);t++){let b=t*36u;let a=ns_v(b);let v=ns_v(b+3u);let c=ns_v(b+6u);let hit=nm_hit(ro,rd,a,v,c);if(hit.x>=near&&hit.x<best){best=hit.x;selected=t;bary=hit.yzw;flip=select(1.,-1.,dot(cross(v-a,c-a),rd)>0.);}}
 store1(i,0.);store2(i,0.);store4(i,0.);store6(i,0.);for(var k=0u;k<3u;k++){store3(i*3u+k,0.);store5(i*3u+k,0.);}
 if(selected==0xffffffffu){return;}let b=selected*36u;let normal=ns_v(b+9u)*flip;let current=ns_clip(b+12u)*bary.x+ns_clip(b+16u)*bary.y+ns_clip(b+20u)*bary.z;let delta=ns_clip(b+24u)*bary.x+ns_clip(b+28u)*bary.y+ns_clip(b+32u)*bary.z;let previous=current-delta;
 store1(i,-(ro+rd*best).z);store2(i,1.);store4(i,1.);store6(i,1.);for(var k=0u;k<3u;k++){store3(i*3u+k,normal[k]);}
 if(previous.w>0.&&previous.z>=-previous.w&&previous.z<=previous.w){let motion=(delta.xy*current.w-current.xy*delta.w)/(current.w*previous.w)*.5*vec2f(size)*vec2f(1.,-1.);store5(i*3u,motion.x);store5(i*3u+1u,motion.y);store5(i*3u+2u,1.);}
}`;
/** Geometry-only opaque nearest AOVs, using explicit current/previous poses.
 * Results are resident typed non-color fields, never packed into image RGB.
 * Each field owns its independent mask; release with releaseSpatialField.
 * Native completion, loss and recovery belong to the borrowed Session owner. */
export async function createNativeSpatialDataRenderer(gpu:NativeGpuScope,options:NativeSpatialRendererOptions){
 object(options,'native spatial options',['width','height','meshes','maxBufferBytes','maxRayTests']);const {maxRayTests=2e9,...legacy}=options,config=prepareOptions(legacy);integer(maxRayTests,'maxRayTests');let {width,height}=config,disposed=false,busy=false,captures=0;
 const kernel=await gpu.compileCompute({abiVersion:1,id:'frameweave/spatial-data/native-geometry',version:'0.1.0',bindings:[{type:'f32',access:'read'},...Array.from({length:6},()=>({type:'f32' as const,access:'read_write' as const}))],parameterWords:8,workgroupSize:[8,8,1],code});
 return {async capture(current:SpatialSample,previous:SpatialSample,options:{signal?:AbortSignal}={}):Promise<NativeSpatialCapture>{
  if(disposed)fail('E_SPATIAL_DATA_DISPOSED','Native spatial renderer disposed');if(busy)fail('E_SPATIAL_DATA_BUSY','Await active spatial recording');object(options,'capture options',['signal']);if(options.signal?.aborted)throw Object.assign(new Error('Spatial recording cancelled'),{code:'E_RENDER_CANCELLED'});
  const a=prepareSample(current,config.meshes,width,height),b=prepareSample(previous,config.meshes,width,height),cam=camera(current.camera,width,height),old=camera(previous.camera,width,height);if(a.context.fps.num!==b.context.fps.num||a.context.fps.den!==b.context.fps.den||b.context.time>a.context.time)fail('E_SPATIAL_DATA_TIME','Explicit nonfuture reference with matching FPS required');
  const triangles=config.meshes.reduce((n,m)=>n+m.indices.length/3,0),work=width*height*triangles,bytes=width*height*40+triangles*144+config.geometryBytes;if(!Number.isSafeInteger(work)||work>maxRayTests||!Number.isSafeInteger(bytes)||bytes>config.budget)fail('E_SPATIAL_DATA_BUDGET','Full spatial geometry/work plan exceeds maxRayTests/maxBufferBytes');
  const data=new Float32Array(Math.max(1,triangles*36));let t=0;for(let object=0;object<config.meshes.length;object++){const mesh=config.meshes[object],now=a.objects[object],prev=b.objects[object],mv=new Matrix4().multiplyMatrices(a.camera.matrixWorldInverse,now.model),clip=new Matrix4().multiplyMatrices(a.camera.projectionMatrix,mv),last=new Matrix4().multiplyMatrices(b.camera.projectionMatrix,b.camera.matrixWorldInverse).multiply(prev.model);
   for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),local=ids.map(id=>new Vector3().fromArray(now.positions,id*3)),view=local.map(p=>p.clone().applyMatrix4(mv));
    // Normal uses translated-free world edges, retaining large-origin detail.
    const edges=local.slice(1).map(p=>{const e=p.clone().sub(local[0]);return new Vector3(now.model.elements[0]*e.x+now.model.elements[4]*e.y+now.model.elements[8]*e.z,now.model.elements[1]*e.x+now.model.elements[5]*e.y+now.model.elements[9]*e.z,now.model.elements[2]*e.x+now.model.elements[6]*e.y+now.model.elements[10]*e.z);}),normal=edges[0].cross(edges[1]).normalize();
    for(let j=0;j<3;j++){data.set(view[j].toArray(),t*36+j*3);const p=new Vector4(local[j].x,local[j].y,local[j].z,1).applyMatrix4(clip),q=new Vector4().fromArray([...prev.positions.subarray(ids[j]*3,ids[j]*3+3),1]).applyMatrix4(last);data.set(p.toArray(),t*36+12+j*4);data.set(p.toArray().map((v,k)=>v-q.getComponent(k)),t*36+24+j*4);}data.set(normal.toArray(),t*36+9);t++;
   }
  }if(!data.every(Number.isFinite))fail('E_SPATIAL_DATA_RANGE','Spatial geometry overflows F32');
  const p=new Float32Array(8),u=new Uint32Array(p.buffer);u.set([width,height,triangles,Number(cam.ortho)]);p.set([a.camera.projectionMatrix.elements[0],a.camera.projectionMatrix.elements[5],cam.near,cam.far],4);busy=true;
  try{return await withGpuResources(gpu,async arena=>{const geometry=arena.buffer(await gpu.createBuffer({type:'f32',length:data.length},data)),pairs:SpatialField[]=[];for(const kind of ['axial-depth','world-normal','pixel-motion'] as const){const extras:any={camera:cam.key};if(kind==='pixel-motion')Object.assign(extras,{referenceCamera:old.key,referenceTime:b.context,motion:'current-minus-explicit-previous-geometry',intervalSeconds:a.context.time-b.context.time,previousVisibility:'not-tested'});pairs.push({data:arena.buffer(await gpu.createField(descriptor(kind,[width,height,1],a.context,extras))),validity:arena.buffer(await gpu.createField(validityDescriptor([width,height,1],a.context)))});}
   await gpu.dispatch(kernel,[geometry,...pairs.flatMap(v=>[v.data,v.validity])],{workItems:[width,height,1],parameters:p,signal:options.signal});for(const pair of pairs){arena.keep(pair.data);arena.keep(pair.validity);}captures++;return {depth:pairs[0],normal:pairs[1],motion:pairs[2],transfer:{path:'native-resident',readback:false,uploadBytes:data.byteLength}};
  });}finally{busy=false;}
 },resize(w:number,h:number){if(disposed||busy)fail('E_SPATIAL_DATA_BUSY','Resize requires an open idle recorder');dimensions(w,h,config.budget,config.geometryBytes);width=w;height=h;},stats:()=>({disposed,width,height,captures,backend:'native-wgpu',profile:'opaque-nearest-geometric-AOV/no-MSAA',readbacks:0,physicalPeakBytes:null}),async dispose(){if(busy)fail('E_SPATIAL_DATA_BUSY','Await active recording');disposed=true;}};
}
