import {BufferAttribute,BufferGeometry,Matrix4,Matrix3,Vector3} from 'three';
import {meshConfig,meshSample,meshError} from './mesh-prepare.ts';
import type {MeshData,MeshRendererOptions,MeshRenderOptions} from './mesh-types.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import {withGpuResources} from '../../gpu-effects/resource-arena.ts';
import {nativeMeshCode} from './native-mesh-shader.ts';
import {integer} from './check.ts';
export interface NativeMeshRendererOptions extends Omit<MeshRendererOptions,'fenceTimeoutMs'> {maxRayTests?:number}
/** Stage-local shader adapter. Uses the borrowed Scope, not another device,
 * renderer service or graph. CPU prepares authored geometry; GPU resolves
 * visibility, normal interpolation and scene-linear material pixels.
 */
export async function createNativeMeshRenderer(gpu:NativeGpuScope,input:MeshData[],options:NativeMeshRendererOptions){
 if(Object.hasOwn(options,'fenceTimeoutMs'))meshError('PARAMETER','Native completion/timeout belongs to the existing Session; fenceTimeoutMs is a Web renderer option');
 const {maxRayTests=2e9,...legacy}=options;integer(maxRayTests,'maxRayTests',1);const config=meshConfig(input,legacy),memoryBudget=integer(options.maxBytes??512*1024**2,'maxBytes',1);let width=integer(options.width,'width'),height=integer(options.height,'height'),disposed=false,busy=false,renders=0,resizes=0,lastRayTests=0;
 const shader=await gpu.compile({abiVersion:2,id:'frameweave/skeletal-effects/native-mesh',version:'0.1.0',inputCount:0,dataInputs:[{type:'f32'},{type:'f32'},{type:'f32'}],parameterWords:16,code:nativeMeshCode});
 const fits=(w:number,h:number)=>{if(w>16384||h>16384||w*h*16>512*1024**2)meshError('LAYOUT','Native mesh output exceeds Surface dimensions/value budget');};fits(width,height);
 return {async render(options:MeshRenderOptions){
  if(disposed)meshError('DISPOSED','Native mesh renderer disposed');if(busy)meshError('BUSY','Await the active Native mesh recording');
  const sample=meshSample(options,config,width,height);if(sample.signal?.aborted)throw Object.assign(new Error('Mesh recording cancelled'),{code:'E_RENDER_CANCELLED'});
  const count=sample.objects.reduce((n,o)=>n+(o.visible?config.meshes[o.index].indices.length/3:0),0),work=width*height*count;
  if(!Number.isSafeInteger(work)||work>maxRayTests)meshError('GPU_BUDGET','Complete pixel/triangle plan exceeds maxRayTests; no geometry or resolution reduction');
  const bytes=width*height*16+count*(18+12)*4+sample.lights.length*24+config.extraBytes;if(!Number.isSafeInteger(bytes)||bytes>memoryBudget)meshError('GPU_BUDGET','Native geometry/material plan exceeds maxBytes');
  const vertices=new Float32Array(Math.max(1,count*18)),materials=new Float32Array(Math.max(1,count*12)),lights=new Float32Array(Math.max(1,sample.lights.length*6));let triangle=0;
  for(const object of sample.objects){if(!object.visible)continue;const mesh=config.meshes[object.index],mv=new Matrix4().multiplyMatrices(sample.view.matrixWorldInverse,object.model),normalMatrix=new Matrix3().getNormalMatrix(mv);let normals:Float32Array|undefined=object.suppliedNormals;
   if(config.normals==='smooth'){const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(object.rebased,3));geometry.setIndex(mesh.indices);geometry.computeVertexNormals();normals=new Float32Array(geometry.getAttribute('normal').array as Float32Array);geometry.dispose();}
   const orientation=Math.sign(object.model.determinant());
   for(let t=0;t<mesh.indices.length;t+=3){const start=triangle*18;for(let corner=0;corner<3;corner++){const index=mesh.indices[t+corner],point=new Vector3().fromArray(object.rebased,index*3).applyMatrix4(mv);vertices.set(point.toArray(),start+corner*3);if(normals){const normal=new Vector3().fromArray(normals,index*3).applyNormalMatrix(normalMatrix);vertices.set(normal.toArray(),start+9+corner*3);}}
    const a=object.appearance;materials.set([...a.color,...a.emissive,a.roughness,a.metalness,a.opacity,orientation,0,0],triangle*12);triangle++;
   }
  }
  for(let i=0;i<sample.lights.length;i++){const light=sample.lights[i],direction=new Vector3(...light.direction).transformDirection(sample.view.matrixWorldInverse);lights.set([...direction.toArray(),...light.color.map(v=>v*light.intensity)],i*6);}
  if(!vertices.every(Number.isFinite)||!materials.every(Number.isFinite)||!lights.every(Number.isFinite))meshError('GPU_RANGE','Geometry/light upload overflows F32');
  const p=new Float32Array(16),u=new Uint32Array(p.buffer),view=sample.view as any;p[0]=view.projectionMatrix.elements[0];p[1]=view.projectionMatrix.elements[5];p[2]=view.near;p[3]=view.far;u[4]=Number(view.isOrthographicCamera===true);u[5]=count;u[6]=sample.lights.length;u[7]=Number(config.shading==='standard');p.set(sample.ambient,8);u[11]=Number(config.side==='front');u[12]=Number(config.normals!=='flat');
  busy=true;try{return await withGpuResources(gpu,async a=>{const v=a.buffer(await gpu.createBuffer({type:'f32',length:vertices.length},vertices)),m=a.buffer(await gpu.createBuffer({type:'f32',length:materials.length},materials)),l=a.buffer(await gpu.createBuffer({type:'f32',length:lights.length},lights));const image=await gpu.run(shader,[],{data:[v,m,l],parameters:p,output:{width,height,format:sample.format,alpha:'premultiplied',color:config.color},signal:sample.signal});renders++;lastRayTests=work;return image;});}finally{busy=false;}
 },resize(w:number,h:number){if(disposed||busy)meshError('BUSY','Resize requires an open idle renderer');w=integer(w,'width');h=integer(h,'height');fits(w,h);width=w;height=h;resizes++;},stats:()=>({disposed,width,height,renders,resizes,lastRayTests,objects:config.meshes.length,shading:config.shading,normals:config.normals,backend:'native-wgpu',profile:'opaque-nearest-ray/single-scatter-GGX',physicalPeakBytes:null}),async dispose(){if(busy)meshError('BUSY','Await active recording');disposed=true;}};
}
