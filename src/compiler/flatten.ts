import {stageDefinitions} from '../../modules/stage-orchestration/composite-types.ts';
import {runtimeCachePath} from '../runtime/paths.ts';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {mkdir,mkdtemp,readFile,writeFile,rm,stat,realpath} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {join,resolve,dirname,extname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {exportProject,type ExportOptions} from './export.ts';
import {engineRoot,alias,buildProject} from './build.ts';
import {materializePortable,parsePortable} from './portable.ts';
import {projectPlugins} from '../plugins/registry.ts';
import {typecheckProject} from './typecheck.ts';
import {assetMime} from './assets.ts';
import {fail} from '../plugins/schema.ts';
import type {TVG} from '../core/types.ts';
import {createRuntimeRequirement,checkRuntimeFile} from './runtime-lock.ts';
import {embedSvg} from './svg.ts';
import {installedPackages} from '../packages/manager.ts';
import {packageRef,within} from '../packages/manifest.ts';
import {managedContext} from './managed.ts';
import {preparePluginStages,type PreparedPluginPlan,type PluginResource} from '../plugins/compiler.ts';
import {namedStatements,statementHash,checkFlatPackages,type FlatCertificate} from './flat-integrity.ts';

const f=ts.factory,printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed}),slash=(p:string)=>p.replaceAll('\\','/');
const isCode=(p:string)=>/\.[cm]?[jt]sx?$/.test(p),sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
function explicitEntries(text:string):boolean{let found=false;const ast=ts.createSourceFile('source.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const visit=(node:ts.Node)=>{if(ts.isPropertyAssignment(node)&&node.name.getText(ast).replace(/['"]/g,'')==='entry'&&ts.isStringLiteralLike(node.initializer)&&isCode(node.initializer.text))found=true;if(ts.isJsxAttribute(node)&&node.name.getText(ast)==='entry')found=true;ts.forEachChild(node,visit);};visit(ast);return found;}
/** A constrained source transformation, not a general ESM loader: unsupported module
 * semantics are rejected. TypeScript owns parsing, symbols, alias binding and JSX lowering;
 * the existing esbuild pipeline owns final linking/execution. No source strings are shipped.
 */
export async function exportFlatProject(entry:string,options:ExportOptions):Promise<any>{
  if(options.sources&&options.sources!=='merge'||options.modules&&options.modules!=='merge'||options.assets&&options.assets!=='embed')fail('E_EXPORT_POLICY','Flat single TSX requires sources merge / modules merge / assets embed');
  const output=resolve(options.output);if(!/\.tsx$/i.test(output))fail('E_ARGUMENT','Choose a .tsx output filename');
  const inPlace=output===resolve(entry);
  if(!inPlace)try{await stat(output);fail('E_EXISTS',`Refusing to overwrite ${output}`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const parent=runtimeCachePath('flat');await mkdir(parent,{recursive:true});const temp=await mkdtemp(join(parent,'export-'));
  try{
    const capsule=join(temp,'analysis.tsx');
    const legacy=await exportProject(entry,{...options,output:capsule,singleFile:true,layout:'capsule'});
    const sourceData=parsePortable(await readFile(capsule,'utf8'))!;
    // The legacy collector is the dependency/portability certificate: a single
    // source, no carried assets, private modules or native-entry siblings. This
    // also checks real runtime constraints and rejects hidden host dependencies.
    const codeSources=Object.keys(sourceData.sources).filter(path=>isCode(path));
    const otherSources=Object.keys(sourceData.sources).filter(path=>path!==sourceData.entry&&!/^frameweave\.(plugins(?:\.lock)?|runtime)\.json$/.test(path));
    if(codeSources.length===1&&codeSources[0]===sourceData.entry&&!otherSources.length&&!Object.keys(sourceData.files).length&&!Object.keys(sourceData.siblings??{}).length&&!legacy.privatePlugins.length){
      const proof=await buildProject(entry),graph=JSON.parse(await readFile(join(proof.dir,'sources.json'),'utf8')) as {manifest:TVG;pluginRoots:string[]};
      const sourceRoot=dirname(resolve(entry));
      if((checkFlatPackages(resolve(entry))||!explicitEntries(await readFile(entry,'utf8')))&&graph.pluginRoots.every(path=>path===sourceRoot)&&stageDefinitions(graph.manifest).map(({key,stage})=>({...stage,id:key})).every(stage=>!stage.entry||stage.entry==='@frameweave/plugin-stage'||resolve(sourceRoot,stage.entry)===resolve(entry))){
        const existing=checkRuntimeFile(resolve(entry)),runtime=existing??createRuntimeRequirement(legacy.officialPackages);
        if(inPlace&&!existing)fail('E_EXISTS','In-place export is only allowed for a verified unchanged TSX; use a different output path for the first export');
        const bytes=await readFile(entry),code=existing?bytes:Buffer.from(`export const frameweaveRuntime = ${JSON.stringify(runtime,null,2)} as const;\n\n`+bytes.toString('utf8'));
        if(!existing){const check=join(temp,'single.tsx');await writeFile(check,code);await buildProject(check);}
        if(!inPlace){await mkdir(dirname(output),{recursive:true});await writeFile(output,code);}
        const inlineEffects=[...new Set(stageDefinitions(graph.manifest).map(({key,stage})=>({...stage,id:key})).flatMap(stage=>(stage.props.pluginPipeline as {plugin:string}[]|undefined)?.map(use=>use.plugin)??[]))];
        const report={...legacy,entry:output,layout:'flat-tsx',runtime,sourceModules:1,inlineEffects,privateRegistryRequired:false,typechecked:true,sourceUnchanged:!!existing,verification:'BUILT_NOT_YET_VISUALLY_VERIFIED'};
        await writeFile(`${output}.export.json`,JSON.stringify(report,null,2)+'\n');return report;
      }
    }
    if(inPlace)fail('E_EXISTS','This export needs transformations; choose a different output path');
    const original=await realpath((await materializePortable(capsule,join(temp,'files')))!);
    const root=dirname(original),built=await buildProject(original,{outputDir:join(temp,'build')}),analysis=JSON.parse(await readFile(join(built.dir,'sources.json'),'utf8')) as {manifest:TVG;pluginRoots:string[]};
    const registry=(await projectPlugins(root)).registry;
    const plugins=registry.list().filter(p=>analysis.pluginRoots.includes(p.directory));
    const packageState=await installedPackages(root),usedPackages=packageState.records.filter(p=>analysis.pluginRoots.includes(p.directory)),managed=await managedContext(root,engineRoot,alias),hasPackages=usedPackages.length>0;
    const managedNames=new Map<string,Set<string>>();for(const use of await managed.scan(original))managedNames.set(use.ref,new Set(use.names));
    const nativeBindings=new Map<string,NonNullable<Awaited<ReturnType<typeof managed.prepare>>['data']>>(),pluginPlans=new Map<string,PreparedPluginPlan>(),extraResources:PluginResource[]=[],graphModules=new Map<string,string>(),graphEffects=new Map<string,{file:string;exportName?:string}>();
    const add=(data:{javascript:[string,string][];effects:{ref:string;file:string;exportName?:string}[]})=>{data.javascript.forEach(([k,p])=>graphModules.set(k,p));data.effects.forEach(m=>graphEffects.set(m.ref,m));};
    if(hasPackages){
      const prepared=await preparePluginStages(structuredClone(analysis.manifest),root,join(temp,'plans'),engineRoot);extraResources.push(...prepared.resources);
      for(const [id,plan]of Object.entries(prepared.plans)){pluginPlans.set(id,plan);add({javascript:plan.javascript,effects:plan.modules});}
      for(const stage of stageDefinitions(analysis.manifest).map(({key,stage})=>({...stage,id:key})))if(stage.entry&&stage.entry!=='@frameweave/plugin-stage'){
        const uses=await managed.factoryUses(resolve(root,stage.entry),stage.exportName);for(const u of uses){const n=managedNames.get(u.ref)??new Set<string>();u.names.forEach(x=>n.add(x));managedNames.set(u.ref,n);}
        const prepared=await managed.prepare(structuredClone(stage),analysis.manifest,join(temp,'native-plans'),uses);if(prepared.data){for(const b of prepared.data.bindings){const n=managedNames.get(b.ref)??new Set<string>();b.names.forEach(x=>n.add(x));managedNames.set(b.ref,n);}nativeBindings.set(stage.id,prepared.data);extraResources.push(...prepared.resources);add(prepared.data);}
      }
    }
    const shims=new Map<string,string>();
    for(const [ref,names]of managedNames){const r=managed.records.get(ref)!,types=resolve(r.directory,r.manifest.bindings!.types),file=join(temp,'flat-shims',encodeURIComponent(ref)+'.ts');await mkdir(dirname(file),{recursive:true});await writeFile(file,`import type {${[...names].map((n,i)=>`${n} as Public_${i}`).join(',')}} from ${JSON.stringify(types)};\nexport type * from ${JSON.stringify(types)};\n${[...names].map((n,i)=>`export let ${n}:typeof Public_${i};`).join('\n')}`);shims.set(r.manifest.id,file);}
    const texts=new Map<string,string>(),assets=new Map<string,{name:string;uri:string;text?:string;json?:unknown}>(),styles=new Map<string,string>();
    const graphEntries=[...graphModules.values(),...graphEffects.values()].map(p=>typeof p==='string'?p:p.file);
    const moduleEntries=[original,...stageDefinitions(analysis.manifest).map(({key,stage})=>({...stage,id:key})).filter(s=>s.entry&&s.entry!=='@frameweave/plugin-stage').map(s=>resolve(root,s.entry!)),...shims.values(),...(hasPackages?graphEntries:plugins.flatMap(p=>p.entry?[p.entry]:[]))];
    const opts:ts.CompilerOptions={target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,jsx:ts.JsxEmit.ReactJSX,jsxImportSource:'@frameweave/engine',allowImportingTsExtensions:true,resolveJsonModule:true,esModuleInterop:true,strict:true,skipLibCheck:true,typeRoots:[dirname(dirname(createRequire(import.meta.url).resolve('@types/node/package.json')))],types:['node']};
    const host=ts.createCompilerHost(opts,true),baseGet=host.getSourceFile;
    const resolveModule=(name:string,file:string):string|undefined=>{
      if(file.endsWith('.d.ts')&&Object.hasOwn(managed.paths,name))return managed.paths[name][0];
      if(shims.has(name))return shims.get(name);
      if(name.endsWith('.d.ts')){const path=resolve(dirname(file),name);if(existsSync(path))return path;}
      if(alias[name as keyof typeof alias])return alias[name as keyof typeof alias];
      const result=ts.resolveModuleName(name,file,opts,ts.sys).resolvedModule??ts.resolveModuleName(name,join(engineRoot,'__resolver__.ts'),opts,ts.sys).resolvedModule;return result?.resolvedFileName;
    };
    async function asset(path:string){path=resolve(path);if(assets.has(path))return assets.get(path)!;let bytes:Buffer=await readFile(path);const ext=extname(path).toLowerCase();if(ext==='.svg')bytes=(await embedSvg(bytes,{file:path,owner:root})).bytes;const name=`fw_asset_${sha(bytes).slice(0,20)}`;
      let uri=`data:${assetMime[ext]??'application/octet-stream'};base64,${bytes.toString('base64')}`;
      if(ext==='.gltf'){
        const model=JSON.parse(bytes.toString('utf8'));for(const item of [...model.buffers??[],...model.images??[]])if(item.uri&&!item.uri.startsWith('data:'))item.uri=(await asset(resolve(dirname(path),decodeURIComponent(item.uri)))).uri;
        uri=`data:model/gltf+json;base64,${Buffer.from(JSON.stringify(model)).toString('base64')}`;
      }
      const value={name,uri,...(['.glsl','.wgsl','.txt'].includes(ext)?{text:bytes.toString('utf8')}:{}) ,...(ext==='.json'?{json:JSON.parse(bytes.toString('utf8'))}:{})};assets.set(path,value);return value;
    }
    const imports=new Map<string,{name:string;target:string;typeOnly:boolean}[]>();
    async function load(file:string):Promise<void>{file=resolve(file);if(texts.has(file))return;
      let text=await readFile(file,'utf8');
      // Source-development relative Servo imports keep the same official SDK
      // boundary as named imports. Do not inline neighbouring host/private files.
      const servoNames=new Map(['index.ts','stage.ts','document.ts'].map(name=>[join(engineRoot,'modules/servo',name),'@frameweave/engine/servo']));
      servoNames.set(join(engineRoot,'modules/servo/node.ts'),'@frameweave/engine/servo/node');
      servoNames.set(join(engineRoot,'modules/native-effects/authoring/index.ts'),'@frameweave/engine/image-effects');
      servoNames.set(join(engineRoot,'modules/native-effects/authoring/node.ts'),'@frameweave/engine/image-effects/node');
      const sourceAst=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,/x$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS),servoEdits:{start:number;end:number;text:string}[]=[];
      for(const statement of sourceAst.statements)if((ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement))&&statement.moduleSpecifier&&ts.isStringLiteral(statement.moduleSpecifier)){
        const value=statement.moduleSpecifier.text;if(!value.startsWith('.'))continue;const target=resolveModule(value,file),name=target&&servoNames.get(resolve(target));
        if(name)servoEdits.push({start:statement.moduleSpecifier.getStart(sourceAst),end:statement.moduleSpecifier.end,text:JSON.stringify(name)});
      }
      for(const edit of servoEdits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
      if(/@jsxImportSource\s+react\b/.test(text)){
        const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
        const transform=(ts as unknown as {transformJsx:ts.TransformerFactory<ts.SourceFile>}).transformJsx;
        const result=ts.transform(source,[transform],{...opts,jsxImportSource:'react'});text=printer.printFile(result.transformed[0]);result.dispose();
      }
      text=text.replace(/@jsxImportSource/g,'JSX source:');texts.set(file,text);
      const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,/x$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS),edges:{name:string;target:string;typeOnly:boolean}[]=[];imports.set(file,edges);
      for(const node of ast.statements)if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)){
        const name=node.moduleSpecifier.text,managedType=file.endsWith('.d.ts')&&Object.hasOwn(managed.paths,name);
        if(!managedType&&!shims.has(name)&&!name.startsWith('.')&&!/^[a-zA-Z]:/.test(name)){if(ts.isExportDeclaration(node))fail('E_FLAT_REEXPORT',`${relative(root,file)}: import the external library first, then re-export its binding`);continue;}
        let target=resolveModule(name,file);if(!target){const candidate=resolve(dirname(file),name);if(existsSync(candidate))target=candidate;}
        if(!target)fail('E_FLAT_IMPORT',`${file}: Cannot resolve ${name}`);target=resolve(target);
        const typeOnly=file.endsWith('.d.ts')||(ts.isImportDeclaration(node)?!!node.importClause?.isTypeOnly||!!node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)&&node.importClause.namedBindings.elements.every(e=>e.isTypeOnly):node.isTypeOnly);
        edges.push({name,target,typeOnly});if(isCode(target))await load(target);
        else if(extname(target)==='.css'){if(target.endsWith('.module.css'))fail('E_FLAT_CSS','CSS modules need a dedicated source-preserving adapter; use plain CSS or capsule layout');styles.set(target,await readFile(target,'utf8'));}
        else await asset(target);
      }
    }
    for(const file of moduleEntries)await load(file);
    const graphFiles=new Set<string>();function mark(file:string){file=resolve(file);if(graphFiles.has(file)||[...shims.values()].includes(file))return;graphFiles.add(file);for(const e of imports.get(file)??[])if(!e.typeOnly&&texts.has(e.target))mark(e.target);}graphEntries.forEach(mark);
    if(graphFiles.has(original)||stageDefinitions(analysis.manifest).map(({key,stage})=>({...stage,id:key})).some(s=>s.entry&&s.entry!=='@frameweave/plugin-stage'&&graphFiles.has(resolve(root,s.entry))))fail('E_FLAT_PACKAGE_SCOPE','A managed module graph cannot also contain the authoring entry/native factory. Separate this shared module or use capsule layout.');
    for(const file of graphFiles)if(!/\.tsx?$/.test(file))fail('E_FLAT_PACKAGE_SOURCE','Readable managed Flat currently requires typed .ts/.tsx module sources; use capsule for JavaScript-only packages');
    for(const r of analysis.manifest.resources)if(!r.src.startsWith('data:'))await asset(resolve(root,r.src));
    for(const p of plugins)for(const r of Object.values(p.manifest.resources??{}))await asset(resolve(p.directory,r.src));
    for(const r of extraResources)if(!r.path.startsWith('data:'))await asset(r.path);
    const assetModules=new Map<string,string>();
    for(const [file,a]of assets){const virtual=file+'.fw_asset.ts';assetModules.set(virtual,`export default ${a.text!==undefined?JSON.stringify(a.text):a.json!==undefined?JSON.stringify(a.json):JSON.stringify(a.uri)};`);}
    host.getSourceFile=(file,lang,onError,create)=>texts.has(resolve(file))?ts.createSourceFile(file,texts.get(resolve(file))!,lang,true,/x$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS):assetModules.has(file)?ts.createSourceFile(file,assetModules.get(file)!,lang,true):baseGet(file,lang,onError,create);
    host.resolveModuleNames=(names,containing)=>names.map(name=>{
      const edge=imports.get(resolve(containing))?.find(e=>e.name===name);
      if(edge&&!isCode(edge.target)){if(styles.has(edge.target))return undefined;return {resolvedFileName:edge.target+'.fw_asset.ts',extension:ts.Extension.Ts};}
      const resolved=resolveModule(name,containing);return resolved?{resolvedFileName:resolved,extension:resolved.endsWith('.d.ts')?ts.Extension.Dts:resolved.endsWith('.tsx')?ts.Extension.Tsx:ts.Extension.Ts,isExternalLibraryImport:resolved.includes('node_modules')}:undefined;
    });
    const program=ts.createProgram({rootNames:[...texts.keys(),...assetModules.keys()],options:opts,host}),checker=program.getTypeChecker();
    const files=[...texts.keys()],ids=new Map(files.map((p,i)=>[p,i])),symbols=new Map<ts.Symbol,string>(),externalSymbols=new Map<ts.Symbol,string>();
    const actual=(symbol:ts.Symbol|undefined):ts.Symbol|undefined=>{const seen=new Set<ts.Symbol>();while(symbol?.flags&&symbol.flags&ts.SymbolFlags.Alias&&!seen.has(symbol)){seen.add(symbol);symbol=checker.getAliasedSymbol(symbol);}return symbol;};
    const symName=(symbol:ts.Symbol|undefined)=>symbol?symbols.get(actual(symbol)!)??symbols.get(symbol)??externalSymbols.get(actual(symbol)!):undefined;
    function declare(name:ts.BindingName,file:string){if(ts.isIdentifier(name)){const symbol=checker.getSymbolAtLocation(name);if(symbol&&!symbols.has(symbol)){const binding=`FW_${ids.get(file)}_${name.text.replace(/\W/g,'_')}`;symbols.set(symbol,binding);if(symbol.flags&ts.SymbolFlags.Alias){const target=actual(symbol);if(target&&!externalSymbols.has(target))externalSymbols.set(target,binding);}}}else for(const element of name.elements)if(ts.isBindingElement(element))declare(element.name,file);}
    for(const file of files){const ast=program.getSourceFile(file)!;
      for(const statement of ast.statements){
        if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)declare(d.name,file);
        else if((ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement)||ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement)||ts.isEnumDeclaration(statement)||ts.isModuleDeclaration(statement))&&statement.name&&ts.isIdentifier(statement.name))declare(statement.name,file);
        else if(ts.isImportDeclaration(statement)&&statement.importClause&&!imports.get(file)?.some(e=>e.name===(statement.moduleSpecifier as ts.StringLiteral).text)){
          if(statement.importClause.name)declare(statement.importClause.name,file);const n=statement.importClause.namedBindings;if(n){if(ts.isNamespaceImport(n))declare(n.name,file);else for(const e of n.elements)declare(e.name,file);}
        }
      }
      const moduleSymbol=checker.getSymbolAtLocation(ast);for(const exported of moduleSymbol?checker.getExportsOfModule(moduleSymbol):[]){const target=actual(exported);if(target&&!symbols.has(target)&&target.declarations?.some(d=>d.getSourceFile()===ast))symbols.set(target,`FW_${ids.get(file)}_${exported.name==='default'?'default':exported.name.replace(/\W/g,'_')}`);}
    }
    const exportsOf=(file:string)=>{const ast=program.getSourceFile(file)!,symbol=checker.getSymbolAtLocation(ast);return symbol?checker.getExportsOfModule(symbol):[];};
    const exportedName=(file:string,name:string)=>{const exp=exportsOf(file).find(s=>s.name===name),specifier=exp?.declarations?.find(ts.isExportSpecifier),local=specifier?checker.getExportSpecifierLocalTargetSymbol(specifier):undefined;return symName(local)??symName(exp)??(name==='default'?`FW_${ids.get(file)}_default`:undefined);};
    const order:string[]=[],visiting=new Set<string>(),seen=new Set<string>(),stack:string[]=[];
    const topLevelAwait=(file:string)=>{let found=false;const inspect=(node:ts.Node):void=>{if(ts.isFunctionLike(node))return;if(ts.isAwaitExpression(node)||ts.isForOfStatement(node)&&node.awaitModifier)found=true;ts.forEachChild(node,inspect);};inspect(program.getSourceFile(file)!);return found;};
    // Detect whole strongly connected components, including cross edges which
    // are not on the first DFS back edge. Async SCCs cannot be linearized here.
    const indices=new Map<string,number>(),low=new Map<string,number>(),active=new Set<string>(),componentStack:string[]=[];let nextIndex=0;
    const edges=(file:string)=>(imports.get(file)??[]).filter(edge=>!edge.typeOnly&&texts.has(edge.target)).map(edge=>edge.target);
    function component(file:string){indices.set(file,nextIndex);low.set(file,nextIndex++);active.add(file);componentStack.push(file);for(const target of edges(file)){if(!indices.has(target)){component(target);low.set(file,Math.min(low.get(file)!,low.get(target)!));}else if(active.has(target))low.set(file,Math.min(low.get(file)!,indices.get(target)!));}if(low.get(file)===indices.get(file)){const members:string[]=[];let item:string;do{item=componentStack.pop()!;active.delete(item);members.push(item);}while(item!==file);if((members.length>1||edges(file).includes(file))&&members.some(topLevelAwait))fail('E_FLAT_ASYNC_CYCLE',`Top-level async evaluation in a module cycle is not flattened: ${members.map(path=>relative(root,path)).join(' -> ')}. Keep modules or use --layout capsule.`);}}
    for(const file of files)if(!indices.has(file))component(file);
    function visit(file:string){if(seen.has(file))return;if(visiting.has(file)){const cycle=stack.slice(stack.indexOf(file));if(cycle.some(topLevelAwait))fail('E_FLAT_ASYNC_CYCLE',`Top-level async evaluation in a module cycle is not flattened: ${cycle.map(p=>relative(root,p)).join(' -> ')}. Keep modules or use --layout capsule.`);return;}visiting.add(file);stack.push(file);for(const e of imports.get(file)??[])if(!e.typeOnly&&texts.has(e.target))visit(e.target);stack.pop();visiting.delete(file);seen.add(file);order.push(file);}
    for(const file of moduleEntries)visit(resolve(file));
    for(const file of files)if(!seen.has(file)){
      const ast=program.getSourceFile(file)!;if(!file.endsWith('.d.ts')&&ast.statements.some(n=>!ts.isInterfaceDeclaration(n)&&!ts.isTypeAliasDeclaration(n)&&!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n)))fail('E_FLAT_TYPE_ONLY',`Type-only dependency contains runtime declarations: ${relative(root,file)}`);order.unshift(file);
    }
    const external:string[]=[],blocks:string[]=[],namespaceObjects=new Map<string,string>(),wrappers:string[]=[],overrides=new Map<string,string>();
    const reserved=new Set([...exportsOf(original).map(symbol=>symbol.name),...symbols.values()]);
    const allocate=(base:string)=>{let name=base,index=1;while(reserved.has(name))name=base+'_'+index++;reserved.add(name);return name;};
    const styleClosure=(file:string,visited=new Set<string>()):string[]=>{if(visited.has(file))return [];visited.add(file);return (imports.get(file)??[]).flatMap(e=>styles.has(e.target)?[styles.get(e.target)!]:texts.has(e.target)&&!e.typeOnly?styleClosure(e.target,visited):[]);};
    for(const [i,stage]of stageDefinitions(analysis.manifest).map(({key,stage})=>({...stage,id:key})).entries())if(stage.entry&&stage.entry!=='@frameweave/plugin-stage'){
      const file=resolve(root,stage.entry),target=exportedName(file,stage.exportName??'default');if(!target)fail('E_FLAT_EXPORT',`Missing native factory ${stage.id}`);
      const css=styleClosure(file);if(file===original&&!css.length&&!explicitEntries(texts.get(file)!))continue;
      const wrapper=allocate(`fw_stage_${i}`);overrides.set(stage.id,wrapper);
      wrappers.push(`export const ${wrapper}: typeof ${target} = (init) => {${css.map(s=>`fw_installStyles(${JSON.stringify(s)});`).join('')}return ${target}(init);};`);
    }
    const prefix=`/** @jsxImportSource @frameweave/engine */\n// FrameWeave flat TSX. Real typed code: no source capsule, eval, module restoration, or private registry.\nimport {defineEffect as fw_defineEffect,type PluginManifest as FWManifest} from '@frameweave/engine/plugins';\n${hasPackages?`import {createManagedStage as fw_managedStage,withFlatStages as fw_flatProject} from '@frameweave/engine/packages';`:''}`;
    function transform(file:string):string{
      const ast=program.getSourceFile(file)!;
      const namespaceTargets=new Map<ts.Symbol,string>();for(const n of ast.statements)if(ts.isImportDeclaration(n)&&n.importClause?.namedBindings&&ts.isNamespaceImport(n.importClause.namedBindings)){const edge=imports.get(file)?.find(e=>e.name===(n.moduleSpecifier as ts.StringLiteral).text),s=checker.getSymbolAtLocation(n.importClause.namedBindings.name);if(edge&&s)namespaceTargets.set(s,edge.target);}
      const tr=ts.transform(ast,[context=>source=>{
        const transform:ts.Visitor=node=>{
          if(ts.isImportTypeNode(node)&&ts.isLiteralTypeNode(node.argument)&&ts.isStringLiteral(node.argument.literal)){
            const target=resolveModule(node.argument.literal.text,file);if(target&&texts.has(resolve(target))){if(!node.qualifier||!ts.isIdentifier(node.qualifier))fail('E_FLAT_TYPE_IMPORT','Local import types need a named export');const name=exportedName(resolve(target),node.qualifier.text);if(!name)fail('E_FLAT_TYPE_IMPORT','Cannot flatten local import type');return node.isTypeOf?f.createTypeQueryNode(f.createIdentifier(name)):f.createTypeReferenceNode(name,node.typeArguments?.map(n=>ts.visitNode(n,transform) as ts.TypeNode));}
          }
          if(ts.isJsxAttribute(node)&&node.initializer&&ts.isStringLiteral(node.initializer)){
            const a=assets.get(resolve(dirname(file),node.initializer.text));if(a)return f.updateJsxAttribute(node,node.name,f.createJsxExpression(undefined,f.createIdentifier(a.name)));
          }
          if(ts.isImportSpecifier(node)){
            const name=symName(checker.getSymbolAtLocation(node.name));if(name)return f.updateImportSpecifier(node,node.isTypeOnly,node.propertyName??f.createIdentifier(node.name.text),f.createIdentifier(name));
          }
          if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require'))fail('E_FLAT_DYNAMIC',`${relative(root,file)}: dynamic module loading is not flattened; use static imports or capsule layout`);
          if(ts.isMetaProperty(node))fail('E_FLAT_META',`${relative(root,file)}: import.meta has module-specific identity`);
          if(ts.isShorthandPropertyAssignment(node)){const name=symName(checker.getShorthandAssignmentValueSymbol(node));if(name)return f.createPropertyAssignment(node.name.text,f.createIdentifier(name));}
          if(ts.isBindingElement(node)&&!node.propertyName&&ts.isIdentifier(node.name)){const name=symName(checker.getSymbolAtLocation(node.name));if(name)return f.updateBindingElement(node,node.dotDotDotToken,node.dotDotDotToken||ts.isArrayBindingPattern(node.parent)?undefined:f.createIdentifier(node.name.text),f.createIdentifier(name),ts.visitNode(node.initializer,transform) as ts.Expression|undefined);}
          if(ts.isQualifiedName(node)){const target=ts.isIdentifier(node.left)&&namespaceTargets.get(checker.getSymbolAtLocation(node.left)!),name=target?exportedName(target,node.right.text):symName(checker.getSymbolAtLocation(node.right));if(name)return f.createIdentifier(name);}
          if(ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)){const target=namespaceTargets.get(checker.getSymbolAtLocation(node.expression)!);if(target){const name=exportedName(target,node.name.text);if(name)return f.createIdentifier(name);}}
          if(ts.isIdentifier(node)){
            if(ts.isPropertyAccessExpression(node.parent)&&node.parent.name===node||ts.isPropertyAssignment(node.parent)&&node.parent.name===node||ts.isPropertySignature(node.parent)&&node.parent.name===node||ts.isMethodDeclaration(node.parent)&&node.parent.name===node)return node;
            const name=symName(checker.getSymbolAtLocation(node));if(name)return f.createIdentifier(name);
          }
          if(ts.isStringLiteralLike(node)){
            const path=resolve(dirname(file),node.text),a=assets.get(path)??(ts.isPropertyAssignment(node.parent)&&node.parent.name.getText(ast)==='src'?assets.get(resolve(root,node.text)):undefined);if(a&&!ts.isImportDeclaration(node.parent)&&!ts.isExportDeclaration(node.parent))return f.createIdentifier(a.name);
          }
          if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
            const attr=node.attributes.properties,id=attr.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='id') as ts.JsxAttribute|undefined;
            const value=id?.initializer&&ts.isStringLiteral(id.initializer)?id.initializer.text:undefined;
            if(value&&overrides.has(value)&&attr.some(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)==='entry')){
              const properties=attr.filter(a=>!ts.isJsxAttribute(a)||!['entry','exportName'].includes(a.name.getText(ast))).map(a=>ts.visitNode(a,transform) as ts.JsxAttributeLike);
              properties.push(f.createJsxAttribute(f.createIdentifier('factory'),f.createJsxExpression(undefined,f.createIdentifier(overrides.get(value)!))));
              const tag=ts.visitNode(node.tagName,transform) as ts.JsxTagNameExpression,attributes=f.createJsxAttributes(properties);
              return ts.isJsxOpeningElement(node)?f.updateJsxOpeningElement(node,tag,node.typeArguments,attributes):f.updateJsxSelfClosingElement(node,tag,node.typeArguments,attributes);
            }
          }
          if(ts.isObjectLiteralExpression(node)&&ts.isCallExpression(node.parent)){
            const id=node.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='id') as ts.PropertyAssignment|undefined;
            const value=id&&ts.isStringLiteral(id.initializer)?id.initializer.text:undefined;
            if(value&&overrides.has(value)&&node.properties.some(p=>ts.isPropertyAssignment(p)&&p.name.getText(ast)==='entry'))return f.updateObjectLiteralExpression(node,[...node.properties.filter(p=>!ts.isPropertyAssignment(p)||!['entry','exportName'].includes(p.name.getText(ast))).map(p=>ts.visitNode(p,transform) as ts.ObjectLiteralElementLike),f.createPropertyAssignment('factory',f.createIdentifier(overrides.get(value)!))]);
          }
          return ts.visitEachChild(node,transform,context);
        };
        const output:ts.Statement[]=[];
        for(const statement of source.statements){
          if(ts.isImportDeclaration(statement)){
            const edge=imports.get(file)?.find(e=>e.name===(statement.moduleSpecifier as ts.StringLiteral).text);
            if(!edge){external.push(printer.printNode(ts.EmitHint.Unspecified,ts.visitNode(statement,transform)!,ast));continue;}
            const clause=statement.importClause;if(!clause)continue;
            if(!isCode(edge.target)){
              if(styles.has(edge.target)){if(clause)fail('E_FLAT_CSS','Use a side-effect import for plain CSS');continue;}
              const a=assets.get(edge.target)!;const exp=checker.getSymbolAtLocation(program.getSourceFile(edge.target+'.fw_asset.ts')!)!;const defaultSymbol=checker.getExportsOfModule(exp).find(s=>s.name==='default');if(defaultSymbol)symbols.set(actual(defaultSymbol)!,a.text!==undefined||a.json!==undefined?a.name+'_value':a.name);continue;
            }
            if(clause.namedBindings&&ts.isNamespaceImport(clause.namedBindings)){
              const name=`fw_namespace_${ids.get(edge.target)}`,local=checker.getSymbolAtLocation(clause.namedBindings.name);if(local)symbols.set(local,name);
              const values=exportsOf(edge.target).filter(s=>!!(actual(s)!.flags&ts.SymbolFlags.Value)).map(s=>`get ${JSON.stringify(s.name)}(){return ${exportedName(edge.target,s.name)};}`).join(',');namespaceObjects.set(name,`const ${name}=Object.freeze({${values}});`);
            }continue;
          }
          if(ts.isExportDeclaration(statement))continue;
          if(ts.isExportAssignment(statement)){
            const expression=ts.visitNode(statement.expression,transform) as ts.Expression;
            output.push(f.createVariableStatement(undefined,f.createVariableDeclarationList([f.createVariableDeclaration(`FW_${ids.get(file)}_default`,undefined,undefined,expression)],ts.NodeFlags.Const)));continue;
          }
          let transformed=ts.visitNode(statement,transform) as ts.Statement;
          if(ts.canHaveModifiers(transformed)){
            const mods=ts.getModifiers(transformed)?.filter(m=>m.kind!==ts.SyntaxKind.ExportKeyword&&m.kind!==ts.SyntaxKind.DefaultKeyword);
            if(ts.isFunctionDeclaration(transformed))transformed=f.updateFunctionDeclaration(transformed,mods,transformed.asteriskToken,transformed.name??f.createIdentifier(`FW_${ids.get(file)}_default`),transformed.typeParameters,transformed.parameters,transformed.type,transformed.body);
            else if(ts.isClassDeclaration(transformed))transformed=f.updateClassDeclaration(transformed,mods,transformed.name??f.createIdentifier(`FW_${ids.get(file)}_default`),transformed.typeParameters,transformed.heritageClauses,transformed.members);
            else transformed=f.replaceModifiers(transformed as ts.HasModifiers,mods??[]) as ts.Statement;
          }output.push(transformed);
        }
        return f.updateSourceFile(source,output);
      }]);
      const result=printer.printFile(tr.transformed[0]);tr.dispose();return result;
    }
    // Assign asset alias symbols before transforming references in all modules.
    for(const file of files)for(const node of program.getSourceFile(file)!.statements)if(ts.isImportDeclaration(node)){
      const e=imports.get(file)?.find(e=>e.name===(node.moduleSpecifier as ts.StringLiteral).text);if(e&&assets.has(e.target)){
        const ast=program.getSourceFile(e.target+'.fw_asset.ts')!,symbol=checker.getSymbolAtLocation(ast)!;const target=checker.getExportsOfModule(symbol).find(s=>s.name==='default');const a=assets.get(e.target)!;if(target)symbols.set(actual(target)!,a.text!==undefined||a.json!==undefined?a.name+'_value':a.name);
      }
    }
    const graphBlocks:string[]=[];
    for(const file of order)(graphFiles.has(file)?graphBlocks:blocks).push(`// Source: ${slash(relative(root,file)).replace(/^\.\.\//g,'')}\n${transform(file)}`);
    const uniqueAssets=new Map<string,{uri:string;text?:string;json?:unknown}>();for(const a of assets.values())uniqueAssets.set(a.name,a);
    const assetCode=[...uniqueAssets].map(([name,a])=>`const ${name}:string=${JSON.stringify(a.uri)};${a.text!==undefined?`\nconst ${name}_value:string=${JSON.stringify(a.text)};`:a.json!==undefined?`\nconst ${name}_value=${JSON.stringify(a.json)};`:''}`).join('\n');
    const effectCode=(hasPackages?[]:plugins).map((p,i)=>{
      const m=structuredClone(p.manifest);delete m.entry;for(const r of Object.values(m.resources??{}))r.src=assets.get(resolve(p.directory,r.src))!.uri;
      let manifest=JSON.stringify(m,null,2);for(const r of Object.values(m.resources??{})){const a=[...assets.values()].find(a=>a.uri===r.src)!;manifest=manifest.replaceAll(JSON.stringify(a.uri),a.name);}
      return `const fw_manifest_${i}:FWManifest=${manifest};\nexport const ${allocate(`fw_effect_${i}`)}=fw_defineEffect(fw_manifest_${i}${p.entry?','+exportedName(resolve(p.entry),'default'):''});`;
    }).join('\n');
    const entryExports=exportsOf(original).filter(s=>!['default','frameweaveRuntime'].includes(s.name)).map(s=>{const target=exportedName(original,s.name);return target?`export ${actual(s)!.flags&ts.SymbolFlags.Value?'':'type '}{${target} as ${s.name}};`:'';}).join('\n');
    const licenses=Object.entries(sourceData.sources).filter(([path])=>/\b(license|notice|ofl|copying)([.-]|$)/i.test(path)).map(([path,text])=>`/* Included license: ${path}\n${text.replaceAll('*/','* /')}\n*/`).join('\n');
    const runtime=createRuntimeRequirement(legacy.officialPackages);
    let packageCode='',defaultCode=exportedName(original,'default')!;
    const graphNamespaceNames=new Set([...namespaceObjects.keys()].filter(name=>graphFiles.has(files[Number(name.replace('fw_namespace_',''))])));
    if(hasPackages){
      // These modules may be evaluated together only when module evaluation is
      // declaration-only. Initialization, GPU work and side effects belong to
      // the original lifecycle, invoked later through the same ModuleLoader.
      const pure=(n:ts.Node):boolean=>ts.isFunctionLike(n)||ts.isStringLiteralLike(n)||ts.isNumericLiteral(n)||ts.isBigIntLiteral(n)||ts.isIdentifier(n)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(n.kind)||ts.isAsExpression(n)&&pure(n.expression)||ts.isParenthesizedExpression(n)&&pure(n.expression)||ts.isArrayLiteralExpression(n)&&n.elements.every(pure)||ts.isObjectLiteralExpression(n)&&n.properties.every(p=>ts.isMethodDeclaration(p)||ts.isPropertyAssignment(p)&&pure(p.initializer)||ts.isShorthandPropertyAssignment(p))||ts.isPrefixUnaryExpression(n)&&pure(n.operand)||ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='definePlugin'&&n.arguments.every(pure);
      for(const file of graphFiles)for(const s of program.getSourceFile(file)!.statements){if(ts.isImportDeclaration(s)||ts.isExportDeclaration(s)||ts.isInterfaceDeclaration(s)||ts.isTypeAliasDeclaration(s)||ts.isFunctionDeclaration(s)||ts.isEmptyStatement(s))continue;if(ts.isVariableStatement(s)&&s.declarationList.declarations.every(d=>!d.initializer||pure(d.initializer)))continue;if(ts.isExportAssignment(s)&&pure(s.expression))continue;fail('E_FLAT_PACKAGE_EVALUATION',`${relative(root,file)}: managed Flat requires declaration-only module evaluation; use capsule for side effects, classes or top-level async work`);}
      const namespace=(file:string)=>`Object.freeze({${exportsOf(resolve(file)).filter(s=>!!(actual(s)!.flags&ts.SymbolFlags.Value)).map(s=>`get ${JSON.stringify(s.name)}(){return ${exportedName(resolve(file),s.name)};}`).join(',')}})`;
      const graph=`async function fw_loadPackageGraph():Promise<{javascript:Record<string,Record<string,unknown>>;effects:Record<string,import('@frameweave/engine/plugins').PluginDefinition<any>>}>{\n${[...namespaceObjects].filter(([n])=>graphNamespaceNames.has(n)).map(([,s])=>s).join('\n')}\n${graphBlocks.join('\n\n')}\nreturn {javascript:{${[...graphModules].map(([key,file])=>`${JSON.stringify(key)}:${namespace(file)}`).join(',')}},effects:{${[...graphEffects].map(([ref,m])=>`${JSON.stringify(ref)}:${exportedName(resolve(m.file),m.exportName??'default')}${m.exportName?'.implementation!':''}`).join(',')}}};\n}`;
      const factories:Record<string,string>={},stagePackages:Record<string,PreparedPluginPlan['packages']>={},stageCode:string[]=[];
      for(const [id,p]of nativeBindings){const stage=stageDefinitions(analysis.manifest).map(({key,stage})=>({...stage,id:key})).find(s=>s.id===id)!,file=resolve(root,stage.entry!),target=exportedName(file,stage.exportName??'default'),name=allocate('fw_flat_'+id);factories[id]=name;stagePackages[id]=p.packages;
        const bindings=p.bindings.map(b=>{const shim=shims.get(managed.records.get(b.ref)!.manifest.id)!;return `{ref:${JSON.stringify(b.ref)},engine:${JSON.stringify(b.engine)},module:${JSON.stringify(b.module)},initialize:${JSON.stringify(b.initialize)},forward:${JSON.stringify(b.forward)},resources:${JSON.stringify(b.resources)},dependencies:${JSON.stringify(b.dependencies)},bind(ns:Record<string,unknown>){${b.names.map(n=>`if(!Object.hasOwn(ns,${JSON.stringify(n)})||typeof ns[${JSON.stringify(n)}]!=='function')throw new Error('Invalid embedded callable binding');${exportedName(shim,n)}=ns[${JSON.stringify(n)}] as typeof ${exportedName(shim,n)};`).join('')}}}`;});
        stageCode.push(`${stage.engine==='native-gpu'?`import {defineNativeStage as ${name}_define} from '@frameweave/engine/native';\n`:''}export const ${name}:typeof ${target}=${stage.engine==='native-gpu'?`${name}_define(`:''}async init=>{const graph=await fw_loadPackageGraph();return fw_managedStage(async()=>${target},[${bindings.join(',')}],${JSON.stringify(p.packages)},Object.fromEntries(Object.entries(graph.javascript).map(([k,v])=>[k,async()=>v])),Object.fromEntries(Object.entries(graph.effects).map(([k,v])=>[k,async()=>v])))(init);}${stage.engine==='native-gpu'?')':''};`);
      }
      const resources=[...new Map(extraResources.map(r=>[r.id,{id:r.id,src:r.path.startsWith('data:')?r.path:assets.get(resolve(r.path))!.uri,kind:r.kind}])).values()];
      let resourceCode=JSON.stringify(resources);for(const a of assets.values())resourceCode=resourceCode.replaceAll(JSON.stringify(a.uri),a.name);
      packageCode=[graph,...stageCode,`const fw_flatResources:import('@frameweave/engine').TVG['resources']=${resourceCode};`,`const fw_flatPackages:Record<string,Record<string,import('@frameweave/engine/packages').RuntimePackage>>=${JSON.stringify(stagePackages)};`,`const fw_flatFactories={${Object.entries(factories).map(([id,n])=>`${JSON.stringify(id)}:${n}`).join(',')}};`].join('\n\n');
      defaultCode=`fw_flatProject(${defaultCode},fw_flatFactories,fw_flatPackages,[...fw_flatResources])`;
    }
    let code=[prefix,`export const frameweaveRuntime = ${JSON.stringify(runtime,null,2)} as const;`,...new Set(external),assetCode,...[...namespaceObjects].filter(([n])=>!graphNamespaceNames.has(n)).map(([,s])=>s),...wrappers,...blocks,effectCode,packageCode,entryExports,`export default ${defaultCode};\n`,licenses].join('\n\n');
    if(hasPackages){const ast=ts.createSourceFile('flat.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),sealed=namedStatements(ast),names=new Set(['fw_loadPackageGraph','fw_flatResources','fw_flatPackages','fw_flatFactories',...[...uniqueAssets].flatMap(([n,a])=>a.text!==undefined||a.json!==undefined?[n,n+'_value']:[n]),...packageCode.matchAll(/export const (\w+)/g)].map(n=>typeof n==='string'?n:n[1]));
      for(const [n,s]of sealed)if(ts.isImportDeclaration(s))names.add(n);
      const certificate:FlatCertificate={schemaVersion:1,trustedSources:packageState.config.trustedSources,packages:Object.fromEntries(usedPackages.map(p=>{const pin=packageState.lock!.packages[packageRef(p.manifest)];return [packageRef(p.manifest),{manifest:p.manifest,integrity:pin.integrity,modules:pin.modules,dependencies:pin.dependencies}];})),declarations:Object.fromEntries([...names].map(n=>[n,statementHash(sealed.get(n)!,ast)]))};code+=`\nexport const frameweaveEmbeddedPackages=${JSON.stringify(certificate,null,2)} as const;\n`;}
    const check=join(temp,'flat.tsx');await writeFile(check,code);await typecheckProject([{file:check}]);
    // Compile once before delivery to catch source-reference/backend/inline metadata errors.
    await buildProject(check,{outputDir:join(temp,'checked')});
    await mkdir(dirname(output),{recursive:true});await writeFile(output,code);
    const report={...legacy,entry:output,layout:'flat-tsx',runtime,sourceModules:files.length,inlineEffects:plugins.map(p=>`${p.manifest.id}@${p.manifest.version}`),privateRegistryRequired:false,typechecked:true,verification:'BUILT_NOT_YET_VISUALLY_VERIFIED'};
    await writeFile(`${output}.export.json`,JSON.stringify(report,null,2)+'\n');return report;
  }finally{await rm(temp,{recursive:true,force:true});}
}
