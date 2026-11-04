// Copy into an outside npm consumer after installing the built engine tarball.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rename,appendFile,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const sourceMode=process.argv.includes('--source'),quick=process.argv.includes('--quick');
const base=dirname(fileURLToPath(import.meta.url)),root=sourceMode?resolve(base,'..'):dirname(dirname(fileURLToPath(import.meta.resolve('@frameweave/engine/cli'))));
const sdk=await import(sourceMode?pathToFileURL(join(root,'src/node.ts')).href:'@frameweave/engine/node'),exec=promisify(execFile);
const cli=sourceMode?['--import','tsx',join(root,'src/cli.ts')]:[join(root,'bin/frameweave.mjs')];
const proofBase=sourceMode?join(root,'.frameweave/main-native-images-check'):base;await mkdir(proofBase,{recursive:true});
const proof=await mkdtemp(join(proofBase,'native-images-v2-')),project=join(proof,'project'),entry=join(project,'project.tsx');await mkdir(project);
const executable=sourceMode?await (await import(pathToFileURL(join(root,'modules/native-gpu/executable.ts')).href)).nativeExecutable():join(root,'native-bin',process.platform+'-'+process.arch,'frameweave-native-gpu'+(process.platform==='win32'?'.exe':'')),browser=process.env.FRAMEWEAVE_TEST_BROWSER;
process.env.FRAMEWEAVE_HOME=join(proof,'home');const rows=[],report={source:process.env.FRAMEWEAVE_TEST_COMMIT,sourceMode,quick,proof,allPassed:false,rows,excludedChecks:quick?['Flat/Capsule','MP4','full numerical matrix','npm build/install']:[]};
const hash=x=>createHash('sha256').update(x).digest('hex');
const run=args=>exec(process.execPath,[...cli,...args],{windowsHide:true,maxBuffer:4*1024**2});
async function check(name,fn){if(quick&&name.startsWith('typed Flat')){rows.push({name,skipped:true,reason:'full profile only'});return;}const start=performance.now();try{rows.push({name,pass:true,result:await fn(),ms:performance.now()-start});}catch(e){rows.push({name,pass:false,error:e.stack??String(e),code:e.code,ms:performance.now()-start});throw e;}finally{await writeFile(join(proof,'result.json'),JSON.stringify(report,null,2)+'\n');}}
const source=`import {Composition,Stage,Layer,ref,linear709,surfaceFromPixels} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {GpuPixelImage} from '@frameweave/engine/native';
import {processImage,imageStats,processRaster,rasterStats,processBuiltin,builtinStats,generateImage} from 'native-image-effects';
export const source=defineNativeStage<Record<string,GpuPixelImage>,{format:'rgba16float'|'rgba32float'}>(async init=>{
 const kernel=await init.gpu.compile({abiVersion:1,id:'consumer/image-v2',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{let coverage=array<f32,4>(0.,.125,.5,1.);let a=coverage[p.x%4u];if(a==0.){return vec4f(.25,-.5,2.,0.);}return vec4f(vec3f(-.25+f32(p.x%4u)*.125+paramF32(0u),2.,.5)*a,a);}'});
 return {async renderAt(context,_inputs,props){await generateImage(fx=>fx.importImage(surfaceFromPixels(1,1,[-.25,2,.5,.5],{format:'rgba32float',alpha:'premultiplied',color:linear709})),{context});const input=await init.gpu.run(kernel,[],{parameters:Float32Array.of(context.frame/8),output:{width:init.width,height:init.height,format:props.format,alpha:'premultiplied',color:linear709}});
 return processImage(input,async(image,fx)=>{if(Object.keys(fx).length!==82||!('autoLevels'in fx)||!('importImage'in fx))throw Error('wrong resident API');const mixed=await fx.channelMix(image,{matrix:[[1,0,0],[0,1,0],[0,0,1]]});await fx.autoLevels(mixed);return fx.brightnessContrast(mixed,{brightness:.125,contrast:1});},{context});}};});
export const finish=defineNativeStage(init=>({async renderAt(context,inputs){const result=await processRaster(inputs.image,async(image,fx)=>{if(Object.keys(fx).length!==23)throw Error('wrong raster API');return fx.offsetRGB(await fx.exposure(image,{stops:0}),{offset:[0,0,0]});},{context});await processBuiltin(result,async(image,fx)=>{if(Object.keys(fx).length!==7)throw Error('wrong builtin API');return fx.brightness(image,{amount:1});},{context});if(builtinStats().completion!=='recorded-only')throw Error('not a GPU fence');if(imageStats().completion!=='recorded-only'||rasterStats().completion!=='recorded-only')throw Error('not a GPU fence');return result;}}));
export default <Composition width={64} height={36} fps={24} durationInFrames={12} background="transparent"><Stage id="a" factory={source} props={{format:'rgba32float'}}/><Stage id="b" factory={finish} inputs={{image:ref('a')}} inputTypes={{image:'surface'}}/><Layer source={ref('b')}/></Composition>;`;
await writeFile(entry,source);let build;
const variant=async format=>{const file=join(project,'variant-'+format+'.tsx');await writeFile(file,source.replace("props={{format:'rgba32float'}}","props={{format:'"+format+"'}}"));return sdk.buildProject(file);};
const decode=async(file,pixelFormat='gbrapf32le')=>(await exec(sdk.ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt',pixelFormat,'pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:8*1024**2})).stdout;
async function exr(b,file){const renderer=await sdk.Renderer.create(b,{browser,nativeGpu:{executable,slots:1,export:{executable:sdk.ffmpegPath(),output:file,fps:[24,1],codec:'exr',format:'gbrapf32le'}}});try{await renderer.prepareNativeFrame(0);const ticket=await renderer.submitNativeFrame(0);await ticket.completed;}finally{await renderer.close();}return decode(file);}
try{
 await check('verified distribution and exact trusted typed package installation',async()=>{
  let catalog='native-image-effects@0.4.0',add=[];
  if(sourceMode){catalog=await (await import(pathToFileURL(join(root,'modules/native-effects/scripts/build-package.ts')).href)).buildNativeImagePackage(join(proof,'package'));add=['--add','native-image-effects@0.4.0'];}
  else{const doctor=JSON.parse((await run(['doctor','--json'])).stdout);assert.equal((doctor.data??doctor).distribution.verified,true);}
  await assert.rejects(run(['packages','install',catalog,...add,'--project',project]),e=>/E_PACKAGE_TRUST/.test(e.stderr??''));
  await run(['packages','install',catalog,...add,'--project',project,'--trust','local:frameweave.gpu-images']);
  const state=await sdk.installedPackages(project),p=state.records[0];assert.equal(state.lock.roots['native-image-effects'],'native-image-effects@0.4.0');assert.ok(p.manifest.modules.bindings.path.endsWith('.ts'));assert.deepEqual(p.manifest.bindings.gpuExports,['processImage','processRaster','processPa','generatePa','generateImage','processBuiltin']);return {version:p.manifest.version,integrity:p.integrity,initializer:p.manifest.modules.bindings.path};
 });
 await check('real dual Factory imports, 81 effects + input tool /23 separate contracts, random frames and abort',async()=>{
  if(!quick){const example=join(project,'example.tsx');await writeFile(example,await readFile(join(root,'examples/native-image-effects/project.tsx'),'utf8'));await sdk.buildProject(example);}
  build=await sdk.buildProject(entry);assert.deepEqual(build.manifest.stages.map(s=>s.engine),['native-gpu','native-gpu']);
  const renderer=await sdk.Renderer.create(build,{browser,nativeGpu:{executable,slots:1}});try{
   for(const frame of [5,0,5]){const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;}
   const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.submitted,3);
   await assert.rejects(renderer.submitNativeFrame(0,{signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});return stats;
  }finally{await renderer.close();await renderer.close();}
 });
 await check('F16/F32 true EXR signed HDR, Alpha and emission exact components',async()=>{
  const out=[];for(const format of ['rgba16float','rgba32float']){
   const raw=await exr(await variant(format),join(proof,format+'.exr')),n=64*36;assert.equal(raw.length,n*16);let mismatches=0,first;
   for(let y=0;y<36;y++)for(let x=0;x<64;x++){const a=[0,.125,.5,1][x%4],expected=a===0?[-.5,2,.25,0]:[(2+.125)*a,(.5+.125)*a,(-.25+(x%4)*.125+.125)*a,a];for(let p=0;p<4;p++){const actual=raw.readFloatLE((p*n+y*64+x)*4);if(actual!==expected[p]){mismatches++;first??={x,y,p,actual,expected:expected[p]};}}}
   assert.equal(mismatches,0,JSON.stringify(first));out.push({format,components:n*4,mismatches,sha256:hash(raw)});
  }return out;
 });
 await check('official CLI PNG and default NVENC MP4 complete decode',async()=>{
  const flags=browser?['--browser',browser]:[],png=join(proof,'frame.png'),video=join(proof,'clip.mp4');
  await run(['frame',entry,'--frame','3','--output',png,...flags]);const p=await decode(png,'rgba');assert.equal(p.length,64*36*4);
  if(quick)return {png,pngSha256:hash(p),videoSkipped:true};
  await run(['render',entry,'--from','0','--to',String(4/24),'--width','320','--height','180','--output',video,...flags]);const v=await decode(video,'rgba');assert.equal(v.length,320*180*4*4);return {png,video,frames:4,videoSha256:hash(v)};
 });
 await check('typed Flat and Capsule execute with original project and Store unavailable',async()=>{
  const entries=[];for(const layout of ['flat','capsule'])entries.push({layout,entry:(await sdk.exportProject(entry,{output:join(proof,layout+'.tsx'),singleFile:true,layout})).entry});
  const expected=await decode(join(proof,'rgba32float.exr')),hidden=project+'.unavailable',home=process.env.FRAMEWEAVE_HOME;await rename(project,hidden);process.env.FRAMEWEAVE_HOME=join(proof,'empty-portable-home');
  try{for(const item of entries){const raw=await exr(await sdk.buildProject(item.entry),join(proof,item.layout+'.exr'));assert.deepEqual(raw,expected);item.sha256=hash(raw);}}finally{await rename(hidden,project);process.env.FRAMEWEAVE_HOME=home;}return entries;
 });
 await check('permissions, module tampering and wrong lock rejected',async()=>{
  const state=await sdk.installedPackages(project),record=state.records[0],manifest=join(record.directory,'frameweave.package.json'),text=await readFile(manifest,'utf8'),m=JSON.parse(text);m.permissions.network=true;await writeFile(manifest,JSON.stringify(m));
  try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_PERMISSION'});}finally{await writeFile(manifest,text);}
  const file=join(record.directory,record.manifest.modules.bindings.path),original=await readFile(file,'utf8');await appendFile(file,'\n// tampered');try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_INTEGRITY'});}finally{await writeFile(file,original);}
  const path=join(project,(await readdir(project)).find(n=>n.includes('packages')&&n.includes('lock'))),old=await readFile(path,'utf8'),wrong=JSON.parse(old);wrong.roots['native-image-effects']='native-image-effects@99.0.0';await writeFile(path,JSON.stringify(wrong));try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_LOCK'});}finally{await writeFile(path,old);}return {permission:'E_PACKAGE_PERMISSION',tamper:'E_PACKAGE_INTEGRITY',lock:'E_PACKAGE_LOCK'};
 });
 report.allPassed=true;
}finally{await writeFile(join(proof,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({proof,allPassed:report.allPassed,groups:rows.length}));}
