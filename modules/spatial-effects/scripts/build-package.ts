import {readFile,writeFile,mkdir,copyFile,stat,cp} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../..');
/** Build an explicitly reviewed local R1 package; never installs/trusts/refreshes a lock. */
export async function buildSpatialEffects(output:string){
  output=resolve(output);const rel=relative(join(workspace,'.frameweave/spatial-effects'),output);
  if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Spatial package outputs must be new paths in this worktree .frameweave/spatial-effects');
  try{await stat(output);throw Error('Refusing to replace package output');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  await mkdir(join(output,'src'),{recursive:true});await mkdir(join(output,'dist'));await mkdir(join(output,'licenses'));await mkdir(join(output,'native'));
  const publicSource=(text:string)=>text.replaceAll('../../../src/core/types.ts','@frameweave/engine').replaceAll('../../../src/core/simulation.ts','@frameweave/engine').replaceAll('../../../src/core/time.ts','@frameweave/engine').replaceAll('../../../src/core/animation.ts','@frameweave/engine').replaceAll('../../../src/media/surface.ts','@frameweave/engine');
  for(const name of ['types','checks','noise','noise-glsl','native-target','appearance','sprite-atlas','image-emitter','bursts','simulation','renderer','noise-renderer','index','bindings'])await writeFile(join(output,'src',name+'.ts'),publicSource(await readFile(join(root,'src',name+'.ts'),'utf8')));
  await cp(join(root,'vendor'),join(output,'vendor'),{recursive:true});
  // R1 forbids undeclared nested npm imports. Bundle the exact reviewed Three dependency,
  // retaining its license, instead of weakening that gate or requiring backend selection in TSX.
  for(const native of ['renderer','noise-renderer'])await build({absWorkingDir:workspace,entryPoints:[join(root,'src',native+'.ts')],outfile:join(output,'native',native+'.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',logLevel:'silent',legalComments:'inline',plugins:[{name:'public-engine',setup(b){b.onResolve({filter:/src\/(?:core|media)\//},()=>({path:'@frameweave/engine',external:true}));}}]});
  for(const name of ['index','bindings']){const file=join(output,'src',name+'.ts');await writeFile(file,(await readFile(file,'utf8')).replaceAll('./renderer.ts','../native/renderer.js').replaceAll('./noise-renderer.ts','../native/noise-renderer.js'));}
  await build({absWorkingDir:output,entryPoints:[join(output,'src/index.ts')],outfile:join(output,'dist/index.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',external:['@frameweave/engine'],logLevel:'silent',legalComments:'inline'});
  const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,lib:['lib.es2022.d.ts','lib.dom.d.ts'],types:['node'],typeRoots:[join(workspace,'node_modules/@types')],declaration:true,emitDeclarationOnly:true,allowImportingTsExtensions:true,rootDir:workspace,outDir:join(output,'types')};
  const host=ts.createCompilerHost(options);host.writeFile=(file,text)=>{if(file.replaceAll('\\','/').includes('/spatial-effects/src/'))ts.sys.writeFile(join(output,'dist',file.replaceAll('\\','/').split('/').at(-1)!),publicSource(text).replace(/\.ts(['"])/g,'.js$1'));};
  const p=ts.createProgram([join(root,'src/index.ts')],options,host),errors=ts.getPreEmitDiagnostics(p).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw Error(ts.formatDiagnostics(errors,{getCurrentDirectory:()=>workspace,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));if(p.emit().emitSkipped)throw Error('Spatial declaration emit failed');
  for(const native of ['renderer','noise-renderer'])await writeFile(join(output,'native',native+'.d.ts'),(await readFile(join(output,'dist',native+'.d.ts'),'utf8')).replaceAll('./types.js','../src/types.ts').replaceAll('./noise.js','../src/noise.ts'));
  for(const name of ['package.json','frameweave.package.json','README.md','NOTICE'])await copyFile(join(root,name),join(output,name));
  await copyFile(join(workspace,'licenses/APACHE-2.0.txt'),join(output,'LICENSE'));await copyFile(join(workspace,'node_modules/three/LICENSE'),join(output,'licenses/three-MIT.txt'));
  const lock=JSON.parse(await readFile(join(workspace,'package-lock.json'),'utf8')),dependency=lock.packages['node_modules/three'];
  if(dependency.version!=='0.186.1')throw Error('Unreviewed Three version');
  const hashes:Record<string,string>={};for(const name of ['src/renderers/WebGLRenderer.js','src/core/InstancedBufferGeometry.js','src/core/BufferAttribute.js','src/renderers/webgl/WebGLBindingStates.js','src/textures/DataTexture.js','src/renderers/webgl/WebGLTextures.js','LICENSE'])hashes[name]=createHash('sha256').update(await readFile(join(workspace,'node_modules/three',name))).digest('hex');
  await writeFile(join(output,'UPSTREAM.json'),JSON.stringify({algorithm:'Frameweave fixed-step primitive particles and normalized-age/native float atlas integration; FastNoiseLite 1.1.1 point kernels and GPU color generator; no external physics solver copied',noise:JSON.parse(await readFile(join(root,'vendor/fastnoise-lite/SOURCE.json'),'utf8')),rendering:{repository:'https://github.com/mrdoob/three.js',tag:'r186',npm:dependency,files:hashes,license:'MIT',use:'Tree-shaken native renderer bundled from the existing exact dependency, no undeclared nested npm imports',bundledBytes:(await stat(join(output,'native/renderer.js'))).size,noiseBundledBytes:(await stat(join(output,'native/noise-renderer.js'))).size}},null,2));
  return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildSpatialEffects(process.argv[2]));
