// SPDX-License-Identifier: Apache-2.0
import type {Signal} from '../../src/core/types.ts';
import type {CreationInit,CreationOptions} from './types.ts';
import type {CharacterDocument,CharacterAnimationControls} from './character-assets.ts';
import {createCharacterAnimator,characterDocument} from './character-animation.ts';
import {createCharacterRenderer,type CharacterRenderOptions} from './character-renderer.ts';
import {validateCreation,creationStage,scalar} from './lifecycle.ts';
export interface CharacterActorOptions extends CreationOptions,Omit<CharacterRenderOptions,'width'|'height'|'format'> {
 asset:CharacterDocument;controls?:CharacterAnimationControls;opacity?:Signal<number>;
 /** Omitted controls play the first imported clip; explicit clips:[] gives bind pose. */
}
/** Imported character -> retained real Three mixer -> GPU morph/CSR skin ->
 * float PM image. Controls use the existing absolute FrameContext and Signals.
 * No automatic network, file access, code execution or WASM authorization. */
export async function characterActor(init:CreationInit,options:CharacterActorOptions){
 validateCreation(init,options,['asset','controls','opacity','camera','shading','textures','maxBytes','maxWork','maxRayTests','ambient','lights']);
 const {post,signal,...data}=options,o={...structuredClone(data),post,signal},asset=characterDocument(o.asset),animator=await createCharacterAnimator(asset);
 let renderer:Awaited<ReturnType<typeof createCharacterRenderer>>|undefined;
 try{renderer=await createCharacterRenderer(init.gpu,asset,{width:init.width,height:init.height,format:o.format,camera:o.camera,shading:o.shading,textures:o.textures,maxBytes:o.maxBytes,maxRayTests:o.maxRayTests,ambient:o.ambient,lights:o.lights});
 const draw=renderer;return creationStage(init,o,async(c,inputs)=>draw.render(animator.sample(c,o.controls??{clips:asset.clips.length?[{clip:asset.clips[0].id}]:[]}),inputs,{opacity:scalar(o.opacity??1,c,'actor opacity',0,1),signal}),async()=>{animator.dispose();await draw.dispose();},()=>({kind:'character-actor',asset:asset.id,animation:'retained Three AnimationMixer; absolute time reset',gpu:draw.stats()}));
 }catch(e){animator.dispose();await renderer?.dispose();throw e;}
}
