import ts from 'typescript';
import type * as esbuild from 'esbuild';
import {createHash} from 'node:crypto';
import {isBuiltin} from 'node:module';
import {readFile,mkdir,writeFile,realpath,readdir} from 'node:fs/promises';
import {resolve,join,dirname,isAbsolute,relative} from 'node:path';
import type {PackageLock} from '../packages/manager.ts';
import {effectivePackages} from '../packages/program-library.ts';
import {packageRef,within,type PackageRecord} from '../packages/manifest.ts';
import {preparePluginStages,type PluginResource,type PreparedPluginPlan} from '../plugins/compiler.ts';
import {EngineError} from '../core/errors.ts';
import type {TVG,StageSpec} from '../core/types.ts';
import {engineDependencyRoots} from '../runtime/dependencies.ts';
import {packageContext} from './package-context.ts';
import type {BindingForward} from '../packages/stage-bindings.ts';
const fail=(code:string,message:string):never=>{throw new EngineError(code,message);};
export interface ManagedUse {ref:string;names:string[]}
/** One verified R1 snapshot, used by the checker, authoring evaluator and Stage bundler. */
export async function managedContext(root:string,sdkRoot:string,sdkAliases:Record<string,string>,entry?:string){
 const context=entry?await packageContext(entry):{state:await effectivePackages(root),embedded:undefined};
 const {state,embedded}=context,records=new Map(state.records.map(r=>[packageRef(r.manifest),r])),ids=new Map(state.records.map(r=>[r.manifest.id,r]));
 const known=new Set(ids.keys());
 for(const p of Object.values(embedded?.packages??{}))known.add(p.manifest.id);
 for(const folder of await readdir(join(sdkRoot,'modules'),{withFileTypes:true}))if(folder.isDirectory())try{const m=JSON.parse(await readFile(join(sdkRoot,'modules',folder.name,'frameweave.package.json'),'utf8'));if(typeof m.id==='string')known.add(m.id);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const names=new Map<string,Set<string>>(),files=new Set<string>(),programs=new Map<string,ts.Program>();let dependencyRoots:Promise<string[]>|undefined;
 const paths:Record<string,string[]>={};
 for(const record of records.values())if(record.manifest.bindings)paths[record.manifest.id]=[resolve(record.directory,record.manifest.bindings.types)];
 function requested(spec:string,importer?:string):PackageRecord|undefined{
  const r=ids.get(spec);if(!r){if(state.unavailableProgramIds?.has(spec))fail('E_PACKAGE_CONFLICT',`Program library package '${spec}' conflicts with this project's pinned packages`);if(known.has(spec))fail('E_PACKAGE_MISSING',`Managed package '${spec}' must be installed through packages install`);return;}
  const owner=importer&&state.records.find(p=>within(p.directory,resolve(importer)));
  const authorized=owner?state.lock?.packages[packageRef(owner.manifest)]?.dependencies[spec]:state.lock?.roots[spec];
  if(!authorized||authorized!==packageRef(r.manifest))fail('E_PACKAGE_UNDECLARED',`Managed import '${spec}' is not declared by its importing owner`);
  if(!r.manifest.bindings)fail('E_PACKAGE_BINDING',`${spec} has no declared static Stage bindings`);
  return r;
 }
 function inspect(source:ts.SourceFile):ManagedUse[]{
  const out=new Map<string,Set<string>>();
  function visit(n:ts.Node){
   if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)){
    const r=requested(n.moduleSpecifier.text,source.fileName);
    if(r){
     const c=n.importClause;
     if(!c||c.name||c.namedBindings&&!ts.isNamedImports(c.namedBindings))fail('E_PACKAGE_IMPORT_FORM','Managed imports support named functions and type-only imports; no default/namespace/side-effect import');
     const ref=packageRef(r.manifest),used=out.get(ref)??new Set<string>();out.set(ref,used);
     for(const e of (c!.namedBindings as ts.NamedImports|undefined)?.elements??[]){if(c!.isTypeOnly||e.isTypeOnly)continue;const name=(e.propertyName??e.name).text;if(!/^[$A-Za-z_][$\w]*$/.test(name))fail('E_PACKAGE_IMPORT_FORM','Unsupported managed export name');used.add(name);const all=names.get(ref)??new Set<string>();all.add(name);names.set(ref,all);}
    }
   }else if(ts.isExportDeclaration(n)&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier)&&ids.has(n.moduleSpecifier.text))fail('E_PACKAGE_IMPORT_FORM','Import managed bindings by name; direct re-exports are not supported');
   else if(ts.isCallExpression(n)&&n.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(n.arguments[0])&&ids.has(n.arguments[0].text))fail('E_PACKAGE_IMPORT_FORM','Dynamic managed imports must use the explicit R1 ModuleLoader');
   ts.forEachChild(n,visit);
  }visit(source);return [...out].filter(([,n])=>n.size).map(([ref,n])=>({ref,names:[...n]}));
 }
 async function scan(entry:string,seen=new Set<string>()):Promise<ManagedUse[]>{
  entry=resolve(entry);if(seen.has(entry)||!/[cm]?[jt]sx?$/.test(entry)||entry.includes('node_modules')||within(join(sdkRoot,'src'),entry))return [];
  seen.add(entry);let text:string;try{text=await readFile(entry,'utf8');}catch{return [];}
  const source=ts.createSourceFile(entry,text,ts.ScriptTarget.Latest,true,entry.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS),uses=inspect(source);files.add(entry);
  for(const spec of ts.preProcessFile(text,true,true).importedFiles){if(!spec.fileName.startsWith('.'))continue;const found=ts.resolveModuleName(spec.fileName,entry,{moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true},ts.sys).resolvedModule?.resolvedFileName;if(found)uses.push(...await scan(found,seen));}
  const refs=new Map<string,Set<string>>();for(const u of uses)for(const name of u.names){const set=refs.get(u.ref)??new Set();set.add(name);refs.set(u.ref,set);}return [...refs].map(([ref,n])=>({ref,names:[...n]}));
 }
 function plugin(runtime=false,scope:ManagedUse[]=[],directory?:string):esbuild.Plugin{
  const allowed=new Map(scope.map(u=>[u.ref,u.names]));
  return {name:'verified-managed-bindings',setup(b){
   b.onResolve({filter:/.*/},async args=>{
    if(args.pluginData?.managedChecked||!args.importer)return;
    const owner=state.records.find(p=>within(p.directory,resolve(args.importer)));if(!owner||ids.has(args.path))return;
    if(isBuiltin(args.path))fail('E_PACKAGE_PERMISSION','Managed Web modules cannot import Node builtins');
    if(Object.hasOwn(sdkAliases,args.path))return;
    const result=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{...args.pluginData,managedChecked:true}});
    if(result.errors.length)return {errors:result.errors};
    if(result.external)fail('E_PACKAGE_PERMISSION','Managed modules cannot escape through external imports');
    const path=await realpath(result.path),dependencies=await (dependencyRoots??=engineDependencyRoots(sdkRoot));
    const sdkDependency=dependencies.some(p=>within(p,path));
    if(!within(owner.directory,path)&&!within(join(sdkRoot,'src'),path)&&!sdkDependency)fail('E_PLUGIN_PATH','Managed module import escapes its locked package and SDK dependencies');
    if(!sdkDependency&&relative(owner.directory,path).split(/[\\/]/).includes('node_modules'))fail('E_PLUGIN_PACKAGE','Nested private npm dependencies are not declared managed modules');
    return {path:result.path,namespace:result.namespace};
   });
   b.onResolve({filter:/^[^./\\]/},args=>{
    if(isAbsolute(args.path)||!known.has(args.path))return;
    const r=requested(args.path,args.importer),ref=packageRef(r!.manifest);
    return runtime&&allowed.has(ref)&&directory?{path:join(directory,encodeURIComponent(ref)+'.ts')}:{path:ref,namespace:'frameweave-managed'};
   });
   b.onLoad({filter:/.*/,namespace:'frameweave-managed'},args=>{
    const n=[...names.get(args.path)??[]];
    return {contents:`import {EngineError} from ${JSON.stringify(join(sdkRoot,'src/core/errors.ts'))};\n${n.map(name=>`export function ${name}(..._args:unknown[]):never{throw new EngineError('E_MANAGED_SCOPE','Managed functions are available inside their initialized Web Stage, not project evaluation or an incompatible Stage');}`).join('\n')}`,loader:'ts',resolveDir:root};
   });
  }};
 }
 /** Follow the selected factory's local value references, not unrelated factories in a single TSX. */
 async function factoryUses(entry:string,exportName='default'):Promise<ManagedUse[]>{
  await scan(entry);
  if(!Object.keys(paths).length)return [];
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,allowJs:true,jsx:ts.JsxEmit.ReactJSX,jsxImportSource:'@frameweave/engine',paths:{...Object.fromEntries(Object.entries(sdkAliases).map(([k,v])=>[k,[v]])),...paths},skipLibCheck:true};
  const key=resolve(entry);let program=programs.get(key);if(!program){program=ts.createProgram([key],options);programs.set(key,program);}const checker=program.getTypeChecker(),source=program.getSourceFile(key);if(!source)return [];
  const imports=new Map<ts.Symbol,{ref:string;name:string}>();
  for(const file of program.getSourceFiles()){
   if(file.isDeclarationFile||within(join(sdkRoot,'src'),file.fileName)||file.fileName.includes('node_modules'))continue;
   inspect(file);
   for(const n of file.statements)if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&ids.has(n.moduleSpecifier.text)&&n.importClause&&!n.importClause.isTypeOnly&&n.importClause.namedBindings&&ts.isNamedImports(n.importClause.namedBindings)){
    const r=requested(n.moduleSpecifier.text,file.fileName)!;
    for(const e of n.importClause.namedBindings.elements)if(!e.isTypeOnly){const s=checker.getSymbolAtLocation(e.name);if(s)imports.set(s,{ref:packageRef(r.manifest),name:(e.propertyName??e.name).text});}
   }
  }
  const seen=new Set<ts.Symbol>(),out=new Map<string,Set<string>>();
  function symbol(s:ts.Symbol|undefined){if(!s||seen.has(s))return;seen.add(s);const imported=imports.get(s);if(imported){const n=out.get(imported.ref)??new Set();n.add(imported.name);out.set(imported.ref,n);return;}if(s.flags&ts.SymbolFlags.Alias){symbol(checker.getAliasedSymbol(s));return;}for(const d of s.declarations??[]){const file=d.getSourceFile();if(file.isDeclarationFile||within(join(sdkRoot,'src'),file.fileName)||file.fileName.includes('node_modules'))continue;visit(d);}}
  function visit(n:ts.Node){if(ts.isTypeNode(n)||ts.isImportDeclaration(n))return;if(ts.isShorthandPropertyAssignment(n))symbol(checker.getShorthandAssignmentValueSymbol(n));if(ts.isIdentifier(n))symbol(checker.getSymbolAtLocation(n));ts.forEachChild(n,visit);}
  const mod=checker.getSymbolAtLocation(source),target=mod&&checker.getExportsOfModule(mod).find(s=>s.name===exportName);symbol(target);
  return [...out].map(([ref,n])=>({ref,names:[...n]}));
 }
 async function prepare(stage:StageSpec,tvg:TVG,dir:string,uses:ManagedUse[]){
  if(!uses.length)return {resources:[] as PluginResource[],roots:[] as string[],prefix:'',wrap:(load:string)=>load,plugin:plugin(),data:undefined};
  const expanded=new Map<string,Set<string>>(),visited=new Set<string>();
  const forwards=new Map<string,BindingForward>();
  async function expand(use:ManagedUse){
   const seen=expanded.get(use.ref)??new Set<string>();
   const added=use.names.filter(name=>!seen.has(name));
   added.forEach(name=>seen.add(name));expanded.set(use.ref,seen);
   const record=records.get(use.ref)!,binding=record.manifest.bindings!;
   if(binding.forward){
    const targets=forwards.get(use.ref)??Object.create(null) as BindingForward;
    forwards.set(use.ref,targets);
    for(const name of added){
     const target=Object.hasOwn(binding.forward,name)?binding.forward[name]:undefined;
     const ref=target&&state.lock!.packages[use.ref].dependencies[target.dependency];
     if(!ref||!records.get(ref)?.manifest.bindings)
      fail('E_PACKAGE_BINDING_EXPORT',`${use.ref} has no locked callable provider for ${name}`);
     targets[name]={ref:ref!,name:target!.name};
     await expand({ref:ref!,names:[target!.name]});
    }
    return;
   }
   if(visited.has(use.ref))return;
   visited.add(use.ref);
   for(const module of Object.values(record.manifest.modules))if(module.format==='javascript')
    for(const dependency of await scan(resolve(record.directory,module.path)))await expand(dependency);
  }
  for(const use of uses)await expand(use);
  const ordered:ManagedUse[]=[],done=new Set<string>();function order(ref:string){if(done.has(ref))return;done.add(ref);for(const dep of Object.values(state.lock!.packages[ref].dependencies))if(expanded.has(dep))order(dep);ordered.push({ref,names:[...expanded.get(ref)!]});}for(const ref of expanded.keys())order(ref);uses=ordered;
  for(const use of uses)if(records.get(use.ref)!.manifest.bindings!.engine!==stage.engine)throw new EngineError('E_ENGINE_INCOMPATIBLE','Managed binding engine disagrees with its actual Stage',{stageId:stage.id,details:{engine:stage.engine,module:use.ref,required:records.get(use.ref)!.manifest.bindings!.engine}});
  const resources:PluginResource[]=[],roots=new Set<string>(),packages:PreparedPluginPlan['packages']={},javascript=new Map<string,string>(),effects=new Map<string,{file:string;exportName?:string}>(),meta:PreparedPluginPlan['metadata']={};
  // Keep the complete installation closure for carried projects. Only selected
  // providers enter the Stage execution/resource plan.
  function remember(ref:string){
   const directory=records.get(ref)!.directory;
   if(roots.has(directory))return;
   roots.add(directory);
   for(const dep of Object.values(state.lock!.packages[ref].dependencies))remember(dep);
  }
  for(const use of uses)if(forwards.has(use.ref))remember(use.ref);
  for(const use of uses){
   if(forwards.has(use.ref))continue;
   const record=records.get(use.ref)!;
   if(record.effect){
    const fake:StageSpec={...stage,id:'managed_'+stage.id+'_'+Object.keys(meta).length,entry:'@frameweave/plugin-stage',inputs:{},inputTypes:{},outputs:{surface:'surface'},props:{pluginPipeline:[{plugin:use.ref}]}};
    const result=await preparePluginStages({...tvg,stages:[fake]},root,dir,sdkRoot),plan=result.plans[fake.id];
    resources.push(...result.resources);result.roots.forEach(r=>roots.add(r));Object.assign(packages,plan.packages);Object.assign(meta,plan.metadata);plan.javascript.forEach(([k,v])=>javascript.set(k,v));plan.modules.forEach(m=>effects.set(m.ref,m));
   }else{
    function collect(r:PackageRecord){const ref=packageRef(r.manifest);if(packages[ref])return;const pin=state.lock!.packages[ref];packages[ref]={integrity:pin.integrity,source:pin.source,capabilities:r.manifest.capabilities,dependencies:pin.dependencies,modules:{}};roots.add(r.directory);
     for(const [name,m]of Object.entries(r.manifest.modules)){const resourceId='pkg_'+createHash('sha256').update(ref+'/'+name).digest('hex').slice(0,24);packages[ref].modules[name]={format:m.format,integrity:pin.modules[name],...m.format==='javascript'?{}:{resourceId}};if(m.format==='javascript')javascript.set(ref+'/'+name,resolve(r.directory,m.path));else resources.push({id:resourceId,path:resolve(r.directory,m.path),kind:'file',verbatim:true});}
     for(const dep of Object.values(pin.dependencies))collect(records.get(dep)!);
    }collect(record);
   }
  }
  const directory=join(dir,'plugins','managed_'+stage.id);await mkdir(directory,{recursive:true});
  const imports:string[]=[],specs:string[]=[];
  for(let i=0;i<uses.length;i++){
   const u=uses[i],r=records.get(u.ref)!,b=r.manifest.bindings!,file=join(directory,encodeURIComponent(u.ref)+'.ts'),bind='fw_bind_'+i;
   // esbuild validates every static import before removing sibling factories.
   // Declare their names too, but initialize only this factory's actual uses.
   const declared=[...new Set([...names.get(u.ref)??[],...u.names])];
   let binder='fw_bindExports';while(declared.includes(binder))binder+='_';
   await writeFile(file,`${declared.map(n=>`export let ${n}:any=(..._args:unknown[])=>{throw Object.assign(new Error('Managed binding is not initialized'),{code:'E_MANAGED_SCOPE'});};`).join('\n')}\nexport function ${binder}(ns:Record<string,unknown>){${u.names.map(n=>`if(!Object.hasOwn(ns,${JSON.stringify(n)})||typeof ns[${JSON.stringify(n)}]!=='function')throw Object.assign(new Error('Managed named imports require callable exports'),{code:'E_PACKAGE_BINDING_EXPORT'});${n}=ns[${JSON.stringify(n)}];`).join('\n')}}\n`);
   imports.push(`import {${binder} as ${bind}} from ${JSON.stringify(file)};`);
   const m=meta[u.ref],forward=forwards.get(u.ref);specs.push(`{ref:${JSON.stringify(u.ref)},engine:${JSON.stringify(b.engine)},module:${JSON.stringify(b.module)},initialize:${JSON.stringify(b.initialize)},forward:${JSON.stringify(forward)},bind:${bind},resources:${JSON.stringify(m?.resourceIds??{})},dependencies:${JSON.stringify(m?.dependencies??{})}}`);
  }
  const prefix=`import {createManagedStage} from ${JSON.stringify(join(sdkRoot,'src/packages/stage-bindings.ts'))};\n${imports.join('\n')}\n`;
  const js=`{${[...javascript].map(([k,p])=>`${JSON.stringify(k)}:()=>import(${JSON.stringify(p)})`).join(',')}}`,defs=`{${[...effects].map(([ref,p])=>`${JSON.stringify(ref)}:()=>import(${JSON.stringify(p.file)}).then(m=>m[${JSON.stringify(p.exportName??'default')}]${p.exportName?'.implementation!':''})`).join(',')}}`;
  const wrap=(load:string)=>`createManagedStage(${load},[${specs.join(',')}],${JSON.stringify(packages)},${js},${defs})`;
  for(const use of uses){const b=records.get(use.ref)!.manifest.bindings;if(b?.gpu==='required'&&(!b.gpuExports||use.names.some(name=>b.gpuExports!.includes(name)))){packages[use.ref].gpu='required';if(b.gpuApi)packages[use.ref].gpuApi=b.gpuApi;}}
  stage.props.$packages=packages;
  return {resources,roots:[...roots],prefix,wrap,plugin:plugin(true,uses,directory),data:{packages,javascript:[...javascript],effects:[...effects].map(([ref,m])=>({ref,...m})),bindings:uses.map(u=>{const b=records.get(u.ref)!.manifest.bindings!,m=meta[u.ref];return {...u,engine:b.engine,module:b.module,initialize:b.initialize,forward:forwards.get(u.ref),resources:m?.resourceIds??{},dependencies:m?.dependencies??{}};})}};
 }
 return {state,embedded,paths,files,scan,factoryUses,plugin,prepare,records};
}
