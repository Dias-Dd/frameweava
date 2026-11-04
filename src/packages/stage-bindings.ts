import {temporalForManagedModule} from '../../modules/native-gpu/temporal.ts';
import {EngineError} from '../core/errors.ts';
import type {StageFactory,StageInstance,PortValue} from '../core/types.ts';
import type {PluginDefinition,PluginInit} from '../plugins/sdk.ts';
import {packageModuleLoader,type JavascriptLoaders,type RuntimePackage} from './runtime.ts';
import type {NativeStageFactory,NativeStageInit} from '../../modules/native-gpu/authoring.ts';
import {nativeScopeEvidence} from '../../modules/native-gpu/provenance.ts';
import {borrowNativeScope} from '../../modules/native-gpu/borrow.ts';
export type BindingForward = Record<string,{ref:string;name:string}>;
export interface BindingSpec {ref:string;engine?:'native-gpu';module:string;initialize?:string;forward?:BindingForward;bind:(exports:Record<string,unknown>)=>void;resources:Record<string,string>;dependencies:Record<string,string>}
/** Existing Stage lifecycle owns these bindings. Nothing executes in the project evaluator. */
export function createManagedStage(load:()=>Promise<NativeStageFactory>,bindings:BindingSpec[],packages:Record<string,RuntimePackage>,javascript:JavascriptLoaders,effects:Record<string,()=>Promise<PluginDefinition<any>>>):NativeStageFactory;
export function createManagedStage<I=Record<string,PortValue>,P=Record<string,unknown>,O=Record<string,PortValue>>(load:()=>Promise<StageFactory<I,P,O>>,bindings:BindingSpec[],packages:Record<string,RuntimePackage>,javascript:JavascriptLoaders,effects:Record<string,()=>Promise<PluginDefinition<any>>>):StageFactory<I,P,O>;
export function createManagedStage(load:()=>Promise<any>,bindings:BindingSpec[],packages:Record<string,RuntimePackage>,javascript:JavascriptLoaders,effects:Record<string,()=>Promise<PluginDefinition<any>>>):any{
 return async (init:any)=>{
  const owned:{dispose?:()=>unknown}[]=[];let instance:StageInstance<any,any,any>|undefined,disposed=false;
  async function dispose(){if(disposed)return;disposed=true;const errors:unknown[]=[];try{await instance?.dispose?.();}catch(e){errors.push(e);}for(const item of [...owned].reverse())try{await item.dispose?.();}catch(e){errors.push(e);}if(errors.length)throw new EngineError('E_PACKAGE_DISPOSE','Managed module cleanup failed',{details:{errors:errors.map(String)}});}
  try{
   const definitions=Object.fromEntries(await Promise.all(Object.entries(effects).map(async([ref,load])=>[ref,await load()])));
   const initialized=new Map<string,Record<string,unknown>>();
   for(const b of bindings){
    const native=b.engine==='native-gpu',rootGpu=(init as NativeStageInit).gpu;
    if(native&&!nativeScopeEvidence(rootGpu)||!native&&rootGpu)throw new EngineError('E_ENGINE_INCOMPATIBLE','Managed initializer engine disagrees with the Stage host');
    if(b.forward){
      const values=Object.fromEntries(Object.entries(b.forward).map(([name,target])=>{
        const provider=initialized.get(target.ref);
        if(!provider||!Object.hasOwn(provider,target.name)||typeof provider[target.name]!=='function')
          throw new EngineError('E_PACKAGE_BINDING_EXPORT',`Missing forwarded callable ${target.ref}/${target.name}`);
        return [name,provider[target.name]];
      }));
      b.bind(values);
      initialized.set(b.ref,values);
      continue;
    }
    const lease=native&&packages[b.ref].capabilities.includes('native-gpu')?borrowNativeScope(rootGpu):undefined;if(lease)owned.push(lease);
    const ratio=init.pixelRatio??1;
    const {gpu:_gpu,temporal:_temporal,moduleResources:_moduleResources,...base}=init;
    const temporal=native&&lease?temporalForManagedModule(init.temporal,lease,b.ref,packages,Object.values(b.resources)):undefined;
    const context={...base,...temporal?{temporal}:{},...native?{backend:'native-gpu' as const,...lease?{gpu:lease.scope}:{}}:{},width:Math.round(init.width*ratio),height:Math.round(init.height*ratio),logicalWidth:init.width,logicalHeight:init.height,pixelRatio:ratio,
     resources:Object.fromEntries(Object.entries(b.resources).map(([name,id])=>[name,init.resources[id]])),
     ...lease?{moduleResources:Object.freeze(Object.fromEntries(Object.entries(packages[b.ref].modules).flatMap(([name,m])=>m.format!=='javascript'&&m.resourceId?[[name,Object.freeze({resourceId:m.resourceId,integrity:m.integrity,format:m.format})]]:[])))}:{},
     dependencies:Object.fromEntries(Object.entries(b.dependencies).map(([name,ref])=>[name,definitions[ref]])),
     loadModule:packageModuleLoader(b.ref,packages,javascript,init.resources,{nativeGpu:lease?.scope,...native&&typeof init.readModuleBytes==='function'?{readModuleBytes:init.readModuleBytes}:{}})};
    const module=await context.loadModule({module:b.module,format:'javascript'});
    let values=module;
    if(b.initialize){const fn=module[b.initialize];if(typeof fn!=='function')throw new EngineError('E_PACKAGE_BINDING','Missing managed initializer');const result=await fn(context);if(!result||typeof result!=='object'||!result.exports||typeof result.exports!=='object'||result.dispose!==undefined&&typeof result.dispose!=='function')throw new EngineError('E_PACKAGE_BINDING','Initializer must return exports and optional dispose');owned.push(result);values=result.exports;}
    b.bind(values);
    initialized.set(b.ref,values);
   }
   const factory=await load();if(typeof factory!=='function')throw new EngineError('E_STAGE_FACTORY','Managed Stage entry must export a factory');instance=await factory(init);
   if(!instance||typeof instance.renderAt!=='function')throw new EngineError('E_STAGE_CONTRACT','Managed Stage factory requires renderAt');
   const stage=instance;return {...(stage as any).temporal?{temporal:{...(stage as any).temporal,sampleAt:(...args:any[])=>{if(disposed)throw new EngineError('E_PACKAGE_DISPOSE','Managed Stage is disposed');return (stage as any).temporal.sampleAt(...args);}}}:{},renderAt:(...args:Parameters<StageInstance<any,any,any>['renderAt']>)=>{if(disposed)throw new EngineError('E_PACKAGE_DISPOSE','Managed Stage is disposed');return stage.renderAt(...args);},dispose};
  }catch(e){try{await dispose();}catch(cleanup){throw new EngineError('E_PACKAGE_INIT','Managed initialization and cleanup failed',{details:{cause:String(e),cleanup:String(cleanup)}});}throw e;}
 };
}
