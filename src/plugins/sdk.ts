import {Stage,type StageNode,type StageProps} from '../core/authoring.ts';
import type {FrameContext,Json,Signal,StageInit} from '../core/types.ts';
import type {ModuleLoader} from '../packages/runtime.ts';
export type {ModuleLoader,ModuleRequest,LoadedModules} from '../packages/runtime.ts';
export type {PackageManifest,PackageModule,ModuleFormat,Capability} from '../packages/manifest.ts';


export const PLUGIN_API=1;
export const PLUGIN_STAGE_ENTRY='@frameweave/plugin-stage';
export type PluginKind='function'|'generator'|'modifier'|'image-effect'|'composite-effect'|'preset';
export type PluginPort='image'|'number'|'string'|'boolean'|'json';
export type Parameter={type:'number'|'string'|'boolean';minimum?:number;maximum?:number;integer?:boolean;enum?:Json[]}&({default:Json;required?:false}|{required:true;default?:never});
/** Finite, closed parameter data; signals are authored through AnimatedValue, never defaults. */
export type ParameterValue=number|string|boolean|ParameterValue[]|{[key:string]:ParameterValue};
export type ScalarParameterV2=
  | {type:'number';default?:number;required?:boolean;minimum?:number;maximum?:number;integer?:boolean;enum?:readonly number[]}
  | {type:'string';default?:string;required?:boolean;minLength?:number;maxLength?:number;enum?:readonly string[]}
  | {type:'boolean';default?:boolean;required?:boolean;enum?:readonly boolean[]};
export type ParameterV2=ScalarParameterV2
  | {type:'object';default?:Record<string,ParameterValue>;properties:Record<string,ParameterV2>;required?:readonly string[];additionalProperties?:false}
  | {type:'array';default?:ParameterValue[];items:ParameterV2;minItems?:number;maxItems?:number;required?:boolean};
export interface PluginUse {plugin:string;params?:Record<string,unknown>;as?:string;inputs?:Record<string,string>}
interface PluginManifestBase {
  schemaVersion:1;id:string;name:string;version:string;kind:PluginKind;engine:string;
  description:string;tags?:string[];entry?:string;apiVersion:1;compatible:string;
  inputs:Record<string,PluginPort>;outputs:Record<string,PluginPort>;
  dependencies?:Record<string,string>;resources?:Record<string,{src:string;kind:'image'|'font'|'model'|'file'}>;
  examples?:string[];pipeline?:PluginUse[];temporal?:'resample-prefix';
}
export interface PluginManifestV1 extends PluginManifestBase {parameterSchemaVersion?:1;parameters:Record<string,Parameter>}
export interface PluginManifestV2 extends PluginManifestBase {parameterSchemaVersion:2;parameters:Record<string,ParameterV2>}
export type PluginManifest=PluginManifestV1|PluginManifestV2;
export type PluginValue=HTMLCanvasElement|ImageBitmap|Json;
export type PluginValues=Record<string,PluginValue>;
export interface PluginInit extends Omit<StageInit,'width'|'height'> {width:number;height:number;logicalWidth:number;logicalHeight:number;pixelRatio:number;dependencies:Readonly<Record<string,PluginDefinition<any>>>;loadModule:ModuleLoader}
/** Native binding schema 2 only. GPU is a borrowed module lease, not a device. */
export interface NativePluginInit extends Omit<PluginInit,'container'> {backend:'native-gpu';moduleResources?:Readonly<Record<string,Readonly<{resourceId:string;integrity:string;format:'resource'|'wgsl'|'wasm'}>>>;temporal?:import('../../modules/native-gpu/temporal-types.ts').NativeTemporalStage;gpu?:import('../../modules/native-gpu/authoring.ts').NativeGpuScope}
export interface PluginFrame extends FrameContext {
  /** Temporal resampling of this pipeline's upstream prefix, never a static blur. */
  sample(time:number):Promise<PluginValues>;
}
export interface PluginInstance<P extends object> {
  render(context:PluginFrame,inputs:PluginValues,params:P):PluginValues|Promise<PluginValues>;
  dispose?():void|Promise<void>;
}
export type PluginDefinition<P extends object=Record<string,Json>>=
  | {kind:'function';evaluate(context:FrameContext,inputs:PluginValues,params:P):PluginValues}
  | {kind:Exclude<PluginKind,'function'|'preset'>;create(init:PluginInit):PluginInstance<P>|Promise<PluginInstance<P>>};
export function definePlugin<P extends object>(definition:PluginDefinition<P>):PluginDefinition<P>{return definition;}
export type RequiredAnimated<P,R extends keyof P>=Animated<P>&{[K in R]-?:NonNullable<Animated<P>[K]>};
type UseArguments<P extends object,R extends keyof P>=[R] extends [never]?[params?:Animated<P>,options?:Pick<PluginUse,'as'|'inputs'>]:[params:RequiredAnimated<P,R>,options?:Pick<PluginUse,'as'|'inputs'>];
export interface EffectModule<P extends object,R extends keyof P=never> {
  readonly manifest:PluginManifest;
  readonly implementation:PluginDefinition<P>|undefined;
  use(...args:UseArguments<P,R>):PluginUse;
}
type PropertyKeys<P,R>={[K in keyof P]:K extends R?K:P[K] extends {default:unknown}|{required:true}?K:never}[keyof P];
export type ParameterType<S>=S extends {type:'number'}?number:S extends {type:'string'}?string:S extends {type:'boolean'}?boolean:
  S extends {type:'array';items:infer I}?ParameterType<I>[]:
  S extends {type:'object';properties:infer P;required?:infer R}?{[K in PropertyKeys<P,R extends readonly string[]?R[number]:never>]:ParameterType<P[K]>}&{[K in Exclude<keyof P,PropertyKeys<P,R extends readonly string[]?R[number]:never>>]?:ParameterType<P[K]>}:never;
