// SPDX-License-Identifier: Apache-2.0
// Runs only in Node via the installed engine's tsx; never included in a Stage entry graph.
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,mkdir,mkdtemp,copyFile,writeFile} from 'node:fs/promises';
import {instantiateModule} from './runtime/session.mjs';
import {createRequire} from 'node:module';
import {resolve,relative,isAbsolute} from 'node:path';
const root=dirname(fileURLToPath(import.meta.url)),[command,engine,...args]=process.argv.slice(2);
const fromEngine=path=>import(pathToFileURL(join(engine,path)).href);
const {validatePackage,readPackage}=await fromEngine('src/packages/manifest.ts');
const {validateManifest}=await fromEngine('src/plugins/schema.ts');
const effect=JSON.parse(await readFile(join(root,'effect.json'),'utf8'));
if(command==='validate'){
  validateManifest(effect);validatePackage(JSON.parse(await readFile(join(root,'frameweave.package.json'),'utf8')));
  if(effect.parameterSchemaVersion!==2)throw Error('Template requires the existing P4 parameterSchemaVersion 2');
  console.log(JSON.stringify({valid:true}));
}else if(command==='types'){
  const {typecheckProject}=await fromEngine('src/compiler/typecheck.ts');
  const typeRoot=args[0]??root;
  await typecheckProject(['index.ts','generated/types.ts','runtime/client.ts','runtime/worker.ts'].map(path=>({file:join(typeRoot,path)})));
  if(args[0]){
    // TypeScript deliberately permits unresolved side-effect imports by default.
    // Validate the collected JS graph too, without executing package code.
    const require=createRequire(join(engine,'package.json')),pkg=await readPackage(typeRoot);
    try{
      const graph=await require('esbuild').build({absWorkingDir:typeRoot,entryPoints:Object.values(pkg.manifest.modules).filter(m=>m.format==='javascript').map(m=>m.path),bundle:true,platform:'browser',format:'esm',target:'es2022',packages:'external',write:false,outdir:'__kit_graph__',metafile:true,logLevel:'silent'});
      for(const input of Object.keys(graph.metafile.inputs)){
        const rel=relative(typeRoot,resolve(typeRoot,input));if(rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw Error(`Imported source escapes package: ${input}`);
      }
    }catch(error){throw Object.assign(Error(`Collected module dependencies are incomplete: ${error.message}`),{code:'E_KIT_DEPENDENCY'});}
  }
  console.log(JSON.stringify({typecheck:true}));
}else if(command==='abi'){
  const session=await instantiateModule(await readFile(join(root,'dist/module.wasm')));session.dispose();console.log(JSON.stringify({abi:'bytes-v1'}));
}else if(command==='inspect'){
  const record=await readPackage(args[0]);console.log(JSON.stringify({directory:record.directory,reference:`${record.manifest.id}@${record.manifest.version}`,integrity:`sha256-${record.integrity}`,modules:record.moduleIntegrity}));
}else if(command==='browser'){
  const {pack}=await import('./module.mjs');
  await mkdir(join(root,'.frameweave/kit'),{recursive:true});const directory=await mkdtemp(join(root,'.frameweave/kit/smoke-'));
  const packed=await pack(join(directory,'package')),project=join(directory,'project');await mkdir(project);
  await copyFile(join(root,'demo/project.tsx'),join(project,'project.tsx'));
  const {installPackages}=await fromEngine('src/packages/manager.ts'),{writeLock}=await fromEngine('src/plugins/registry.ts');
  await installPackages(project,[packed.directory],{trust:[`local:${(await readPackage(packed.directory)).manifest.source.authority}`]});
  await writeLock(project);
  const {buildProject}=await fromEngine('src/compiler/build.ts'),{Renderer,VideoEncoder,probeVideo}=await fromEngine('src/node.ts');
  const build=await buildProject(join(project,'project.tsx'));
  const denied=await Renderer.create(build);let deniedAsExpected=false;
  try{await denied.renderFrame(0);}catch(error){deniedAsExpected=/WASM|WebAssembly/.test(error.message);}finally{await denied.close();}
  if(!deniedAsExpected)throw Error('Default CSP did not reject WASM');
  const renderer=await Renderer.create(build,{allowWasm:true,cache:false}),frames=new Map();
  try{
    for(const frame of [0,6,11,3,6]){const result=await renderer.renderFrame(frame);
      if(result.diagnostics.length)throw Error(JSON.stringify(result.diagnostics));
      if(frames.has(frame)&&!frames.get(frame).equals(result.png))throw Error('Random frame mismatch');frames.set(frame,result.png);
      await writeFile(join(directory,`frame-${frame}.png`),result.png);
    }
    const encoder=await VideoEncoder.create(join(directory,'demo.mp4'),{num:12,den:1},build.manifest.composition.width,build.manifest.composition.height);
    try{for(let frame=0;frame<12;frame++)await encoder.write((await renderer.renderFrame(frame)).png);await encoder.finish();}catch(error){await encoder.abort();throw error;}
  }finally{await renderer.close();}
  console.log(JSON.stringify({passed:true,directory,defaultDenied:true,frames:[0,6,11,3,6],video:await probeVideo(join(directory,'demo.mp4'))}));
}else throw Error(`Unknown host command ${command}`);
