// Run from an outside npm consumer: node verify-installed-native-effects.mjs.
// Only public SDK/CLI and the carried R1 catalog are used.
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rename,appendFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';

const exec=promisify(execFile),base=dirname(fileURLToPath(import.meta.url));
const resume=process.env.FRAMEWEAVE_NATIVE_EFFECTS_RESUME;
const proof=resume?resolve(resume):await mkdtemp(join(base,'native-effects-installed-'));
const previous=resume?JSON.parse(await readFile(join(proof,'result.json'),'utf8')):undefined;
const priorFile=resume?'result-before-resume-'+Date.now()+'.json':undefined;
if(resume)await writeFile(join(proof,priorFile),JSON.stringify(previous,null,2));
const sdk=await import('@frameweave/engine/node');
const root=dirname(dirname(fileURLToPath(import.meta.resolve('@frameweave/engine/cli'))));
const executable=join(root,'native-bin',process.platform+'-'+process.arch,'frameweave-native-gpu'+(process.platform==='win32'?'.exe':''));
const cli=join(root,'bin/frameweave.mjs'),browser=process.env.FRAMEWEAVE_TEST_BROWSER;
const project=join(proof,'project'),entry=join(project,'project.tsx');await mkdir(project,{recursive:true});
process.env.FRAMEWEAVE_HOME=join(proof,'home');
const rows=[],report={source:process.env.FRAMEWEAVE_TEST_COMMIT,proof,resumed:!!resume,allPassed:false,rows};
const run=(args)=>exec(process.execPath,[cli,...args],{windowsHide:true,maxBuffer:4*1024**2});
async function check(name,fn){const old=previous?.rows.find(r=>r.name===name&&r.pass);if(old){rows.push({...old,reusedFrom:{file:priorFile,source:previous.source},ms:0});return;}const start=performance.now();try{rows.push({name,pass:true,result:await fn(),ms:performance.now()-start});}catch(e){rows.push({name,pass:false,error:e.stack??String(e),code:e.code,ms:performance.now()-start});if(name.startsWith('verified npm'))throw e;}finally{await writeFile(join(proof,'result.json'),JSON.stringify(report,null,2)+'\n');}}
const source=`import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
import type {GpuPixelImage} from '@frameweave/engine/native';
import {processImage,imageStats} from 'native-image-effects';
export const source=defineNativeStage<Record<string,GpuPixelImage>,{format:'rgba16float'|'rgba32float';all?:boolean}>(async init=>{
 const kernel=await init.gpu.compile({abiVersion:1,id:'consumer/native-image-source',version:'1.0.0',inputCount:0,parameterWords:1,
 code:'fn pixel(p:vec2u)->vec4f{let coverage=array<f32,4>(0.,.125,.5,1.);let a=coverage[p.x%4u];if(a==0.){return vec4f(.25,-.5,2.,0.);}return vec4f(vec3f(-.25+f32(p.x%4u)*.125+paramF32(0u),2.,.5)*a,a);}'});
 return {async renderAt(context,_inputs,props){const input=await init.gpu.run(kernel,[],{parameters:Float32Array.of(context.frame/8),output:{width:init.width,height:init.height,format:props.format,alpha:'premultiplied',color:linear709}});
 return processImage(input,async(image,fx)=>{
  if(props.all){if(Object.keys(fx).length!==20)throw Error('incomplete Native effects');for(const [name,method]of Object.entries(fx))image=await (name==='reliefLighting'?fx.reliefLighting(image,image):['darken','lighten','difference','exclusion','overlay','hardLight','linearBurn','subtractBlend','linearLight','pinLight'].includes(name)?(method as any)(input,image):(method as any)(image));return image;}
  return fx.brightnessContrast(image,{brightness:.125,contrast:1});
 },{context});}};
});
export const finish=defineNativeStage(init=>({async renderAt(context,inputs){const output=await processImage(inputs.image,(image,fx)=>fx.vignette(image,{amount:0}),{context});if(imageStats().completion!=='recorded-only')throw Error('false completion contract');return output;}}));
export default <Composition width={64} height={36} fps={24} durationInFrames={12} background="transparent"><Stage id="a" factory={source} props={{format:'rgba32float'}}/><Stage id="b" factory={finish} inputs={{image:ref('a')}} inputTypes={{image:'surface'}}/><Layer source={ref('b')}/></Composition>;`;
await writeFile(entry,source);
let build;
function variant(format,all=false){return {...build,manifest:{...build.manifest,stages:build.manifest.stages.map(s=>s.id==='a'?{...s,props:{...s.props,format,all}}:s)}};}
async function submit(b,frames){const renderer=await sdk.Renderer.create(b,{browser,nativeGpu:{executable,slots:1}});try{for(const frame of frames){const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;}const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.capabilities.backend,'native-wgpu');return stats;}finally{await renderer.close();await renderer.close();}}
async function exr(b,file,frame=0){const renderer=await sdk.Renderer.create(b,{browser,nativeGpu:{executable,slots:1,export:{executable:sdk.ffmpegPath(),output:file,fps:[24,1],codec:'exr',format:'gbrapf32le'}}});try{await renderer.prepareNativeFrame(frame);const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;}finally{await renderer.close();}return (await exec(sdk.ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2})).stdout;}
const hash=x=>createHash('sha256').update(x).digest('hex');
try{
 await check('verified npm distribution and explicit R1 trust',async()=>{
  const doctor=JSON.parse((await run(['doctor','--json'])).stdout);assert.equal((doctor.data??doctor).distribution.verified,true);
  let oldBundle;if(resume){const state=await sdk.installedPackages(project);oldBundle=await readFile(join(state.records[0].directory,'bindings.js'));}
  if(!resume)await assert.rejects(run(['packages','install','native-image-effects@0.1.1','--project',project]),e=>/E_PACKAGE_TRUST/.test(e.stderr??''));
  await run(['packages','install','native-image-effects@0.1.1','--project',project,'--trust','local:frameweave.gpu-images']);
  const state=await sdk.installedPackages(project);assert.equal(state.lock.roots['native-image-effects'],'native-image-effects@0.1.1');
  const bytes=await readFile(join(state.records[0].directory,'bindings.js'));if(oldBundle)assert.deepEqual(bytes,oldBundle,'reused GPU evidence requires an identical executable bundle');
  return {version:state.records[0].manifest.version,integrity:state.records[0].integrity,trustInstallReused:!!resume,unchangedBundleFromPrevious:!!oldBundle,bundleSha256:hash(bytes)};
 });
 await check('two factories share real managed imports, random frames, twenty resident operations and cancel',async()=>{
  const example=join(project,'example.tsx');await writeFile(example,await readFile(join(root,'examples/native-image-effects/project.tsx'),'utf8'));await sdk.buildProject(example);
  build=await sdk.buildProject(entry);assert.deepEqual(build.manifest.stages.map(s=>s.engine),['native-gpu','native-gpu']);
  const normal=await submit(variant('rgba32float'),[5,0,5]),all=await submit(variant('rgba16float',true),[1,0,1]);
  const renderer=await sdk.Renderer.create(build,{browser,nativeGpu:{executable}});try{await assert.rejects(renderer.submitNativeFrame(0,{signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});assert.equal((await renderer.nativeStats()).submitted,0);}finally{await renderer.close();}
  return {normal,all};
 });
 await check('actual F16/F32 EXR full component roundtrip with signed HDR and transparent emission',async()=>{
  const results=[];for(const format of ['rgba16float','rgba32float']){
   const raw=await exr(variant(format),join(proof,format+'.exr'));const n=64*36;assert.equal(raw.length,n*16);
   let mismatches=0,first;for(let y=0;y<36;y++)for(let x=0;x<64;x++){
    const a=[0,.125,.5,1][x%4],expected=a===0?[-.5,2,.25,0]:[(2+.125)*a,(.5+.125)*a,(-.25+(x%4)*.125+.125)*a,a];
    for(let plane=0;plane<4;plane++){const actual=raw.readFloatLE((plane*n+y*64+x)*4);if(actual!==expected[plane]){mismatches++;first??={x,y,plane,actual,expected:expected[plane]};}}
   }assert.equal(mismatches,0,JSON.stringify(first));
   const repeat=await exr(variant(format),join(proof,format+'-repeat.exr'));assert.deepEqual(raw,repeat);results.push({format,components:n*4,mismatches,sha256:hash(raw)});
  }return results;
 });
 await check('official CLI PNG and MP4 genuinely decode',async()=>{
  const common=browser?['--browser',browser]:[],png=join(proof,'frame.png'),video=join(proof,'clip.mp4');
  if(!resume)await run(['frame',entry,'--frame','3','--output',png,...common]);
  await run(['render',entry,'--from','0','--to',String(4/24),'--width','320','--height','180','--output',video,...common]);
  const image=await exec(sdk.ffmpegPath(),['-v','error','-i',png,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,encoding:'buffer'});
  const decoded=await exec(sdk.ffmpegPath(),['-v','error','-i',video,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,encoding:'buffer'});
  assert.equal(image.stdout.length,64*36*4);assert.equal(decoded.stdout.length,320*180*4*4);return {png,pngReusedFromPriorCli:!!resume,video,videoSize:[320,180],decodedFrames:4,sha256:hash(decoded.stdout)};
 });
 await check('Capsule and Flat run with original project and store inaccessible',async()=>{
  const entries=[];for(const layout of ['capsule','flat'])entries.push({layout,entry:(await sdk.exportProject(entry,{output:join(proof,layout+'.tsx'),singleFile:true,layout})).entry});
  const expected=resume?(await exec(sdk.ffmpegPath(),['-v','error','-i',join(proof,'rgba32float.exr'),'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2})).stdout:await exr(build,join(proof,'portable-original.exr'));
  const hidden=project+'.unavailable';await rename(project,hidden);
  const oldHome=process.env.FRAMEWEAVE_HOME;process.env.FRAMEWEAVE_HOME=join(proof,'empty-home');
  try{for(const item of entries){const b=await sdk.buildProject(item.entry),raw=await exr(b,join(proof,item.layout+'.exr'));assert.deepEqual(raw,expected);item.sha256=hash(raw);}}finally{await rename(hidden,project);process.env.FRAMEWEAVE_HOME=oldHome;}
  return entries;
 });
 await check('native grant and package lock/integrity failures stay enforced',async()=>{
  const state=await sdk.installedPackages(project),record=state.records[0],manifest=join(record.directory,'frameweave.package.json');
  const original=await readFile(manifest,'utf8');const metadata=JSON.parse(original);metadata.permissions.network=true;await writeFile(manifest,JSON.stringify(metadata));
  try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_PERMISSION'});}finally{await writeFile(manifest,original);}
  const file=join(record.directory,'bindings.js'),text=await readFile(file,'utf8');await appendFile(file,'\n// tampered frozen module');
  try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_INTEGRITY'});}finally{await writeFile(file,text);}
  const {readdir}=await import('node:fs/promises');const lock=(await readdir(project)).find(name=>name.includes('packages')&&name.includes('lock'));
  assert.ok(lock,'formal package lock exists');const path=join(project,lock),old=await readFile(path,'utf8'),wrong=JSON.parse(old);wrong.roots['native-image-effects']='native-image-effects@99.0.0';await writeFile(path,JSON.stringify(wrong));
  try{await assert.rejects(sdk.buildProject(entry),{code:'E_PACKAGE_LOCK'});}finally{await writeFile(path,old);}
  return {permission:'E_PACKAGE_PERMISSION',tamper:'E_PACKAGE_INTEGRITY',lock:'E_PACKAGE_LOCK'};
 });
 report.allPassed=rows.every(row=>row.pass);if(!report.allPassed)process.exitCode=1;
}finally{await writeFile(join(proof,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({proof,allPassed:report.allPassed,groups:rows.length}));}
