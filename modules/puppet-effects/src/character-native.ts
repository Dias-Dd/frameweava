// SPDX-License-Identifier: Apache-2.0. CPU bone control, GPU resident vertex skinning.
import {Matrix4,OrthographicCamera,PerspectiveCamera,WebGPUCoordinateSystem} from 'three';
import type {NativeGpuScope} from '../../native-gpu/authoring.ts';
import type {GpuDataBuffer} from '../../gpu-effects/compute-types.ts';
import type {GpuPixelImage} from '../../gpu-effects/pixel-types.ts';
import type {SpatialCamera} from '../../spatial-fields/types.ts';
import {camera as validateCamera,time as checkTime} from '../../spatial-fields/parameters.ts';
import {linear709} from '../../../src/media/surface.ts';
import {validateCharacterAsset,characterError as fail,characterNumber as number,characterObject as object} from './character-asset.ts';
import type {CharacterAsset,CharacterPose,Matrix4 as Matrix} from './character-types.ts';

export interface NativeCharacterOptions {width:number;height:number;camera:SpatialCamera;color?:readonly [number,number,number,number];format?:'rgba16float'|'rgba32float';maxBufferBytes?:number;/** Explicit texture override; render supplies an admitted frame-local image. */texture?:'borrowed'}
const f32=(v:number)=>{if(!Number.isFinite(v)||!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0)fail('GPU_RANGE','Native skin inputs must fit finite nonzero f32');return v;};
const skinCode=/* wgsl */`
fn compute(g:vec3u,l:vec3u,w:vec3u){
 let i=g.x;let p=vec4f(load0(i*3u),load0(i*3u+1u),load0(i*3u+2u),1.);var q=vec3f(0.);
 for(var j=0u;j<4u;j++){let weight=load2(i*4u+j);if(weight==0.){continue;}let base=load1(i*4u+j)*16u;
  let m=mat4x4f(vec4f(load3(base),load3(base+1u),load3(base+2u),load3(base+3u)),vec4f(load3(base+4u),load3(base+5u),load3(base+6u),load3(base+7u)),vec4f(load3(base+8u),load3(base+9u),load3(base+10u),load3(base+11u)),vec4f(load3(base+12u),load3(base+13u),load3(base+14u),load3(base+15u)));
  q+=(m*p).xyz*weight;
 }store4(i*3u,q.x);store4(i*3u+1u,q.y);store4(i*3u+2u,q.z);
}`;
/** Stage init only: immutable rest/weights/indices. Frame output positions are
 * fresh existing data capabilities, not persistent writable cross-frame state. */
