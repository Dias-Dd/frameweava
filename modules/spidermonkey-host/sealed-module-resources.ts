import {stageDefinitions} from '../stage-orchestration/composite-types.ts';
/** Trusted controller side only. Never bundle this file into authored JS.
 * Reuses BuiltProject's existing manifest+sorted-artifact SHA-256 seal. It
 * admits bytes from compiled R1 metadata, not arbitrary paths or image decode. */
import {readFile,open} from 'node:fs/promises';import {createReadStream} from 'node:fs';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {EngineError} from '../../src/core/errors.ts';import type {BuiltProject} from '../../src/core/types.ts';import type {RuntimePackage} from '../../src/packages/runtime.ts';
import {snapshotModuleResources,moduleResourceBudget,type ModuleResourceBudget} from './module-resources.ts';
export async function sealedStageModuleResources(build:BuiltProject,stageId:string,options:ModuleResourceBudget&{signal?:AbortSignal}={}){
 try{return await admit(build,stageId,options);}catch(error){if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Module byte admission cancelled');if(error instanceof EngineError)throw error;throw new EngineError((error as NodeJS.ErrnoException)?.code==='ENOENT'?'E_PACKAGE_RESOURCE_MISSING':'E_PACKAGE_RESOURCE','Sealed module resource admission failed');}
}
async function admit(build:BuiltProject,stageId:string,options:ModuleResourceBudget&{signal?:AbortSignal}){
 const max=moduleResourceBudget(options).bytes;const check=()=>{if(options.signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Module byte admission cancelled');};check();const stage=stageDefinitions(build.manifest).find(s=>s.key===stageId)?.stage;if(!stage||stage.engine!=='native-gpu')throw new EngineError('E_PACKAGE_RESOURCE_UNDECLARED','Module bytes require the current Native Stage');
 const bytes=await readFile(join(build.dir,'tvg.json'),{signal:options.signal});check();if(JSON.stringify(JSON.parse(bytes.toString()))!==JSON.stringify(build.manifest))throw new EngineError('E_PACKAGE_INTEGRITY','Compiled manifest changed');
 const seal=createHash('sha256').update(bytes),hashes=new Map<string,string>();for(const file of [...Object.values(build.stageBundles).map(p=>join(build.dir,p)),...Object.values(build.assets)].sort()){check();const own=createHash('sha256');for await(const chunk of createReadStream(file,{signal:options.signal})){seal.update(chunk);own.update(chunk);}hashes.set(resolve(file),own.digest('hex'));}
 if(seal.digest('hex')!==build.hash)throw new EngineError('E_PACKAGE_INTEGRITY','Existing compiled build seal does not match its bytes');
 // The table is compiler-prepared metadata inside the verified manifest. The
 // existing managed loader still resolves owner/dependency/format/capability.
 const packages=(stage.props.$packages??{}) as unknown as Record<string,RuntimePackage>;
 return snapshotModuleResources(packages,async id=>{check();const resource=build.manifest.resources.find(r=>r.id===id);if(!resource||resource.kind!=='file'||!Object.hasOwn(build.assets,resource.src))throw new EngineError('E_PACKAGE_RESOURCE_UNDECLARED','Module must name an exact declared file Resource ID');const path=resolve(build.assets[resource.src]),handle=await open(path,'r');
  try{const stat=await handle.stat();if(!Number.isSafeInteger(stat.size)||stat.size>max)throw new EngineError('E_PACKAGE_RESOURCE_LIMIT','Declared module exceeds complete byte budget');const value=new Uint8Array(stat.size+1);let at=0;while(at<value.length){check();const r=await handle.read(value,at,value.length-at,null);if(!r.bytesRead)break;at+=r.bytesRead;}check();if(at!==stat.size)throw new EngineError('E_PACKAGE_INTEGRITY','Module file changed while snapshotting');const result=value.subarray(0,at);if(createHash('sha256').update(result).digest('hex')!==hashes.get(path))throw new EngineError('E_PACKAGE_INTEGRITY','Module bytes changed after build seal verification');return result;}finally{await handle.close();}
 },options);
}
