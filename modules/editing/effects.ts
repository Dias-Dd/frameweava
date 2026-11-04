import {cloneEditData as structuredClone} from './data.ts';
import type {ProfessionalFilters} from '../gpu-image-effects/resident/filters.ts';
import type {NativePaImageFilters} from '../native-effects/pa/filters.ts';
import {EngineError} from '../../src/core/errors.ts';
import type {EditClip} from './types.ts';
export const editEffectNames=['exposure','brightnessContrast','hueSaturation','vibrance','levels','curves','channelMix','blackAndWhite','tint','tritone','colorBalance','vignette','filmGrain','pixelate','lumaKey','chromaKey','despill','unsharpMask','blur','glow'] as const;
export type EditEffectName=typeof editEffectNames[number];
export type EditFilters=ProfessionalFilters&Pick<NativePaImageFilters,'blur'|'glow'>;
type DataOptions<T>=Omit<T,'format'|'signal'|'alpha'|'workingColor'>;
export type EditEffectOptions<N extends EditEffectName>=N extends 'blur'|'glow'?Partial<DataOptions<NonNullable<Parameters<EditFilters[N]>[1]>>>:DataOptions<NonNullable<Parameters<EditFilters[N]>[1]>>;
export type EditImageEffect={[N in EditEffectName]:{readonly name:N;readonly options:EditEffectOptions<N>}}[EditEffectName];
export function effectError(message:string):never{throw new EngineError('E_EDIT_EFFECT',message);}
/** A typed call description for existing algorithms, not another effect registry. */
export function effect<N extends EditEffectName>(name:N,options:EditEffectOptions<N>={} as EditEffectOptions<N>):Extract<EditImageEffect,{name:N}>{
 if(!editEffectNames.includes(name))effectError('Unknown editing effect: '+name);
 if(!options||typeof options!=='object'||Array.isArray(options))effectError('Effect options must be an object');
 for(const k of ['format','signal','alpha','workingColor'])if(Object.hasOwn(options,k))effectError(k+' belongs to the Stage contract, not a serializable effect call');
 try{return structuredClone({name,options}) as unknown as Extract<EditImageEffect,{name:N}>;}catch{effectError('Use static data or Core Signals, not functions or live GPU handles');}
}
export function validateEffects(effects:readonly EditImageEffect[]|undefined){if(effects===undefined)return;if(!Array.isArray(effects))effectError('Effects must be an array');for(const e of effects){if(!e||Object.keys(e).some(k=>!['name','options'].includes(k)))effectError('Invalid effect call');effect(e.name,e.options);}}
export function withEffects(source:EditClip,...effects:readonly EditImageEffect[]):EditClip {validateEffects(effects);return {...structuredClone(source),effects:[...structuredClone(source.effects??[]),...structuredClone(effects)]};}
