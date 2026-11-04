import {BufferGeometry,BufferAttribute,Matrix4,Matrix3,Vector3} from 'three';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import {withGpuResources} from '../../gpu-effects/resource-arena.ts';
import {instanceConfig,instanceSample} from './instance-prepare.ts';
import {meshError} from './mesh-prepare.ts';import {integer} from './check.ts';
import type {InstanceMeshDefinition,InstanceRenderOptions} from './instance-types.ts';
import type {NativeMeshRendererOptions} from './native-mesh.ts';
import {nativeMeshCode} from './native-mesh-shader.ts';
const expand=/* wgsl */`
fn nm_rest(base:u32)->vec3f{return vec3f(load0(base),load0(base+1u),load0(base+2u));}
fn compute(g:vec3u,l:vec3u,w:vec3u){let instance=g.y+paramU32(3u);let source=(paramU32(0u)+g.x)*18u;let destination=(paramU32(2u)+instance*paramU32(1u)+g.x);let matrix=instance*28u;
 let mv=mat4x4f(vec4f(load1(matrix),load1(matrix+1u),load1(matrix+2u),load1(matrix+3u)),vec4f(load1(matrix+4u),load1(matrix+5u),load1(matrix+6u),load1(matrix+7u)),vec4f(load1(matrix+8u),load1(matrix+9u),load1(matrix+10u),load1(matrix+11u)),vec4f(load1(matrix+12u),load1(matrix+13u),load1(matrix+14u),load1(matrix+15u)));
 let normal=mat3x3f(vec3f(load1(matrix+16u),load1(matrix+17u),load1(matrix+18u)),vec3f(load1(matrix+19u),load1(matrix+20u),load1(matrix+21u)),vec3f(load1(matrix+22u),load1(matrix+23u),load1(matrix+24u)));
 for(var j=0u;j<3u;j++){let p=(mv*vec4f(nm_rest(source+j*3u),1.)).xyz;let raw=normal*nm_rest(source+9u+j*3u);let n=raw/max(length(raw),1e-20);for(var k=0u;k<3u;k++){store3(destination*18u+j*3u+k,p[k]);store3(destination*18u+9u+j*3u+k,n[k]);}}
 for(var k=0u;k<12u;k++){store4(destination*12u+k,load2(instance*12u+k));}
}`;
/** Rest topology is shared. Per-frame instance expansion is GPU computation,
 * never duplicated CPU MeshData or a new graphics device/renderer service. */
