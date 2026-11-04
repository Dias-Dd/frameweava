// Focused source/installed acceptance; no old-suite or long-video reruns.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile,rename} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const installed=process.env.FRAMEWEAVE_INSTALLED==='1';
const root=installed?dirname(dirname(fileURLToPath(import.meta.resolve('@frameweave/engine/cli')))):resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sdk=await import(installed?'@frameweave/engine/node':pathToFileURL(join(root,'src/node.ts')).href),exec=promisify(execFile),require=createRequire(join(root,'package.json'));
const parent=installed?join(dirname(fileURLToPath(import.meta.url)),'mesh-proof'):join(root,'artifacts/main-mesh-deformation');await mkdir(parent,{recursive:true});
const proof=await mkdtemp(join(parent,'run-')),project=join(proof,'project'),clean=join(proof,'clean');await cp(join(root,'modules/mesh-deformation/examples'),project,{recursive:true});await mkdir(clean);
process.env.FRAMEWEAVE_HOME=join(proof,'home');
const entry=join(project,'project.tsx');await writeFile(entry,(await readFile(entry,'utf8')).replace('width={640} height={360}','width={160} height={90}').replace('durationInFrames={24}','durationInFrames={3}'));
const media={workingColor:sdk.linear709,transport:'buffer-v1',preview:{color:sdk.srgb,clip:true}},rows=[],report={sourceCommit:process.env.FRAMEWEAVE_TEST_COMMIT,installed,proof,rows,allPassed:false};
let expected;
async function check(name,fn){const start=performance.now();try{rows.push({name,pass:true,data:await fn(),ms:performance.now()-start});}catch(e){rows.push({name,pass:false,ms:performance.now()-start,code:e.code,error:e.stack??String(e)});throw e;}finally{await writeFile(join(proof,'result.json'),JSON.stringify(report,null,2));}}
function compare(a,b){assert.equal(a.length,b.length);let rgb=0,alpha=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(i%4===3){alpha=Math.max(alpha,d);assert.ok(d<=2e-7);}else{rgb=Math.max(rgb,d);assert.ok(d<=3e-6*Math.max(1,Math.abs(b[i])));}}return {rgb,alpha};}
async function image(file){const build=await sdk.buildProject(file),r=await sdk.Renderer.create(build,{media,cache:false});try{assert.equal(r.status().gpu.required,true);return await r.renderMediaFrame(0);}finally{await r.close();}}
try{
 await check('formal immutable package, source trust and named types',async()=>{
  let catalog=process.env.FRAMEWEAVE_MESH_CATALOG;
  if(installed)catalog=join(root,'catalog');else if(!catalog){
   const {buildMeshDeformation}=await import(pathToFileURL(join(root,'modules/mesh-deformation/scripts/build-package.ts')).href),{buildSkeletalEffects}=await import(pathToFileURL(join(root,'modules/skeletal-effects/scripts/build-package.ts')).href),{buildGraphicsPackage}=await import(pathToFileURL(join(root,'modules/graphics-contracts/scripts/build-package.ts')).href);
   catalog=join(proof,'catalog');await mkdir(catalog);
   for(const [name,builder,folder]of [['mesh-deformation',buildMeshDeformation,'mesh-deformation'],['skeletal-effects',buildSkeletalEffects,'skeletal-effects'],['graphics-contracts',buildGraphicsPackage,'graphics-distribution-tests']]){const base=join(root,'.frameweave',folder);await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'main-'));await builder(join(dir,'package'));await cp(join(dir,'package'),join(catalog,name),{recursive:true});}
  }
  const dirs=['mesh-deformation','skeletal-effects','graphics-contracts'].map(n=>join(catalog,n));
  await assert.rejects(sdk.installPackages(project,[dirs[0]]),{code:'E_PACKAGE_TRUST'});
  await sdk.installPackages(project,dirs,{add:['mesh-deformation@0.1.4','skeletal-effects@0.6.3'],trust:['local:frameweave.mesh','local:frameweave.skeletal','local:frameweave.foundation']});
  assert.equal((await sdk.verifyPackages(project)).valid,true);await sdk.writeLock(project);
  const p=await sdk.readPackage(join(catalog,'mesh-deformation'));assert.equal(p.integrity,'ed5bd723efcef4d69ab63e1869e66d72f755035f5de5ee42c9a0e20b7edb8855');
  if(installed){const bin=join(root,'bin/frameweave.mjs');await exec(process.execPath,[bin,'packages','types','--project',entry],{windowsHide:true});await writeFile(join(project,'tsconfig.json'),JSON.stringify({extends:'./.frameweave/managed.tsconfig.json',compilerOptions:{strict:true,noEmit:true,skipLibCheck:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',jsx:'react-jsx',jsxImportSource:'@frameweave/engine',allowImportingTsExtensions:true},files:['project.tsx','scene.ts','geometry.ts']}));await exec(process.execPath,[require.resolve('typescript/bin/tsc'),'--project',join(project,'tsconfig.json')],{windowsHide:true});}
  return {integrity:p.integrity,gpu:p.manifest.bindings.gpu};
 });
 if(!installed)await check('21 independent numeric GPU references, immutable inputs and invalid publication',async()=>{
  const {fixtures}=await import(pathToFileURL(join(root,'tests/helpers/mesh-deformation-oracle.ts')).href),file=join(project,'numeric.tsx');await writeFile(file,"import {Composition,Stage} from '@frameweave/engine';export default <Composition width={32} height={18} fps={24} durationInFrames={24} seed={91}><Stage id=\"mesh\" entry=\"./verify-stage.ts\" outputs={{surface:'surface',metrics:'json'}}/></Composition>;");
  const b=await sdk.buildProject(file),r=await sdk.Renderer.create(b,{media,cache:false}),stage=b.manifest.stages[0],samples=[];try{
   assert.equal(r.status().gpu.required,true);
   for(const [i,f]of fixtures().entries()){stage.props={fixture:f};const m=(await r.evaluateFrame(0,'mesh')).stageOutputs.mesh.metrics,actual=m.positions.flat(),maxAbs=Math.max(...actual.map((x,j)=>Math.abs(x-f.expected[j])));assert.ok(maxAbs<=f.tolerance,f.name+': '+maxAbs);assert.deepEqual(m.original,m.inputAfter);assert.equal(m.scope.activeDataBuffers,0);assert.equal(m.compute.backendInfo.isFallbackAdapter,false);samples.push({index:i,name:f.name,maxAbs,tolerance:f.tolerance});}
   const invalid=[];for(const kind of ['nan','range','normal']){stage.props={fixture:fixtures().find(f=>f.name==='noiseDisplacePositions'),invalid:kind};await assert.rejects(r.evaluateFrame(0,'mesh'),e=>{invalid.push({kind,code:e.code,message:e.message});return /Invalid coordinate|Nonfinite field input|E_MESH_DEFORM_DATA/.test(String(e));});}
   stage.props={release:true};const m=(await r.evaluateFrame(0,'mesh')).stageOutputs.mesh.metrics;assert.equal(m.scope.activeDataBuffers,0);assert.equal(m.scope.liveBytes,0);return {samples,invalid,release:m};
  }finally{await r.close();}
 });
 await check('all 15 maps through Final R1, random frames, preview cache, F16 and disposal',async()=>{
  const session=await sdk.openRenderSession(entry,{media,cache:true}),samples=[];try{let first;
   for(const n of [2,0,2]){const v=await session.mediaFrame(n),m=v.stageOutputs.mesh.metrics,p=sdk.pixelsFromSurface(v.surface);assert.equal(m.functions.length,15);assert.equal(m.compute.backendInfo.isFallbackAdapter,false);assert.ok(!/swiftshader|software|llvmpipe/i.test(m.render.backend.renderer));assert.equal(v.surface.format,'rgba32float');assert.equal(m.scope.activeDataBuffers,3);let difference;if(n===2){if(first)difference=compare(p,first);else first=p.slice();}if(n===0){expected=p.slice();await writeFile(join(proof,'gallery.png'),(await session.renderFrame(0)).png);}samples.push({frame:n,cacheHits:v.cacheHits,difference,compute:m.compute,render:m.render});}
  }finally{await session.close();}
  const preview=await sdk.openRenderSession(entry,{mode:'preview',cache:true,media});try{const a=await preview.mediaFrame(0),b=await preview.mediaFrame(0);samples.push({preview:compare(sdk.pixelsFromSurface(a.surface),expected),cache:compare(sdk.pixelsFromSurface(b.surface),sdk.pixelsFromSurface(a.surface)),cacheHits:b.cacheHits});assert.ok(b.cacheHits>0);}finally{await preview.close();}
  const b=await sdk.buildProject(entry),r=await sdk.Renderer.create(b,{media,cache:false});try{b.manifest.stages[0].props={half:true};const h=(await r.evaluateFrame(0,'mesh')).stageOutputs.mesh.surface;assert.equal(h.format,'rgba16float');assert.ok(sdk.pixelsFromSurface(h).every(Number.isFinite));b.manifest.stages[0].props={release:true};const m=(await r.evaluateFrame(0,'mesh')).stageOutputs.mesh.metrics;assert.equal(m.scope.activeDataBuffers,0);assert.equal(m.scope.liveBytes,0);assert.equal(m.render.geometries,0);assert.equal(m.render.fencesCreated,m.render.fencesDestroyed);samples.push({released:m,physicalPeak:'unknown'});}finally{await r.close();}return samples;
 });
 if(installed){
  await check('capsule executes without original Store, Flat reports actual support',async()=>{
   const capsule=await sdk.exportProject(entry,{singleFile:true,layout:'capsule',output:join(clean,'gallery.tsx')});let flat,refusal;try{flat=await sdk.exportProject(entry,{singleFile:true,output:join(clean,'flat.tsx')});}catch(e){assert.ok(['E_FLAT_PACKAGE_EVALUATION','E_FLAT_PACKAGE_SOURCE'].includes(e.code));refusal={code:e.code,message:e.message};}
   await rename(project,project+'-offline');try{const a=compare(sdk.pixelsFromSurface((await image(capsule.entry)).surface),expected);const f=flat?compare(sdk.pixelsFromSurface((await image(flat.entry)).surface),expected):refusal;return {capsule:a,flat:f};}finally{await rename(project+'-offline',project);}
  });
  await check('tampered source and incorrect lock rejected',async()=>{
   const p=(await sdk.installedPackages(project)).records.find(p=>p.manifest.id==='mesh-deformation'),f=join(p.directory,'kernels.ts'),raw=await readFile(f);await writeFile(f,Buffer.concat([raw,Buffer.from('// tamper')]));try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_INTEGRITY'});}finally{await writeFile(f,raw);}const file=join(project,'frameweave.packages.lock.json'),bytes=await readFile(file),lock=JSON.parse(bytes);lock.requirements['mesh-deformation']='9.0.0';await writeFile(file,JSON.stringify(lock));try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_LOCK'});}finally{await writeFile(file,bytes);}return {source:true,lock:true};
  });
  await check('installed CLI video, actual probe and complete decode below one second',async()=>{
   const file=join(proof,'gallery.mp4'),settings=join(proof,'settings.json');await writeFile(settings,JSON.stringify({schemaVersion:1,media}));await exec(process.execPath,[join(root,'bin/frameweave.mjs'),'create',entry,'--settings',settings,'--output',file,'--format','mp4','--json'],{windowsHide:true,timeout:60000,maxBuffer:4e6});const probe=await sdk.probeVideo(file);assert.equal(probe.frames,3);assert.ok(probe.duration<=1);assert.equal(probe.decodable,true);const decoded=(await exec(sdk.ffmpegPath(),['-v','error','-i',file,'-f','framemd5','pipe:1'],{windowsHide:true})).stdout;assert.equal(decoded.split(/\r?\n/).filter(x=>/^0,/.test(x)).length,3);await writeFile(join(proof,'decoded.framemd5'),decoded);await writeFile(join(proof,'ffprobe.json'),JSON.stringify(probe,null,2));return {frames:3,probe};
  });
 }
 report.allPassed=true;
}finally{await writeFile(join(proof,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({proof,installed,allPassed:report.allPassed,checks:rows.length}));}
