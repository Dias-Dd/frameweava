import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildProject,Renderer,installedPackages} from '../src/node.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {exportProject} from '../src/compiler/export.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {inspectExr,readExr,writePathAovExr,pathAovChannels} from '../modules/native-effects/authoring/node.ts';
import {prepareNativeCharacterAsset} from '../modules/spatial-creation/node.ts';
import {searchFunctionPage} from '../src/capabilities/functions.ts';

const started=performance.now(),base=resolve('.frameweave/library-domains');await mkdir(base,{recursive:true});
const run=await mkdtemp(join(base,'run-')),project=join(run,'project'),entry=join(project,'project.tsx');await mkdir(project);
process.env.FRAMEWEAVE_HOME=join(run,'home');process.env.FRAMEWEAVE_PROGRAM_LIBRARY=join(run,'program-library');
// Same editable example, consumed through the installed suite instead of SDK facades.
await writeFile(entry,(await readFile('examples/library-domains/project.tsx','utf8'))
  .replaceAll("from '@frameweave/engine/spatial-creation'","from 'pro-animation'")
  .replaceAll("from '@frameweave/engine/image-effects'","from 'pro-animation'"));
const exec=promisify(execFile),catalog=resolve(process.argv[2]);
const result=await exec(process.execPath,['--import','tsx','src/cli.ts','packages','install','pro-animation@1.1.0','--catalog',catalog,'--project',entry,...['frameweave.pro','frameweave.gpu-images','frameweave.native-2d','frameweave.spatial'].flatMap(s=>['--trust','local:'+s]),'--json'],{windowsHide:true,timeout:60000,maxBuffer:4*1024**2});
JSON.parse(result.stdout); // R1 install returns its lock, not a render envelope.
const state=await installedPackages(project);assert.equal(state.lock!.roots['pro-animation'],'pro-animation@1.1.0');
for(const name of ['createNativeScene','createNativePathTracer','attachNativeCharacter','createRefractiveScene'])assert.equal(state.records.find(r=>r.manifest.id==='pro-animation')!.manifest.bindings!.forward![name].dependency,'spatial-creation');
assert.equal(state.records.find(r=>r.manifest.id==='pro-animation')!.manifest.bindings!.forward!.exrResource.dependency,'native-image-effects');
const queries=['路径追踪','水滴','多层 EXR'];
for(const query of queries){const page=await searchFunctionPage({query,mode:'keyword',limit:20},{installed:state.records,catalog:[]});assert.ok(page.functions.some(f=>query==='路径追踪'?f.name==='createNativePathTracer':query==='水滴'?f.name==='createRefractiveScene':f.name==='exrResource'),query);}
const build=await buildProject(entry),executable=await nativeExecutable();
const options={allowWasm:true,nativeGpu:{executable,rayQuery:true,slots:1,readback:'final-surface' as const,maxBytes:1024**3}};
let aov:any,adapter:unknown;
const renderer=await Renderer.create(build,options);
try{
  const grab=async(frame:number)=>renderer.captureNativeFrame(frame,['frameweave.final-surface','trace/path-transport','trace/path-guide','trace/path-cryptomatte']);
  const first=await grab(1);await grab(0);const repeated=await grab(1);
  assert.deepEqual(first.buffers['frameweave.final-surface'].values,repeated.buffers['frameweave.final-surface'].values);
  assert.ok((first.buffers['frameweave.final-surface'].values as Float32Array).some(v=>v>1));
  adapter=(await renderer.nativeStats()).adapter;
  aov={width:64,height:36,transport:first.buffers['trace/path-transport'].values,guide:first.buffers['trace/path-guide'].values,cryptomatte:first.buffers['trace/path-cryptomatte']};
  assert.ok(pathAovChannels(aov).channels['Beauty.R']);
  await writePathAovExr(join(run,'lighting.exr'),aov);const info=await inspectExr(join(run,'lighting.exr'));
  assert.ok(info.parts.some(p=>p.channels.some(c=>c.name==='Beauty.R')));
  const decoded=await readExr(join(run,'lighting.exr'),{color:{primaries:'rec709',whitePoint:'D65',transfer:'linear',reference:'scene',range:'full',referenceWhiteNits:100},alpha:'opaque',selection:{part:0,channels:{r:'Beauty.R',g:'Beauty.G',b:'Beauty.B',a:1},window:'data'}});
  assert.equal(pixelsFromSurface(decoded.surface).length,64*36*4);
  const controller=new AbortController();controller.abort();await assert.rejects(renderer.captureNativeFrame(0,['frameweave.final-surface'],{signal:controller.signal}),{code:'E_RENDER_CANCELLED'});
}finally{await renderer.close();await renderer.close();}
const carried=join(run,'carried');await exportProject(entry,{output:carried});
const hidden=project+'-hidden';await rename(project,hidden);
try{const receiving=await Renderer.create(await buildProject(join(carried,'project.tsx')),options);try{assert.ok(pixelsFromSurface(await receiving.renderNativeSurface(0)).every(Number.isFinite));}finally{await receiving.close();}}finally{await rename(hidden,project);}
// Node preparation facade is usable without entering an authored Stage.
const character=JSON.parse(await readFile('modules/spatial-creation/examples/character-asset/model.character.json','utf8'));
for(const image of character.images)image.bytes=Array.from(await readFile(`modules/spatial-creation/examples/character-asset/${image.id}.png`));
const prepared=await prepareNativeCharacterAsset(character,join(run,'prepared-character'));assert.equal(prepared.version,1);
const evidence={ok:true,run,catalog,adapter,groups:['R1 install / exact forwards','search / descriptions','four real shared scene factories + EXR source binding','HDR / random-repeat','AOV EXR write-inspect-decode','cancel / double close','carried project with original project hidden','Node character preparation'],elapsedMs:performance.now()-started};
await writeFile(join(run,'result.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
