import {creationColor} from './colors.ts';
import {createTrailGeometry,createNativeMeshRenderer,createSkeletonRig,createNativeSkinnedRenderer} from '../skeletal-effects/native.ts';
import type {RigControls,MeshData,SkeletonData} from '../skeletal-effects/native.ts';
import {createNativePuppetTools,createNativePuppetRenderer} from '../puppet-effects/native.ts';
import type {PuppetOptions,PuppetConstraints} from '../puppet-effects/src/types.ts';
import type {ModuleLoader} from '../../src/plugins/sdk.ts';
import type {Signal} from '../../src/core/types.ts';
import type {CreationInit,CreationOptions,CameraOptions,MaterialOptions} from './types.ts';
import {creationStage,defaultCamera,scalar,vector,material,requireInput,fail,validateCreation,materialKeys} from './lifecycle.ts';

export interface SilkRibbonOptions extends CreationOptions,CameraOptions,MaterialOptions {
  /** Authored procedural motion, not a cloth solver. Dimensions in meters; radians and seconds. */
  length?:Signal<number>;width?:Signal<number>;amplitude?:Signal<number>;turns?:Signal<number>;
  speed?:Signal<number>;phase?:Signal<number>;twist?:Signal<number>;
  segments?:number;maxRayTests?:number;maxBytes?:number;
  strands?:number;spacing?:Signal<number>;phaseShift?:Signal<number>;
}
/** Existing parallel-transport ribbon topology + Native GGX shading. Camera,
 * three-point lighting and tapered fabric silhouette are ready to use. */
export async function silkRibbon(init:CreationInit,options:SilkRibbonOptions={}){
 validateCreation(init,options,[...materialKeys,'camera','length','width','amplitude','turns','speed','phase','twist','segments','maxRayTests','maxBytes','strands','spacing','phaseShift']);
 const {post,signal,...raw}=options,o=structuredClone(raw),segments=o.segments??64;
 if(!Number.isSafeInteger(segments)||segments<4)fail('Ribbon segments must be an integer >=4');
 const count=o.strands??1;if(!Number.isSafeInteger(count)||count<1)fail('Ribbon strands must be a positive integer');
 const plan=count*(segments+1)*2*72+init.width*init.height*16;if(!Number.isSafeInteger(plan)||plan>(o.maxBytes??512*1024**2))fail('Complete ribbon geometry and image plan exceeds maxBytes','E_CREATION_BUDGET');
 const ribbons:ReturnType<typeof createTrailGeometry>[]=[];try{for(let i=0;i<count;i++)ribbons.push(createTrailGeometry({id:'creation.silk.'+i,kind:'ribbon',pointCount:segments+1,maxBytes:o.maxBytes}));}catch(e){for(const r of ribbons)r.dispose();throw e;}
 let image:Awaited<ReturnType<typeof createNativeMeshRenderer>>;
 try{image=await createNativeMeshRenderer(init.gpu,ribbons.flatMap(r=>r.meshes),{width:init.width,height:init.height,shading:'standard',normals:'smooth',side:'double',maxBytes:o.maxBytes,maxRayTests:o.maxRayTests});}catch(e){for(const r of ribbons)r.dispose();throw e;}
 return creationStage(init,{...o,post,signal},async c=>{
  const length=scalar(o.length??5,c,'length',.001),width=scalar(o.width??.48,c,'width',.001),a=scalar(o.amplitude??.6,c,'amplitude',0),turns=scalar(o.turns??1.15,c,'turns'),phase=scalar(o.phase??0,c,'phase')+c.time*scalar(o.speed??.65,c,'speed'),twist=scalar(o.twist??4.5,c,'twist'),spacing=scalar(o.spacing??.22,c,'spacing'),shift=scalar(o.phaseShift??.7,c,'phaseShift');
  const objects=ribbons.flatMap((r,j)=>{const p=phase+j*shift,points:[number,number,number][]=Array.from({length:segments+1},(_,i)=>{const u=i/segments,s=u*Math.PI*2*turns+p;return [(u-.5)*length,Math.sin(s)*a+(j-(count-1)/2)*spacing,Math.cos(s*.73+.4)*a*.9+j*.07];});
   const radius=points.map((_,i)=>width*.5*(.1+.9*Math.sin(Math.PI*i/segments)**.6)),rotation=points.map((_,i)=>p*.55+twist*(i/segments-.5));
   const geometry=r.sample({points,radius,twist:rotation,context:c}),appearance=material({...o,ink:o.ink??(j%3===0?[.9,.23,.08]:j%3===1?[.12,.5,.62]:[.9,.55,.2]),roughness:o.roughness??.32,metalness:o.metalness??.3},c);return geometry.draws.map(d=>({...d,appearance}));});
  return image.render({context:c,camera:o.camera??{...defaultCamera,position:[.3,.4,6],viewHeight:3.4},objects,lighting:{ambient:[.12,.15,.2],directional:[{direction:[.2,.5,3],color:[1,.82,.64],intensity:4},{direction:[-1,-.2,2],color:[.25,.55,1],intensity:1.7},{direction:[0,1,-1],color:[.55,.8,1],intensity:2}]},format:o.format??'rgba32float',signal});
 },async()=>{await image.dispose();for(const r of ribbons)r.dispose();},()=>({kind:'silk-ribbon',motion:'absolute Stage time; procedural, not cloth physics',geometry:ribbons.map(r=>r.describe()),renderer:image.stats()}));
}

