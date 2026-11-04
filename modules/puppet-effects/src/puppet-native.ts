import {Matrix4,OrthographicCamera,WebGPUCoordinateSystem} from 'three';
import {validateMeshData} from '../../graphics-contracts/validate.ts';
import {assertColor,linear709} from '../../../src/media/surface.ts';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {MeshData,Vec3} from './types.ts';
import type {PuppetRendererOptions,PuppetRenderOptions} from './renderer.ts';
import {puppetError as fail} from './puppet-error.ts';
import {withGpuResources} from '../../gpu-effects/resource-arena.ts';
export interface NativePuppetRenderOptions extends PuppetRenderOptions {
 /** Signed per-vertex visibility scores in REST vertex order. No geometric Z or Stage port. */
 overlap?:readonly number[];signal?:AbortSignal;
}
const f32=(v:unknown):number=>{if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0)fail('E_PUPPET_GPU_RANGE','Finite representable F32 geometry required');return v;};
/** Explicit Native entry for the old planar textured Puppet renderer. The
 * texture is a BORROWED admitted image; no implicit file load or CPU readback.
 * Native LessEqual on the common plane preserves triangle index overwrite.
 */
export async function createNativePuppetRenderer(gpu:NativeGpuScope,input:MeshData,options:PuppetRendererOptions){
 const mesh=validateMeshData(input),n=mesh.vertexIds.length;
 if(!options||Object.keys(options).some(k=>!['width','height','workingColor','bounds','maxBufferBytes'].includes(k)))fail('E_PUPPET_PARAMETER','Unknown Native Puppet renderer options');
 const o=structuredClone(options),width=o.width,height=o.height;
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>16384||height>16384)fail('E_MEDIA_LAYOUT','Puppet output requires valid Surface dimensions');
 const color=o.workingColor??linear709;assertColor(color);if(color.transfer!=='linear'||color.reference!=='scene')fail('E_PUPPET_COLOR','Scene-linear Puppet working colour required');
 if(!mesh.uv||mesh.uvOrigin!=='top-left')fail('E_PUPPET_UV','Explicit top-left UV per vertex required');
 const plane=mesh.restPositions[0][2],bounds=o.bounds??{left:-1.5*width/height,right:1.5*width/height,bottom:-1.5,top:1.5};
 if(!bounds||Object.keys(bounds).length!==4||Object.keys(bounds).some(k=>!['left','right','bottom','top'].includes(k)))fail('E_PUPPET_PARAMETER','Explicit left/right/bottom/top bounds required');Object.values(bounds).forEach(f32);
 if(bounds.left>=bounds.right||bounds.bottom>=bounds.top)fail('E_PUPPET_PARAMETER','Increasing orthographic bounds required');
 const plannedBytes=width*height*36+n*20+mesh.indices.length*4,budget=o.maxBufferBytes??256*1024**2;
 if(!Number.isSafeInteger(budget)||budget<1||plannedBytes>budget)fail('E_PUPPET_GPU_BUDGET','Complete Native Puppet plan exceeds maxBufferBytes');
 const view=new OrthographicCamera(bounds.left,bounds.right,bounds.top,bounds.bottom,.1,100);view.coordinateSystem=WebGPUCoordinateSystem;view.position.z=plane+10;view.lookAt(0,0,plane);view.updateMatrixWorld();view.updateProjectionMatrix();
 const clip=new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse).elements.map(f32);
 const owned:GpuDataBuffer[]=[];let disposed=false,busy=false,renders=0,overlapRenders=0;
 try{
  const indices=await gpu.createBuffer({type:'u32',length:mesh.indices.length},Uint32Array.from(mesh.indices));owned.push(indices);
  const uvs=await gpu.createField({type:'f32',dimensions:[n,1,1],components:2,semantic:'generic',space:'uv-top-left',units:'dimensionless'},Float32Array.from(mesh.uv.flat().map(f32)));owned.push(uvs);
  return {async render(pose:Vec3[],source:GpuPixelImage,render:NativePuppetRenderOptions={}){
   if(disposed)fail('E_PUPPET_DISPOSED','Native Puppet renderer disposed');if(busy)fail('E_PUPPET_BUSY','Await the active Puppet recording');
   if(!render||Object.keys(render).some(k=>!['sampling','boundary','format','signal','overlap'].includes(k))||render.sampling!==undefined&&!['nearest','linear'].includes(render.sampling)||render.boundary!==undefined&&!['zero','clamp'].includes(render.boundary)||render.format!==undefined&&!['rgba16float','rgba32float'].includes(render.format))fail('E_PUPPET_PARAMETER','Unknown or invalid Native Puppet render options');
   if(render.signal?.aborted)throw Object.assign(new Error('Puppet recording cancelled'),{code:'E_RENDER_CANCELLED'});
   if(!Array.isArray(pose)||pose.length!==n)fail('E_PUPPET_POSE','Positions must preserve the mesh vertex count/order');
   for(const point of pose){if(!Array.isArray(point)||point.length!==3||point[2]!==plane)fail('E_PUPPET_POSE','Puppet pose must stay in the authored XY plane');point.forEach(f32);}
   let depths:readonly number[]|undefined;
   if(render.overlap!==undefined){
    if(!Array.isArray(render.overlap)||render.overlap.length!==n||!render.overlap.every(v=>typeof v==='number'&&Number.isFinite(v)))fail('E_PUPPET_OVERLAP','Overlap scores must align with all rest vertices and remain finite');
    const scale=render.overlap.reduce((a,b)=>Math.max(a,Math.abs(b)),0);
    // A common positive affine scale preserves the signed additive field and
    // orders every crossing while remaining inside the fixed orthographic clip.
    // drawMesh depth-peel resolves transparent layers at each covered sample.
    depths=render.overlap.map(v=>plane+(scale===0?0:v/scale*.25));
    for(let i=0;i<n;i++)if(!Number.isFinite(Math.fround(depths[i]))||render.overlap[i]!==0&&Math.fround(depths[i])===Math.fround(plane))fail('E_PUPPET_OVERLAP_RANGE','Overlap contrast is not representable at this mesh plane in F32');
   }
   const info=source?.info;if(!info||!['rgba16float','rgba32float'].includes(info.format)||(['primaries','whitePoint','transfer','reference','range','referenceWhiteNits','peakNits','hlgSystemGamma'] as const).some(k=>info.color[k]!==color[k]))fail('E_PUPPET_COLOR','Borrowed float image must use the declared scene-linear working colour');
   // Borrowing avoids the former upload/readback allocations; retain a real
   // full-value image budget rather than silently reducing texture dimensions.
   if(plannedBytes+info.width*info.height*16>budget)fail('E_PUPPET_GPU_BUDGET','Borrowed texture exceeds maxBufferBytes plan');
   busy=true;try{return await withGpuResources(gpu,async a=>{
    const positions=a.buffer(await gpu.createField({type:'f32',dimensions:[n,1,1],components:3,semantic:'position',space:mesh.coordinates.spaceId,units:'meter'},Float32Array.from(pose.flatMap((p,i)=>[p[0],p[1],depths?.[i]??p[2]]))));
    if(render.signal?.aborted)throw Object.assign(new Error('Puppet recording cancelled'),{code:'E_RENDER_CANCELLED'});
    const image=a.image(await gpu.drawMesh({positions,indices,matrix:clip,...(depths?{raster:{version:1 as const,mode:'depth-peel' as const}}:{}),texture:{version:1,image:source,uvs,filter:render.sampling??'linear',addressU:render.boundary==='zero'?'transparent':'clamp',addressV:render.boundary==='zero'?'transparent':'clamp'},output:{width,height,format:render.format??'rgba32float',alpha:'premultiplied',color}}));if(render.signal?.aborted)throw Object.assign(new Error('Puppet recording cancelled'),{code:'E_RENDER_CANCELLED'});renders++;if(depths)overlapRenders++;return a.keep(image);
   });}finally{busy=false;}
  },stats:()=>({disposed,renders,overlapRenders,plannedBytes,physicalGpuPeakBytes:null,textureInput:'borrowed-native-image',readbacks:0,overlap:overlapRenders?'rest-UV signed field / native exact depth-peel':'coplanar triangle index order'}),async dispose(){if(busy)fail('E_PUPPET_BUSY','Await current Puppet recording');if(disposed)return;disposed=true;const results=await Promise.allSettled(owned.map(buffer=>gpu.releaseBuffer(buffer))),errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected');if(errors.length)throw new AggregateError(errors.map(r=>r.reason),'Puppet buffer release failed');}};
 }catch(error){for(const buffer of owned.reverse())await gpu.releaseBuffer(buffer);throw error;}
}
