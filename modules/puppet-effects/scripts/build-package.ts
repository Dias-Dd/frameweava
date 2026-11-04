import {readFile,writeFile,mkdir,cp,copyFile,stat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {build} from 'esbuild';import ts from 'typescript';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../..'),hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const publicSource=(s:string)=>s.replaceAll('../../../src/plugins/sdk.ts','@frameweave/engine/plugins').replaceAll('../../../src/media/surface.ts','@frameweave/engine').replaceAll('../../graphics-contracts/types.ts','@frameweave/engine/graphics-contracts');
/** Uses the existing R1 package format; no install/trust/lock side effects. */
export async function buildPuppetEffects(output:string){
  output=resolve(output);const rel=relative(join(workspace,'.frameweave/puppet-effects'),output);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Choose a fresh output within this worktree .frameweave/puppet-effects');
  try{await stat(output);throw Error('Refusing to replace a package');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const record=JSON.parse(await readFile(join(root,'dist/build.json'),'utf8'));
  for(const [name,digest]of Object.entries({...record.inputs,...record.outputs}))if(hash(await readFile(join(root,name)))!==digest)throw Error('Stale solver build: '+name);
  for(const dir of ['src','dist','native','runtime','licenses'])await mkdir(join(output,dir),{recursive:true});
  for(const name of ['index','types','solver','meshing','processor','bindings'])await writeFile(join(output,'src',name+'.ts'),publicSource(await readFile(join(root,'src',name+'.ts'),'utf8')).replaceAll('./renderer.ts','../native/renderer.js'));
  await cp(join(root,'runtime'),join(output,'runtime'),{recursive:true});await writeFile(join(output,'runtime/client.ts'),publicSource(await readFile(join(root,'runtime/client.ts'),'utf8')));
  await build({absWorkingDir:workspace,entryPoints:[join(root,'src/renderer.ts')],outfile:join(output,'native/renderer.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',legalComments:'inline',plugins:[{name:'public-sdk',setup(b){b.onResolve({filter:/src\/(?:core|plugins|media)\//},a=>({path:a.path.includes('/plugins/')?'@frameweave/engine/plugins':'@frameweave/engine',external:true}));}}]});
  await build({absWorkingDir:output,entryPoints:[join(output,'src/index.ts')],outfile:join(output,'dist/index.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['@frameweave/engine','@frameweave/engine/plugins'],logLevel:'silent',legalComments:'inline'});
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,lib:['lib.es2022.d.ts','lib.dom.d.ts'],types:['node'],typeRoots:[join(workspace,'node_modules/@types')],declaration:true,emitDeclarationOnly:true,allowImportingTsExtensions:true,rootDir:workspace,outDir:join(output,'types')};
  const host=ts.createCompilerHost(options);host.writeFile=(file,text)=>{if(file.replaceAll('\\','/').includes('/puppet-effects/src/'))ts.sys.writeFile(join(output,'dist',file.replaceAll('\\','/').split('/').at(-1)!),publicSource(text).replace(/\.ts(['"])/g,'.js$1'));};
  const p=ts.createProgram([join(root,'src/index.ts'),join(root,'src/renderer.ts')],options,host),errors=ts.getPreEmitDiagnostics(p).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw Error(ts.formatDiagnostics(errors,{getCurrentDirectory:()=>workspace,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));if(p.emit().emitSkipped)throw Error('Puppet declaration emit skipped');
  await copyFile(join(output,'dist/renderer.d.ts'),join(output,'native/renderer.d.ts'));await writeFile(join(output,'native/renderer.d.ts'),(await readFile(join(output,'native/renderer.d.ts'),'utf8')).replaceAll('./types.js','../dist/types.js'));
  await writeFile(join(output,'dist/public.d.ts'),(await readFile(join(root,'src/public.d.ts'),'utf8')).replace(/\.ts(['"])/g,'.js$1'));
  for(const file of ['module.wasm','worker.js','build.json'])await copyFile(join(root,'dist',file),join(output,'dist',file));
  for(const dir of ['vendor','licenses','rust'])await cp(join(root,dir),join(output,dir),{recursive:true});
  for(const file of ['package.json','frameweave.package.json','LICENSE','NOTICE','README.md'])await copyFile(join(root,file),join(output,file));
  const lock=JSON.parse(await readFile(join(workspace,'package-lock.json'),'utf8')),three=lock.packages['node_modules/three'];if(three.version!=='0.186.1')throw Error('Review changed Three dependency');await copyFile(join(workspace,'node_modules/three/LICENSE'),join(output,'licenses/three-MIT.txt'));
  await writeFile(join(output,'UPSTREAM.json'),JSON.stringify({effectcraft:JSON.parse(await readFile(join(root,'vendor/effectcraft/SOURCE.json'),'utf8')),solver:record,three,threeRendererSha256:hash(await readFile(join(workspace,'node_modules/three/src/renderers/WebGLRenderer.js'))),nativeTargetSha256:hash(await readFile(join(workspace,'modules/spatial-effects/src/native-target.ts'))),nativeBundleBytes:(await stat(join(output,'native/renderer.js'))).size,note:'Reuses module-local native Three float target in the bundle. No shared GPUTexture/Host/IPC and no extra npm dependency.'},null,2));return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildPuppetEffects(process.argv[2]));
