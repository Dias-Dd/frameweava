/** Stage-local recording adapter, not a new Renderer/owner/registry.
 * Reuse original Native deformation, then the CURRENT public raster-v1. */
import {Matrix4,WebGPUCoordinateSystem} from 'three';
import {createNativeCharacterRenderer,type CharacterAsset,type CharacterPose,type NativeCharacterOptions} from '../puppet-effects/native.ts';
import {camera as originalCamera} from '../skeletal-effects/src/renderer.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import type {NativeGpuScope,NativeMeshRaster} from '../native-gpu/authoring.ts';
import type {GpuPixelImage} from '../gpu-effects/pixel-types.ts';
import {linear709} from '../../src/media/surface.ts';
export function recordImageSkin(gpu:NativeGpuScope,asset:CharacterAsset,o:NativeCharacterOptions,raster:NativeMeshRaster={version:1,mode:'depth-peel'}){
 return withGpuResources(gpu,async init=>{
  const view=originalCamera(o.camera,o.width,o.height);view.coordinateSystem=WebGPUCoordinateSystem;(view as any).updateProjectionMatrix();const clip=new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse).elements;
  const skin=init.adopt(await createNativeCharacterRenderer(gpu,asset,{...o,texture:undefined}),s=>s.dispose()),indices=init.buffer(await gpu.createBuffer({type:'u32',length:asset.mesh.indices.length},Uint32Array.from(asset.mesh.indices))),uvs=init.buffer(await gpu.createField({type:'f32',dimensions:[asset.mesh.vertexIds.length,1,1],components:2,semantic:'generic',space:'uv-top-left',units:'dimensionless'},Float32Array.from(asset.mesh.uv!.flat())));
  let frames=0,closed=false;const result={async render(pose:CharacterPose,p:{texture:GpuPixelImage;sampling?:'nearest'|'linear';boundary?:'zero'|'clamp';signal?:AbortSignal}){return withGpuResources(gpu,async a=>{const positions=a.buffer(await skin.deform(pose,p.signal)),image=a.image(await gpu.drawMesh({positions,indices,matrix:clip,color:[1,1,1,1],texture:{version:1,image:p.texture,uvs,filter:p.sampling??'linear',addressU:p.boundary==='clamp'?'clamp':'transparent',addressV:p.boundary==='clamp'?'clamp':'transparent'},raster,output:{width:o.width,height:o.height,format:o.format??'rgba32float',alpha:'premultiplied',color:linear709}}));frames++;return a.keep(image);});},stats:()=>({...skin.stats(),frames,raster:raster.mode,geometryExport:false}),async dispose(){if(closed)return;closed=true;const r=await Promise.allSettled([skin.dispose(),gpu.releaseBuffer(indices),gpu.releaseBuffer(uvs)]),bad=r.filter((v):v is PromiseRejectedResult=>v.status==='rejected');if(bad.length)throw new AggregateError(bad.map(v=>v.reason),'Image skin recording cleanup failed');}};init.keep(skin);init.keep(indices);init.keep(uvs);return result;
 });
}
