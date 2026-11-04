import {engineVersion} from '../compiler/runtime-lock.ts';
import {readFile,writeFile,mkdir,mkdtemp,rename,rm,open,lstat,copyFile} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {fields,plain,fail,parseRef,satisfies,version} from '../plugins/schema.ts';
import {PACKAGE_MANIFEST,discoverPackages,readPackage,packageRef,packageFiles,within,assertPlatform,type PackageRecord,type PackageSource} from './manifest.ts';

export interface PackageConfig {schemaVersion:1;requirements:Record<string,string>;trustedSources:string[];store?:string}
export interface PackagePin {integrity:string;source:PackageSource;modules:Record<string,string>;dependencies:Record<string,string>}
export interface PackageLock {schemaVersion:1;apiVersion:1;platform:'web';requirements:Record<string,string>;roots:Record<string,string>;packages:Record<string,PackagePin>}
const configName='frameweave.packages.json',lockName='frameweave.packages.lock.json';
const stable=<T>(map:Record<string,T>)=>Object.fromEntries(Object.entries(map).sort(([a],[b])=>a<b?-1:a>b?1:0));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const compare=(a:string,b:string)=>{const x=version(a),y=version(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];};
const sourceKey=(s:PackageSource)=>`${s.kind}:${s.authority}`;
async function safeSubdirectory(base:string,path:string){
  base=resolve(base);path=resolve(path);if(!within(base,path)||base===path)fail('E_PACKAGE_PATH','Managed path must stay below its project');
  let current=base;for(const part of relative(base,path).split(/[\\/]/)){current=join(current,part);try{if((await lstat(current)).isSymbolicLink())fail('E_PACKAGE_PATH',`Managed path cannot contain links: ${current}`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
}
function trust(record:PackageRecord,authorities:string[]){if(!authorities.includes(sourceKey(record.manifest.source)))fail('E_PACKAGE_TRUST',`Untrusted source ${sourceKey(record.manifest.source)} for ${packageRef(record.manifest)}; explicitly approve this local authority`);}
async function optional(path:string):Promise<string|undefined>{try{return await readFile(path,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}}
function requirements(value:unknown){if(!plain(value))fail('E_PACKAGE_SCHEMA','Requirements must be a map');for(const [id,range]of Object.entries(value)){if(!/^[a-z][a-z0-9.-]*$/.test(id)||typeof range!=='string')fail('E_PACKAGE_SCHEMA','Invalid requirement');satisfies(engineVersion,range);}}
export async function packageProject(directory:string){
  directory=resolve(directory);const text=await optional(join(directory,configName));let config:PackageConfig={schemaVersion:1,requirements:{},trustedSources:[]};
  if(text!==undefined){const value=JSON.parse(text);fields(value,['schemaVersion','requirements','trustedSources','store'],'package config');if(value.schemaVersion!==1||!Array.isArray(value.trustedSources)||!value.trustedSources.every(s=>typeof s==='string'&&/^local:[a-z][a-z0-9.-]*$/.test(s)))fail('E_PACKAGE_SCHEMA','Invalid package config');requirements(value.requirements);if(value.store!==undefined&&(typeof value.store!=='string'||!value.store))fail('E_PACKAGE_PATH','Invalid store');config=value as unknown as PackageConfig;}
  const store=resolve(directory,config.store??'.frameweave/packages');
  if(!within(directory,store)||store===directory)fail('E_PACKAGE_PATH','Package store must be a subdirectory of its project');
  await safeSubdirectory(directory,store);
  return {directory,config,store,configPath:join(directory,configName),lockPath:join(directory,lockName),exists:text!==undefined};
}
export async function readPackageLock(path:string):Promise<PackageLock>{
  const text=await optional(path);if(text===undefined)fail('E_PACKAGE_LOCK',`Missing package lock ${path}`);
  let value:unknown;try{value=JSON.parse(text);}catch{fail('E_PACKAGE_LOCK','Invalid package lock JSON');}
  fields(value,['schemaVersion','apiVersion','platform','requirements','roots','packages'],'package lock');
  if(value.schemaVersion!==1||value.apiVersion!==1||value.platform!=='web'||!plain(value.roots)||!plain(value.packages))fail('E_PACKAGE_LOCK','Invalid package lock');
  requirements(value.requirements);
  for(const [id,ref]of Object.entries(value.roots)){if(typeof ref!=='string'||parseRef(ref).id!==id)fail('E_PACKAGE_LOCK','Invalid locked root');}
  for(const [ref,pin]of Object.entries(value.packages)){
    parseRef(ref);fields(pin,['integrity','source','modules','dependencies'],'package pin');fields(pin.source,['kind','authority'],'locked source');
    if(typeof pin.integrity!=='string'||!/^sha256-[a-f0-9]{64}$/.test(pin.integrity)||pin.source.kind!=='local'||typeof pin.source.authority!=='string'||!plain(pin.modules)||!plain(pin.dependencies))fail('E_PACKAGE_LOCK','Invalid package pin');
    for(const hash of Object.values(pin.modules))if(typeof hash!=='string'||!/^sha256-[a-f0-9]{64}$/.test(hash))fail('E_PACKAGE_LOCK','Invalid module integrity');
    for(const [id,target]of Object.entries(pin.dependencies))if(typeof target!=='string'||parseRef(target).id!==id)fail('E_PACKAGE_LOCK','Invalid locked dependency');
  }
  return value as unknown as PackageLock;
}

/** One version per ID in a project. Highest stable first, then deterministic backtracking.
 * Existing pins are preferred on additive installs; frozen restore never calls the resolver. */
export function resolvePackages(catalog:PackageRecord[],requested:Record<string,string>,trustedSources:string[],preferred?:PackageLock):PackageLock {
  requirements(requested);const candidates=new Map<string,PackageRecord[]>();
  for(const record of catalog){const id=record.manifest.id;candidates.set(id,[...candidates.get(id)??[],record]);}
  for(const [id,list]of candidates){list.sort((a,b)=>compare(b.manifest.version,a.manifest.version));const pinned=Object.keys(preferred?.packages??{}).find(ref=>parseRef(ref).id===id);if(pinned)list.sort((a,b)=>Number(packageRef(b.manifest)===pinned)-Number(packageRef(a.manifest)===pinned));}
  let missing:string|undefined,platform:string|undefined,untrusted:string|undefined;let attempts=0;
  function solve(selected:Map<string,PackageRecord>):Map<string,PackageRecord>|undefined {
    if(++attempts>10000)fail('E_PACKAGE_BUDGET','Dependency resolution exceeds 10000 attempts');
    const constraints=new Map<string,string[]>();
    const add=(id:string,range:string)=>constraints.set(id,[...constraints.get(id)??[],range]);
    for(const [id,range]of Object.entries(requested))add(id,range);
    for(const record of selected.values())for(const [id,range]of Object.entries(record.manifest.dependencies??{}))add(id,range);
    for(const [id,record]of selected)if(!constraints.get(id)?.every(r=>satisfies(record.manifest.version,r)))return;
    const next=[...constraints.keys()].sort().find(id=>!selected.has(id));if(!next)return selected;
    const all=candidates.get(next)??[];if(!all.length){missing=next;return;}
    for(const record of all){
      if(!constraints.get(next)!.every(r=>satisfies(record.manifest.version,r)))continue;
      if(!trustedSources.includes(sourceKey(record.manifest.source))){untrusted=sourceKey(record.manifest.source);continue;}
      if(!record.manifest.platforms.includes('web')||!satisfies(engineVersion,record.manifest.compatible)){platform=packageRef(record.manifest);continue;}
      const found=solve(new Map([...selected,[next,record]]));if(found)return found;
    }
  }
  const selected=solve(new Map());
  if(!selected){if(missing)fail('E_PACKAGE_MISSING',`Missing dependency ${missing}`);if(untrusted)fail('E_PACKAGE_TRUST',`Untrusted source ${untrusted}`);if(platform)fail('E_PACKAGE_PLATFORM',`No compatible web/engine candidate for ${platform}`);fail('E_PACKAGE_CONFLICT','No single-version solution satisfies all package requirements');}
  const packages:PackageLock['packages']={},roots:Record<string,string>={};
  for(const [id]of Object.entries(requested))roots[id]=packageRef(selected.get(id)!.manifest);
  for(const record of selected.values())packages[packageRef(record.manifest)]={integrity:`sha256-${record.integrity}`,source:record.manifest.source,modules:stable(Object.fromEntries(Object.entries(record.moduleIntegrity).map(([k,v])=>[k,`sha256-${v}`]))),dependencies:stable(Object.fromEntries(Object.keys(record.manifest.dependencies??{}).map(id=>[id,packageRef(selected.get(id)!.manifest)])))};
  const lock:PackageLock={schemaVersion:1,apiVersion:1,platform:'web',requirements:stable(requested),roots:stable(roots),packages:stable(packages)};validateGraph(lock);return lock;
}
function validateGraph(lock:PackageLock){
  const reached=new Set<string>(),versions=new Map<string,string>();
  function visit(ref:string,active=new Set<string>()){
    if(active.has(ref))fail('E_PACKAGE_CYCLE',`Package dependency cycle at ${ref}`);
    if(reached.has(ref))return;const pin=lock.packages[ref];if(!pin)fail('E_PACKAGE_MISSING',`Missing locked package ${ref}`);
    const {id,version}=parseRef(ref);if(versions.has(id)&&versions.get(id)!==version)fail('E_PACKAGE_CONFLICT',`Multiple locked versions of ${id}`);versions.set(id,version);
    reached.add(ref);for(const dep of Object.values(pin.dependencies))visit(dep,new Set([...active,ref]));
  }
  for(const [id,range]of Object.entries(lock.requirements)){const ref=lock.roots[id];if(!ref||parseRef(ref).id!==id||!satisfies(parseRef(ref).version,range))fail('E_PACKAGE_LOCK',`Locked root disagrees with requirement ${id}`);visit(ref);}
  if(Object.keys(lock.roots).length!==Object.keys(lock.requirements).length||reached.size!==Object.keys(lock.packages).length)fail('E_PACKAGE_LOCK','Lock contains extraneous roots/packages');
}
export function verifyPackageRecord(record:PackageRecord,pin:PackagePin,lock:PackageLock){
  if(pin.integrity!==`sha256-${record.integrity}`||!same(pin.source,record.manifest.source)||!same(stable(pin.modules),stable(Object.fromEntries(Object.entries(record.moduleIntegrity).map(([k,v])=>[k,`sha256-${v}`])))))fail('E_PACKAGE_INTEGRITY',`Changed package/source/module bytes: ${packageRef(record.manifest)}`);
  assertPlatform(record);const deps=record.manifest.dependencies??{};
  if(Object.keys(deps).sort().join('|')!==Object.keys(pin.dependencies).sort().join('|'))fail('E_PACKAGE_LOCK','Dependency declaration differs from lock');
  for(const [id,range]of Object.entries(deps)){const ref=pin.dependencies[id];if(!ref||parseRef(ref).id!==id||!satisfies(parseRef(ref).version,range)||!lock.packages[ref])fail('E_PACKAGE_CONFLICT',`Invalid locked dependency ${id}@${range}`);}
}
export const installedPath=(store:string,ref:string,pin:PackagePin)=>join(store,ref,pin.integrity.slice(7));
export async function installedPackages(directory:string):Promise<{config:PackageConfig;lock?:PackageLock;records:PackageRecord[];store:string}>{
  const project=await packageProject(directory);if(!project.exists)return {config:project.config,records:[],store:project.store};
  const lock=await readPackageLock(project.lockPath);validateGraph(lock);
  if(!same(stable(lock.requirements),stable(project.config.requirements)))fail('E_PACKAGE_LOCK','Package requirements changed; explicitly install/remove to update the lock');
  const records:PackageRecord[]=[];
  for(const [ref,pin]of Object.entries(lock.packages)){
    const path=installedPath(project.store,ref,pin);await safeSubdirectory(project.directory,path);
    let record:PackageRecord;try{record=await readPackage(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')fail('E_PACKAGE_MISSING',`Package ${ref} is not installed; restore from a trusted local catalog`);throw e;}
    if(packageRef(record.manifest)!==ref)fail('E_PACKAGE_INTEGRITY',`Package identity changed at ${path}`);
    trust(record,project.config.trustedSources);verifyPackageRecord(record,pin,lock);records.push(record);
  }
  return {config:project.config,lock,records,store:project.store};
}
async function transaction<T>(directory:string,fn:()=>Promise<T>):Promise<T>{
  const parent=join(resolve(directory),'.frameweave');await safeSubdirectory(directory,parent);await mkdir(parent,{recursive:true});const path=join(parent,'packages.operation');
  let handle;try{handle=await open(path,'wx');}catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')fail('E_PACKAGE_BUSY','Another package operation is active; inspect stale packages.operation before removing it');throw e;}
  try{return await fn();}finally{await handle.close();await rm(path,{force:true});}
}
/** Publish config + lock only after every immutable snapshot has been checked. */
async function publish(directory:string,config:PackageConfig,lock:PackageLock){
  const project=await packageProject(directory),previous=await Promise.all([optional(project.configPath),optional(project.lockPath)]),temp=await mkdtemp(join(directory,'.frameweave','package-state-'));
  try{
    await writeFile(join(temp,'config'),JSON.stringify(config,null,2)+'\n');await writeFile(join(temp,'lock'),JSON.stringify(lock,null,2)+'\n');
    await rename(join(temp,'lock'),project.lockPath);await rename(join(temp,'config'),project.configPath);
  }catch(error){for(const [i,path]of [project.configPath,project.lockPath].entries()){if(previous[i]===undefined)await rm(path,{force:true});else await writeFile(path,previous[i]!);}throw error;}
  finally{await rm(temp,{recursive:true,force:true});}
}
async function snapshots(store:string,lock:PackageLock,catalog:PackageRecord[]){
  await mkdir(store,{recursive:true});const stage=await mkdtemp(join(store,'.install-'));
  try{for(const [ref,pin]of Object.entries(lock.packages)){
    const target=installedPath(store,ref,pin);await safeSubdirectory(store,target);
    try{const old=await readPackage(target);verifyPackageRecord(old,pin,lock);continue;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const record=catalog.find(r=>packageRef(r.manifest)===ref);if(!record)fail('E_PACKAGE_MISSING',`Catalog lacks locked ${ref}`);verifyPackageRecord(record,pin,lock);
    const staging=join(stage,ref);await mkdir(staging,{recursive:true});
    for(const file of await packageFiles(record.directory)){const to=join(staging,relative(record.directory,file));await mkdir(dirname(to),{recursive:true});await copyFile(file,to);}
    const copy=await readPackage(staging);verifyPackageRecord(copy,pin,lock);await mkdir(dirname(target),{recursive:true});await rename(staging,target);
  }}finally{await rm(stage,{recursive:true,force:true});}
}
function mergeCatalog(existing:PackageRecord[],incoming:PackageRecord[]){
  const all=new Map(existing.map(r=>[packageRef(r.manifest),r]));
  for(const record of incoming){const ref=packageRef(record.manifest),old=all.get(ref);if(old&&(old.integrity!==record.integrity||!same(old.manifest.source,record.manifest.source)))fail('E_PACKAGE_IMMUTABLE',`Different content/source for ${ref}; publish a new version`);all.set(ref,record);}return [...all.values()];
}
export async function installPackages(directory:string,roots:string[],options:{add?:string[];trust?:string[];integrity?:string;ranges?:Record<string,string>}={}){
  return transaction(directory,async()=>{
    const project=await packageProject(directory),current=await installedPackages(directory),incoming=await discoverPackages(roots);
    if(!incoming.length)fail('E_PACKAGE_MISSING',`No ${PACKAGE_MANIFEST} found`);
    const requested={...project.config.requirements};const additions=options.add??(incoming.length===1?[packageRef(incoming[0].manifest)]:[]);
    if(!additions.length)fail('E_ARGUMENT','A multi-package catalog requires --add id@version');
    for(const ref of additions){const p=parseRef(ref);requested[p.id]=p.version;}
    if(options.ranges){requirements(options.ranges);Object.assign(requested,options.ranges);}
    let selected:PackageRecord|undefined;
    if(options.integrity){
      selected=incoming.length===1?incoming[0]:incoming.find(record=>packageRef(record.manifest)===additions[0]);
      if(!selected||`sha256-${selected.integrity}`!==options.integrity)
        fail('E_PACKAGE_INTEGRITY','Selected incoming package does not match expected integrity');
    }
    const trustedSources=[...new Set([...project.config.trustedSources,...options.trust??[]])].sort();
    if(!trustedSources.every(s=>/^local:[a-z][a-z0-9.-]*$/.test(s)))fail('E_PACKAGE_TRUST','Use --trust local:authority');
    const catalog=mergeCatalog(current.records,incoming),lock=resolvePackages(catalog,requested,trustedSources,current.lock);
    if(selected&&!Object.hasOwn(lock.packages,packageRef(selected.manifest)))fail('E_PACKAGE_INTEGRITY','Resolved packages do not include the pinned selection');
    await snapshots(project.store,lock,catalog);await publish(directory,{...project.config,requirements:stable(requested),trustedSources},lock);
    return {installed:Object.keys(lock.packages),roots:lock.roots,lockfile:project.lockPath};
  });
}
export async function restorePackages(directory:string,roots:string[]){
  return transaction(directory,async()=>{
    const project=await packageProject(directory),lock=await readPackageLock(project.lockPath);validateGraph(lock);
    if(!same(stable(lock.requirements),stable(project.config.requirements)))fail('E_PACKAGE_LOCK','Frozen restore cannot change requirements');
    const catalog=await discoverPackages(roots);
    for(const [ref,pin]of Object.entries(lock.packages)){const record=catalog.find(r=>packageRef(r.manifest)===ref);if(!record)fail('E_PACKAGE_MISSING',`Missing locked ${ref}`);trust(record,project.config.trustedSources);verifyPackageRecord(record,pin,lock);}
    await snapshots(project.store,lock,catalog);await installedPackages(directory);return {restored:Object.keys(lock.packages),frozen:true};
  });
}
export async function uninstallPackage(directory:string,id:string){
  return transaction(directory,async()=>{
    const project=await packageProject(directory),current=await installedPackages(directory);if(!current.lock||!Object.hasOwn(project.config.requirements,id))fail('E_PACKAGE_DEPENDENT',`${id} is not a direct requirement; remove its dependent first`);
    const requested={...project.config.requirements};delete requested[id];
    const lock=resolvePackages(current.records,requested,project.config.trustedSources,current.lock);
    if(Object.keys(lock.packages).some(ref=>parseRef(ref).id===id))fail('E_PACKAGE_DEPENDENT',`${id} is still required by another installed package`);
    await publish(directory,{...project.config,requirements:stable(requested)},lock);
    const removed=Object.keys(current.lock.packages).filter(ref=>!lock.packages[ref]);
    for(const ref of removed){const target=installedPath(project.store,ref,current.lock.packages[ref]);await safeSubdirectory(project.directory,target);await rm(target,{recursive:true,force:true});}
    return {removed,remaining:Object.keys(lock.packages)};
  });
}
export async function verifyPackages(directory:string){const state=await installedPackages(directory);return {valid:true,packages:state.records.map(r=>({reference:packageRef(r.manifest),source:r.manifest.source,integrity:`sha256-${r.integrity}`,modules:r.moduleIntegrity})),lockfile:join(resolve(directory),lockName)};}