export async function createNativeInstancedMeshRenderer(gpu:NativeGpuScope,definitions:InstanceMeshDefinition[],options:NativeMeshRendererOptions){
 if(Object.hasOwn(options,'fenceTimeoutMs'))meshError('PARAMETER','Native completion/timeout belongs to the existing Session');
 const {maxRayTests=2e9,...legacy}=options,data=instanceConfig(definitions,legacy),config=data.config,budget=integer(options.maxBytes??512*1024**2,'maxBytes');integer(maxRayTests,'maxRayTests');let width=integer(options.width,'width'),height=integer(options.height,'height'),disposed=false,busy=false,renders=0,resizes=0,lastInstances=0,lastTriangles=0;
 const starts:number[]=[],triangles=config.meshes.reduce((n,m)=>n+m.indices.length/3,0),rest=new Float32Array(triangles*18);let offset=0;
 config.meshes.forEach((mesh,i)=>{starts.push(offset);let normals:Float32Array|undefined;if(config.normals==='smooth'){const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(data.geometry[i].positions,3));geometry.setIndex(mesh.indices);geometry.computeVertexNormals();normals=new Float32Array(geometry.getAttribute('normal').array as Float32Array);geometry.dispose();}for(let t=0;t<mesh.indices.length;t+=3){for(let j=0;j<3;j++){const v=mesh.indices[t+j];rest.set(data.geometry[i].positions.subarray(v*3,v*3+3),offset*18+j*3);if(normals)rest.set(normals.subarray(v*3,v*3+3),offset*18+9+j*3);}offset++;}});
 const template=await gpu.createBuffer({type:'f32',length:rest.length},rest);try{
 const prepare=await gpu.compileCompute({abiVersion:1,id:'frameweave/skeletal-effects/native-instance-expand',version:'0.1.0',bindings:[{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'},{type:'f32',access:'read_write'}],parameterWords:4,workgroupSize:[64,1,1],code:expand});
 const shader=await gpu.compile({abiVersion:2,id:'frameweave/skeletal-effects/native-mesh',version:'0.1.0',inputCount:0,dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],parameterWords:16,code:nativeMeshCode});
 const fits=(w:number,h:number)=>{if(w>16384||h>16384||w*h*16>512*1024**2)meshError('LAYOUT','Native instance output exceeds Surface limits');};fits(width,height);
 return {async render(options:InstanceRenderOptions){if(disposed||busy)meshError('BUSY','Native instance renderer must be open and idle');const sample=instanceSample(options,data,width,height),count=sample.objects.reduce((n,o)=>n+(o.visible?o.count:0),0),total=sample.objects.reduce((n,o)=>n+(o.visible?o.count*config.meshes[o.index].indices.length/3:0),0),work=width*height*total,bytes=width*height*16+total*120+count*160+rest.byteLength+data.extraBytes;
  if(!Number.isSafeInteger(work)||work>maxRayTests||!Number.isSafeInteger(bytes)||bytes>budget)meshError('GPU_BUDGET','Full instance geometry/ray plan exceeds maxRayTests/maxBytes; no truncation');
  const lights=new Float32Array(Math.max(1,sample.lights.length*6));sample.lights.forEach((l,i)=>lights.set([...new Vector3(...l.direction).transformDirection(sample.view.matrixWorldInverse).toArray(),...l.color.map(v=>v*l.intensity)],i*6));
  if(!lights.every(Number.isFinite))meshError('GPU_RANGE','Light upload exceeds finite F32');if(sample.signal?.aborted)throw Object.assign(new Error('Instance recording cancelled'),{code:'E_RENDER_CANCELLED'});
  busy=true;try{return await withGpuResources(gpu,async a=>{
   const positions=a.buffer(await gpu.createBuffer({type:'f32',length:Math.max(1,total*18)})),materials=a.buffer(await gpu.createBuffer({type:'f32',length:Math.max(1,total*12)})),illumination=a.buffer(await gpu.createBuffer({type:'f32',length:lights.length},lights));let outputStart=0;
   for(const object of sample.objects){if(!object.visible||!object.count)continue;const matrices=new Float32Array(object.count*28),attributes=new Float32Array(object.count*12),mesh=config.meshes[object.index],perMesh=mesh.indices.length/3,mvGroup=new Matrix4().multiplyMatrices(sample.view.matrixWorldInverse,object.model);
    for(let i=0;i<object.count;i++){const instance=new Matrix4().fromArray(object.matrices,i*16),mv=mvGroup.clone().multiply(instance),normal=new Matrix3().getNormalMatrix(mv);matrices.set(mv.elements,i*28);matrices.set(normal.elements,i*28+16);const appearance=object.appearance,ink=appearance.color.map((v,k)=>v*(object.colors?.[i*3+k]??1));attributes.set([...ink,...appearance.emissive,appearance.roughness,appearance.metalness,appearance.opacity,Math.sign(object.model.determinant()),0,0],i*12);}
    if(!matrices.every(Number.isFinite)||!attributes.every(Number.isFinite))meshError('GPU_RANGE','Native instance transform/appearance exceeds finite F32');
    const transforms=a.buffer(await gpu.createBuffer({type:'f32',length:matrices.length},matrices)),material=a.buffer(await gpu.createBuffer({type:'f32',length:attributes.length},attributes));const rows=gpu.capabilities().limits.maxComputeWorkgroupsPerDimension;
    for(let first=0;first<object.count;first+=rows)await gpu.dispatch(prepare,[template,transforms,material,positions,materials],{workItems:[perMesh,Math.min(rows,object.count-first),1],parameters:Uint32Array.of(starts[object.index],perMesh,outputStart,first),signal:sample.signal});outputStart+=perMesh*object.count;
   }
   const p=new Float32Array(16),u=new Uint32Array(p.buffer),view=sample.view as any;p[0]=view.projectionMatrix.elements[0];p[1]=view.projectionMatrix.elements[5];p[2]=view.near;p[3]=view.far;u[4]=Number(view.isOrthographicCamera===true);u[5]=total;u[6]=sample.lights.length;u[7]=Number(config.shading==='standard');p.set(sample.ambient,8);u[11]=Number(config.side==='front');u[12]=Number(config.normals!=='flat');const image=await gpu.run(shader,[],{data:[positions,materials,illumination],parameters:p,output:{width,height,format:sample.format,alpha:'premultiplied',color:config.color},signal:sample.signal});renders++;lastInstances=count;lastTriangles=total;return image;
  });}finally{busy=false;}
 },resize(w:number,h:number){if(disposed||busy)meshError('BUSY','Resize requires an open idle renderer');w=integer(w,'width');h=integer(h,'height');fits(w,h);width=w;height=h;resizes++;},stats:()=>({disposed,renders,resizes,width,height,lastInstances,lastTriangles,capacity:data.capacity,backend:'native-wgpu',physicalPeakBytes:null,profile:'GPU-instance-expansion/opaque-ray/GGX'}),async dispose(){if(busy)meshError('BUSY','Await Native instance recording');if(disposed)return;disposed=true;await gpu.releaseBuffer(template);}};
 }catch(error){await gpu.releaseBuffer(template);throw error;}
}
