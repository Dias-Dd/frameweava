import {readFile,writeFile,mkdir,copyFile,cp,stat} from 'node:fs/promises';
import {resolve,join,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import ts from 'typescript';
import {lightingDefaults} from '../studio-lighting.ts';
import {cameraView} from '../view-presets.ts';
import {materialPreset,materialStyles} from '../material-presets.ts';
import {finishDefaults,type FinishPreset} from '../finish.ts';
import {puppetMotionDefaults} from '../puppet.ts';
import {particleRecipe,type ParticleFieldKind} from '../particle-recipes.ts';
import {characterArtwork,characterPalette} from '../character-art.ts';
import {characterMotionDefaults} from '../character-poses.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=resolve(root,'../..');
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
/** Candidate only. Reuses the existing R1 format, verified local solver builds
 * and pinned dependency graph. Does NOT install, authorize, lock or publish. */
export async function buildSpatialCreation(output:string){
 output=resolve(output);const rel=relative(join(workspace,'.frameweave'),output);if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('Choose a fresh package path inside this worktree .frameweave');
 try{await stat(output);throw Error('Refusing to overwrite a candidate build');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const lock=JSON.parse(await readFile(join(workspace,'package-lock.json'),'utf8'));if(lock.packages['node_modules/three'].version!=='0.186.1')throw Error('Review changed Three version');
 const upstream=JSON.parse(await readFile(join(root,'UPSTREAM.json'),'utf8'));
 for(const file of [...upstream.spatialGeometry?.files??[],...upstream.character?.files??[],...upstream.instancing?.files??[],...upstream.creatorEffects?.files??[],...upstream.creatorMotion?.files??[],...upstream.creatorLayout?.files??[],...upstream.creatorStudio?.files??[],...upstream.puppetControls?.files??[],...upstream.particleMapping?.files??[],...upstream.foamShatter?.files??[],...upstream.waterWorld?.files??[],...upstream.contactPhysics?.files??[],...upstream.coupledPhysics?.files??[],...upstream.characterAssets?.files??[]])if(sha(await readFile(join(workspace,file.source)))!==file.sha256)throw Error('Review changed geometry dependency: '+file.source);
 if(sha(await readFile(join(workspace,upstream.earcut.source)))!==upstream.earcut.sourceSha256||sha(await readFile(join(root,upstream.earcut.licenseFile)))!==upstream.earcut.licenseSha256)throw Error('Review changed bundled Earcut source/license');
 await mkdir(join(output,'wasm'),{recursive:true});const inputs:Record<string,string>={};
 for(const [module,name]of [['puppet-effects','puppet'],['rigid-body-effects','rigid'],['deformable-effects','deform']]){
  const base=join(workspace,'modules',module),record=JSON.parse(await readFile(join(base,'dist/build.json'),'utf8'));
  for(const [path,hash]of Object.entries({...record.inputs,...record.outputs})){if(sha(await readFile(join(base,path)))!==hash)throw Error('Stale solver build: '+module+'/'+path);}
  const wasm=await readFile(join(base,'dist/module.wasm'));inputs[module]=sha(wasm);await writeFile(join(output,'wasm',name+'.wasm'),wasm);
  await cp(join(base,'licenses'),join(output,'licenses',module),{recursive:true});await copyFile(join(base,'NOTICE'),join(output,'licenses',module+'-NOTICE'));
  try{await cp(join(base,'vendor'),join(output,'licenses',module+'-vendor'),{recursive:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 }
 const contact=JSON.parse(await readFile(join(root,'physics/dist/build.json'),'utf8'));for(const [name,hash]of Object.entries(contact.inputs))if(sha(await readFile(join(workspace,name)))!==hash)throw Error('Contact solver provenance stale: '+name);const contactBytes=await readFile(join(root,'physics/dist/module.wasm'));if(sha(contactBytes)!==contact.sha256)throw Error('Contact WASM changed');inputs['contact-physics']=contact.sha256;await writeFile(join(output,'wasm/contact.wasm'),contactBytes);await cp(join(root,'physics/vendor'),join(output,'licenses/contact-physics'),{recursive:true});
 const coupled=JSON.parse(await readFile(join(root,'coupling/dist/build.json'),'utf8'));for(const [name,hash]of Object.entries(coupled.inputs))if(sha(await readFile(join(workspace,name)))!==hash)throw Error('Coupled solver provenance stale: '+name);const coupledBytes=await readFile(join(root,'coupling/dist/module.wasm'));if(sha(coupledBytes)!==coupled.sha256)throw Error('Coupled WASM changed');inputs['coupled-physics']=coupled.sha256;await writeFile(join(output,'wasm/coupled.wasm'),coupledBytes);await cp(join(root,'coupling/licenses'),join(output,'licenses/coupled-physics'),{recursive:true});
 const sdk={name:'public-sdk',setup(b:any){
  // Use the existing public GPU export, not a bundled legacy barrel whose
  // side effects pull the Surface compositor into this Native package.
  b.onResolve({filter:/native-gpu\/authoring\.ts$/},()=>({path:'@frameweave/engine/native',external:true}));
  b.onResolve({filter:/spatial-vfx\/stage\.ts$/},()=>({path:'@frameweave/engine/spatial-vfx',external:true}));
  b.onResolve({filter:/gpu-effects\/index\.ts$/},()=>({path:'@frameweave/engine/native',external:true}));
  b.onResolve({filter:/\/(?:src\/(?:core|media)\/|src\/plugins\/sdk\.ts)/},(a:any)=>{
   // Private pure affine helpers are not public SDK exports. Carry their
   // original tree-shaken implementation; never invent new Core exports.
   if(a.path.endsWith('/media/compositor-geometry.ts'))return;
   return {path:a.path.includes('/plugins/')?'@frameweave/engine/plugins':'@frameweave/engine',external:true};
  });
 }};
 for(const name of ['public','bindings'])await build({entryPoints:[join(root,name+'.ts')],outfile:join(output,name+'.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',treeShaking:true,legalComments:'inline',plugins:[sdk],logLevel:'silent'});
 // Carry declaration dependencies only. No private compiler/runtime is shipped.
 const options:ts.CompilerOptions={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,strict:true,skipLibCheck:true,lib:['lib.es2022.d.ts','lib.dom.d.ts'],types:['node'],typeRoots:[join(workspace,'node_modules/@types')],allowImportingTsExtensions:true,declaration:true,emitDeclarationOnly:true,outDir:join(output,'types'),rootDir:workspace};
 const host=ts.createCompilerHost(options),files=new Map<string,string>();host.writeFile=(path,text)=>files.set(path.replaceAll('\\','/'),text);
 const program=ts.createProgram([join(root,'index.ts')],options,host),errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errors.length)throw Error(ts.formatDiagnostics(errors,{getCurrentDirectory:()=>workspace,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));program.emit();
 const outSlash=join(output,'types').replaceAll('\\','/'),typeRoot=join(output,'types/modules/spatial-creation');
 for(const [path,text]of files){if(!path.startsWith(outSlash+'/'))throw Error('Declaration escaped package');const source=join(workspace,relative(outSlash,path)).replace(/\.d\.ts$/,'.ts');
  // Public capability brands must have ONE identity. Never emit a private copy
  // of GpuPixelImage/NativeGpuScope into a consumer's public signature.
  const publicTypes=text.replace(/(['"])(\.{1,2}\/[^'"]+)\1/g,(all,quote,spec)=>{const target=resolve(dirname(source),spec).replace(/\.js$/,'.ts').replaceAll('\\','/');let entry:string|undefined;
   if(/\/src\/(core|media)\//.test(target))entry='@frameweave/engine';
   else if(target.endsWith('/src/plugins/sdk.ts')||target.endsWith('/src/packages/runtime.ts'))entry='@frameweave/engine/plugins';
   else if(target.endsWith('/modules/native-gpu/authoring.ts'))entry='@frameweave/engine/native';
   else if(target.endsWith('/modules/spatial-vfx/stage.ts'))entry='@frameweave/engine/spatial-vfx';
   else if(/\/modules\/gpu-effects\/(pixel-types|compute-types|compute-capabilities|compute-profiling)\.ts$/.test(target))entry='@frameweave/engine/native';
   else if(/\/modules\/graphics-contracts\/(index|types)\.ts$/.test(target))entry='@frameweave/engine/graphics-contracts';
   return entry?quote+entry+quote:all;
  });await mkdir(dirname(path),{recursive:true});await writeFile(path,publicTypes.replace(/\.ts(['"])/g,'.js$1'));}
 await writeFile(join(typeRoot,'api.d.ts'),(await readFile(join(root,'api.d.ts'),'utf8')).replace(/\.ts(['"])/g,'.js$1'));await writeFile(join(output,'api.d.ts'),"export * from './types/modules/spatial-creation/api.d.ts';\n");
 await copyFile(join(root,'scene-functions.json'),join(output,'frameweave.functions.json'));
 for(const name of ['frameweave.package.json','README.md'])await copyFile(join(root,name),join(output,name));
 if((await readFile(join(root,'examples/paper-figure.json'),'utf8'))!==JSON.stringify(characterArtwork(),null,2)+'\n')throw Error('Review/update authored paper-figure.json using scripts/prepare-character.ts');
 await cp(join(root,'examples'),join(output,'examples'),{recursive:true});
 const guide=JSON.parse(await readFile(join(root,'creation-guide.json'),'utf8')),manifest=JSON.parse(await readFile(join(root,'frameweave.package.json'),'utf8'));guide.package=manifest.id+'@'+manifest.version;guide.studioDefaults={lights:Object.fromEntries((['studio','soft','dramatic','rim','sunset','moonlight','daylight','neon','warm','cool'] as const).map(n=>[n,lightingDefaults(n)])),cameras:Object.fromEntries((['front','back','left','right','top','bottom','isometric','hero','perspective','orbit'] as const).map(n=>[n,cameraView(n)])),materials:Object.fromEntries((Object.keys(materialStyles) as (keyof typeof materialStyles)[]).map(n=>[n,materialPreset(n)]))};guide.characterActionDefaults=characterMotionDefaults;guide.characterPalette=characterPalette;guide.puppetMotionDefaults=puppetMotionDefaults;guide.particleFieldDefaults=Object.fromEntries((['field','snow','sparks','bubbles','fireflies','dust','confetti','energy','stars','petals'] as ParticleFieldKind[]).map(kind=>[kind,particleRecipe(kind)]));guide.finishPresets=Object.fromEntries((['clean','cinema','dream','neon','noir','warm','cool','pastel','poster','sepia'] as FinishPreset[]).map(name=>[name,finishDefaults(name)]));await writeFile(join(output,'creation-guide.json'),JSON.stringify(guide,null,2)+'\n');
 await copyFile(join(workspace,'LICENSE'),join(output,'LICENSE'));await copyFile(join(workspace,'node_modules/three/LICENSE'),join(output,'licenses/three-MIT.txt'));
 for(const [source,name] of [
  ['modules/gpu-image-effects/NOTICE','gpu-image-effects-NOTICE'],['modules/gpu-image-effects/resident/NOTICE','resident-effects-NOTICE'],['modules/gpu-image-effects/resident/LICENSE.effectcraft','effectcraft-resident-MIT.txt'],['modules/gpu-image-effects/resident/creative/vendor/LICENSE-MIT','effectcraft-creative-MIT.txt'],['modules/pro-animation/NOTICE','pro-animation-NOTICE'],['modules/pro-animation/vendor/effectcraft/NOTICE','effectcraft-PA-NOTICE'],['modules/pro-animation/vendor/effectcraft/LICENSE-MIT','effectcraft-PA-MIT.txt']])await copyFile(join(workspace,source),join(output,'licenses',name));
 await copyFile(join(workspace,'modules/skeletal-effects/NOTICE'),join(output,'licenses/skeletal-effects-NOTICE'));
 await cp(join(root,'vendor/ozz-ik'),join(output,'licenses/ozz-ik'),{recursive:true});
 await cp(join(root,'licenses'),join(output,'licenses'),{recursive:true});await copyFile(join(root,'UPSTREAM.json'),join(output,'UPSTREAM.json'));
 await cp(join(workspace,'modules/spatial-effects/vendor/fastnoise-lite'),join(output,'licenses/fastnoise-lite'),{recursive:true});
 await writeFile(join(output,'PROVENANCE.json'),JSON.stringify({candidate:true,three:lock.packages['node_modules/three'],solverSha256:inputs,reused:'Existing Frameweave Native algorithms; authored creator defaults and composition only',sourceFiles:await Promise.all(['character-assets','character-cubic','character-import','character-controls','character-animation','character-shaders','character-renderer','character-actor','coupled-models','coupled-physics','coupled-scenes','fracture-bodies','contact-models','contact-codec','contact-physics','contact-scenes','water-controls','water-kernels','wave-world','height-caustics','foam','foam-kernels','shatter','shatter-geometry','particle-mapping','particle-mapping-shaders','mapped-particle-field','puppet-controls','studio-lighting','view-presets','material-presets','layout','layout-recipes','cards','motion','motion-recipes','creator-effects','colors','clone-layout','clones','primitive-assets','object-controls','sculptures','types','lifecycle','composition-core','composition','creation-scenes','stroke-shapes','strokes','electric','character-art','character-poses','characters','image-character-layout','image-character-controls','image-characters','image-skin-recording','finish','particles','particle-field','particle-emitter','particle-sprites','particle-recipes','scenes','objects','geometry','physics-assets','physics-scenes','puppet-layout','puppet','physics','shot','index','bindings'].map(async n=>({path:n+'.ts',sha256:sha(await readFile(join(root,n+'.ts')))})))},null,2));return output;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await buildSpatialCreation(process.argv[2]));
