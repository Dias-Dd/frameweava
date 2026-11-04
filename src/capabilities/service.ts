import {runtimeCachePath} from '../runtime/paths.ts';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {EngineError,diagnostic} from '../core/errors.ts';
import type {Diagnostic} from '../core/types.ts';
import {projectPlugins,PluginRegistry,readLock,integrity,inside,builtinRoot,discoverableEffects,type InstalledPlugin} from '../plugins/registry.ts';
import {userPluginRoot} from '../plugins/paths.ts';
import {parseRef,satisfies,plain,PLUGIN_KINDS,PORTS} from '../plugins/schema.ts';
import {searchPlugins} from '../plugins/search.ts';
import {discoverPackages,packageRef,within,readPackage,type PackageRecord} from '../packages/manifest.ts';
import {resolvePackages} from '../packages/manager.ts';
import {parsePortable,materializePortable} from '../compiler/portable.ts';
import {engineRoot} from '../compiler/build.ts';
import {engineVersion} from '../compiler/runtime-lock.ts';
import {readExamples,smallFile,kitConfiguration} from './examples.ts';
import {searchFunctionPage} from './functions.ts';
import type {CapabilityQuery,CapabilitySearch,CapabilityIdentity,CapabilitySummary,CapabilityApi,CapabilityCommand} from './types.ts';

