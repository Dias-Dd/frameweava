import {build} from 'esbuild';
import ts from 'typescript';
import {readFile,writeFile,mkdir,copyFile,stat} from 'node:fs/promises';
import {dirname,join,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const moduleRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const workspace=resolve(moduleRoot,'../..');
const within=(root:string,path:string)=>{const r=relative(root,path);return r!==''&&r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r);};
const sourceNames=['index','types','track','track-types','check','validate','resources','path-mask','text-geometry'];

/** Build tooling only. Published code is a dependency-free ESM library, never a Stage or analysis job. */
export async function buildGraphicsPackage(output=join(workspace,'artifacts/graphics-stabilization/package')):Promise<string> {
  output=resolve(output);
  if(!within(join(workspace,'artifacts/graphics-stabilization'),output)&&!within(join(workspace,'.frameweave/graphics-distribution-tests'),output))throw Error('Package output must be inside this worktree\'s isolated graphics artifacts or test fixtures');
  try{await stat(output);throw Error(`Refusing to replace existing package output: ${output}`);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const entry=join(moduleRoot,'index.ts'),dist=join(output,'dist');
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',treeShaking:true,metafile:true,logLevel:'silent',outfile:'index.js'});
  const js=result.outputFiles.find(f=>f.path.endsWith('index.js'));if(!js)throw Error('Missing bundled library entry');
  if(Object.values(result.metafile!.outputs).some(out=>out.imports.length))throw Error('Published library has external runtime imports');
  if(Object.keys(result.metafile!.inputs).some(file=>file.replaceAll('\\','/').includes('/prototypes/')))throw Error('Library still depends on prototype code');
  // Nothing requiring a native Stage is allowed to survive tree shaking.
  if(/\b(?:NATIVE_STAGE_FACTORY|createPluginStage|installStage|createAnalysisTask|AnalysisTaskHandle)\b/.test(js.text))throw Error('Stage/AnalysisTask runtime leaked into the pure library');

  const declarations=new Map<string,string>();
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,declaration:true,emitDeclarationOnly:true,allowImportingTsExtensions:true,rootDir:workspace,outDir:join(output,'declaration-intermediate'),lib:['lib.es2022.d.ts','lib.dom.d.ts'],types:['node'],typeRoots:[join(workspace,'node_modules/@types')],noEmitOnError:true};
  const host=ts.createCompilerHost(options);host.writeFile=(file,text)=>{
    const match=/[\\/]modules[\\/]graphics-contracts[\\/]([^\\/]+\.d\.ts)$/.exec(file);if(match)declarations.set(match[1],text.replaceAll(/(['"])\.\/([^'"]+)\.ts\1/g,'$1./$2.js$1'));
  };
  const program=ts.createProgram([entry],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
  if(diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error))throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>workspace,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
  const emitted=program.emit();if(emitted.emitSkipped)throw Error('Declaration generation skipped');
  const reachable=new Set<string>();
  function visit(name:string){
    if(reachable.has(name))return;const text=declarations.get(name);if(!text)throw Error(`Missing local declaration ${name}`);reachable.add(name);
    if(/(?:src\/|prototypes\/|@frameweave\/engine|node:)/.test(text))throw Error(`External engine/runtime declaration in ${name}`);
    for(const item of ts.preProcessFile(text,true,true).importedFiles){if(!/^\.\/[^/]+\.js$/.test(item.fileName))throw Error(`External declaration dependency ${item.fileName}`);visit(basename(item.fileName).replace(/\.js$/,'.d.ts'));}
  }
  visit('index.d.ts');
  if([...reachable].some(name=>!sourceNames.some(source=>name===`${source}.d.ts`)))throw Error('Unexpected private declaration in library');
  // Roll up only local emitted declarations. The public export set comes from the TS checker,
  // so helper declarations needed by signatures stay private instead of widening the API.
  const checker=program.getTypeChecker(),rootSymbol=checker.getSymbolAtLocation(program.getSourceFile(entry)!);
  if(!rootSymbol)throw Error('Missing library module symbol');
  const values:string[]=[],types:string[]=[];
  for(const symbol of checker.getExportsOfModule(rootSymbol)){
    const target=symbol.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(symbol):symbol;
    (target.flags&ts.SymbolFlags.Value?values:types).push(symbol.name);
  }
  const rolled=[...reachable].sort().flatMap(name=>{
    const ast=ts.createSourceFile(name,declarations.get(name)!,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    return ast.statements.filter(statement=>!ts.isImportDeclaration(statement)&&!ts.isExportDeclaration(statement)).map(statement=>statement.getText(ast).replace(/^export\s+/,''));
  }).join('\n\n')+`\n\nexport {${values.sort().join(',')}};\nexport type {${types.sort().join(',')}};\n`;
  if(ts.preProcessFile(rolled,true,true).importedFiles.length||/\bimport\s*\(/.test(rolled))throw Error('Rolled declarations still reference another module');
  await mkdir(dist,{recursive:true});await writeFile(join(dist,'index.js'),js.contents);
  await writeFile(join(dist,'index.d.ts'),rolled);
  const manifest=JSON.parse(await readFile(join(moduleRoot,'package.json'),'utf8'));delete manifest.scripts;
  await writeFile(join(output,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  await copyFile(join(moduleRoot,'frameweave.package.json'),join(output,'frameweave.package.json'));
  await mkdir(join(output,'src'),{recursive:true});for(const name of sourceNames){const text=(await readFile(join(moduleRoot,name+'.ts'),'utf8')).replaceAll('../../src/core/errors.ts','@frameweave/engine').replaceAll('../../src/core/graph.ts','@frameweave/engine');await writeFile(join(output,'src',name+'.ts'),text);}
  const managed=JSON.parse(await readFile(join(output,'frameweave.package.json'),'utf8'));managed.modules.main.path='./src/index.ts';await writeFile(join(output,'frameweave.package.json'),JSON.stringify(managed,null,2)+'\n');
  await copyFile(join(moduleRoot,'PUBLIC_API_V1.md'),join(output,'PUBLIC_API_V1.md'));
  await copyFile(join(moduleRoot,'GRAPHICS_SCHEMA_V1.md'),join(output,'GRAPHICS_SCHEMA_V1.md'));
  await copyFile(join(workspace,'LICENSE'),join(output,'LICENSE'));
  return output;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildGraphicsPackage(process.argv[2]));