export async function createNativeCharacterRenderer(gpu:NativeGpuScope,input:CharacterAsset,options:NativeCharacterOptions){
 const asset=validateCharacterAsset(input);object(options,['width','height','camera','color','format','maxBufferBytes','texture'],'native character options');const o=structuredClone(options),width=number(o.width,'width',1,16384),height=number(o.height,'height',1,16384),n=asset.mesh.vertexIds.length;
 if(o.texture!==undefined&&o.texture!=='borrowed')fail('PARAMETER','Native texture mode must explicitly borrow a frame-local image');if(o.texture&&(!asset.mesh.uv||asset.mesh.uvOrigin!=='top-left'))fail('UV','Borrowed character texture requires authored top-left UV');
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height))fail('PARAMETER','Integer output dimensions required');if(asset.mesh.material?.texture&&!o.texture)fail('NATIVE_RESOURCE_REQUIRED','Asset texture requires explicit borrowed texture mode; no implicit load or omission');if(asset.mesh.material?.baseColor&&!o.color)fail('COLOR','Supply an explicit scene-linear color instead of silently treating sRGB material ink as linear');
 const color=o.color??(o.texture?[1,1,1,1]:[.2,2,1,1]);if(color.length!==4)fail('COLOR','Explicit linear RGBA required');color.forEach(f32);number(color[3],'alpha',0,1);const format=o.format??'rgba32float';if(!['rgba16float','rgba32float'].includes(format))fail('COLOR','Native character output requires 16F/32F');
 const bytes=n*(3+4+4+3+(o.texture?2:0))*4+asset.mesh.indices.length*4+asset.skeleton.bones.length*64+width*height*36,budget=number(o.maxBufferBytes??256*1024*1024,'maxBufferBytes',1,Number.MAX_SAFE_INTEGER);if(bytes>budget)fail('BUDGET','Complete immutable/deformed/output plan exceeds maxBufferBytes');
 const c=validateCamera(o.camera,width,height),view=c.ortho?new OrthographicCamera(-c.half*width/height,c.half*width/height,c.half,-c.half,c.near,c.far):new PerspectiveCamera(o.camera.projection==='perspective'?o.camera.verticalFov:45,width/height,c.near,c.far);view.coordinateSystem=WebGPUCoordinateSystem;view.position.fromArray(o.camera.position);view.up.fromArray(o.camera.up??[0,1,0]);view.lookAt(...o.camera.target);view.updateProjectionMatrix();view.updateMatrixWorld(true);const clip=new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse).elements.map(f32);
 const boneIndex=new Map(asset.skeleton.bones.map((b,i)=>[b.id,i])),weightMap=new Map(asset.skeleton.weights.map(w=>[w.vertexId,w.influences])),ids=new Uint32Array(n*4),weights=new Float32Array(n*4);asset.mesh.vertexIds.forEach((id,i)=>weightMap.get(id)!.forEach((w,j)=>{ids[4*i+j]=boneIndex.get(w.boneId)!;weights[4*i+j]=f32(w.weight);}));
 const owned:GpuDataBuffer[]=[];let disposed=false,busy=false,frames=0;
 try{
  const rest=await gpu.createField({type:'f32',dimensions:[n,1,1],components:3,semantic:'position',space:asset.mesh.coordinates.spaceId,units:'meter'},Float32Array.from(asset.mesh.restPositions.flat().map(f32)));owned.push(rest);
  const links=await gpu.createBuffer({type:'u32',length:ids.length},ids);owned.push(links);const influence=await gpu.createBuffer({type:'f32',length:weights.length},weights);owned.push(influence);const indices=await gpu.createBuffer({type:'u32',length:asset.mesh.indices.length},Uint32Array.from(asset.mesh.indices));owned.push(indices);
  const uvs=o.texture?await gpu.createField({type:'f32',dimensions:[n,1,1],components:2,semantic:'generic',space:'uv-top-left',units:'dimensionless'},Float32Array.from(asset.mesh.uv!.flat().map(f32))):undefined;if(uvs)owned.push(uvs);
  const kernel=await gpu.compileCompute({abiVersion:1,id:'frameweave/native-character/linear-skin',version:'0.3.0',bindings:[{type:'f32',access:'read'},{type:'u32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read'},{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[64,1,1],code:skinCode});
  async function recordSkin(pose:CharacterPose,signal?:AbortSignal){
   if(disposed)fail('DISPOSED','Native character renderer disposed');if(signal?.aborted)throw Object.assign(new Error('Character cancelled'),{code:'E_RENDER_CANCELLED'});checkTime(pose.context);if(pose.meshId!==asset.mesh.id||pose.skeletonId!==asset.skeleton.id||pose.matrices.length!==asset.skeleton.bones.length||JSON.stringify(pose.boneIds)!==JSON.stringify(asset.skeleton.bones.map(b=>b.id)))fail('POSE','Pose asset/bone ordering mismatch');
   const matrices=pose.matrices.flatMap((m,i)=>{if(m.length!==16||m[3]!==0||m[7]!==0||m[11]!==0||m[15]!==1)fail('POSE','Affine global bone matrix required');m.forEach(f32);return new Matrix4().fromArray(m).multiply(new Matrix4().fromArray(asset.skeleton.bones[i].inverseBindMatrix)).elements.map(f32);});
   const transform=await gpu.createBuffer({type:'f32',length:matrices.length},Float32Array.from(matrices));let result:GpuDataBuffer|undefined;
   try{result=await gpu.createField({type:'f32',dimensions:[n,1,1],components:3,semantic:'position',space:asset.mesh.coordinates.spaceId,units:'meter'});await gpu.dispatch(kernel,[rest,links,influence,transform,result],{workItems:[n,1,1],signal});return result;}catch(e){if(result)await gpu.releaseBuffer(result);throw e;}finally{await gpu.releaseBuffer(transform);}
  }
  return {/** Existing resident buffer ownership transfers to caller. No CPU export. */
   async deform(pose:CharacterPose,signal?:AbortSignal){if(busy)fail('BUSY','Await current character recording');busy=true;try{return await recordSkin(pose,signal);}finally{busy=false;}},
   async render(pose:CharacterPose,options:{signal?:AbortSignal;matrix?:Matrix;texture?:GpuPixelImage;sampling?:'nearest'|'linear';boundary?:'zero'|'clamp'}={}){
    object(options,['signal','matrix','texture','sampling','boundary'],'native character render options');if(!!uvs!==!!options.texture)fail('NATIVE_RESOURCE_REQUIRED','Borrowed texture mode requires exactly one explicit frame-local texture');if(!uvs&&(options.sampling!==undefined||options.boundary!==undefined)||options.sampling!==undefined&&!['nearest','linear'].includes(options.sampling)||options.boundary!==undefined&&!['zero','clamp'].includes(options.boundary))fail('PARAMETER','Invalid explicit texture sampling policy');
    if(options.texture){const info=options.texture.info;if(!['rgba16float','rgba32float'].includes(info.format)||Object.keys(linear709).some(k=>info.color[k as keyof typeof linear709]!==linear709[k as keyof typeof linear709]))fail('COLOR','Texture must be float scene-linear Rec709 with matching reference white');if(bytes+info.width*info.height*16>budget)fail('BUDGET','Borrowed texture exceeds full-value budget');}
    if(busy)fail('BUSY','Await current character recording');busy=true;let positions:GpuDataBuffer|undefined;
    try{positions=await recordSkin(pose,options.signal);const model=options.matrix?new Matrix4().fromArray(options.matrix):new Matrix4();model.elements.forEach(f32);const matrix=new Matrix4().fromArray(clip).multiply(model).elements.map(f32),image=await gpu.drawMesh({positions,indices,matrix,color:color as [number,number,number,number],...options.texture?{texture:{version:1 as const,image:options.texture,uvs:uvs!,filter:options.sampling??'linear' as const,addressU:options.boundary==='zero'?'transparent' as const:'clamp' as const,addressV:options.boundary==='zero'?'transparent' as const:'clamp' as const}}:{},output:{width,height,format,alpha:'premultiplied',color:linear709}});frames++;return image;}finally{if(positions)await gpu.releaseBuffer(positions);busy=false;}
   },stats:()=>({disposed,frames,vertices:n,bones:asset.skeleton.bones.length,plannedValueBytes:bytes,physicalGpuPeakBytes:null,geometryExport:false}),
   async dispose(){if(busy)fail('BUSY','Await current character recording');if(disposed)return;disposed=true;await Promise.all(owned.map(b=>gpu.releaseBuffer(b)));}
  };
 }catch(e){await Promise.all(owned.map(b=>gpu.releaseBuffer(b)));throw e;}
}
