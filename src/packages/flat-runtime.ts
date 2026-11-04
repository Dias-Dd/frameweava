import {stageDefinitions} from '../../modules/stage-orchestration/composite-types.ts';
import type {TVG,StageFactory} from '../core/types.ts';
import {NATIVE_LOGIC,type NativeStageFactory} from '../../modules/native-gpu/authoring.ts';
import type {RuntimePackage} from './runtime.ts';
import {EngineError} from '../core/errors.ts';
export {createManagedStage,type BindingSpec} from './stage-bindings.ts';
export type {RuntimePackage,JavascriptLoaders} from './runtime.ts';
export type {PackageBindings,PackageManifest} from './manifest.ts';
/** Attach verified, readable Flat factories to the existing native Stage mechanism.
 * It does not load code, restore files, install packages or grant permissions. */
// This heterogeneous registry retains each author's already-checked factory.
// Defaulting its generics to Record<string, PortValue> incorrectly rejects
// valid JSON-shaped interface outputs that lack a TypeScript index signature.
export function withFlatStages<T>(project:T,factories:Record<string,StageFactory<any,any,any>|NativeStageFactory<any,any,any>>,packages:Record<string,Record<string,RuntimePackage>>,resources:TVG['resources']):T {
 const apply=(value:TVG):TVG=>{
  const declared=new Map(value.resources.map(r=>[r.id,r]));for(const resource of resources){const old=declared.get(resource.id);if(old&&old.src!==resource.src)throw new EngineError('E_PACKAGE_RESOURCE','Conflicting Flat resource identity');declared.set(resource.id,resource);}
  const copies=new Map<TVG['stages'][number],TVG['stages'][number]>();
  for(const {key,stage:s}of stageDefinitions(value).reverse()){
   const next={...s,...s.composition?{composition:{...s.composition,stages:s.composition.stages.map(c=>copies.get(c)!)}}:{}};
   if(factories[key]){
    if(!(factories[key] as NativeStageFactory)[NATIVE_LOGIC])throw new EngineError('E_STAGE_FACTORY','Embedded visual factories must use defineNativeStage');
    if(s.engine!=='native-gpu')throw new EngineError('E_ENGINE_INCOMPATIBLE','Embedded bindings disagree with their Stage engine');
    next.props={...s.props,...packages[key]?{$packages:packages[key]}:{}};delete next.entry;delete next.exportName;delete next.nodes;
    Object.assign(next,{[Symbol.for('@frameweave/engine.native-stage-factory')]:factories[key]});
   }copies.set(s,next);
  }
  return {...value,resources:[...declared.values()],stages:value.stages.map(s=>copies.get(s)!)};
 };
 if(typeof project==='function')return (async()=>apply(await project())) as T;
 return apply(project as TVG) as T;
}
