import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {copyFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {buildProject,Renderer,ffmpegPath,installedPackages} from '../src/node.ts';
import {exportProject} from '../src/compiler/export.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';

assert.ok(process.argv[2],'Pass a freshly built local catalog directory');
const catalog=resolve(process.argv[2]),base=resolve('.frameweave/suite-acceptance');
await mkdir(base,{recursive:true});
const proof=await mkdtemp(join(base,'run-')),project=join(proof,'project'),entry=join(project,'project.tsx');
process.env.FRAMEWEAVE_HOME=join(proof,'home');
await mkdir(project);
await copyFile(resolve('modules/pro-animation/examples/suite.tsx'),entry);
const exec=promisify(execFile);
const cli=async (args:string[])=>{
  const result=await exec(process.execPath,['--import','tsx','src/cli.ts',...args,'--json'],{
    windowsHide:true,timeout:35000,maxBuffer:4*1024**2,
  });
  return JSON.parse(result.stdout);
};
const install=['packages','install','pro-animation@1.1.0','--catalog',catalog,'--project',entry];
const trust=['frameweave.pro','frameweave.gpu-images','frameweave.native-2d','frameweave.spatial'];
await assert.rejects(cli([...install,'--trust','local:frameweave.pro']),error=>
  /E_PACKAGE_TRUST/.test(String((error as {stderr?:string}).stderr)));
await cli([...install,...trust.flatMap(authority=>['--trust','local:'+authority])]);
const state=await installedPackages(project);
assert.ok(state.lock);
assert.deepEqual(state.lock.roots,{'pro-animation':'pro-animation@1.1.0'});
assert.equal(Object.keys(state.lock.packages).length,8);
assert.equal(state.lock.packages['pro-animation@1.1.0'].dependencies['frameweave.transitions'],'frameweave.transitions@1.0.0');
assert.deepEqual((await cli(['packages','types','--project',entry])).packages,['pro-animation']);
const built=await buildProject(entry);
const executable=await nativeExecutable();
const byStage=Object.fromEntries(built.manifest.stages.map(stage=>[stage.id,Object.keys(stage.props.$packages as object).sort()]));
assert.deepEqual(byStage,{
  card:['frameweave.typography@1.0.0','frameweave.vector@1.0.0','native-2d@0.2.0'],
  backdrop:['spatial-creation@1.2.0'],
  blend:['frameweave.motion@1.0.0','frameweave.transitions@1.0.0','native-image-effects@0.8.0'],
});
async function renderFrames(build:typeof built,order:number[]){
  const renderer=await Renderer.create(build,{nativeGpu:{executable,slots:1,dynamic:'interactive',readback:'final-surface'}});
  try{
    const pixels=[];
    for(const frame of order)pixels.push(pixelsFromSurface(await renderer.renderNativeSurface(frame)));
    assert.ok((await renderer.nativeStats()).capabilities.hardwareVerified);
    return pixels;
  }finally{await renderer.close();}
}
const [first,later,repeated]=await renderFrames(built,[0,3,0]);
assert.deepEqual(first,repeated);
assert.notDeepEqual(first,later);
assert.ok(first.every(Number.isFinite));
assert.ok(first.some((value,index)=>index%4!==3&&value>1));
const video=join(proof,'suite.mp4');
const videoResult=await renderNativeProject(entry,{build:built,output:video,encoder:'libx264',maxConcurrency:1});
assert.equal(videoResult.frames,4);
const decoded=await exec(ffmpegPath(),['-v','error','-xerror','-i',video,'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{
  windowsHide:true,timeout:15000,maxBuffer:1024**2,encoding:'buffer',
});
assert.equal(decoded.stdout.byteLength,96*54*4*4);
const portable=join(proof,'carried');
await exportProject(entry,{output:portable});
const carried=join(portable,'project.tsx'),carriedState=await installedPackages(dirname(carried));
assert.equal(Object.keys(carriedState.lock!.packages).length,8);
assert.ok(carriedState.records.every(record=>record.directory.startsWith(join(portable,'packages'))));
assert.deepEqual((await renderFrames(await buildProject(carried),[0]))[0],first);
const receipt={proof,catalog,roots:state.lock.roots,packages:Object.keys(state.lock.packages),byStage,decodedFrames:4,carriedPixelsExact:true,hardware:true};
await writeFile(join(proof,'result.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
