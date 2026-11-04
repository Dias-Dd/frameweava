import {createCharacterRig} from '../puppet-effects/native.ts';
import type {NativeMeshRaster} from '../native-gpu/authoring.ts';
import {recordImageSkin} from './image-skin-recording.ts';
import type {CreationInit,CreationOptions,CreationImageResource,CreationStage,CameraOptions} from './types.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {linear709} from '../../src/media/surface.ts';
import {validateCreation,creationStage,requireInput,defaultCamera,fail} from './lifecycle.ts';
import {assetOptions,assetNumber} from './physics-assets.ts';
import {characterJoints} from './character-art.ts';
import {figureRig,type CharacterAction} from './character-poses.ts';
import {imageCharacterLayout,type ImageCharacterLayoutOptions} from './image-character-layout.ts';
import {imageFigureControls,type ImageCharacterControls} from './image-character-controls.ts';
import {publishImage} from './composition-core.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
export type {ImageCharacterJoints,ImageCharacterLayoutOptions} from './image-character-layout.ts';
export type {ImageCharacterXY,ImageJointPose,ImageJointTarget,ImageCharacterControls} from './image-character-controls.ts';
export interface ImageCharacterOptions extends CreationOptions,CameraOptions,ImageCharacterLayoutOptions,ImageCharacterControls {
 /** A declared input (default image), or existing declared resource. */
 image?:string|CreationImageResource;
 /** Immutable borrowed-input dimensions; omitted means current Stage extent. */
 imageSize?:readonly [number,number];margin?:number;maxBufferBytes?:number;
 sampling?:'linear'|'nearest';boundary?:'zero'|'clamp';
 raster?:NativeMeshRaster;
}
export interface ImageCharacterSceneOptions extends CreationOptions {
 actor:Omit<ImageCharacterOptions,'format'|'post'|'signal'|'finish'>;
 action?:CharacterAction;background?:Omit<GradientBackgroundOptions,'format'|'post'|'signal'|'finish'>;
}
const keys=['image','imageSize','joints','segments','height','binding','maxValueBytes','margin','maxBufferBytes','sampling','boundary','raster','camera','pose','targets','controls','rig','amount','frequency','phase','target'];
function snapshot<T extends CreationOptions>(o:T):T{const {post,signal,...data}=o;try{return {...structuredClone(data),post,signal} as T;}catch{fail('Image character needs serializable data and Core Signals');}}
function sourceSize(init:CreationInit,o:ImageCharacterOptions):readonly [number,number]{
 if(typeof o.image==='string'||o.image===undefined){if(o.image==='')fail('Image input name required');}
 else{assetOptions(o.image,['resource','size','decode','missingProfile'],'image resource');if(typeof o.image.resource!=='string'||!o.image.resource)fail('Declared image resource ID required');if(o.imageSize!==undefined)fail('Resource dimensions are image.size; imageSize is for borrowed inputs');if(o.image.decode!==undefined&&!['icc-sdr','surface-v2'].includes(o.image.decode)||o.image.missingProfile!==undefined&&!['error','assume-srgb'].includes(o.image.missingProfile))fail('Unknown image decoding policy');}
 const size=typeof o.image==='object'?o.image.size:o.imageSize??[init.width,init.height];if(!Array.isArray(size)||size.length!==2||size.some(n=>!Number.isSafeInteger(n)||n<1))fail('Image width/height must be positive integers');return size as [number,number];
}
function controlsCheck(o:ImageCharacterOptions){
 if(o.pose){assetOptions(o.pose,characterJoints,'image pose');for(const p of Object.values(o.pose))assetOptions(p,['move','rotate','scale'],'image joint pose');}
 if(o.targets){assetOptions(o.targets,['leftHand','rightHand','leftFoot','rightFoot'],'image targets');for(const p of Object.values(o.targets)){assetOptions(p,['at','weight','iterations'],'image target');if(p!.iterations!==undefined&&(!Number.isSafeInteger(p!.iterations)||p!.iterations<1))fail('Target iterations must be positive integers');}}
}
async function imageActor(init:CreationInit,options:ImageCharacterOptions,action:CharacterAction){
 validateCreation(init,options,keys);controlsCheck(options);const o=snapshot(options),[sw,sh]=sourceSize(init,o),margin=assetNumber(o.margin??.12,'image character margin',0,.49),format=o.format??'rgba32float';
 if(o.target!==undefined&&!['point','reach'].includes(action))fail('target is for imageCharacterPoint/Reach; use named targets otherwise');
 if(o.sampling!==undefined&&!['nearest','linear'].includes(o.sampling)||o.boundary!==undefined&&!['zero','clamp'].includes(o.boundary))fail('Unknown image sampling/boundary');
 const layout=imageCharacterLayout(sw,sh,o),rigConfig=figureRig(layout.asset,{rig:o.rig,pose:o.pose,targets:o.targets},action),[w,h]=layout.size,asset=layout.asset;
 const sourceBytes=sw*sh*16,baseBytes=asset.mesh.vertexIds.length*16*4+asset.mesh.indices.length*8+asset.skeleton.bones.length*64+init.width*init.height*36,budget=assetNumber(o.maxBufferBytes??256*1024**2,'maxBufferBytes',1,Number.MAX_SAFE_INTEGER);
 if(!Number.isSafeInteger(sourceBytes)||!Number.isSafeInteger(baseBytes)||baseBytes+sourceBytes>budget)fail('Complete image/skin plan exceeds maxBufferBytes','E_CREATION_BUDGET');
 return withGpuResources(init.gpu,async initArena=>{
  const rig=initArena.adopt(createCharacterRig(layout.asset,rigConfig),r=>r.dispose()),draw=initArena.adopt(await recordImageSkin(init.gpu,layout.asset,{width:init.width,height:init.height,camera:o.camera??{...defaultCamera,position:[0,h*.08,6],target:[0,h*.08,0],viewHeight:Math.max(h,w/(init.width/init.height))/(1-2*margin)},color:[1,1,1,1],format,maxBufferBytes:o.maxBufferBytes},o.raster),r=>r.dispose());let last:ReturnType<typeof rig.sample>['diagnostics']|undefined;
  const stage=creationStage(init,o,async(c,inputs)=>withGpuResources(init.gpu,async a=>{
   const source=o.image??'image';let image=typeof source==='string'?requireInput(inputs,source):a.image(await init.gpu.importResource({version:1,id:source.resource,decode:source.decode??'icc-sdr',missingProfile:source.missingProfile??'error',output:{width:sw,height:sh,format,alpha:'premultiplied',color:linear709}},{signal:o.signal}));
   if(image.info.width!==sw||image.info.height!==sh)fail('Image dimensions changed; declare imageSize and reopen this instance','E_CREATION_INPUT_SIZE');
   if(!['rgba16float','rgba32float'].includes(image.info.format)||!['premultiplied','straight','opaque'].includes(image.info.alpha)||image.info.color.transfer!=='linear'||image.info.color.reference!=='scene')fail('Image character needs an admitted float scene-linear image; use declared ICC/resource import for encoded sources','E_CREATION_IMAGE_COLOR');
   const convert=(Object.keys(linear709) as (keyof typeof linear709)[]).some(k=>image.info.color[k]!==linear709[k]),associate=image.info.alpha==='straight';
   if(baseBytes+sourceBytes*(1+Number(convert)+Number(associate))>budget)fail('Image color/Alpha preparation exceeds complete maxBufferBytes','E_CREATION_BUDGET');
   if(convert)image=a.image(await init.gpu.convertColor(image,{version:1,color:linear709,format:image.info.format,signal:o.signal}));
   if(image.info.alpha==='straight')image=a.image(await publishImage(init,image,image.info.format as 'rgba16float'|'rgba32float',o.signal));
   const pose=rig.sample(c,imageFigureControls(layout,o,action,c));last=pose.diagnostics;
   return a.keep(a.image(await draw.render(pose,{texture:image,sampling:o.sampling??'linear',boundary:o.boundary??'zero',signal:o.signal})));
  }),async()=>{try{await draw.dispose();}finally{rig.dispose();}},()=>({kind:'image-character',action,sourceSize:[sw,sh],geometry:'rectangular UV grid; original distance-to-bone weights, no image analysis/alpha contours',solver:last,renderer:draw.stats()}));initArena.keep(rig);initArena.keep(draw);return stage;
 });
}
export function imageCharacter(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'bind');}
export function imageCharacterIdle(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'idle');}
export function imageCharacterWave(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'wave');}
export function imageCharacterWalk(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'walk');}
export function imageCharacterRun(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'run');}
export function imageCharacterJump(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'jump');}
export function imageCharacterDance(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'dance');}
export function imageCharacterPoint(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'point');}
export function imageCharacterReach(init:CreationInit,o:ImageCharacterOptions){return imageActor(init,o,'reach');}
export async function imageCharacterScene(init:CreationInit,options:ImageCharacterSceneOptions){
 validateCreation(init,options,['actor','action','background']);if(options.action!==undefined&&!['bind','idle','wave','walk','run','jump','dance','point','reach'].includes(options.action))fail('Unknown image character action');const o=snapshot(options),parts:CreationStage[]=[];
 try{parts.push(gradientBackground(init,{center:[.28,.4,.43],edge:[.025,.05,.075],...o.background,format:o.format,signal:o.signal}));parts.push(await imageActor(init,{...o.actor,format:o.format,signal:o.signal,finish:false},o.action??'wave'));return await stackCreations(init,parts,{format:o.format,post:o.post,signal:o.signal,finish:o.finish});}catch(e){await Promise.allSettled(parts.map(p=>p.dispose?.()));throw e;}
}
