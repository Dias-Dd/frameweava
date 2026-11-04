import {readFile,readdir,realpath,stat,writeFile} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runtimePin} from '../compiler/runtime-lock.ts';
import {validateManifest,parseRef,satisfies,version,fail,fields} from './schema.ts';
import type {PluginManifest,PluginKind,PluginPort} from './sdk.ts';
import {userPluginRoot} from './paths.ts';
import {installedPackages} from '../packages/manager.ts';
import {readPackage,PACKAGE_MANIFEST,type PackageRecord} from '../packages/manifest.ts';

export const builtinRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../../plugins/builtin');
export interface InstalledPlugin {manifest:PluginManifest;directory:string;entry?:string;integrity:string;package?:PackageRecord}
export interface Lock {schemaVersion:1;runtime:typeof runtimePin;plugins:Record<string,{integrity:string;dependencies:Record<string,string>}>}
export async function inside(root:string,path:string):Promise<string>{let absolute:string,base:string;try{absolute=await realpath(resolve(root,path));base=await realpath(root);}catch(e){fail('E_PLUGIN_PATH',`Plugin file is unavailable: ${path}: ${String(e)}`);}const rel=relative(base,absolute);if(rel==='..'||rel.startsWith('..\\')||rel.startsWith('../')||isAbsolute(rel))fail('E_PLUGIN_PATH',`Plugin file escapes its declared directory: ${path}`);return absolute;}
export async function integrity(directory:string):Promise<string>{
  const hash=createHash('sha256');let bytes=0,files=0;
  async function walk(dir:string):Promise<void>{for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(['node_modules','.git','.frameweave'].includes(entry.name))continue;
    const path=await inside(directory,join(dir,entry.name)),info=await stat(path);
    if(info.isDirectory()){if(entry.isSymbolicLink())fail('E_PLUGIN_PATH','Directory links inside plugins are unsupported');await walk(path);}
    else {bytes+=info.size;if(++files>1000||bytes>32*1024*1024)fail('E_PLUGIN_BUDGET','Plugin exceeds 1000 files / 32 MiB');hash.update(relative(directory,path).replaceAll('\\','/'));hash.update('\0');hash.update(await readFile(path));hash.update('\0');}
  }}
  await walk(directory);return hash.digest('hex');
}
async function load(directory:string):Promise<InstalledPlugin>{
  directory=await realpath(directory);const path=await inside(directory,'effect.json');
  if((await stat(path)).size>65536)fail('E_PLUGIN_BUDGET','Manifest exceeds 64 KiB');
  let manifest:unknown;try{manifest=JSON.parse(await readFile(path,'utf8'));}catch(e){fail('E_PLUGIN_SCHEMA',`Cannot read ${path}: ${String(e)}`);}
  validateManifest(manifest);
  const entry=manifest.entry?await inside(directory,manifest.entry):undefined;
  if(entry&&!/\.[cm]?[jt]sx?$/.test(entry))fail('E_PLUGIN_PATH','Plugin entry must be TS/TSX/JS');
  for(const resource of Object.values(manifest.resources??{}))await inside(directory,resource.src);
  let pack:PackageRecord|undefined;try{await stat(join(directory,PACKAGE_MANIFEST));pack=await readPackage(directory);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  return {manifest,directory,entry,integrity:await integrity(directory),package:pack};
}
export interface SearchFilter {kind?:PluginKind;engine?:string;input?:PluginPort;output?:PluginPort;compatible?:string}
/** Legacy manifests remain readable for historical locks and exact inspection. */
export function discoverableEffects(registry:PluginRegistry){
  const active=new PluginRegistry();
  for(const record of registry.list())if(record.manifest.engine==='native-gpu')active.add(record);
  return active;
}
export class PluginRegistry {
  private records=new Map<string,InstalledPlugin>();
  add(record:InstalledPlugin){const key=`${record.manifest.id}@${record.manifest.version}`;if(this.records.has(key))fail('E_PLUGIN_DUPLICATE',`Duplicate ${key}`);this.records.set(key,record);}
  get(ref:string):InstalledPlugin{parseRef(ref);const record=this.records.get(ref);if(!record)fail('E_PLUGIN_MISSING',`Plugin not found: ${ref}`);return record;}
  list(){return [...this.records.values()].sort((a,b)=>a.manifest.id.localeCompare(b.manifest.id)||compare(a.manifest.version,b.manifest.version));}
  search(query='',filters:SearchFilter={}){
    const terms=query.toLowerCase().split(/[\s,]+/).filter(Boolean);
    return this.list().filter(({manifest:m})=>{
      const text=[m.id,m.name,m.description,...m.tags??[]].join(' ').toLowerCase();
      return terms.every(t=>text.includes(t))&&(!filters.kind||m.kind===filters.kind)&&(!filters.engine||m.engine===filters.engine)&&(!filters.input||Object.values(m.inputs).includes(filters.input))&&(!filters.output||Object.values(m.outputs).includes(filters.output))&&(!filters.compatible||satisfies(filters.compatible,m.compatible));
    });
  }
  dependencies(ref:string):Record<string,string>{const record=this.get(ref),out:Record<string,string>={};for(const [id,range]of Object.entries(record.manifest.dependencies??{})){const found=this.list().filter(r=>r.manifest.id===id&&satisfies(r.manifest.version,range)).at(-1);if(!found)fail('E_PLUGIN_DEPENDENCY',`${ref} requires missing ${id}@${range}`);out[id]=`${id}@${found.manifest.version}`;}return out;}
  lock(references?:string[]):Lock {
    const plugins:Lock['plugins']={},visiting=new Set<string>();
    const visit=(ref:string)=>{if(visiting.has(ref))fail('E_PLUGIN_CYCLE',`Plugin dependency cycle: ${[...visiting,ref].join(' -> ')}`);if(plugins[ref])return;visiting.add(ref);const record=this.get(ref),dependencies=this.dependencies(ref);for(const dep of Object.values(dependencies))visit(dep);visiting.delete(ref);plugins[ref]={integrity:record.integrity,dependencies};};
    for(const ref of references??this.list().map(record=>`${record.manifest.id}@${record.manifest.version}`))visit(ref);
    return {schemaVersion:1,runtime:runtimePin,plugins};
  }
  verify(ref:string,lock:Lock,visiting=new Set<string>()){
    if(!lock.runtime||lock.runtime.apiVersion!==runtimePin.apiVersion||lock.runtime.engineVersion!==runtimePin.engineVersion||lock.runtime.integrity!==runtimePin.integrity)fail('E_PLUGIN_LOCK','Plugin SDK/dependency runtime changed; review and explicitly update the project lock');
    if(visiting.has(ref))fail('E_PLUGIN_CYCLE',`Locked dependency cycle at ${ref}`);visiting.add(ref);
    const record=this.get(ref),pin=lock.plugins[ref];if(!pin||pin.integrity!==record.integrity)fail('E_PLUGIN_LOCK',`Missing or changed ${ref}; review code and run effects lock explicitly`);
    const declared=record.manifest.dependencies??{};
    if(Object.keys(pin.dependencies).sort().join('|')!==Object.keys(declared).sort().join('|'))fail('E_PLUGIN_LOCK',`${ref} dependency lock mismatch`);
    for(const [id,range]of Object.entries(declared)){const target=pin.dependencies[id],parsed=parseRef(target);if(parsed.id!==id||!satisfies(parsed.version,range))fail('E_PLUGIN_DEPENDENCY',`Conflicting locked dependency ${target}`);this.verify(target,lock,new Set(visiting));}
  }
}
function compare(a:string,b:string){const x=version(a),y=version(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2];}
export async function discoverPlugins(roots:string[]):Promise<PluginRegistry>{const registry=new PluginRegistry(),seen=new Set<string>();
async function register(path:string){const directory=await realpath(path);if(seen.has(directory))return;seen.add(directory);registry.add(await load(directory));}
for(const root of [...new Set(roots.map(r=>resolve(r)))]){
  let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(e){fail('E_PLUGIN_PATH',`Cannot discover plugin root ${root}: ${String(e)}`);}
  if(entries.some(e=>e.name==='effect.json')){await register(root);continue;}
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name)))if(entry.isDirectory()||entry.isSymbolicLink()){
    const dir=join(root,entry.name);try{await stat(join(dir,'effect.json'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')continue;throw e;}await register(dir);
  }
}return registry;}
export async function projectPlugins(projectDirectory:string){
  const directory=resolve(projectDirectory),path=join(directory,'frameweave.plugins.json');let config:{schemaVersion:1;roots:string[];lockfile?:string;userLibrary?:boolean}={schemaVersion:1,roots:[]};
  try{const value=JSON.parse(await readFile(path,'utf8'));fields(value,['schemaVersion','roots','lockfile','userLibrary'],'plugin config');if(value.schemaVersion!==1||!Array.isArray(value.roots)||!value.roots.every((r:unknown)=>typeof r==='string')||value.lockfile!==undefined&&typeof value.lockfile!=='string'||value.userLibrary!==undefined&&typeof value.userLibrary!=='boolean')fail('E_PLUGIN_SCHEMA','Invalid plugin config');config=value as typeof config;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const lockfile=resolve(directory,config.lockfile??'frameweave.plugins.lock.json'),rel=relative(directory,lockfile);
  if(rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))fail('E_PLUGIN_PATH','Lock file must stay inside its project directory');
  const registry=await discoverPlugins([builtinRoot,...config.roots.map(r=>resolve(directory,r))]);
  // Explicit project copies have priority over user installations. Their lock must still match.
  if(config.userLibrary!==false){
    try{await stat(userPluginRoot());const shared=await discoverPlugins([userPluginRoot()]);
      const local=new Set(registry.list().map(p=>`${p.manifest.id}@${p.manifest.version}`));
      for(const p of shared.list())if(!local.has(`${p.manifest.id}@${p.manifest.version}`))registry.add(p);
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  const packages=await installedPackages(directory);
  for(const pack of packages.records)if(pack.effect){const ref=`${pack.manifest.id}@${pack.manifest.version}`;if(registry.list().some(p=>`${p.manifest.id}@${p.manifest.version}`===ref))fail('E_PACKAGE_DUPLICATE',`Managed package collides with legacy effect ${ref}`);registry.add({manifest:pack.effect,directory:pack.directory,entry:pack.effectEntry,integrity:await integrity(pack.directory),package:pack});}
  return {directory,path,config,lockfile,registry,packages};
}
export async function readLock(path:string):Promise<Lock>{
  let value:unknown;try{value=JSON.parse(await readFile(path,'utf8'));}catch(e){fail('E_PLUGIN_LOCK',`Cannot read lock ${path}: ${String(e)}`);}
  fields(value,['schemaVersion','runtime','plugins'],'plugin lock');if(value.schemaVersion!==1||!value.runtime||!value.plugins||typeof value.plugins!=='object')fail('E_PLUGIN_LOCK','Invalid plugin lock');
  for(const pin of Object.values(value.plugins)){fields(pin,['integrity','dependencies'],'lock entry');if(typeof pin.integrity!=='string'||!/^[a-f0-9]{64}$/.test(pin.integrity)||!pin.dependencies||typeof pin.dependencies!=='object'||!Object.values(pin.dependencies).every(v=>typeof v==='string'))fail('E_PLUGIN_LOCK','Invalid plugin lock entry');}
  return value as unknown as Lock;
}
export async function writeLock(projectDirectory:string){const project=await projectPlugins(projectDirectory),lock=project.registry.lock();await writeFile(project.lockfile,JSON.stringify(lock,null,2)+'\n');return {path:project.lockfile,plugins:Object.keys(lock.plugins)};}
