import type {CreationColor,StaticCreationColor} from './colors.ts';
import {creationColor} from './colors.ts';
import {createCharacterRig,createNativeCharacterRenderer,validateCharacterAsset,type CharacterAsset} from '../puppet-effects/native.ts';
import {withGpuResources} from '../gpu-effects/resource-arena.ts';
import {linear709,toHalf} from '../../src/media/surface.ts';
import type {CreationInit,CreationOptions,CreationStage,CameraOptions,AnimatedVec3} from './types.ts';
import type {Signal} from '../../src/core/types.ts';
import {creationStage,validateCreation,scalar,vector,defaultCamera,fail} from './lifecycle.ts';
import {assetOptions} from './physics-assets.ts';
import {characterArtwork,characterPalette,characterJoints,type CharacterJoint,type CharacterPaint} from './character-art.ts';
import {figureRig,figureControls,type FigureControls,type FigureMotion,type CharacterAction} from './character-poses.ts';
import {gradientBackground,stackCreations,type GradientBackgroundOptions} from './composition.ts';
import {confettiField,type ParticleFieldOptions} from './particle-field.ts';
export type {CharacterJoint,CharacterPaint} from './character-art.ts';
export type {FigurePose,FigureTarget,CharacterEnd,CharacterAction,CharacterJointMap,FigureControls} from './character-poses.ts';
export interface PuppetCharacterOptions extends CreationOptions,CameraOptions,FigureControls {
 /** Existing standard Graphics pair; omitted means original paper-figure art. */
 asset?:CharacterAsset;detail?:number;maxValueBytes?:number;maxBufferBytes?:number;
 palette?:Partial<Record<CharacterPaint,CreationColor>>;
 /** Multiplies built-in paint, or selects a custom asset's solid linear RGB. */
 ink?:CreationColor;opacity?:Signal<number>;
}
export interface CharacterActionOptions extends PuppetCharacterOptions,FigureMotion {}
export interface CharacterSceneOptions extends CreationOptions {
 action?:CharacterAction;actor?:Omit<CharacterActionOptions,'format'|'post'|'signal'|'finish'>;
 background?:Omit<GradientBackgroundOptions,'format'|'post'|'signal'|'finish'>;
 confetti?:false|Omit<ParticleFieldOptions,'format'|'post'|'signal'|'finish'|'backgroundInput'>;
}
const basicKeys=['asset','detail','maxValueBytes','maxBufferBytes','palette','ink','opacity','camera','joints','pose','targets','controls','rig'],motionKeys=['amount','frequency','phase','target'];
function snapshot<T extends CreationOptions>(o:T):T{const {post,signal,...data}=o;try{return {...structuredClone(data),post,signal} as T;}catch{fail('Character options need serializable data and Core Signals');}}
function checkControls(o:PuppetCharacterOptions){
 if(o.joints){assetOptions(o.joints,characterJoints,'joint aliases');for(const name of Object.values(o.joints))if(typeof name!=='string'||!name)fail('Joint alias must name an existing bone');}
 if(o.palette)assetOptions(o.palette,Object.keys(characterPalette),'character palette');
 if(o.pose){assetOptions(o.pose,characterJoints,'figure pose');for(const p of Object.values(o.pose))assetOptions(p,['move','rotate','scale'],'joint pose');}
 if(o.targets){assetOptions(o.targets,['leftHand','rightHand','leftFoot','rightFoot'],'figure targets');for(const t of Object.values(o.targets)){assetOptions(t,['at','weight','iterations'],'figure target');if(t!.iterations!==undefined&&(!Number.isSafeInteger(t!.iterations)||t!.iterations<1))fail('Target iterations must be a positive integer');}}
}
async function character(init:CreationInit,options:CharacterActionOptions,action:CharacterAction){
 validateCreation(init,options,[...basicKeys,...action==='bind'?[]:motionKeys]);checkControls(options);if(options.target!==undefined&&!['point','reach'].includes(action))fail('target is for characterPoint/characterReach; use targets for explicit IK');
 const o=snapshot(options),format=o.format??'rgba32float',builtin=!o.asset,asset=builtin?characterArtwork(o.detail,o.maxValueBytes):validateCharacterAsset(o.asset);
 if(!builtin){if(o.palette!==undefined||o.detail!==undefined)fail('Custom assets use ink and existing topology; palette/detail are paper-figure controls');if(asset.mesh.material?.texture)fail('Custom textured assets require the existing explicit low-level texture adapter; no implicit resource load','E_CREATION_CHARACTER_MATERIAL');if(asset.mesh.material?.baseColor&&o.ink===undefined)fail('Custom sRGB material requires an explicit scene-linear ink override','E_CREATION_CHARACTER_MATERIAL');if(!asset.mesh.uv){asset.mesh.uv=asset.mesh.vertexIds.map(()=>[.5,.5]);asset.mesh.uvOrigin='top-left';}}
 const colors=builtin?Object.keys(characterPalette) as CharacterPaint[]:['shirt' as const],count=colors.length,rigConfig=figureRig(asset,o,action);
 return withGpuResources(init.gpu,async a=>{
  const rig=a.adopt(createCharacterRig(asset,rigConfig),r=>r.dispose()),draw=a.adopt(await createNativeCharacterRenderer(init.gpu,asset,{width:init.width,height:init.height,camera:o.camera??{...defaultCamera,position:[0,.2,6],target:[0,.2,0],viewHeight:Math.max(3.6,3/(init.width/init.height))},color:[1,1,1,1],format,maxBufferBytes:o.maxBufferBytes,texture:'borrowed'}),r=>r.dispose());
  const palette=await init.gpu.compile({abiVersion:1,id:'frameweave/spatial-creation/character-palette-'+count,version:'0.1.0',inputCount:0,parameterWords:count*4,code:'fn pixel(p:vec2u)->vec4f{let k=min(p.x,'+(count-1)+'u)*4u;let a=paramF32(k+3u);return vec4f(vec3f(paramF32(k),paramF32(k+1u),paramF32(k+2u))*a,a);}'});
  let last:ReturnType<typeof rig.sample>['diagnostics']|undefined;
  const stage=creationStage(init,o,async c=>withGpuResources(init.gpu,async frame=>{
   const tint=creationColor(o.ink??(builtin?[1,1,1]:[.04,.42,.54]),c,'character ink'),opacity=scalar(o.opacity??1,c,'character opacity',0,1);
   if(format==='rgba16float'&&opacity>0&&(toHalf(Math.fround(opacity))&0x7fff)===0)fail('F16 would lose character Alpha; choose rgba32float','E_CREATION_CHARACTER_COLOR');
   const params=colors.flatMap(name=>{const rgb=builtin?creationColor(o.palette?.[name]??characterPalette[name],c,'palette '+name).map((v,k)=>v*tint[k]):tint;return [...rgb,opacity];});
   if(params.some(v=>!Number.isFinite(v)||!Number.isFinite(Math.fround(v))||v!==0&&Math.fround(v)===0||format==='rgba16float'&&(toHalf(v)&0x7c00)===0x7c00))fail('Character palette exceeds the selected finite float format','E_CREATION_CHARACTER_COLOR');
   const paint=frame.image(await init.gpu.run(palette,[],{parameters:Float32Array.from(params),output:{width:count,height:1,format,alpha:'premultiplied',color:linear709},signal:o.signal})),pose=rig.sample(c,figureControls(o,action,c));last=pose.diagnostics;
   return frame.keep(frame.image(await draw.render(pose,{texture:paint,sampling:'nearest',boundary:'clamp',signal:o.signal})));
  }),async()=>{try{await draw.dispose();}finally{rig.dispose();}},()=>({kind:'puppet-character',action,asset:builtin?'authored paper figure':'explicit Graphics pair',jointConvention:'builtin right=+X, left=-X; custom aliases explicit',palette:'tiny GPU-generated PM linear709 palette; no CPU image',solver:last,renderer:draw.stats()}));a.keep(rig);a.keep(draw);return stage;
 });
}
export function puppetCharacter(init:CreationInit,o:PuppetCharacterOptions={}){return character(init,o,'bind');}
export function characterIdle(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'idle');}
export function characterWave(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'wave');}
export function characterWalk(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'walk');}
export function characterRun(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'run');}
export function characterJump(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'jump');}
export function characterDance(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'dance');}
export function characterPoint(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'point');}
export function characterReach(init:CreationInit,o:CharacterActionOptions={}){return character(init,o,'reach');}
export async function characterScene(init:CreationInit,options:CharacterSceneOptions={}){
 validateCreation(init,options,['action','actor','background','confetti']);if(options.action!==undefined&&!['bind','idle','wave','walk','run','jump','dance','point','reach'].includes(options.action))fail('Unknown character action');const o=snapshot(options),parts:CreationStage[]=[];
 try{parts.push(gradientBackground(init,{center:[.32,.42,.4],edge:[.035,.06,.085],...o.background,format:o.format,signal:o.signal}));if(o.confetti!==false&&o.confetti!==undefined)parts.push(await confettiField(init,{initialCount:35,rate:8,opacity:.5,...o.confetti,format:o.format,signal:o.signal}));parts.push(await character(init,{...o.actor,format:o.format,signal:o.signal,finish:false},o.action??'wave'));return await stackCreations(init,parts,{format:o.format,post:o.post,signal:o.signal,finish:o.finish});}catch(e){await Promise.allSettled(parts.map(s=>s.dispose?.()));throw e;}
}