type OptionalParameterKeys<P>={[K in keyof P]:P[K] extends {required:false}?P[K] extends {default:unknown}?never:K:never}[keyof P];
export type ManifestParameters<M extends PluginManifest>={[K in Exclude<keyof M['parameters'],OptionalParameterKeys<M['parameters']>>]:ParameterType<M['parameters'][K]>}&{[K in OptionalParameterKeys<M['parameters']>]?:ParameterType<M['parameters'][K]>};
export type RequiredParameters<M extends PluginManifest>={[K in keyof M['parameters']]:M['parameters'][K] extends {default:unknown}|{required:false}?never:K}[keyof M['parameters']];
type InputPropertyKeys<P,R>={[K in keyof P]:P[K] extends {default:unknown}?never:K extends R?K:P[K] extends {required:true}?K:never}[keyof P];
export type ParameterInput<S>=S extends {type:'array';items:infer I}?ParameterInput<I>[]:
  S extends {type:'object';properties:infer P;required?:infer R}?{[K in InputPropertyKeys<P,R extends readonly string[]?R[number]:never>]:ParameterInput<P[K]>}&{[K in Exclude<keyof P,InputPropertyKeys<P,R extends readonly string[]?R[number]:never>>]?:ParameterInput<P[K]>}:AnimatedValue<ParameterType<S>>;
export type ParameterInputs<M extends PluginManifestV2>={[K in keyof M['parameters']]?:ParameterInput<M['parameters'][K]>};
export type StructuredEffectModule<M extends PluginManifestV2>=Omit<EffectModule<ManifestParameters<M>>,'use'|'manifest'>&{
  readonly manifest:M;
  use(...args:[RequiredParameters<M>] extends [never]?[params?:ParameterInputs<M>,options?:Pick<PluginUse,'as'|'inputs'>]:[params:ParameterInputs<M>&{[K in RequiredParameters<M>]-?:NonNullable<ParameterInputs<M>[K]>},options?:Pick<PluginUse,'as'|'inputs'>]):PluginUse;
};
/** An ordinary importable TS object. Importing it does not check a Stage or execute it. */
export function defineEffect<const M extends PluginManifestV2>(manifest:M,implementation?:PluginDefinition<ManifestParameters<M>>):StructuredEffectModule<M>;
export function defineEffect<const M extends PluginManifestV1>(manifest:M,implementation?:PluginDefinition<ManifestParameters<M>>):EffectModule<ManifestParameters<M>,Extract<RequiredParameters<M>,keyof ManifestParameters<M>>>;
export function defineEffect<P extends object,R extends keyof P=never>(manifest:PluginManifestV1,implementation?:PluginDefinition<P>):EffectModule<P,R>;
export function defineEffect<P extends object=Record<string,Json>>(manifest:PluginManifest,implementation?:PluginDefinition<P>) {
  manifest=manifest.kind==='preset'?manifest:{...manifest,entry:manifest.entry??'inline'};
  return Object.assign({manifest,implementation,use(params:Record<string,unknown>={},options:Pick<PluginUse,'as'|'inputs'>={}){return plugin(`${manifest.id}@${manifest.version}`,params,options);}},
    {[Symbol.for('@frameweave/engine.effect-module')]:true});
}
export function plugin(plugin:string,params:Record<string,unknown>={},options:Pick<PluginUse,'as'|'inputs'>={}):PluginUse{return {plugin,params,...options};}
export interface PluginStageProps extends Omit<StageProps,'entry'|'factory'|'children'|'props'|'outputs'> {pipeline:PluginUse[]}
/** Ordered Stage-local pipeline. Native Stage and legacy Layer effects remain available. */
export function PluginStage({pipeline,...props}:PluginStageProps):StageNode {
  throw Object.assign(new Error('Browser PluginStage pipelines were removed; call Native modules inside defineNativeStage.'),{code:'E_WEB_REMOVED'});
}
export type AnimatedValue<T>=T extends number|string?Signal<T>:T extends boolean|undefined?T:T extends readonly unknown[]?{[K in keyof T]:AnimatedValue<T[K]>}:T extends object?{[K in keyof T]:AnimatedValue<T[K]>}:never;
export type Animated<P>={[K in keyof P]?:AnimatedValue<P[K]>};
/** Plugin authors publish a small typed companion without importing executable render code. */
export function typedPlugin<P extends object,R extends keyof P=never>(reference:string){return ((params:Animated<P>={},options:Pick<PluginUse,'as'|'inputs'>={}):PluginUse=>plugin(reference,params,options)) as (...args:UseArguments<P,R>)=>PluginUse;}