export interface CharacterMotionOptions extends CreationOptions,CameraOptions,Pick<MaterialOptions,'ink'|'opacity'> {asset:{mesh:MeshData;skeleton:SkeletonData};controls?:RigControls;maxBytes?:number}
/** Standard Graphics asset, existing FK/IK controls and GPU skinning. */
export async function characterMotion(init:CreationInit,options:CharacterMotionOptions){
 validateCreation(init,options,['ink','opacity','camera','asset','controls','maxBytes']);
 const {post,signal,...raw}=options,o=structuredClone(raw),rig=await createSkeletonRig(o.asset.mesh,o.asset.skeleton);let image:Awaited<ReturnType<typeof createNativeSkinnedRenderer>>;
 try{image=await createNativeSkinnedRenderer(init.gpu,rig,{width:init.width,height:init.height,maxBytes:o.maxBytes});}catch(e){rig.dispose();throw e;}
 return creationStage(init,{...o,post,signal},async c=>image.render(rig.sample(c,o.controls),{camera:o.camera??defaultCamera,ink:creationColor(o.ink??[.15,1.6,.85],c,'character ink'),opacity:scalar(o.opacity??1,c,'opacity',0,1),format:o.format??'rgba32float',signal}),async()=>{await image.dispose();rig.dispose();},()=>({kind:'character',control:'existing FK/IK; unlit GPU skin',renderer:image.stats()}));
}
export interface PuppetCardOptions extends CreationOptions {
 mesh:MeshData;textureInput:string;
 /** Named mesh vertex pins, each coordinate uses existing scalar Signals. */
 pins:Readonly<Record<string,readonly [Signal<number>,Signal<number>]>>;
 constraints?:Omit<PuppetConstraints,'pins'>;
 solver?:Omit<PuppetOptions,'worker'|'signal'>;
 bounds?:{left:number;right:number;bottom:number;top:number};
}
export async function puppetCard(init:CreationInit,options:PuppetCardOptions,load?:ModuleLoader){
 if(!load)fail('Puppet requires its existing verified ModuleLoader and explicit WASM authorization','E_CREATION_SERVICE');
 validateCreation(init,options,['mesh','textureInput','pins','constraints','solver','bounds']);
 const {post,signal,...raw}=options,o=structuredClone(raw),solver=await createNativePuppetTools(load).createPuppet(o.mesh,{...o.solver,signal});let image:Awaited<ReturnType<typeof createNativePuppetRenderer>>;
 try{image=await createNativePuppetRenderer(init.gpu,o.mesh,{width:init.width,height:init.height,bounds:o.bounds});}catch(e){await solver.dispose();throw e;}
 return creationStage(init,{...o,post,signal},async(c,inputs)=>{const source=requireInput(inputs,o.textureInput),pins=Object.entries(o.pins).map(([vertexId,p])=>({vertexId,position:[scalar(p[0],c,'pin x'),scalar(p[1],c,'pin y')] as [number,number]})),pose=await solver.solve({...o.constraints,pins});return image.render(pose.positions,source,{format:o.format??'rgba32float',signal});},async()=>{await image.dispose();await solver.dispose();},()=>({kind:'puppet',solver:'existing EffectCraft-derived Rust/WASM ARAP',renderer:image.stats()}));
}
