// SPDX-License-Identifier: Apache-2.0
import {join,dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readFile,mkdir,mkdtemp,copyFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const root=dirname(fileURLToPath(import.meta.url)),[command,engine,...args]=process.argv.slice(2);
const fromEngine=path=>import(pathToFileURL(join(engine,path)).href),require=createRequire(join(engine,'package.json'));
const {validateManifest}=await fromEngine('src/plugins/schema.ts'),{validatePackage,readPackage}=await fromEngine('src/packages/manifest.ts');
if(command==='validate'){
  const effect=JSON.parse(await readFile(join(root,'effect.json'),'utf8'));validateManifest(effect);validatePackage(JSON.parse(await readFile(join(root,'frameweave.package.json'),'utf8')));
  if(effect.parameterSchemaVersion!==2)throw Error('P4 recursive parameters v2 are required');console.log(JSON.stringify({valid:true}));
}else if(command==='types'){
  const directory=args[0]??root,{typecheckProject}=await fromEngine('src/compiler/typecheck.ts');
  await typecheckProject(['index.ts','generated/api.ts','generated/p4.ts','runtime/client.ts','runtime/worker.ts'].map(file=>({file:join(directory,file)})));
  if(args[0]){
    const pack=await readPackage(directory);try{
      const graph=await require('esbuild').build({absWorkingDir:directory,entryPoints:Object.values(pack.manifest.modules).filter(m=>m.format==='javascript').map(m=>m.path),bundle:true,platform:'browser',format:'esm',target:'es2022',packages:'external',write:false,outdir:'__kit_graph__',metafile:true,logLevel:'silent'});
      for(const input of Object.keys(graph.metafile.inputs)){const path=relative(directory,resolve(directory,input));if(path==='..'||path.startsWith('../')||path.startsWith('..\\')||isAbsolute(path))throw Error(`Dependency escapes package: ${input}`);}
    }catch(error){throw Object.assign(Error(error.message),{code:'E_BINDGEN_DEPENDENCY'});}
  }
  console.log(JSON.stringify({typecheck:true}));
}else if(command==='inspect'){
  const record=await readPackage(args[0]);console.log(JSON.stringify({directory:record.directory,reference:`${record.manifest.id}@${record.manifest.version}`,integrity:`sha256-${record.integrity}`,modules:record.moduleIntegrity}));
}else if(command==='browser'){
  const {pack}=await import('./module.mjs');await mkdir(join(root,'.frameweave/kit'),{recursive:true});const directory=await mkdtemp(join(root,'.frameweave/kit/smoke-'));
  const packed=await pack(join(directory,'package')),project=join(directory,'project');await mkdir(project);await copyFile(join(root,'demo/project.tsx'),join(project,'project.tsx'));
  const {installPackages}=await fromEngine('src/packages/manager.ts'),{writeLock}=await fromEngine('src/plugins/registry.ts');
  await installPackages(project,[packed.directory],{trust:[`local:${(await readPackage(packed.directory)).manifest.source.authority}`]});await writeLock(project);
  const {buildProject}=await fromEngine('src/compiler/build.ts'),{Renderer,VideoEncoder,probeVideo}=await fromEngine('src/node.ts');const built=await buildProject(join(project,'project.tsx'));
  const denied=await Renderer.create(built);let rejected=false;try{await denied.renderFrame(0);}catch(error){rejected=/WASM|WebAssembly/.test(error.message);}finally{await denied.close();}if(!rejected)throw Error('Default CSP must reject WASM');
  const renderer=await Renderer.create(built,{allowWasm:true,cache:false}),frames=new Map();
  try{for(const frame of [0,6,11,3,6]){const result=await renderer.renderFrame(frame);if(result.diagnostics.length)throw Error(JSON.stringify(result.diagnostics));if(frames.has(frame)&&!frames.get(frame).equals(result.png))throw Error('Random-access pixels changed');frames.set(frame,result.png);await writeFile(join(directory,`frame-${frame}.png`),result.png);}
    const encoder=await VideoEncoder.create(join(directory,'demo.mp4'),{num:12,den:1},128,96);try{for(let frame=0;frame<12;frame++)await encoder.write((await renderer.renderFrame(frame)).png);await encoder.finish();}catch(error){await encoder.abort();throw error;}
  }finally{await renderer.close();}
  console.log(JSON.stringify({passed:true,directory,defaultDenied:true,video:await probeVideo(join(directory,'demo.mp4'))}));
}else throw Error(`Unknown host command ${command}`);