const hash=(bytes:string|Uint8Array)=>'sha256-'+createHash('sha256').update(bytes).digest('hex');
const canonical=(value:any):string=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const error=(code:string,message:string,details:unknown=null)=>new EngineError(code,message,{details});
const bounded=<T>(value:T,max=131072):T=>{if(Buffer.byteLength(JSON.stringify(value))>max)throw error('E_CAPABILITY_BUDGET','Selected response exceeds its byte budget',{max});return value;};
export function capabilityIdentity(record:InstalledPlugin):CapabilityIdentity{
  const m=record.manifest;if(m.id.length>256)throw error('E_CAPABILITY_BUDGET','Capability identifier exceeds 256 characters');
  return {reference:`${m.id}@${m.version}`,id:m.id,version:m.version,integrity:'sha256-'+(record.package?.integrity??record.integrity),integrityKind:record.package?'package':'plugin',pluginIntegrity:'sha256-'+record.integrity};
}
function validateOptions(options:CapabilityQuery){
  if(options.project!==undefined&&(typeof options.project!=='string'||!options.project))throw error('E_ARGUMENT','project must be a nonempty path');
  if(options.platform!==undefined&&!['web','node'].includes(options.platform))throw error('E_ARGUMENT','platform must be web or node');
  if(options.catalogs&&(!Array.isArray(options.catalogs)||options.catalogs.length>16||!options.catalogs.every(p=>typeof p==='string'&&p.length>0)))throw error('E_ARGUMENT','Use at most 16 explicit local catalogs');
  if(options.expectedIntegrity!==undefined&&!/^sha256-[a-f0-9]{64}$/.test(options.expectedIntegrity))throw error('E_ARGUMENT','integrity must be sha256-<64 lowercase hex digits>');
}
async function context(options:CapabilityQuery){
  validateOptions(options);const projectArgument=resolve(options.project??'.');let directory=projectArgument,portable=false;
  try{if(!(await stat(directory)).isDirectory()){
    if(parsePortable(await readFile(directory,'utf8'))){portable=true;directory=dirname((await materializePortable(directory,runtimeCachePath('portable')))!);}
    else directory=dirname(directory);
  }}catch(e){if(e instanceof EngineError)throw e;throw error('E_CAPABILITY_PROJECT',`Cannot read project ${projectArgument}`,{project:projectArgument});}
  const project=await projectPlugins(directory),registry=new PluginRegistry(),installed=new Set(project.registry.list().map(r=>`${r.manifest.id}@${r.manifest.version}`));
  for(const record of project.registry.list())registry.add(record);
  const catalog=options.catalogs?.length?await discoverPackages(options.catalogs):[],locations=new Map<string,string>(),unsupported:string[]=[];
  if(catalog.length>256||registry.list().length>512)throw error('E_CAPABILITY_BUDGET','Query exceeds 256 catalog packages / 512 installed P4 capabilities');
  for(const pack of catalog){const ref=packageRef(pack.manifest);locations.set(ref,pack.directory);
    if(!pack.effect){unsupported.push(ref);continue;}
    const old=registry.list().find(r=>`${r.manifest.id}@${r.manifest.version}`===ref);
    if(old){if(!old.package||old.package.integrity!==pack.integrity)throw error('E_PACKAGE_IMMUTABLE',`Conflicting installed/catalog content for ${ref}`,{reference:ref});continue;}
    registry.add({manifest:pack.effect,directory:pack.directory,entry:pack.effectEntry,integrity:await integrity(pack.directory),package:pack});
  }
  let lock:Awaited<ReturnType<typeof readLock>>|null=null,lockError:Diagnostic|null=null;
  try{await stat(project.lockfile);lock=await readLock(project.lockfile);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')lockError=diagnostic(e);}
  let userRoot:string|null=null;try{userRoot=await realpath(userPluginRoot());}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  return {project,projectArgument,portable,registry,installed,catalog,locations,unsupported,lock,lockError,userRoot,builtin:await realpath(builtinRoot),platform:options.platform??'web'};
}
type Context=Awaited<ReturnType<typeof context>>;
function select(ctx:Context,ref:string,expected?:string){
  if(typeof ref!=='string'||ref.length>300)throw error('E_PLUGIN_VERSION','Use the exact capability id@major.minor.patch returned by search');parseRef(ref);
  let record:InstalledPlugin;try{record=ctx.registry.get(ref);}catch(e){if(ctx.unsupported.includes(ref))throw error('E_CAPABILITY_DESCRIPTOR','Package has no P4 effect descriptor; use packages inspect for package-only modules',{reference:ref});throw e;}
  const identity=capabilityIdentity(record);if(expected&&identity.integrity!==expected)throw error('E_PACKAGE_INTEGRITY',`Selected ${ref} has changed content`,{reference:ref,expected,actual:identity.integrity});return record;
}
function summary(ctx:Context,record:InstalledPlugin):CapabilitySummary{
  const identity=capabilityIdentity(record),ref=identity.reference,m=record.manifest,pack=record.package,installed=ctx.installed.has(ref),diagnostics:Diagnostic[]=[];
  const approved=!!pack&&ctx.project.packages.config.trustedSources.includes(`local:${pack.manifest.source.authority}`);
  const origin=pack?'package':within(ctx.builtin,record.directory)?'builtin':ctx.userRoot&&within(ctx.userRoot,record.directory)?'user':'project';
  const compatible=m.engine==='native-gpu'&&ctx.platform==='web'&&satisfies(engineVersion,m.compatible)&&(!pack||pack.manifest.platforms.includes(ctx.platform));
  if(!compatible)diagnostics.push(diagnostic(error(pack?'E_PACKAGE_PLATFORM':'E_EFFECT_BACKEND',`${ref} cannot use the ${ctx.platform} P4 runtime`,{backend:m.engine,compatible:m.compatible,platforms:pack?.manifest.platforms??[m.engine]})));
  let pluginLock:CapabilitySummary['locks']['plugin']=installed?'missing':'not-installed';
  if(installed&&ctx.lockError){pluginLock='stale';diagnostics.push(ctx.lockError);}
  else if(installed&&ctx.lock){try{ctx.project.registry.verify(ref,ctx.lock);pluginLock='verified';}catch(e){pluginLock='stale';diagnostics.push(diagnostic(e));}}
  const declarations=[...new Map([...Object.entries(m.dependencies??{}),...Object.entries(pack?.manifest.dependencies??{})].map(([id,range])=>[id+'\0'+range,[id,range] as const])).values()];
  const dependencies=declarations.sort(([a],[b])=>a.localeCompare(b)).map(([id,range])=>{
    const installedRefs=ctx.registry.list().filter(r=>ctx.installed.has(`${r.manifest.id}@${r.manifest.version}`)&&r.manifest.id===id&&satisfies(r.manifest.version,range)).map(r=>`${r.manifest.id}@${r.manifest.version}`);
    // Resource-only R1 dependencies belong to the package resolver, even without a P4 descriptor.
    for(const p of ctx.project.packages.records)if(p.manifest.id===id&&satisfies(p.manifest.version,range)&&!installedRefs.includes(packageRef(p.manifest)))installedRefs.push(packageRef(p.manifest));
    const candidates=ctx.catalog.filter(p=>p.manifest.id===id&&satisfies(p.manifest.version,range)).map(p=>packageRef(p.manifest));
    return {id,range,installed:installedRefs.sort(),catalog:candidates.sort(),state:installedRefs.length?'installed' as const:candidates.length?'local-candidate' as const:'missing' as const};
  });
  let missing=dependencies.some(d=>!d.installed.length);
  if(missing)diagnostics.push(diagnostic(error(pack?'E_PACKAGE_MISSING':'E_PLUGIN_DEPENDENCY',`${ref} has missing dependencies`,{dependencies:dependencies.filter(d=>d.state==='missing')})));
  if(pack&&!installed){try{
    const available=new Map(ctx.project.packages.records.map(p=>[packageRef(p.manifest),p]));available.set(ref,pack);
    // A read-only resolution against existing R1 trust. No authority is added by this query.
    resolvePackages([...available.values()],{...ctx.project.packages.config.requirements,[m.id]:m.version},ctx.project.packages.config.trustedSources,ctx.project.packages.lock);
  }catch(e){const d=diagnostic(e);diagnostics.push(d);if(d.code==='E_PACKAGE_MISSING')missing=true;}}
  const installPath=ctx.locations.get(ref),command=(args:string[],requiresSourceApproval=false):CapabilityCommand=>({executable:'frameweave',args,requiresSourceApproval});
  if(ctx.portable&&!installed)diagnostics.push(diagnostic(error('E_PORTABLE_EDIT','Install in the authoring project and re-export; a portable project cannot be edited by packages install')));
  const install=pack&&compatible&&!installed&&installPath&&!ctx.portable?command(['packages','install',installPath,'--project',ctx.projectArgument,'--add',ref,'--integrity',identity.integrity,...approved?[]:['--trust',`local:${pack.manifest.source.authority}`]],!approved):null;
  const capabilities=pack?.manifest.capabilities??[];
  return {
    identity,name:m.name.slice(0,256),description:m.description.slice(0,512),descriptionTruncated:m.description.length>512,kind:m.kind,
    source:{kind:origin,location:record.directory,authority:pack?.manifest.source.authority??null,catalog:!installed},
    trust:{system:pack?'r1':'legacy',state:pack?approved?'approved':'approval-required':origin==='builtin'?'bundled':'not-recorded'},
    availability:{state:missing?'missing-dependencies':!compatible?'blocked':!installed?'not-installed':pluginLock!=='verified'?'requires-lock':'eligible',installed,contentVerified:true,runtimeVerified:false},
    locks:{plugin:pluginLock,package:pack?installed?'verified':'not-installed':'not-applicable'},
    requirements:{backend:m.engine,platforms:pack?.manifest.platforms??[m.engine],capabilities,hostAuthorization:capabilities.includes('wasm')?['allowWasm']:[],worker:'unknown'},
    assessment:{platform:ctx.platform,compatible,execution:'not-verified',diagnostics},dependencies,
    commands:{install,lock:compatible&&installed&&pluginLock!=='verified'?command(['effects','lock','--project',ctx.projectArgument]):null},
  };
}

export async function searchCapabilities(options:CapabilitySearch){
  if(typeof options.query!=='string'||!options.query.trim()||options.query.length>512)throw error('E_ARGUMENT','Search requires 1..512 characters');
  const mode=options.mode??'keyword',limit=options.limit??10,filters=options.filters??{};
  if(filters.kind&&!PLUGIN_KINDS.includes(filters.kind)||filters.input&&!PORTS.includes(filters.input)||filters.output&&!PORTS.includes(filters.output))throw error('E_ARGUMENT','Unknown P4 kind or port filter');
  if(options.expectedIntegrity)throw error('E_ARGUMENT','Integrity selects an exact inspect/examples identity, not a search');
  const ctx=await context(options);
  let ranked:Awaited<ReturnType<typeof searchPlugins>>,functionPage:Awaited<ReturnType<typeof searchFunctionPage>>;
  try{
    ranked=await searchPlugins(discoverableEffects(ctx.registry),options.query,filters,{mode,limit,offline:true});
    functionPage=await searchFunctionPage({...options,mode,limit},{installed:ctx.project.packages.records,catalog:ctx.catalog});
  }
  catch(e){if(e instanceof EngineError&&e.code==='E_SEARCH_MODEL')throw new EngineError(e.code,e.message,{hint:'Use --mode keyword, or explicitly prepare the pinned cache with effects index.',details:{mode,offline:true,alternative:{executable:'frameweave',args:['capabilities','search',options.query,'--mode','keyword','--json']}}});throw e;}
  return bounded({query:options.query,mode,offline:true,limit,includeLowLevel:options.includeLowLevel===true,
    projectDirectory:ctx.project.directory,...functionPage,
    coverage:{kind:'p4-effects',packageOnlyCount:ctx.unsupported.length,packageOnlyDescriptors:ctx.unsupported.slice(0,20)},
    items:ranked.map(r=>({...summary(ctx,r.record),ranking:{score:r.score,keywordScore:r.keywordScore,semanticScore:r.semanticScore??null}}))},262144);
}

async function apiMetadata(record:InstalledPlugin):Promise<CapabilityApi>{
  const path='generated/agent-api.json',text=await smallFile(record,path);if(text===null)return {state:'missing',path:null,integrity:null};
  let data:any;try{data=JSON.parse(text);}catch{throw error('E_CAPABILITY_METADATA','Invalid agent-api.json JSON',{path});}
  const m=record.manifest,ref=`${m.id}@${m.version}`;
  if(data.schemaVersion!==1||data.p4Reference!==ref||data.parameterSchemaVersion!==(m.parameterSchemaVersion??1)||canonical(data.parameters)!==canonical(m.parameters)||data.profile!==undefined&&(typeof data.profile!=='string'||data.profile.length>128)||!Array.isArray(data.functions)||data.functions.length>64||!data.functions.every((f:any)=>plain(f)&&typeof f.name==='string'&&/^[A-Za-z]\w*$/.test(f.name)&&typeof f.signature==='string'&&f.signature.length<=2048&&typeof f.documentation==='string'&&f.documentation.length<=4096))throw error('E_CAPABILITY_METADATA','Agent metadata disagrees with selected P4 identity/parameters or exceeds its contract',{path,reference:ref});
  if(data.profile==='wasm-bindgen-data-v1'){
    const declaration=await smallFile(record,'dist/generated/module.d.ts');if(declaration===null)throw error('E_CAPABILITY_METADATA','Generated binding declaration is missing',{path});
    const ast=ts.createSourceFile('module.d.ts',declaration,ts.ScriptTarget.Latest,true),klass=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text===data.entryClass) as ts.ClassDeclaration|undefined;
    const methods=klass?.members.filter((n):n is ts.MethodDeclaration=>ts.isMethodDeclaration(n)&&ts.isIdentifier(n.name)&&n.name.text!=='free');
    if(!methods||methods.length!==data.functions.length||methods.some(n=>!data.functions.some((f:any)=>f.name===n.name.getText(ast)&&f.signature.replace(/\s/g,'')===n.getText(ast).replace(/\s/g,''))))throw error('E_CAPABILITY_METADATA','Agent functions disagree with generated wasm-bindgen declarations',{path});
  }
  if(data.errors!==undefined&&(!Array.isArray(data.errors)||data.errors.length>64||!data.errors.every((v:unknown)=>typeof v==='string'&&/^E_[A-Z0-9_]+$/.test(v)))||data.environment!==undefined&&(!plain(data.environment)||['webStage','worker','allowWasmRequired'].some(k=>data.environment[k]!==undefined&&typeof data.environment[k]!=='boolean')||data.environment.host!==undefined&&(typeof data.environment.host!=='string'||data.environment.host.length>1024))||data.limitations!==undefined&&(!Array.isArray(data.limitations)||data.limitations.length>32||!data.limitations.every((v:unknown)=>typeof v==='string'&&v.length<=2048)))throw error('E_CAPABILITY_METADATA','Invalid errors/environment/limitations metadata',{path});
  const environment=Object.fromEntries(['webStage','worker','allowWasmRequired','host'].filter(k=>data.environment?.[k]!==undefined).map(k=>[k,data.environment[k]]));
  return {state:'present',path,integrity:hash(text),profile:data.profile,functions:data.functions.map((f:any)=>({name:f.name,signature:f.signature,documentation:f.documentation})),errors:data.errors??[],environment,limitations:data.limitations??[]};
}
async function unchanged(record:InstalledPlugin){
  if(record.package){if((await readPackage(record.directory)).integrity!==record.package.integrity)throw error('E_PACKAGE_INTEGRITY','Package changed while being inspected');}
  else if(await integrity(record.directory)!==record.integrity)throw error('E_PLUGIN_LOCK','Plugin changed while being inspected');
}
export async function inspectCapability(reference:string,options:CapabilityQuery={}){
  const ctx=await context(options),record=select(ctx,reference,options.expectedIntegrity),m=record.manifest,brief=summary(ctx,record),api=await apiMetadata(record),kit=await kitConfiguration(record);
  const resources=[];for(const [id,resource]of Object.entries(m.resources??{})){
    if(resources.length>=128)throw error('E_CAPABILITY_BUDGET','Selected capability has more than 128 resources');
    const file=await inside(record.directory,resource.src);resources.push({id,...resource,integrity:hash(await readFile(file))});
  }
  let examples:Awaited<ReturnType<typeof readExamples>>=[],exampleDiagnostic:Diagnostic|null=null;
  try{examples=await readExamples(record,2);}catch(e){exampleDiagnostic=diagnostic(e);}
  await unchanged(record);
  return bounded({...brief,description:m.description,parameters:{schemaVersion:m.parameterSchemaVersion??1,definitions:m.parameters},ports:{inputs:m.inputs,outputs:m.outputs},resources,
    modules:record.package?Object.entries(record.package.manifest.modules).map(([name,module])=>({name,...module,integrity:'sha256-'+record.package!.moduleIntegrity[name]})):[],
    api,execution:{...brief.requirements,worker:{moduleSupport:api.environment?.worker??'unknown',hostSupport:'not-probed',configuredMode:kit?.execution??'unknown'},hostAuthorization:[...new Set([...brief.requirements.hostAuthorization,...api.environment?.allowWasmRequired===true?['allowWasm']:[]])],runtimeVerified:false},
    examples:{state:exampleDiagnostic?'invalid':examples.length?'present':'missing',items:examples,diagnostics:exampleDiagnostic?[exampleDiagnostic]:[]},limitations:{state:api.limitations?.length?'declared':'not-declared',items:api.limitations??[]}});
}
export async function capabilityExamples(reference:string,options:CapabilityQuery&{limit?:number}={}){
  const limit=options.limit??3;if(!Number.isInteger(limit)||limit<1||limit>5)throw error('E_ARGUMENT','Example limit must be 1..5');
  const ctx=await context(options),record=select(ctx,reference,options.expectedIntegrity),items=await readExamples(record,limit);await unchanged(record);
  if(!items.length)throw error('E_CAPABILITY_EXAMPLES_MISSING','No authored, version-matched example is available',{identity:capabilityIdentity(record),checked:['effect.json.examples','Kit demo/project.tsx']});
  return bounded({identity:capabilityIdentity(record),items});
}
