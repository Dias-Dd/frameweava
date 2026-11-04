import {dirname,join,resolve} from 'node:path';
import {installedPackages} from '../packages/manager.ts';
import {checkProgramRequirements,effectivePackages,type EffectivePackageState} from '../packages/program-library.ts';
import {checkFlatPackages} from './flat-integrity.ts';
import {checkRuntimeFile} from './runtime-lock.ts';
import {EngineError} from '../core/errors.ts';

/** A sealed Flat owns its embedded dependencies, independent of its location.
 * This does not authorize external imports or grant runtime permissions. */
export async function packageContext(entry:string){
  entry=resolve(entry);
  const embedded=checkFlatPackages(entry),root=dirname(entry);
  if(!embedded){
    const isolated=checkRuntimeFile(entry);
    const state:EffectivePackageState=isolated?await installedPackages(root):await effectivePackages(root);
    if(!isolated)await checkProgramRequirements(root,state);
    return {state,embedded:undefined};
  }
  if(!checkRuntimeFile(entry))throw new EngineError('E_RUNTIME_LOCK','Embedded packages require an explicit SDK runtime pin');
  const state:EffectivePackageState={config:{schemaVersion:1,requirements:{},trustedSources:[]},records:[],store:join(root,'.frameweave/packages')};
  return {state,embedded};
}
