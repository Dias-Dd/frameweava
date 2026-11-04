// SPDX-License-Identifier: MIT
import {Matrix4,OrthographicCamera,PerspectiveCamera,Vector3} from 'three';
import type {MeshData} from '../graphics-contracts/types.ts';
import type {GpuPixelImage,GpuPixelKernel} from '../gpu-effects/pixel-types.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {linear709} from '../../src/media/surface.ts';
import type {SpatialCamera} from '../spatial-fields/types.ts';
import {constantImage} from './composition-core.ts';
import type {CreationInit,CreationOptions,CreationImageResource,CameraOptions} from './types.ts';
import {creationStage,validateCreation,requireInput,fail,defaultCamera,scalar} from './lifecycle.ts';
import {creationColor,type CreationColor} from './colors.ts';
import {assetNumber} from './physics-assets.ts';
import {shatterPattern,extrudeShatterFragments,fractureMesh,shatterPose,type ShatterCell,type ShatterFragment,type ShatterMotion,type ShatterPatternOptions} from './shatter-geometry.ts';
export interface ShatterImageOptions extends CreationOptions,CameraOptions,ShatterMotion {
 image:string|CreationImageResource;pattern?:ShatterPatternOptions['pattern'];cells?:readonly ShatterCell[];
 size?:readonly [number,number];cell?:number;thickness?:number;gap?:number;interior?:CreationColor;interiorOpacity?:import('../../src/core/types.ts').Signal<number>;
 maxCells?:number;maxVertices?:number;maxTriangles?:number;
}
export interface ShatterMeshOptions extends Omit<ShatterImageOptions,'pattern'|'cells'|'size'|'cell'|'gap'|'maxCells'> {asset:MeshData}
const meshKeys=['image','asset','pattern','cells','size','cell','thickness','gap','interior','interiorOpacity','camera','maxCells','maxVertices','maxTriangles','blasts','gravity','drag','tumble','randomness','massVariation','seed','amount'];
const atlasPrograms=new WeakMap<CreationInit['gpu'],Promise<GpuPixelKernel>>();
function projection(init:CreationInit,camera:SpatialCamera=defaultCamera){
 const number=(n:number,name:string,min=-Infinity)=>assetNumber(n,name,min);if(!['orthographic','perspective'].includes(camera.projection)||camera.position.length!==3||camera.target.length!==3)fail('Expected a standard spatial camera');camera.position.forEach(x=>number(x,'camera position'));camera.target.forEach(x=>number(x,'camera target'));number(camera.near,'near',Number.MIN_VALUE);number(camera.far,'far',Number.MIN_VALUE);if(camera.near>=camera.far||new Vector3(...camera.position).distanceTo(new Vector3(...camera.target))===0)fail('Invalid camera range/direction');
 const aspect=init.width/init.height;let view:OrthographicCamera|PerspectiveCamera;if(camera.projection==='orthographic'){const h=number(camera.viewHeight,'viewHeight',Number.MIN_VALUE);view=new OrthographicCamera(-h*aspect/2,h*aspect/2,h/2,-h/2,camera.near,camera.far);}else view=new PerspectiveCamera(number(camera.verticalFov,'verticalFov',.01),aspect,camera.near,camera.far);view.position.set(...camera.position);view.up.set(...camera.up??[0,1,0]);view.lookAt(...camera.target);view.updateMatrixWorld();return new Matrix4().set(1,0,0,0,0,1,0,0,0,0,.5,.5,0,0,0,1).multiply(new Matrix4().multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse)).elements;
}
async function createShatter(init:CreationInit,options:ShatterImageOptions|ShatterMeshOptions,fragments:ShatterFragment[]){
 const {post,signal,...raw}=options,o={...structuredClone(raw),post,signal},g=init.gpu,matrix=projection(init,o.camera),count=fragments.reduce((n,f)=>n+f.indices.length,0),vertices=fragments.reduce((n,f)=>n+f.positions.length,0);
 if(!Number.isSafeInteger(vertices)||vertices>(o.maxVertices??1000000)||count/3>(o.maxTriangles??100000))fail('Shatter geometry exceeds configurable budget','E_CREATION_BUDGET');
 const limits=g.capabilities().limits;if(vertices*12>Math.min(limits.maxBufferSize,limits.maxStorageBufferBindingSize)||count*4>limits.maxBufferSize)fail('Shatter geometry exceeds actual device buffer limits','E_CREATION_BUDGET');
 if(typeof o.image!=='string'){if(!o.image||typeof o.image.resource!=='string'||!Array.isArray(o.image.size)||o.image.size.length!==2||o.image.size.some(v=>!Number.isSafeInteger(v)||v<1))fail('Shatter image requires a declared resource with positive dimensions');}else if(!o.image)fail('Shatter image input name must not be empty');
 const indices=new Uint32Array(Math.max(3,count));let k=0,offset=0;for(const f of fragments){for(const i of f.indices)indices[k++]=i+offset;offset+=f.positions.length;}
 const topology=await g.createBuffer({type:'u32',length:indices.length},indices);let closed=false;
 try{return creationStage(init,o,async(c,inputs)=>{
  const source=typeof o.image==='string'?{image:requireInput(inputs,o.image),owned:false}:{image:await g.importResource({version:1,id:o.image.resource,decode:o.image.decode??'icc-sdr',missingProfile:o.image.missingProfile??'error',output:{width:o.image.size[0],height:o.image.size[1],format:o.format??'rgba32float',alpha:'premultiplied',color:linear709}},{signal}),owned:true};
  try{if(source.image.info.color.transfer!=='linear'||source.image.info.color.primaries!=='rec709'||!['premultiplied','opaque'].includes(source.image.info.alpha))fail('Shatter source must be explicit scene-linear Rec709 PM/opaque');
   if(!count)return await constantImage(init,[0,0,0,0],o.format??'rgba32float',signal);
   return await withGpuResources(g,async a=>{let compiled=atlasPrograms.get(g);if(!compiled){compiled=g.compile({abiVersion:1,id:'frameweave/shatter/material-atlas',version:'0.1.0',inputCount:1,parameterWords:8,code:'fn pixel(p:vec2u)->vec4f{let w=paramU32(0u);if(p.x<=w+1u){return read0(vec2i(clamp(i32(p.x)-1,0,i32(w)-1),i32(p.y)));}let a=paramF32(7u);return vec4f(paramF32(4u)*a,paramF32(5u)*a,paramF32(6u)*a,a);}'}).catch(e=>{atlasPrograms.delete(g);throw e;});atlasPrograms.set(g,compiled);}
    const width=source.image.info.width,atlasWidth=width+4,p=new Float32Array(8);new Uint32Array(p.buffer)[0]=width;p.set(creationColor(o.interior??[.07,.18,.24],c,'fragment interior'),4);p[7]=scalar(o.interiorOpacity??1,c,'interiorOpacity',0,1);
    const motion:ShatterMotion={};for(const key of ['blasts','gravity','drag','tumble','randomness','massVariation','seed','amount'] as const)if(o[key]!==undefined)(motion as Record<string,unknown>)[key]=o[key];
    const atlas=a.image(await g.run(await compiled,[source.image],{parameters:p,output:{...source.image.info,width:atlasWidth,format:o.format??'rgba32float',alpha:'premultiplied'},signal})),positions=new Float32Array(Math.max(9,vertices*3)),uvs=new Float32Array(Math.max(6,vertices*2)),models=shatterPose(fragments,c,motion),v=new Vector3();let at=0;
    for(let j=0;j<fragments.length;j++){const f=fragments[j],transform=new Matrix4().fromArray(models[j]);for(let i=0;i<f.positions.length;i++){v.set(...f.positions[i]).applyMatrix4(transform);for(const value of v.toArray())if(!Number.isFinite(Math.fround(value)))fail('Shatter position is not representable in F32');positions.set(v.toArray(),at*3);uvs.set(f.interior[i]?[(width+2.5)/atlasWidth,.5]:[(1+f.uvs[i][0]*width)/atlasWidth,f.uvs[i][1]],at*2);at++;}}
    const pos=a.buffer(await g.createField({type:'f32',dimensions:[Math.max(3,vertices),1,1],components:3,semantic:'position',space:'creation.world',units:'meter'},positions)),tex=a.buffer(await g.createField({type:'f32',dimensions:[Math.max(3,vertices),1,1],components:2,semantic:'generic'},uvs));
    return g.drawMesh({positions:pos,indices:topology,count,matrix,color:[1,1,1,1],texture:{version:1,image:atlas,uvs:tex,filter:'linear',addressU:'clamp',addressV:'clamp'},raster:{version:1,mode:'depth-peel'},output:{width:init.width,height:init.height,format:o.format??'rgba32float',alpha:'premultiplied',color:linear709}});
   });
  }finally{if(source.owned)await g.release(source.image);}
 },async()=>{if(closed)return;closed=true;await g.releaseBuffer(topology);},()=>({kind:'shatter',fragments:fragments.length,triangles:count/3,vertices,motion:'absolute-time damped ballistic factors; grouped fragments; explicit blast times',render:'existing Native textured depth-peel; padded GPU atlas; true front/back/interior geometry'}));}catch(e){await g.releaseBuffer(topology);throw e;}
}
/** Cuts a real image into reusable convex fragments; callers never manage its
 * geometry buffers, atlas or temporary images. Input remains borrowed. */
export function shatterImage(init:CreationInit,o:ShatterImageOptions){
 validateCreation(init,o,meshKeys);const size=o.size??[3,1.7],cells=o.cells??shatterPattern({pattern:o.pattern,size,cell:o.cell,seed:o.seed??init.seed,maxCells:o.maxCells});return createShatter(init,o,extrudeShatterFragments(cells,{size,thickness:o.thickness,gap:o.gap,maxVertices:o.maxVertices}));
}
export function shatterMesh(init:CreationInit,o:ShatterMeshOptions){validateCreation(init,o,meshKeys);return createShatter(init,o,fractureMesh(o.asset,{thickness:o.thickness,maxVertices:o.maxVertices}));}
