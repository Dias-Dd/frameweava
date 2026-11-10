import {readFile,writeFile,mkdir,mkdtemp,rm,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EngineError} from '../core/errors.ts';
import {runtimeCachePath} from '../runtime/paths.ts';
import {installedPackages,installPackages,resolvePackages} from './manager.ts';
import {validatePackage,readPackage,packageRef,type PackageRecord} from './manifest.ts';
import {parseFunctionMetadata} from './function-metadata.ts';
import {unpackReleaseCatalog,verifyReleaseCatalogPin,type ReleaseCatalogPin} from './release-catalog.ts';
import type {CatalogPackageApi} from '../capabilities/catalog-api.ts';
import {satisfies,version} from '../plugins/schema.ts';
import {runtimePin} from '../compiler/runtime-lock.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
const error=(message:string)=>new EngineError('E_PACKAGE_CATALOG',message);
export interface RegistryConfig {schemaVersion:1;repository:string;channel:string;indexUrl:string}
export interface RemotePackage extends PackageRecord {archive:ReleaseCatalogPin}
export interface RemoteRegistry {schemaVersion:1;packages:RemotePackage[];api:CatalogPackageApi[]}

export async function registryConfig():Promise<RegistryConfig|undefined>{
  let text:string;try{text=await readFile(join(root,'frameweave.registry.json'),'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
  const config=JSON.parse(text) as RegistryConfig;
  if(config.schemaVersion!==1||!/^[-\w]+\/[-\w.]+$/.test(config.repository)||!/^[-\w.]+$/.test(config.channel)||
    config.indexUrl!==`https://raw.githubusercontent.com/${config.repository}/${config.channel}/registry/index.json`)
    throw error('Invalid official registry configuration');
  return config;
}

/** Metadata is data, not executable code or installation permission. */
export function validateRegistry(value:RemoteRegistry,config:RegistryConfig):RemoteRegistry{
  if(!value||value.schemaVersion!==1||!Array.isArray(value.packages)||!Array.isArray(value.api))throw error('Invalid official registry index');
  const refs=new Set<string>();
  const packages=value.packages.map(item=>{
    validatePackage(item.manifest);const ref=packageRef(item.manifest);
    if(refs.has(ref)||!/^[a-f0-9]{64}$/.test(item.integrity)||!item.moduleIntegrity||typeof item.moduleIntegrity!=='object')throw error('Duplicate or malformed registry package');
    refs.add(ref);verifyReleaseCatalogPin(item.archive);
    if(!item.archive.url.startsWith(`https://github.com/${config.repository}/releases/download/`)||
      Object.keys(item.archive.packages).length!==1||item.archive.packages[ref]!==item.integrity)
      throw error('Registry archive identity does not match package');
    if(Object.keys(item.moduleIntegrity).sort().join('|')!==Object.keys(item.manifest.modules).sort().join('|')||
      Object.values(item.moduleIntegrity).some(v=>!/^[a-f0-9]{64}$/.test(v)))throw error('Invalid registry module fingerprints');
    const functions=item.functions?parseFunctionMetadata(JSON.stringify({schemaVersion:1,functions:item.functions}),ref):undefined;
    const creationGuide=item.creationGuide?parseFunctionMetadata(JSON.stringify({schemaVersion:1,functions:item.creationGuide}),ref):undefined;
    return {...item,directory:'',functions,creationGuide};
  });
  const api=value.api.filter(entry=>entry.sdkImport?entry.integrity===runtimePin.integrity:
    packages.some(record=>packageRef(record.manifest)===entry.reference&&record.integrity===entry.integrity));
  return {schemaVersion:1,packages,api};
}

async function boundedFetch(url:string,maximum:number){
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.body)throw error(`Official registry request failed (HTTP ${response.status})`);
  const chunks:Uint8Array[]=[];let bytes=0;const reader=response.body.getReader();
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>maximum)throw error('Official response exceeded its declared byte budget');chunks.push(part.value);}}
  finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}

