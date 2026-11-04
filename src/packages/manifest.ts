import {engineVersion} from '../compiler/runtime-lock.ts';
import {readFile,readdir,realpath,stat,lstat} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {fields,plain,fail,version,satisfies,validateManifest} from '../plugins/schema.ts';
import type {PluginManifest} from '../plugins/sdk.ts';
import {FUNCTION_METADATA,parseFunctionMetadata,spatialFunctionGuide,type FunctionMetadata} from './function-metadata.ts';

export const PACKAGE_MANIFEST='frameweave.package.json';
export type ModuleFormat='javascript'|'wasm'|'wgsl'|'resource';
export type Capability='canvas2d'|'wasm'|'webgpu'|'native-gpu';
export interface PackageModule {format:ModuleFormat;path:string;abi?:'core-v1';producer?:'rust'}
export interface PackageSource {kind:'local';authority:string}
interface BindingFields {
  module:string;
  types:string;
  gpu?:'required';
  gpuExports?:string[];
  /** Exposed name -> an existing named binding in an exact locked dependency. */
  forward?:Record<string,{dependency:string;name:string}>;
}
export type PackageBindings=(BindingFields&{schemaVersion:2;engine:'native-gpu';initialize?:string;gpuApi?:'native-wgpu'});
export interface PackageManifest {
  schemaVersion:1;apiVersion:1;id:string;version:string;name:string;description:string;tags?:string[];
  source:PackageSource;compatible:string;platforms:('web'|'node')[];capabilities:Capability[];
  permissions:{filesystem:false;network:false;process:false};
  modules:Record<string,PackageModule>;entry?:string;effect?:string;dependencies?:Record<string,string>;bindings?:PackageBindings;
}
export interface PackageRecord {
  manifest:PackageManifest;directory:string;integrity:string;moduleIntegrity:Record<string,string>;
  effect?:PluginManifest;effectEntry?:string;functions?:FunctionMetadata[];creationGuide?:FunctionMetadata[];
}
export const packageRef=(m:Pick<PackageManifest,'id'|'version'>)=>`${m.id}@${m.version}`;
export const digest=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
export const within=(root:string,path:string)=>{const r=relative(root,path);return r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
const idPattern=/^[a-z][a-z0-9.-]*$/;
export function localPath(value:unknown):asserts value is string {
  if(typeof value!=='string'||!value||value.includes('\\')||value.includes(':')||value.includes('\0')||isAbsolute(value)||value.split('/').some(p=>p==='..'||p==='' ))
    fail('E_PACKAGE_PATH',`Expected a relative package path: ${String(value)}`);
}
export function validatePackage(value:unknown):asserts value is PackageManifest {
  fields(value,['schemaVersion','apiVersion','id','version','name','description','tags','source','compatible','platforms','capabilities','permissions','modules','entry','effect','dependencies','bindings'],'package manifest');
  if(value.schemaVersion!==1||value.apiVersion!==1)fail('E_PACKAGE_SCHEMA','Unsupported package schema/API version');
  for(const key of ['id','version','name','description','compatible'])if(typeof value[key]!=='string'||!value[key])fail('E_PACKAGE_SCHEMA',`Missing ${key}`);
  if(!idPattern.test(value.id as string))fail('E_PACKAGE_SCHEMA','Invalid package ID');
  version(value.version as string);satisfies(engineVersion,value.compatible as string);
  fields(value.source,['kind','authority'],'package source');
  if(value.source.kind!=='local'||typeof value.source.authority!=='string'||!idPattern.test(value.source.authority))fail('E_PACKAGE_SOURCE','R1 supports explicitly trusted local authorities only');
  if(!Array.isArray(value.platforms)||!value.platforms.length||!value.platforms.every(p=>['web','node'].includes(p))||new Set(value.platforms).size!==value.platforms.length)fail('E_PACKAGE_SCHEMA','Invalid platforms');
  if(!Array.isArray(value.capabilities)||!value.capabilities.every(c=>['canvas2d','wasm','webgpu','native-gpu'].includes(c))||new Set(value.capabilities).size!==value.capabilities.length)fail('E_PACKAGE_CAPABILITY','Unsupported capability');
  fields(value.permissions,['filesystem','network','process'],'package permissions');
  if(['filesystem','network','process'].some(k=>value.permissions && (value.permissions as Record<string,unknown>)[k]!==false))fail('E_PACKAGE_PERMISSION','R1 grants no filesystem, network, or process permissions');
  if(value.tags!==undefined&&(!Array.isArray(value.tags)||!value.tags.every(t=>typeof t==='string')))fail('E_PACKAGE_SCHEMA','Invalid tags');
  if(!plain(value.modules)||!Object.keys(value.modules).length||Object.keys(value.modules).length>64)fail('E_PACKAGE_SCHEMA','Package requires 1–64 modules');
  for(const [name,module]of Object.entries(value.modules)){
    if(!/^[A-Za-z]\w*$/.test(name))fail('E_PACKAGE_SCHEMA',`Invalid module name ${name}`);
    fields(module,['format','path','abi','producer'],`module ${name}`);localPath(module.path);
    const extension=extname(module.path).toLowerCase();
    if(!['javascript','wasm','wgsl','resource'].includes(module.format as string))fail('E_PACKAGE_SCHEMA',`Unknown module format ${String(module.format)}`);
    if(module.format==='javascript'&&!/\.[cm]?[jt]sx?$/.test(extension)||module.format==='wgsl'&&extension!=='.wgsl'||module.format==='wasm'&&extension!=='.wasm')fail('E_PACKAGE_SCHEMA',`Module ${name} extension disagrees with format`);
    if(module.format==='wasm'){
      if(module.abi!=='core-v1'||module.producer!==undefined&&module.producer!=='rust')fail('E_PACKAGE_ABI','WASM requires core-v1 ABI; optional producer is rust');
      if(!(value.capabilities as string[]).includes('wasm'))fail('E_PACKAGE_CAPABILITY','WASM module requires wasm capability');
    }else if(module.abi!==undefined||module.producer!==undefined)fail('E_PACKAGE_ABI','ABI/producer belong to WASM modules');
  }
  if(value.entry!==undefined&&(typeof value.entry!=='string'||!Object.hasOwn(value.modules,value.entry)||(value.modules[value.entry] as PackageModule).format!=='javascript'))fail('E_PACKAGE_SCHEMA','Default entry must name a JavaScript/TypeScript module');
  if(value.effect!==undefined){localPath(value.effect);if(!value.entry)fail('E_PACKAGE_SCHEMA','An effect package requires a default JS/TS entry');}
  if(value.bindings!==undefined){
    const b=value.bindings;fields(b,['schemaVersion','module','types','engine','initialize','gpu','gpuApi','gpuExports','forward'],'package bindings');
    if(b.engine==='web')fail('E_WEB_REMOVED','Browser package bindings were removed; use Native bindings and Servo for HTML/CSS.');
    const native=b.schemaVersion===2&&b.engine==='native-gpu';
    if(!native)fail('E_PACKAGE_BINDING','Bindings require schema 2/native-gpu');
    if(typeof b.module!=='string'||!Object.hasOwn(value.modules,b.module)||(value.modules[b.module] as PackageModule).format!=='javascript')fail('E_PACKAGE_BINDING','Bindings require a declared JavaScript module');
    if(b.forward===undefined&&b.initialize===undefined||b.initialize!==undefined&&(typeof b.initialize!=='string'||!/^[$A-Za-z_][$\w]*$/.test(b.initialize)))fail('E_PACKAGE_BINDING','Native bindings require a named initializer');
    if(b.gpu!==undefined&&b.gpu!=='required')fail('E_PACKAGE_BINDING','Unsupported binding GPU requirement');
    if(b.gpuApi!==undefined&&(b.gpu!=='required'||!['native-wgpu'].includes(b.gpuApi as string)))fail('E_PACKAGE_BINDING','GPU API disagrees with binding engine/version');
    if(b.gpuExports!==undefined&&(b.gpu!=='required'||!Array.isArray(b.gpuExports)||!b.gpuExports.length||new Set(b.gpuExports).size!==b.gpuExports.length||!b.gpuExports.every(n=>typeof n==='string'&&/^[$A-Za-z_][$\w]*$/.test(n))))fail('E_PACKAGE_BINDING','GPU exports must be explicit unique callable names');
    if(b.forward!==undefined){
      if(!plain(b.forward)||!Object.keys(b.forward).length||!plain(value.dependencies)||b.initialize!==undefined||b.gpu!==undefined||value.effect!==undefined||value.capabilities.length)
        fail('E_PACKAGE_BINDING','A forwarding suite requires declared dependencies and borrows their binding capabilities');
      const identifier=/^[$A-Za-z_][$\w]*$/;
      for(const [name,target] of Object.entries(b.forward)){
        fields(target,['dependency','name'],'forwarded binding');
        if(!identifier.test(name)||typeof target.name!=='string'||!identifier.test(target.name)||typeof target.dependency!=='string'||!Object.hasOwn(value.dependencies,target.dependency))
          fail('E_PACKAGE_BINDING','Forwarded bindings must name a declared dependency and a callable export');
      }
    }
    const capabilities=value.capabilities as string[];
    if(native){
      if(capabilities.includes('canvas2d')||capabilities.includes('webgpu'))fail('E_PACKAGE_CAPABILITY','Native bindings cannot claim a Web drawing backend');
      if(b.gpu==='required'&&(b.gpuApi!=='native-wgpu'||!capabilities.includes('native-gpu'))||capabilities.includes('native-gpu')&&b.gpu!=='required')fail('E_PACKAGE_CAPABILITY','Native GPU binding requires native-wgpu and its own capability');
    }
    localPath(b.types);if(!b.types.endsWith('.d.ts'))fail('E_PACKAGE_BINDING','Bindings require a public .d.ts declaration');
  }
  if(value.dependencies!==undefined){if(!plain(value.dependencies))fail('E_PACKAGE_SCHEMA','Invalid package dependencies');for(const [id,range]of Object.entries(value.dependencies)){if(!idPattern.test(id)||typeof range!=='string')fail('E_PACKAGE_SCHEMA','Invalid dependency');satisfies(engineVersion,range);}}
}

/** Reject links and special files, including links that would alias a different hash path. */
export async function packageFiles(directory:string):Promise<string[]> {
  const base=await realpath(directory),files:string[]=[];let bytes=0;
  async function walk(path:string){for(const entry of (await readdir(path,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    if(['node_modules','.git','.frameweave'].includes(entry.name))continue;
    const file=join(path,entry.name),info=await lstat(file);
    if(info.isSymbolicLink()||!within(base,await realpath(file)))fail('E_PACKAGE_PATH',`Package links are unsupported: ${file}`);
    if(info.isDirectory())await walk(file);
    else if(info.isFile()){bytes+=info.size;files.push(file);if(files.length>1000||bytes>32*1024*1024)fail('E_PACKAGE_BUDGET','Package exceeds 1000 files / 32 MiB');}
    else fail('E_PACKAGE_PATH',`Package requires ordinary files: ${file}`);
  }}
  await walk(base);return files;
}
export async function readPackage(directory:string):Promise<PackageRecord> {
  directory=await realpath(directory);const files=await packageFiles(directory),manifestPath=join(directory,PACKAGE_MANIFEST);
  if((await stat(manifestPath)).size>65536)fail('E_PACKAGE_BUDGET','Package manifest exceeds 64 KiB');
  let manifest:unknown;try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(e){fail('E_PACKAGE_SCHEMA',`Cannot read package manifest: ${String(e)}`);}validatePackage(manifest);
  const declared=async(path:string)=>{localPath(path);const file=resolve(directory,path);if(!files.includes(file))fail('E_PACKAGE_PATH',`Missing declared package file: ${path}`);return file;};
  const moduleIntegrity:Record<string,string>={};
  for(const [name,module]of Object.entries(manifest.modules))moduleIntegrity[name]=digest(await readFile(await declared(module.path)));
  if(manifest.bindings)await declared(manifest.bindings.types);
  let effect:PluginManifest|undefined,effectEntry:string|undefined;
  if(manifest.effect){
    const file=await declared(manifest.effect);if((await stat(file)).size>65536)fail('E_PACKAGE_BUDGET','Effect manifest exceeds 64 KiB');
    const raw=JSON.parse(await readFile(file,'utf8'));validateManifest(raw);effect=raw;
    if(effect.id!==manifest.id||effect.version!==manifest.version||effect.engine!=='web'||effect.compatible!==manifest.compatible)fail('E_PACKAGE_ABI','Package/effect identity, platform, and compatibility must agree');
    effectEntry=await declared(manifest.modules[manifest.entry!].path);
    if(!effect.entry||resolve(directory,effect.entry)!==effectEntry)fail('E_PACKAGE_ABI','Effect entry must match the default package module');
    for(const resource of Object.values(effect.resources??{}))await declared(resource.src);
  }
  // Canonical records bind file boundaries even when arbitrary binary bytes contain NULs.
  const inventory:[string,string][]=[];
  let functions:FunctionMetadata[]|undefined,creationGuide:FunctionMetadata[]|undefined;
  for(const file of files){
    const name=relative(directory,file).replaceAll('\\','/'),bytes=await readFile(file);
    if(name===FUNCTION_METADATA){
      if(!manifest.bindings||bytes.length>256*1024)fail('E_PACKAGE_FUNCTIONS',`${FUNCTION_METADATA} requires Native bindings and at most 256 KiB`);
      functions=parseFunctionMetadata(bytes.toString('utf8'),packageRef(manifest));
    }
    if(name==='creation-guide.json'&&manifest.id==='spatial-creation')
      creationGuide=spatialFunctionGuide(bytes.toString('utf8'),packageRef(manifest),path=>files.includes(join(directory,path)));
    inventory.push([name,digest(bytes)]);
  }
  return {manifest,directory,integrity:digest(JSON.stringify(inventory)),moduleIntegrity,effect,effectEntry,functions,creationGuide};
}
export function assertPlatform(record:PackageRecord,platform='web'){
  if(!record.manifest.platforms.includes(platform as 'web')||!satisfies(engineVersion,record.manifest.compatible))fail('E_PACKAGE_PLATFORM',`${packageRef(record.manifest)} is incompatible with ${platform}/engine ${engineVersion}`);
}
export async function discoverPackages(roots:string[]):Promise<PackageRecord[]> {
  const records:PackageRecord[]=[],seen=new Set<string>(),identities=new Set<string>();
  async function add(path:string){path=await realpath(path);if(seen.has(path))return;seen.add(path);const record=await readPackage(path),ref=packageRef(record.manifest);if(identities.has(ref))fail('E_PACKAGE_DUPLICATE',`Ambiguous package ${ref}; choose one trusted catalog`);identities.add(ref);records.push(record);}
  for(const root of [...new Set(roots.map(r=>resolve(r)))]){
    let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(e){fail('E_PACKAGE_MISSING',`Cannot read package catalog ${root}: ${String(e)}`);}
    if(entries.some(e=>e.name===PACKAGE_MANIFEST)){await add(root);continue;}
    for(const entry of entries.sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0))if(entry.isDirectory())try{await stat(join(root,entry.name,PACKAGE_MANIFEST));await add(join(root,entry.name));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  return records.sort((a,b)=>packageRef(a.manifest)<packageRef(b.manifest)?-1:1);
}
