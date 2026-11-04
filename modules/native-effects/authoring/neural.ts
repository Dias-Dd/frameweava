import {createNativeRotoEffects,parseRotoBundle,type RotoInspection} from '../roto-authoring/neural.ts';
import type {NativeRotoFilters,Prompt,Segment,Propagate,RotoRefine,RotoOverlay} from '../roto-authoring/types.ts';
import type {MotionField} from '../image-estimation/types.ts';
import type {ImageAsset,ImageEffect,ImageInput,ImageProcessor} from './types.ts';
import type {FieldInput} from './fields.ts';import {isFieldAsset,resolveField} from './fields.ts';
import {prepareImageEffects,withPreparedEffects} from './prepared.ts';import {authoringError,withImageAssets,withImageSources} from './runtime.ts';

export type RotoModel=ImageAsset<ImageProcessor<NativeRotoFilters>>;
export type RotoOptions=Omit<Segment,'id'>&{id?:string};
export type RotoPropagateOptions=Omit<Propagate,'id'|'flow'>&{id?:string;flow?:FieldInput<MotionField>};
/** Pure declaration, not installation, trust or runtime availability. Construct
 * once and reuse it across operations; Stage tools prepare/release its original
 * admitted model sessions once. No model download/runtime selection occurs here. */
export function rotoModel(value:unknown,inspection:RotoInspection={}):RotoModel {const bundle=parseRotoBundle(value);return prepareImageEffects(init=>createNativeRotoEffects(init,bundle,inspection));}
function options(value:RotoOptions):Segment {if(!value||typeof value!=='object'||Array.isArray(value))authoringError('roto.options','expected original segmentation controls');return {...value,id:value.id??'subject'};}
/** Physical-pixel prompt positions/labels and stable IDs use the existing
 * algorithm and Signal evaluator. Default subject identity is Stage-local. */
export function segmentRoto(model:RotoModel,prompts:readonly Prompt[],controls:RotoOptions={}):ImageEffect {const segment=options(controls);return withPreparedEffects(model,async(image,f)=>(await f.segmentRoto(image,prompts,segment)).image,'segmentRoto');}
export function refinedRoto(model:RotoModel,prompts:readonly Prompt[],controls:{segment?:RotoOptions;refine?:RotoRefine}={}):ImageEffect {if(!controls||typeof controls!=='object'||Array.isArray(controls)||Object.keys(controls).some(k=>!['segment','refine'].includes(k)))authoringError('refinedRoto.options','expected segment and refine controls');const segment=options(controls.segment??{});return withPreparedEffects(model,async(image,f)=>f.refineRoto(image,await f.segmentRoto(image,prompts,segment),controls.refine),'refinedRoto');}
export function rotoEdgeOverlay(model:RotoModel,prompts:readonly Prompt[],controls:{segment?:RotoOptions;overlay?:RotoOverlay}={}):ImageEffect {if(!controls||typeof controls!=='object'||Array.isArray(controls)||Object.keys(controls).some(k=>!['segment','overlay'].includes(k)))authoringError('rotoEdgeOverlay.options','expected segment and overlay controls');const segment=options(controls.segment??{});return withPreparedEffects(model,async(image,f)=>f.rotoEdgeOverlay(image,await f.segmentRoto(image,prompts,segment),controls.overlay),'rotoEdgeOverlay');}
/** Reference and optional current→reference flow are explicit same-frame
 * inputs. There is no hidden history or automatic upstream Stage sampling. */
export function propagateRoto(model:RotoModel,reference:ImageInput,prompts:readonly Prompt[],controls:RotoPropagateOptions={}):ImageEffect {if(!controls||typeof controls!=='object'||Array.isArray(controls))authoringError('propagateRoto.options','expected original propagation controls');const {flow,...rest}=controls,segment={...rest,id:rest.id??'subject'};
 const operation=withPreparedEffects(model,async(image,f,frame)=>{const other=await frame.input(reference),motion=flow===undefined?undefined:await resolveField(flow,frame);return (await f.propagateRoto(image,other,prompts,{...segment,...(motion?{flow:motion}:{})})).image;},'propagateRoto');return withImageSources(flow!==undefined&&isFieldAsset(flow)?withImageAssets(operation,flow):operation,reference);
}
export type {Prompt as RotoPrompt} from '../roto-authoring/types.ts';