/** Installs refresh the remote index. Search uses only cached/shipped metadata. */
export async function officialRegistry(refresh=false):Promise<{config:RegistryConfig;index:RemoteRegistry}|undefined>{
  const config=await registryConfig();if(!config)return;
  const cache=runtimeCachePath('registry',hash(config.indexUrl)+'.json');let data:RemoteRegistry;
  if(refresh){
    // Configurable metadata budget, separate from package/render capacity.
    const budget=Number(process.env.FRAMEWEAVE_REGISTRY_INDEX_BYTES??16*1024**2);
    if(!Number.isSafeInteger(budget)||budget<1)throw error('Registry index budget must be a positive byte count');
    data=JSON.parse((await boundedFetch(config.indexUrl,budget)).toString('utf8'));validateRegistry(data,config);
    await mkdir(dirname(cache),{recursive:true});const temporary=cache+'.'+process.pid+'.tmp';
    try{await writeFile(temporary,JSON.stringify(data));await rename(temporary,cache);}finally{await rm(temporary,{force:true});}
  }else{
    try{data=JSON.parse(await readFile(cache,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
      data=JSON.parse(await readFile(join(root,'registry/index.json'),'utf8'));}
  }
  const index=validateRegistry(data,config);
  // The remote development branch can run a different SDK. Keep this installed
  // SDK's shipped declarations, never relabel remote SDK documentation as local.
  if(!index.api.some(entry=>entry.sdkImport)){
    const local=JSON.parse(await readFile(join(root,'registry/index.json'),'utf8')) as RemoteRegistry;
    index.api.push(...validateRegistry(local,config).api.filter(entry=>entry.sdkImport));
  }
  return {config,index};
}

/** Download only the selected missing dependency closure. Archives/extraction
 * are temporary; the existing R1 transaction owns immutable installed copies. */
export async function installRemotePackage(directory:string,spec:string,options:{trust?:string[];integrity?:string;add?:string[]}={}){
  const remote=await officialRegistry(true);if(!remote)throw error('Official remote registry is not configured');
  const match=/^([a-z][a-z0-9.-]*)(?:@((?:\^|~|>=)?\d+\.\d+\.\d+)|(>=\d+\.\d+\.\d+))?$/.exec(spec);
  if(!match)throw error('Expected a package name and optional version range');
  const current=await installedPackages(directory),range=match[2]??match[3],pinned=current.lock?.roots[match[1]];
  const candidates=[...remote.index.packages,...current.records];
  const eligible=candidates.filter(r=>r.manifest.id===match[1]&&(!range||satisfies(r.manifest.version,range)));
  const selected=eligible.find(r=>packageRef(r.manifest)===pinned)??eligible.sort((a,b)=>{const x=version(a.manifest.version),y=version(b.manifest.version);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];}).at(-1);
  if(!selected)throw new EngineError('E_PACKAGE_MISSING',`No matching ${spec} in the official remote registry`);
  if(options.integrity&&options.integrity!==`sha256-${selected.integrity}`)throw new EngineError('E_PACKAGE_INTEGRITY','Selected remote package does not match requested integrity');
  const requested={...current.config.requirements,[match[1]]:range??current.config.requirements[match[1]]??selected.manifest.version};
  for(const add of options.add??[]){const at=add.lastIndexOf('@');if(at<1)throw error('Additional packages require exact id@version');requested[add.slice(0,at)]=add.slice(at+1);}
  const trusted=[...new Set([...current.config.trustedSources,...options.trust??[]])];
  const byRef=new Map<string,PackageRecord>();
  for(const record of candidates){const ref=packageRef(record.manifest),old=byRef.get(ref);if(old&&old.integrity!==record.integrity)throw new EngineError('E_PACKAGE_IMMUTABLE',`Remote content changed for ${ref}`);byRef.set(ref,record);}
  const lock=resolvePackages([...byRef.values()],requested,trusted,current.lock);
  const parent=resolve(runtimeCachePath('remote-packages'));await mkdir(parent,{recursive:true});const stage=await mkdtemp(join(parent,'install-'));
  const directories=current.records.map(r=>r.directory),downloaded:string[]=[];let transferredBytes=0;
  try{
    const missing=Object.keys(lock.packages).filter(ref=>!current.records.some(r=>packageRef(r.manifest)===ref&&`sha256-${r.integrity}`===lock.packages[ref].integrity));
    // Bounded parallel download; package resources are never executed here.
    for(let offset=0;offset<missing.length;offset+=3){const batch=await Promise.allSettled(missing.slice(offset,offset+3).map(async ref=>{
      const record=remote.index.packages.find(r=>packageRef(r.manifest)===ref);if(!record)throw new EngineError('E_PACKAGE_MISSING',`Remote registry lacks ${ref}`);
      const output=join(stage,ref),archive=await boundedFetch(record.archive.url,record.archive.bytes);await mkdir(output);
      await unpackReleaseCatalog(archive,record.archive,output);const checked=await readPackage(output);
      if(packageRef(checked.manifest)!==ref||checked.integrity!==record.integrity)throw new EngineError('E_PACKAGE_INTEGRITY',`Downloaded package differs from registry: ${ref}`);
      directories.push(output);downloaded.push(ref);transferredBytes+=archive.length;
    }));const failed=batch.find((r):r is PromiseRejectedResult=>r.status==='rejected');if(failed)throw failed.reason;}
    const result=await installPackages(directory,directories,{add:[packageRef(selected.manifest),...options.add??[]],trust:options.trust,integrity:options.integrity,ranges:requested});
    return {...result,remote:{registry:remote.config.indexUrl,downloaded:downloaded.sort(),transferredBytes,archiveCacheRetained:false}};
  }finally{
    if(dirname(stage)!==parent)throw error('Invalid remote installation cleanup path');await rm(stage,{recursive:true,force:true});
  }
}
