import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,cp,rename,rm} from 'node:fs/promises';
import {join,dirname,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {installPackages,restorePackages,verifyPackages} from '../src/packages/manager.ts';
import {writeLock} from '../src/plugins/registry.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';

const parent=join(engineRoot,'.frameweave/p4-r1-proof');await mkdir(parent,{recursive:true});
const run=await mkdtemp(join(parent,'run-')),output=join(engineRoot,'artifacts/p4-r1/verified',basename(run));await mkdir(output,{recursive:true});
const source=join(run,'author'),project=join(run,'project'),replica=join(run,'replica');
await cp(join(engineRoot,'plugins/packages/orbit-grid'),source,{recursive:true});await mkdir(project);await mkdir(replica);
await cp(join(engineRoot,'examples/p4-r1/project.tsx'),join(project,'project.tsx'));
await writeFile(join(project,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:[],userLibrary:false}));
const expected:Buffer[]=[],hashes:string[]=[],seek=[0,24,47,7,24,0],entry=join(project,'project.tsx');
const raw=async(bytes:Buffer)=>sharp(bytes).ensureAlpha().raw().toBuffer();
let report:Record<string,unknown>={ok:false};
try{
  await installPackages(project,[source],{trust:['local:frameweave.examples']});await writeLock(project);
  const verified=await verifyPackages(project),build=await buildProject(entry),renderer=await Renderer.create(build,{cache:false,allowWasm:true});
  try{
    for(const i of seek){const frame=await renderer.renderFrame(i);assert.deepEqual(frame.diagnostics,[]);await writeFile(join(output,`frame-${i}.png`),frame.png);}
    const encoder=await VideoEncoder.create(join(output,'Orbit-Grid.mp4'),{num:24,den:1},640,360);
    try{for(let i=0;i<48;i++){const frame=await renderer.renderFrame(i);assert.deepEqual(frame.diagnostics,[]);expected.push(await raw(frame.png));hashes.push(createHash('sha256').update(expected[i]).digest('hex'));await encoder.write(frame.png);}await encoder.finish();}catch(e){await encoder.abort();throw e;}
    for(const i of seek)assert.deepEqual(await raw((await renderer.renderFrame(i)).png),expected[i]);
  }finally{await renderer.close();}
  const video=await probeVideo(join(output,'Orbit-Grid.mp4'));assert.deepEqual(video,{width:640,height:360,fps:24,duration:2,frames:48,decodable:true});
  await cp(entry,join(replica,'project.tsx'));for(const name of ['frameweave.plugins.json','frameweave.plugins.lock.json','frameweave.packages.json','frameweave.packages.lock.json'])await cp(join(project,name),join(replica,name));
  await restorePackages(replica,[source]);assert.deepEqual(await readFile(join(project,'frameweave.packages.lock.json')),await readFile(join(replica,'frameweave.packages.lock.json')));
  const tree=await exportProject(entry,{output:join(run,'carried')}),capsule=await exportProject(entry,{output:join(output,'Orbit-Grid.tsx'),singleFile:true,layout:'capsule'});
  const offlineAuthor=source+'-offline',offlineProject=project+'-offline';await rename(source,offlineAuthor);await rename(project,offlineProject);
  const comparisons:Record<string,number>={};
  for(const [label,path]of [['restored',join(replica,'project.tsx')],['sourceTree',tree.entry],['singleTSX',capsule.entry]]){
    const isolated=await Renderer.create(await buildProject(path),{cache:false,allowWasm:true});let compared=0;
    try{for(let i=47;i>=0;i--){const frame=await isolated.renderFrame(i);assert.deepEqual(frame.diagnostics,[]);assert.deepEqual(await raw(frame.png),expected[i]);compared++;}}finally{await isolated.close();}
    comparisons[label]=compared;
  }
  // Parameter extremes are real frame renders, outside the original golden sequence.
  const original=await readFile(join(replica,'project.tsx'),'utf8'),extremes:Record<string,string>={};
  for(const [label,speed,radius]of [['minimum',0,0.05],['maximum',4,0.45]] as const){
    const text=original.replace(/speed:1\.25,radius:keyframes\(\[.*?\]\)/s,`speed:${speed},radius:${radius}`);assert.notEqual(text,original);await writeFile(join(replica,'project.tsx'),text);
    const r=await Renderer.create(await buildProject(join(replica,'project.tsx')),{cache:false,allowWasm:true});try{const frame=await r.renderFrame(24);assert.deepEqual(frame.diagnostics,[]);extremes[label]=join(output,`${label}.png`);await writeFile(extremes[label],frame.png);}finally{await r.close();}
  }
  report={ok:true,package:verified.packages,video,seekOrder:seek,uncached:true,rgbaTolerance:0,comparedFrames:comparisons,frameHashes:hashes,parameterExtremes:extremes,originalAuthorAndInstallationUnavailable:true,sourceTree:tree.selfContained,singleTSX:{path:capsule.entry,layout:capsule.layout,selfContained:capsule.selfContained},runtime:process.version};
  await writeFile(join(output,'proof.json'),JSON.stringify(report,null,2)+'\n');await writeFile(join(output,'../latest.json'),JSON.stringify({output,proof:join(output,'proof.json')},null,2)+'\n');console.log(JSON.stringify({ok:true,output,video,comparedFrames:comparisons,rgbaTolerance:0},null,2));
}catch(error){report={ok:false,error:String(error)};await writeFile(join(output,'proof.json'),JSON.stringify(report,null,2)+'\n');throw error;}
finally{assert.equal(dirname(resolve(run)),resolve(parent));await rm(run,{recursive:true,force:true});}
