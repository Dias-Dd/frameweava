import {build} from 'esbuild';import ts from 'typescript';import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,cp,stat} from 'node:fs/promises';import {resolve,dirname,join,relative,isAbsolute} from 'node:path';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../..');
/** Rewrite the public SDK boundary before normalizing local TS extensions. */
export function publicSdkReferences(text:string){
 const modules:Record<string,string>={
  '../../../src/plugins/sdk':'@frameweave/engine/plugins',
  '../../graphics-contracts/types':'@frameweave/engine/graphics-contracts',
  '../../graphics-contracts/index':'@frameweave/engine/graphics-contracts',
  ...Object.fromEntries(['media/surface','media/color','core/types','core/time','core/animation','core/errors'].map(name=>['../../../src/'+name,'@frameweave/engine']))
 };
 for(const [file,target]of Object.entries(modules))for(const ext of ['ts','js'])for(const quote of ["'",'"'])text=text.replaceAll(quote+file+'.'+ext+quote,quote+target+quote);
 return text;
}
/** Descriptive metadata must be reproducible across workspace paths. Formal declarations remain the TS authority. */
export function publicSignature(signature:string){
 return signature.replace(/import\(["']([^"']+)["']\)/g,(_all,path:string)=>{
  const p=path.replaceAll('\\','/'),prefix=workspace.replaceAll('\\','/')+'/',rel=p.startsWith(prefix)?p.slice(prefix.length):p;
  const name=rel.startsWith('src/plugins/')?'@frameweave/engine/plugins':rel.startsWith('src/')?'@frameweave/engine':rel.startsWith('modules/graphics-contracts/')?'@frameweave/engine/graphics-contracts':rel.startsWith('modules/pro-animation/')?'pro-animation':undefined;
  if(!name&&(/^[A-Za-z]:\//.test(p)||p.startsWith('/')))throw Error('Unmapped private path in descriptive API signature');
  return 'import("'+(name??p)+'")';
 });
}
/** Package build only. Installation, resolution, trust and locks remain in R1. */
export async function buildProAnimation(output:string){
 output=resolve(output);const rel=relative(join(workspace,'.frameweave/pa0'),output);if(!rel||rel==='..'||rel.startsWith('..')||isAbsolute(rel))throw Error('PA package output must be inside this worktree .frameweave/pa0');
 try{await stat(output);throw Error('Refusing to replace package output');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await mkdir(join(output,'dist'),{recursive:true});
 // R1 accepts ordinary typed modules. Ship the reviewed editable sources as the
 // executable module graph as well as the npm ESM build; Flat need not decompile JS.
 await mkdir(join(output,'src'),{recursive:true});
 for(const name of ['index','effect','bindings','noise','professional','coverage','geometry','path-tools','selectors','animated-text','procedural','particles','shape-modifiers','advanced','aim-2d','bidi-animation','bidi-line','curve-sampler','font-shaping','glyph-animation','glyph-on-path','inertia','path-dashes','path-motion','path-operations','path-twist','path-zigzag','shutter-sampling','text-itemizer','time-controls']){let text=publicSdkReferences(await readFile(join(root,'src',name+'.ts'),'utf8'));text=text.replace(/\.ts(['"])/g,'.js$1').replaceAll('../../../src/media/surface.js','@frameweave/engine').replaceAll('../../../src/core/types.js','@frameweave/engine').replaceAll('../../../src/core/time.js','@frameweave/engine').replaceAll('../../../src/core/animation.js','@frameweave/engine').replaceAll('../../../src/core/errors.js','@frameweave/engine').replaceAll('../../graphics-contracts/types.js','@frameweave/engine/graphics-contracts').replaceAll('../../graphics-contracts/index.js','@frameweave/engine/graphics-contracts').replaceAll('../../../src/media/surface.ts','@frameweave/engine').replaceAll('../../../src/media/color.ts','@frameweave/engine').replaceAll('../../../src/core/time.ts','@frameweave/engine').replaceAll('../../../src/core/animation.ts','@frameweave/engine').replaceAll('../../../src/core/errors.ts','@frameweave/engine').replaceAll('../../../src/core/types.ts','@frameweave/engine').replaceAll('../../../src/plugins/sdk.ts','@frameweave/engine/plugins').replaceAll('../../graphics-contracts/types.ts','@frameweave/engine/graphics-contracts').replaceAll('../../graphics-contracts/index.ts','@frameweave/engine/graphics-contracts');await writeFile(join(output,'src',name+'.ts'),text);}
 await build({entryPoints:[join(root,'src/index.ts'),join(root,'src/effect.ts'),join(root,'src/bindings.ts')],outdir:join(output,'dist'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['@frameweave/engine','@frameweave/engine/plugins'],legalComments:'inline',logLevel:'silent',plugins:[{name:'public-sdk',setup(b){b.onResolve({filter:/src\/(?:core|plugins|media)\//},a=>({path:a.path.includes('/plugins/')?'@frameweave/engine/plugins':'@frameweave/engine',external:true}));}}]});
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,paths:{'@frameweave/engine':[join(workspace,'src/index.ts')],'@frameweave/engine/plugins':[join(workspace,'src/plugins/sdk.ts')]},declaration:true,emitDeclarationOnly:true,allowImportingTsExtensions:true,rootDir:workspace,outDir:join(output,'types'),lib:['lib.es2022.d.ts','lib.dom.d.ts'],types:['node'],typeRoots:[join(workspace,'node_modules/@types')]};
 const host=ts.createCompilerHost(options);host.writeFile=(file,text)=>{if(file.replaceAll('\\','/').includes('/pro-animation/src/'))ts.sys.writeFile(join(output,'dist',file.replaceAll('\\','/').split('/').at(-1)!),text.replaceAll('../../../src/media/surface.ts','@frameweave/engine').replaceAll('../../../src/media/color.ts','@frameweave/engine').replaceAll('./professional.ts','./professional.js').replaceAll('./coverage.ts','./coverage.js').replaceAll('./path-tools.ts','./path-tools.js').replaceAll('./geometry.ts','./geometry.js').replaceAll('./selectors.ts','./selectors.js').replaceAll('./animated-text.ts','./animated-text.js').replaceAll('./procedural.ts','./procedural.js').replaceAll('./particles.ts','./particles.js').replaceAll('./shape-modifiers.ts','./shape-modifiers.js').replaceAll('../../../src/core/types.ts','@frameweave/engine').replaceAll('../../../src/plugins/sdk.ts','@frameweave/engine/plugins').replaceAll('../../graphics-contracts/types.ts','@frameweave/engine/graphics-contracts').replaceAll('../../graphics-contracts/index.ts','@frameweave/engine/graphics-contracts'));};
 const program=ts.createProgram([join(root,'src/index.ts')],options,host),errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw Error(ts.formatDiagnostics(errors,{getCurrentDirectory:()=>workspace,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));if(program.emit().emitSkipped)throw Error('Declaration emit failed');
 const checker=program.getTypeChecker(),source=program.getSourceFile(join(root,'src/index.ts'))!,symbol=checker.getSymbolAtLocation(source)!;const functions=checker.getExportsOfModule(symbol).flatMap(s=>{const target=s.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(s):s;const declaration=target.valueDeclaration;if(!declaration||!ts.isFunctionDeclaration(declaration))return [];const signature=checker.getSignatureFromDeclaration(declaration)!;return [{name:s.name,signature:publicSignature(checker.signatureToString(signature)),documentation:ts.displayPartsToString(target.getDocumentationComment(checker))}];});
 await writeFile(join(output,'dist/bindings.d.ts'),(await readFile(join(root,'src/public.d.ts'),'utf8')).replaceAll('./index.ts','./index.js'));
 const effect=JSON.parse(await readFile(join(root,'effect.json'),'utf8'));await mkdir(join(output,'generated'),{recursive:true});await writeFile(join(output,'generated/agent-api.json'),JSON.stringify({schemaVersion:1,p4Reference:'pro-animation@0.7.3',parameterSchemaVersion:1,parameters:effect.parameters,profile:'typescript-functions',functions,errors:['E_PA_PARAMETER','E_PA_GRAPHICS','E_PA_TOPOLOGY','E_PA_SPACE','E_PA_SIZE','E_PA_PRECISION','E_PA_DISPOSED','E_PA_BUSY','E_PA_LIMIT','E_PA_DEPENDENCY','E_PA_TEMPORAL'],environment:{webStage:true,worker:false,allowWasmRequired:false,host:'Managed Web bindings; CPU float effects and explicit Legacy Canvas8'},limitations:['Legacy Trim preserved; explicit curves mode supports bounded adaptive arc length, offset/wrap and contours','Strict Morph preserved; explicit matchPaths resamples contours with declared mapping/winding rules','Professional: CPU 16F/32F scene-linear; Legacy Canvas overload remains SDR; no professional GPU pass','Named Web Stage bindings v1 and declaration-only typed managed Flat are supported; JS-only graphs use capsule']},null,2));
 // 0.2.1 is already frozen. TypeScript printed checkout-specific type paths
 // into its descriptive API JSON; retain those published bytes, never a second
 // same-version identity. They are documentation, not runtime imports.
 const version=JSON.parse(await readFile(join(root,'frameweave.package.json'),'utf8')).version;
 if(version==='0.2.1'){
  const frozen=await readFile(join(root,'release/0.2.1/agent-api.json'));
  if(createHash('sha256').update(frozen).digest('hex')!=='cfc4b8f70c9b4e799093ecdb5eb5cd5e5036195a6aa630e84f5979595812403e')throw Error('Frozen 0.2.1 API metadata integrity mismatch');
  const normalize=(api:{functions:{signature:string}[]})=>JSON.stringify({...api,functions:api.functions.map(f=>({...f,signature:f.signature.replace(/import\("[^"]*\/modules\/graphics-contracts\/index"\)/g,'import("@frameweave/engine/graphics-contracts")')}))});
  const generated=JSON.parse(await readFile(join(output,'generated/agent-api.json'),'utf8'));
  if(normalize(generated)!==normalize(JSON.parse(frozen.toString('utf8'))))throw Error('Frozen 0.2.1 API changed: publish a new immutable version');
  await writeFile(join(output,'generated/agent-api.json'),frozen);
 }
 await cp(join(root,'attribution'),join(output,'attribution'),{recursive:true});await cp(join(root,'rust'),join(output,'rust'),{recursive:true});
 for(const name of ['package.json','frameweave.package.json','effect.json','README.md','PUBLIC_API.md','NOTICE'])await copyFile(join(root,name),join(output,name));
 const managed=JSON.parse(await readFile(join(output,'frameweave.package.json'),'utf8'));for(const [name,m]of Object.entries(managed.modules) as [string,{path:string}][])m.path='./src/'+(name==='main'?'index':name)+'.ts';await writeFile(join(output,'frameweave.package.json'),JSON.stringify(managed,null,2)+'\n');effect.entry='./src/effect.ts';await writeFile(join(output,'effect.json'),JSON.stringify(effect,null,2)+'\n');
 await copyFile(join(workspace,'LICENSE'),join(output,'LICENSE'));await cp(join(root,'vendor'),join(output,'vendor'),{recursive:true});return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildProAnimation(process.argv[2]));
