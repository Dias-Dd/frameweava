import {stageDefinitions} from '../../modules/stage-orchestration/composite-types.ts';
import {engineDependencyRoots} from '../runtime/dependencies.ts';
import {runtimeCachePath} from '../runtime/paths.ts';
import ts from 'typescript';
import * as esbuild from 'esbuild';
import {readFile,writeFile,mkdir,stat,readdir,mkdtemp,rm,rename,realpath} from 'node:fs/promises';
import {resolve,join,dirname,relative,extname,isAbsolute,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {isUtf8} from 'node:buffer';
import {createRequire,isBuiltin} from 'node:module';
import {buildProject,engineRoot,alias,loader} from './build.ts';
import {printPortable} from './portable.ts';
import type {PortableProject} from '../core/portable.ts';
import type {TVG} from '../core/types.ts';
import {projectPlugins,builtinRoot,readLock,discoverPlugins,PluginRegistry} from '../plugins/registry.ts';
import {fail} from '../plugins/schema.ts';
import {createRuntimeRequirement} from './runtime-lock.ts';
import {embedSvg} from './svg.ts';
import {packageRef} from '../packages/manifest.ts';
import {packageContext} from './package-context.ts';

export interface ExportOptions {
  output:string;
  singleFile?:boolean;
  sources?:'merge'|'preserve';
  modules?:'merge'|'copy'|'external';
  assets?:'embed'|'copy'|'external';
  maxAssetMB?:number;
  layout?:'flat'|'capsule';
}
interface Analysis {entry:string;files:string[];manifest:TVG;pluginRoots:string[]}
const slash=(path:string)=>path.replaceAll('\\','/');
const within=(root:string,path:string)=>{const r=relative(root,path);return r!== '..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const textExtensions=new Set(['.ts','.tsx','.mts','.cts','.js','.jsx','.mjs','.cjs','.css','.json','.glsl','.wgsl','.txt','.md','.html','.license']);
const codeExtensions=/\.[cm]?[jt]sx?$/i;
const engineRequire=createRequire(join(engineRoot,'package.json'));
async function walk(directory:string):Promise<string[]>{const result:string[]=[];for(const e of await readdir(directory,{withFileTypes:true})){if(['node_modules','.git','.frameweave'].includes(e.name))continue;const path=join(directory,e.name);if(e.isSymbolicLink())fail('E_EXPORT_PATH',`Export requires ordinary files, not links: ${path}`);if(e.isDirectory())result.push(...await walk(path));else result.push(path);}return result;}
async function absent(path:string){try{await stat(path);fail('E_EXISTS',`Export refuses to overwrite ${path}`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}

/** Collect using the real esbuild graphs and evaluated TVG. Never enumerate an entire project or user catalog. */
export async function exportProject(entry:string,options:ExportOptions) {
  if(options.singleFile&&options.layout!=='capsule')return (await import('./flatten.ts')).exportFlatProject(entry,options);
  const sources=options.sources??(options.singleFile?'merge':'preserve'),modules=options.modules??(options.singleFile?'merge':'copy'),assets=options.assets??(options.singleFile?'embed':'copy');
  if(!['merge','preserve'].includes(sources)||!['merge','copy','external'].includes(modules)||!['embed','copy','external'].includes(assets))fail('E_ARGUMENT','Invalid export policy');
  if(options.singleFile&&(sources!=='merge'||modules!=='merge'||assets!=='embed'))fail('E_EXPORT_POLICY','--single-file requires --sources merge --modules merge --assets embed');
  const budget=(options.maxAssetMB??16)*1024*1024;if(!Number.isFinite(budget)||budget<=0||budget>256*1024*1024)fail('E_ARGUMENT','max-asset-mb must be > 0 and <= 256');
  const output=resolve(options.output);if(options.singleFile&&!output.endsWith('.tsx'))fail('E_ARGUMENT','Single-file output must use your chosen .tsx filename');
  await absent(output);
  const build=await buildProject(entry),analysis=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8')) as Analysis;
  const root=dirname(analysis.entry),context=await packageContext(analysis.entry),project=context.embedded||analysis.pluginRoots.length&&analysis.pluginRoots.every(dir=>dir===root)?{registry:new PluginRegistry()}:await projectPlugins(root);
  const privatePlugins=project.registry.list().filter(p=>analysis.pluginRoots.includes(p.directory)&&!within(builtinRoot,p.directory));
  const refs=analysis.pluginRoots.flatMap(dir=>{const record=project.registry.list().find(p=>p.directory===dir);return record?[`${record.manifest.id}@${record.manifest.version}`]:[];});
  const packageState=context.state,usedPackages=packageState.records.filter(p=>analysis.pluginRoots.includes(p.directory)),packageRoots=new Set(usedPackages.map(p=>p.directory));
  const privateRoots=new Map(privatePlugins.filter(p=>!packageRoots.has(p.directory)).map(p=>[p.directory,`modules/${p.manifest.id}@${p.manifest.version}`]));
  for(const p of usedPackages)privateRoots.set(p.directory,`packages/${packageRef(p.manifest)}/${p.integrity}`);
  const files=new Set<string>(),mapping=new Map<string,string>(),replacements=new Map<string,string>(),external:string[]=[],warnings:string[]=[],packages=new Map<string,string>();
  const sdk=join(engineRoot,'src'),dependencies=join(engineRoot,'node_modules'),dependencyRoots=await engineDependencyRoots(engineRoot);
  // Exact pure SDK contracts only. Never classify a neighbouring host adapter
  // or a lookalike prefix as official project-external source.
  const sdkActual=await realpath(engineRoot),inferenceSdk=new Set<string>();
  // Keep the exact implementation of the used public entries and the injected
  // Native Stage bootstrap in the pinned SDK.
  const linkedSdk=new Set<string>(),usedSdkFiles=new Set(analysis.files.map(file=>resolve(file)));
  const sdkEntries=['native','editing','editing/node','typography','typography/node','image-effects','image-effects/node','spatial-vfx']
    .map(name=>alias[`@frameweave/engine/${name}` as keyof typeof alias])
    .concat(join(engineRoot,'modules/native-gpu/logic-bootstrap.ts'))
    .filter(entry=>usedSdkFiles.has(entry));
  if(sdkEntries.length){
    const probe=await esbuild.build({entryPoints:sdkEntries,outdir:join(build.dir,'linked-sdk-probe'),bundle:true,write:false,metafile:true,platform:'node',format:'esm',packages:'external',alias,loader,logLevel:'silent'});
    for(const file of Object.keys(probe.metafile!.inputs)){
      const expected=resolve(file),actual=await realpath(expected);
      if(actual!==expected||!within(sdkActual,actual))fail('E_EXPORT_DEPENDENCY','Linked SDK dependencies must retain their exact installed SDK identity');
      linkedSdk.add(actual);
    }
  }
  for(const name of ['modules/servo/index.ts','modules/servo/stage.ts','modules/servo/document.ts','modules/inference/types.ts','modules/inference/native.ts','modules/inference/schema.ts','modules/spidermonkey-host/module-resources.ts','modules/spidermonkey-host/bootstrap.ts','modules/spatial-compute/native-replay.ts','modules/spatial-fields/parameters.ts']){const candidate=join(sdkActual,name);try{const actual=await realpath(candidate);if(actual!==candidate)fail('E_EXPORT_DEPENDENCY','Native SDK contracts must be ordinary files at their exact SDK identity');inferenceSdk.add(actual);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  // Node preparation is a separate public host entry, never part of the pure
  // Stage SDK set above. It is external only when the source actually uses it.
  const servoNode=alias['@frameweave/engine/servo/node'];
  if(analysis.files.includes(servoNode)){if(await realpath(servoNode)!==servoNode)fail('E_EXPORT_DEPENDENCY','Servo Node SDK entry must retain its exact identity');linkedSdk.add(servoNode);}
  const official=(file:string)=>linkedSdk.has(resolve(file))||inferenceSdk.has(resolve(file))||within(sdk,file)||within(join(engineRoot,'modules/gpu-effects'),file)||within(join(engineRoot,'modules/native-gpu'),file)||within(join(engineRoot,'modules/shared-state'),file)||within(join(engineRoot,'modules/stage-orchestration'),file)||within(join(engineRoot,'modules/graphics-contracts'),file);
  const inDependency=(file:string)=>dependencyRoots.some(root=>within(root,file));
  for(const file of analysis.files){
    if(official(file)||inDependency(file)||within(builtinRoot,file)||within(join(build.dir,'plugins'),file))continue;
    files.add(file);
  }
  files.add(analysis.entry);
  for(const directory of privateRoots.keys())for(const file of await walk(directory))files.add(file);
  // Type-only imports are part of an editable TS project too; esbuild omits them at runtime.
  for(const file of files)if(codeExtensions.test(file)){
    const source=await readFile(file,'utf8'),imports=ts.preProcessFile(source,true,true).importedFiles;
    for(const imported of imports){const spec=imported.fileName;if(Object.hasOwn(alias,spec)||isBuiltin(spec))continue;
      const resolved=ts.resolveModuleName(spec,file,{moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,resolveJsonModule:true},ts.sys).resolvedModule?.resolvedFileName;
      if(resolved&&!official(resolved)&&!inDependency(resolved)&&!within(builtinRoot,resolved))files.add(resolve(resolved));
    }
  }
  for(const resource of analysis.manifest.resources){
    if(resource.src.startsWith('data:'))continue;
    if(/^(https?:|data:|blob:)/.test(resource.src))fail('E_EXPORT_RESOURCE',`External resource must be downloaded and declared locally before export: ${resource.src}`);
    const file=resource.src.startsWith('package:')?engineRequire.resolve(resource.src.slice(8)):resolve(root,resource.src);files.add(file);
    replacements.set(resource.src,file);
  }
  for(const stage of stageDefinitions(analysis.manifest).map(({stage})=>stage))for(const record of Object.values((stage.props.$inlineEffects??{}) as Record<string,{manifest:{resources?:Record<string,{src:string}>}}>))for(const r of Object.values(record.manifest.resources??{})){
    if(r.src.startsWith('data:'))continue;const path=resolve(root,r.src);files.add(path);replacements.set(r.src,path);
  }
  // glTF's relative buffers/textures are dependency edges, even though esbuild only sees the .gltf file.
  for(const file of files)if(extname(file).toLowerCase()==='.gltf'&&![...packageRoots].some(dir=>within(dir,file))){
    const gltf=JSON.parse(await readFile(file,'utf8'));
    for(const item of [...gltf.buffers??[],...gltf.images??[]])if(item.uri&&!item.uri.startsWith('data:')){
      if(/^[a-z]+:/i.test(item.uri)||isAbsolute(item.uri))fail('E_EXPORT_RESOURCE',`glTF external URI is not portable: ${file}: ${item.uri}`);
      const dependency=resolve(dirname(file),decodeURIComponent(item.uri)),owner=[...privateRoots.keys()].find(p=>within(p,file))??(within(root,file)?root:dirname(file));if(!within(owner,dependency))fail('E_EXPORT_RESOURCE','glTF resource escapes its declared project/plugin directory');await stat(dependency);files.add(dependency);
    }
  }
  // Carry adjacent resource licenses as part of the portable artifact, including font OFL notices.
  for(const file of [...files])if(!codeExtensions.test(file))for(const directory of [dirname(file),dirname(dirname(file))]){
    if(!within(root,directory)&&!inDependency(directory)&&![...privateRoots.keys()].some(p=>within(p,directory)))continue;
    for(const name of ['LICENSE','LICENSE.txt','LICENSE.md','OFL.txt','OFL.md'])try{const candidate=join(directory,name);if((await stat(candidate)).isFile())files.add(candidate);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  for(const file of files){
    const plugin=[...privateRoots].find(([dir])=>within(dir,file));
    if(plugin)mapping.set(file,`${plugin[1]}/${slash(relative(plugin[0],file))}`);
    else if(within(root,file))mapping.set(file,slash(relative(root,file)));
    else if(inDependency(file))mapping.set(file,`assets/packages/${hash(await readFile(file)).slice(0,16)}${extname(file)}`);
    else fail('E_EXPORT_DEPENDENCY',`Imported source/resource outside the project and locked plugin directories: ${file}. Move it into the project or register it as a plugin.`);
  }
  // Static imports are resolved by esbuild, retaining source text. No module linker is implemented here.
  const captured=new Map<string,Buffer>(),assetFiles=new Set<string>(),moduleFiles=new Set<string>();
  const declaredAssets=new Set(replacements.values());for(const p of privatePlugins)for(const r of Object.values(p.manifest.resources??{}))declaredAssets.add(resolve(p.directory,r.src));
  for(const file of [...files].sort()){
    const logical=mapping.get(file)!,isModule=[...privateRoots.keys()].some(dir=>within(dir,file));if(isModule)moduleFiles.add(logical);
    let bytes:Buffer=await readFile(file);const ext=extname(file).toLowerCase(),isSource=textExtensions.has(ext)||/^(?:LICENSE|NOTICE|COPYING|OFL)(?:[.-]|$)/i.test(basename(file));
    if(ext==='.svg'&&![...packageRoots].some(dir=>within(dir,file))){const owner=[...privateRoots.keys()].find(p=>within(p,file))??(within(root,file)?root:dirname(file));bytes=(await embedSvg(bytes,{file,owner,maxBytes:budget})).bytes;}
    const isAsset=!isSource||declaredAssets.has(file)||['.glsl','.wgsl','.gltf','.txt','.json'].includes(ext)&&!['effect.json','OFL.txt','LICENSE.txt'].includes(basename(file));
    if(isAsset){assetFiles.add(logical);if(assets==='embed'&&bytes.length>budget)fail('E_EXPORT_ASSET_SIZE',`${logical} is ${(bytes.length/1024/1024).toFixed(2)} MiB, above --max-asset-mb ${budget/1024/1024}; use --assets copy or explicitly raise the limit`);}
    if(/\.(node|exe|dll|so|dylib)$/i.test(file))fail('E_EXPORT_NATIVE',`Native executable/plugin cannot be embedded: ${logical}`);
    // Managed package identities are byte immutable; carry their entire relative tree verbatim.
    if([...packageRoots].some(dir=>within(dir,file))){captured.set(logical,bytes);continue;}
    let text=isSource?bytes.toString('utf8'):undefined;
    const originalText=text;
    if(text!==undefined&&codeExtensions.test(file)){
      const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ext==='.tsx'?ts.ScriptKind.TSX:ts.ScriptKind.TS),edits:{start:number;end:number;text:string}[]=[];
      const literals:ts.StringLiteralLike[]=[],imports=new Map<ts.StringLiteralLike,boolean>();
      const visit=(node:ts.Node)=>{
        if(ts.isStringLiteralLike(node))literals.push(node);
        if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){if(node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))imports.set(node.moduleSpecifier,true);}
        if(ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(node.expression)&&node.expression.text==='require')){
          if(node.arguments.length!==1||!ts.isStringLiteralLike(node.arguments[0]))fail('E_EXPORT_DYNAMIC',`${logical}: dynamic module specifier cannot be collected; use a literal import()`);imports.set(node.arguments[0] as ts.StringLiteralLike,true);
        }
        if(ts.isMetaProperty(node))warnings.push(`${logical}: import.meta locations refer to the exported materialized module, not the original machine`);
        if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['eval','Function'].includes(node.expression.text))fail('E_EXPORT_DYNAMIC',`${logical}: generated executable strings cannot be collected statically`);
        if(ts.isNewExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='URL'&&node.arguments?.some(a=>a.getText(ast).includes('import.meta')))fail('E_EXPORT_RESOURCE',`${logical}: import.meta URL assets must be declared with Resource or a static asset import`);
        if(ts.isStringLiteralLike(node)&&/^https?:\/\//i.test(node.text)){
          const parent=node.parent,namespace=ts.isCallExpression(parent)&&ts.isPropertyAccessExpression(parent.expression)&&parent.expression.name.text==='createElementNS'&&parent.arguments[0]===node&&['http://www.w3.org/2000/svg','http://www.w3.org/1999/xhtml','http://www.w3.org/1998/Math/MathML'].includes(node.text);
          if(!namespace)fail('E_EXPORT_RESOURCE',`${logical}: remote URL requires a locally declared resource before portable export: ${node.text}`);
        }
        ts.forEachChild(node,visit);
      };visit(ast);
      for(const node of literals){
        const specifier=node.text;let target:string|undefined;
        if(imports.has(node)){
          if(isBuiltin(specifier))fail('E_EXPORT_NATIVE',`${logical}: Node built-in ${specifier} has host dependencies. Refactor or keep this project in its original environment.`);
          if(Object.hasOwn(alias,specifier))continue;
          if(usedPackages.some(p=>p.manifest.id===specifier))continue;
          // Resolve a probe without executing the imported module. External packages remain explicit engine dependencies.
          const result=await esbuild.build({stdin:{contents:`import ${JSON.stringify(specifier)}`,resolveDir:dirname(file),sourcefile:'export-probe.ts'},bundle:true,write:false,outdir:join(build.dir,'export-probes'),metafile:true,platform:'node',format:'esm',loader,logLevel:'silent',plugins:[{name:'capture-resolution',setup(b){b.onResolve({filter:/.*/},async a=>{if(a.pluginData)return;const r=await b.resolve(a.path,{kind:a.kind,resolveDir:a.resolveDir,pluginData:true});if(r.errors.length)return {errors:r.errors};target=r.path;return {path:r.path,external:true};});}}],nodePaths:[dependencies]});
          void result;
          if(!target)fail('E_EXPORT_DEPENDENCY',`${logical}: Cannot resolve ${specifier}`);
          const sdkEntry=Object.entries(alias).find(([name,path])=>name.startsWith('@frameweave/engine')&&resolve(path)===resolve(target!));
          if(sdkEntry){edits.push({start:node.getStart(ast),end:node.end,text:JSON.stringify(sdkEntry[0])});continue;}
          if(inDependency(target)){
            if(!specifier.startsWith('.')&&!isAbsolute(specifier)){const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0],pkg=JSON.parse(await readFile(join(dependencyRoots.filter(root=>within(root,target!)).sort((a,b)=>b.length-a.length)[0],'package.json'),'utf8'));packages.set(name,pkg.version);continue;}
          }
          if(!mapping.has(target)&&!files.has(target)){
            // Type-only import graphs can be tree-shaken from esbuild's runtime graph. Refuse to silently lose them.
            fail('E_EXPORT_DEPENDENCY',`${logical}: ${specifier} was not captured in the runtime graph (possibly type-only or unused). Add it to a reachable source module or remove the unused import.`);
          }
        }else if(replacements.has(specifier))target=replacements.get(specifier);
        else {
          const candidate=resolve(root,specifier);if(stageDefinitions(analysis.manifest).map(({stage})=>stage).some(s=>s.entry===specifier)&&mapping.has(candidate))target=candidate;
        }
        if(target&&mapping.has(target)){
          const to=mapping.get(target)!,from=imports.has(node)?dirname(logical):dirname(mapping.get(analysis.entry)!),rel=slash(relative(from,to)),replacement=rel.startsWith('.')?rel:'./'+rel;
          if(replacement!==specifier)edits.push({start:node.getStart(ast),end:node.end,text:JSON.stringify(replacement)});
        }
      }
      for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.text+text.slice(edit.end);
    }
    if(text!==undefined&&ext==='.gltf'){
      const model=JSON.parse(text);for(const item of [...model.buffers??[],...model.images??[]])if(item.uri&&!item.uri.startsWith('data:')){
        const original=resolve(dirname(file),decodeURIComponent(item.uri)),mapped=mapping.get(original);if(!mapped)fail('E_EXPORT_RESOURCE',`Unresolved model resource ${logical}: ${item.uri}`);item.uri=slash(relative(dirname(logical),mapped));
      }text=JSON.stringify(model,null,2)+'\n';
    }
    captured.set(logical,text===undefined||text===originalText?bytes:Buffer.from(text));
  }
  // Preserve glTF URI layout; its buffers were copied at their original relative paths.
  const config={schemaVersion:1,roots:modules==='external'?[]:[...privateRoots].filter(([dir])=>!packageRoots.has(dir)).map(([,path])=>'./'+path),userLibrary:modules==='external'};
  if(usedPackages.length){
    if(modules==='external')fail('E_EXPORT_POLICY','Managed packages require modules copy/merge; their lock cannot reference arbitrary external stores');
    const used=new Set(usedPackages.map(p=>packageRef(p.manifest))),lock=structuredClone(packageState.lock!);
    lock.packages=Object.fromEntries(Object.entries(lock.packages).filter(([ref])=>used.has(ref)));
    lock.roots=Object.fromEntries(Object.entries(lock.roots).filter(([,ref])=>used.has(ref)));
    lock.requirements=Object.fromEntries(Object.entries(lock.requirements).filter(([id])=>Object.hasOwn(lock.roots,id)));
    // A used effect may have been installed only as another root's dependency.
    // Keep its exact version as an export root when the unused owner is pruned.
    const reached=new Set<string>();
    const reach=(ref:string)=>{if(reached.has(ref))return;reached.add(ref);for(const dependency of Object.values(lock.packages[ref].dependencies))reach(dependency);};
    Object.values(lock.roots).forEach(reach);
    for(const ref of refs)if(lock.packages[ref]&&!reached.has(ref)){const record=usedPackages.find(p=>packageRef(p.manifest)===ref)!;lock.roots[record.manifest.id]=ref;lock.requirements[record.manifest.id]=record.manifest.version;reach(ref);}
    if(reached.size!==Object.keys(lock.packages).length)fail('E_EXPORT_DEPENDENCY','Export contains package modules without a used effect or reachable root');
    captured.set('frameweave.packages.json',Buffer.from(JSON.stringify({...packageState.config,requirements:lock.requirements,store:'./packages'},null,2)+'\n'));
    captured.set('frameweave.packages.lock.json',Buffer.from(JSON.stringify(lock,null,2)+'\n'));
  }
  captured.set('frameweave.plugins.json',Buffer.from(JSON.stringify(config,null,2)+'\n'));
  // Build a temporary concrete graph to calculate pins for the exact exported plugin files.
  await mkdir(runtimeCachePath('exports'),{recursive:true});const temporary=await mkdtemp(runtimeCachePath('exports','collect-'));
  try{
    for(const [path,bytes]of captured){await mkdir(dirname(join(temporary,path)),{recursive:true});await writeFile(join(temporary,path),bytes);}
    if(refs.length){
      const registry=modules==='external'?project.registry:(await projectPlugins(temporary)).registry;
      const exportedLock=registry.lock(refs);captured.set('frameweave.plugins.lock.json',Buffer.from(JSON.stringify(exportedLock,null,2)+'\n'));
    }
  }finally{await rm(temporary,{recursive:true,force:true});}
  const selfContained=modules!=='external'&&assets!=='external',capsule=sources==='merge'||modules!=='copy'||assets!=='copy';
  const data:PortableProject={schemaVersion:1,entry:mapping.get(analysis.entry)!,sources:{},blobs:{},files:{},siblings:{},runtime:createRuntimeRequirement(Object.fromEntries(packages))};
  const fileOrigins=new Map([...mapping].map(([physical,logical])=>[logical,physical]));
  const exportDir=options.singleFile?dirname(output):output,entryName=options.singleFile?basename(output):capsule?'render.tsx':data.entry;
  const staging=await mkdtemp(join(await (async()=>{await mkdir(dirname(output),{recursive:true});return dirname(output);})(),'.frameweave-export-'));
  let binaryBytes=0;
  try{
    for(const [path,bytes]of captured){
      const isAsset=assetFiles.has(path),isModule=moduleFiles.has(path);
      if(isModule&&modules==='external'||isAsset&&assets==='external'){
        const physical=fileOrigins.get(path);if(!physical)fail('E_EXPORT_DEPENDENCY',`Missing origin ${path}`);data.siblings![path]=physical;external.push(physical);continue;
      }
      const inline=isAsset?assets==='embed':isModule?modules==='merge':sources==='merge'||path.startsWith('frameweave.plugins.');
      if(inline){
        // Filenames do not guarantee UTF-8. Immutable package documents and text
        // assets may contain other encodings; preserve their original bytes.
        const utf8=isUtf8(bytes);
        if(isAsset||!utf8){const key=hash(bytes);if(!data.blobs[key])binaryBytes+=bytes.length;const ext=extname(path).toLowerCase();data.blobs[key]=utf8&&textExtensions.has(ext)?{text:bytes.toString('utf8')}:{base64:bytes.toString('base64')};data.files[path]=key;}
        else data.sources[path]=bytes.toString('utf8');
      }
      else {
        const carried=capsule?`files/${path}`:path;data.siblings![path]='./'+carried;await mkdir(dirname(join(staging,carried)),{recursive:true});await writeFile(join(staging,carried),bytes);
      }
    }
    // In an ordinary directory export the config/lock need ordinary files as well.
    if(!capsule)for(const [path,bytes]of captured)if(path.startsWith('frameweave.plugins.'))await writeFile(join(staging,path),bytes);
    if(!capsule)await writeFile(join(staging,'frameweave.runtime.json'),JSON.stringify(data.runtime,null,2)+'\n');
    if(capsule)await writeFile(join(staging,entryName),printPortable(data));
    const result={schemaVersion:1,entry:join(exportDir,entryName),layout:capsule?'source-capsule':'source-tree',runtime:data.runtime,selfContained,sources,modules,assets,files:captured.size,privatePlugins:privatePlugins.map(p=>`${p.manifest.id}@${p.manifest.version}`),officialPackages:Object.fromEntries(packages),uniqueEmbeddedAssets:Object.keys(data.blobs).length,embeddedAssetReferences:Object.keys(data.files).length,embeddedBytes:binaryBytes,externalFiles:[...new Set(external)],warnings:[...new Set(warnings)],verification:'NOT_YET_RENDERED: use frame/render and compare outputs in an isolated instance'};
    if(options.singleFile){await rename(join(staging,entryName),output);await writeFile(`${output}.export.json`,JSON.stringify(result,null,2)+'\n');}
    else {await writeFile(join(staging,'export-report.json'),JSON.stringify(result,null,2)+'\n');await rename(staging,output);}
    return result;
  }finally{await rm(staging,{recursive:true,force:true});}
}

export async function exportCLI(args:string[]){
  const [entry,...rest]=args;if(!entry)fail('E_ARGUMENT','export <entry> --output <directory|custom-name.tsx> [--single-file]');
  const flags:Record<string,string>={};let singleFile=false;
  for(let i=0;i<rest.length;i++){const flag=rest[i];if(flag==='--single-file'){singleFile=true;continue;}if(!['--output','--format','--sources','--modules','--assets','--max-asset-mb','--layout'].includes(flag)||!rest[i+1]||rest[i+1].startsWith('--'))fail('E_ARGUMENT',`Invalid export option ${flag}`);flags[flag.slice(2)]=rest[++i];}
  if(!flags.output||flags.format&&flags.format!=='tsx')fail('E_ARGUMENT','Specify --output; supported format is tsx');
  if(flags.layout&&!['flat','capsule'].includes(flags.layout))fail('E_ARGUMENT','--layout must be flat or capsule');
  return exportProject(entry,{output:flags.output,singleFile,layout:flags.layout as ExportOptions['layout'],sources:flags.sources as ExportOptions['sources'],modules:flags.modules as ExportOptions['modules'],assets:flags.assets as ExportOptions['assets'],maxAssetMB:flags['max-asset-mb']?Number(flags['max-asset-mb']):undefined});
}
