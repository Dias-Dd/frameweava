import {resolveStageEngine,type StageEngineSelection} from '../core/engine-inference.ts';
import {EngineError} from '../core/errors.ts';
import {engineDependencyRoots} from '../runtime/dependencies.ts';
import {mkdir,writeFile,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import type {TVG} from '../core/types.ts';
import {PLUGIN_STAGE_ENTRY,type PluginManifest,type PluginUse,type PluginPort} from './sdk.ts';
import {projectPlugins,readLock,inside,PluginRegistry} from './registry.ts';
import {validateManifest,fail,parseRef,satisfies} from './schema.ts';
import {planPipeline} from './plan.ts';
import {engineVersion} from '../compiler/runtime-lock.ts';
import {installedPackages} from '../packages/manager.ts';
import {packageRef,type PackageRecord} from '../packages/manifest.ts';
import type {RuntimePackage} from '../packages/runtime.ts';
export interface PluginResource {id:string;path:string;kind:'image'|'font'|'model'|'file';verbatim?:boolean}
export type {PreparedNode} from './plan.ts';
export interface PreparedPluginPlan {
 nodes:import('./plan.ts').PreparedNode[];
 modules:{ref:string;file:string;exportName?:string}[];
 metadata:Record<string,{manifest:PluginManifest;resourceIds:Record<string,string>;dependencies:Record<string,string>;packageRef?:string}>;
 packages:Record<string,RuntimePackage>;javascript:[string,string][];
}
export async function preparePluginStages(tvg:TVG,root:string,dir:string,sdkRoot:string,selections:Record<string,StageEngineSelection>={},isolatedFlat=false):Promise<{resources:PluginResource[];roots:string[];stageIds:string[];plans:Record<string,PreparedPluginPlan>}>{
  for(const stage of tvg.stages)if(stage.entry===PLUGIN_STAGE_ENTRY)throw new EngineError('E_WEB_REMOVED','Browser PluginStage pipelines were removed. Call installed Native modules in defineNativeStage; HTML/CSS uses Servo.',{stageId:stage.id});
  return {resources:[],roots:[],stageIds:[],plans:{}};
}
function relativeResource(root:string,path:string){return path.startsWith(root+'\\')||path.startsWith(root+'/');}
/** A locked plugin cannot silently import untracked sibling files or private node_modules. */
export async function assertPluginBundleInputs(inputs:string[],pluginRoots:string[],engineRoot:string,dir:string,virtualEntry:string){
  const within=(root:string,path:string)=>{const r=relative(root,path);return r!== '..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
  const [sourceRoot,packages,generated]=await Promise.all([realpath(join(engineRoot,'src')),engineDependencyRoots(engineRoot),realpath(join(dir,'plugins'))]);
  for(const input of inputs){
    const path=resolve(input);if(path===virtualEntry)continue;
    let actual:string;try{actual=await realpath(path);}catch(e){fail('E_PLUGIN_PATH',`Untracked virtual/file import ${input}: ${String(e)}`);}
    const graphicsSdk=['index','types','track','track-types','check','validate','resources','path-mask'].some(name=>actual===join(engineRoot,'modules/graphics-contracts',name+'.ts'));
    if(packages.some(root=>within(root,actual))||within(sourceRoot,actual)||within(generated,actual)||graphicsSdk)continue;
    const owner=pluginRoots.find(root=>within(root,actual));
    // An installed SDK/package itself lives under node_modules. Only nested,
    // unpinned dependencies inside a locked plugin root are private imports.
    if((owner?relative(owner,actual):actual).split(/[\\/]/).includes('node_modules'))fail('E_PLUGIN_PACKAGE',`Plugin imports private package outside the engine lock: ${actual}. Install and pin it in the engine, or vendor licensed source inside the plugin.`);
    if(!owner)fail('E_PLUGIN_PATH',`Plugin imports source outside locked plugin roots: ${actual}`);
  }
}
