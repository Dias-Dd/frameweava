import {keyframes} from '../../../src/core/animation.ts';
import * as api from './index.ts';
import bundle from './examples/assets/slimsam-bundle.json';
import type {Prompt} from '../roto-authoring/types.ts';
export const width=614,height=410;
export const model=api.rotoModel(bundle);
export const prompts:readonly Prompt[]=[{id:'dog',position:[keyframes([{frame:0,value:340.5},{frame:199,value:341.5}]),250.5],label:'foreground'}];
export const reference=api.floatImageResource('photo',{width,height});
export const motion=api.motionField(Float32Array.from({length:width*height*3},(_,i)=>i%3===2?1:0));
const segment={softness:.1},refine={radius:1,strength:.6,feather:.5},overlay={opacity:.5,width:1};
export const cases:{name:string;effect:api.ImageEffect;direct:api.ImageEffect}[]=[
 {name:'segmentRoto',effect:api.segmentRoto(model,prompts,segment),direct:api.withPreparedEffects(model,async(i,f)=>(await f.segmentRoto(i,prompts,{...segment,id:'subject'})).image)},
 {name:'refinedRoto',effect:api.refinedRoto(model,prompts,{segment,refine}),direct:api.withPreparedEffects(model,async(i,f)=>f.refineRoto(i,await f.segmentRoto(i,prompts,{...segment,id:'subject'}),refine))},
 {name:'rotoEdgeOverlay',effect:api.rotoEdgeOverlay(model,prompts,{segment,overlay}),direct:api.withPreparedEffects(model,async(i,f)=>f.rotoEdgeOverlay(i,await f.segmentRoto(i,prompts,{...segment,id:'subject'}),overlay))},
 {name:'propagateRoto',effect:api.propagateRoto(model,reference,prompts,{...segment,flow:motion}),direct:api.withImageSources(api.withImageAssets(api.withPreparedEffects(model,async(i,f,frame)=>(await f.propagateRoto(i,await frame.input(reference),prompts,{...segment,id:'subject',flow:await frame.asset(motion)})).image),motion),reference)},
];
