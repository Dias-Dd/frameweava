import {cloneEditData as structuredClone} from './data.ts';
import type {TransitionOptions,ColorTransitionOptions,DirectionalWipeOptions,IrisWipeOptions,MoveTransitionOptions} from '../creation-capabilities/transitions.ts';
import type {EditClip,EditTrack,PlacedClip} from './types.ts';
import {at,editInteger} from './authoring.ts';
import {EngineError} from '../../src/core/errors.ts';
interface Options {crossDissolve:TransitionOptions;fadeThroughColor:ColorTransitionOptions;directionalWipe:DirectionalWipeOptions;irisWipe:IrisWipeOptions;pushTransition:MoveTransitionOptions}
export type EditTransitionName=keyof Options;
export type EditTransition={[N in EditTransitionName]:{readonly name:N;readonly duration:number;readonly options:Omit<Options[N],'signal'|'format'>}}[EditTransitionName];
export const editTransitionNames=['crossDissolve','fadeThroughColor','directionalWipe','irisWipe','pushTransition'] as const;
export function transitionError(message:string):never{throw new EngineError('E_EDIT_TRANSITION',message);}
/** Existing Native transition, over an explicit overlap of the two declared clips. */
export function transition<N extends EditTransitionName>(name:N,options:{duration:number}&Omit<Options[N],'signal'|'format'>):Extract<EditTransition,{name:N}>{
 if(!editTransitionNames.includes(name))transitionError('Unknown editing transition: '+name);editInteger(options?.duration,'transition duration',1);
 if(Object.hasOwn(options,'signal')||Object.hasOwn(options,'format'))transitionError('Signal cancellation and format belong to the Stage');
 const {duration,...parameters}=options;try{return structuredClone({name,duration,options:parameters}) as unknown as Extract<EditTransition,{name:N}>;}catch{transitionError('Use data and Core Signals in transition options');}
}
export function validateTransition(t:EditTransition){if(!t||Object.keys(t).some(k=>!['name','duration','options'].includes(k)))transitionError('Invalid transition description');transition(t.name,{...t.options,duration:t.duration});}
/** Overlaps existing tails/heads. No extra source handles or upstream Stage are invented. */
export function sequenceWithTransitions(clips:readonly EditClip[],cuts:EditTransition|readonly (EditTransition|null)[]):EditTrack {
 const values=Array.isArray(cuts)?cuts:Array.from({length:Math.max(0,clips.length-1)},()=>cuts as EditTransition);
 if(values.length!==Math.max(0,clips.length-1))transitionError('Supply one transition or one optional transition per boundary');let end=0;const output:PlacedClip[]=[];
 for(const [index,c]of clips.entries()){const t=index?values[index-1]:undefined;if(t)validateTransition(t);if(t&&(t.duration>c.duration||t.duration>clips[index-1].duration))transitionError('An overlap must fit both declared clips');const placed={...at(end-(t?.duration??0),c),...t?{transition:structuredClone(t)}:{}};if(index>1&&placed.at<output[index-2].at+output[index-2].clip.duration)transitionError('Incoming and outgoing transitions may not overlap inside the middle clip');output.push(placed);end=editInteger(placed.at+c.duration,'sequence duration');}
 return output;
}
