import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
import {writeLock} from '../src/plugins/registry.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';

const parent=join(engineRoot,'artifacts/professional-media');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'sdr-compat-')),exec=promisify(execFile);
const json=async(file:string)=>JSON.parse(await readFile(file,'utf8'));
const baselineRef=process.argv[2]??'74a8031';
const names=(await exec('git',['ls-tree','-r','--name-only',baselineRef,'--','src','plugins/builtin'],{cwd:engineRoot,windowsHide:true})).stdout.trim().split(/\r?\n/).sort().concat(['package.json','package-lock.json']),h=createHash('sha256');
for(const name of names){const bytes=(await exec('git',['show',`${baselineRef}:${name}`],{cwd:engineRoot,encoding:'buffer',windowsHide:true,maxBuffer:8*1024*1024})).stdout;h.update(name).update('\0').update(bytes);}const baselineIntegrity=h.update('\0').digest('hex');
const fixture=join(directory,'editable');await mkdir(join(fixture,'plugins'),{recursive:true});await cp(join(engineRoot,'plugins/shared'),join(fixture,'plugins/shared'),{recursive:true});
const identities=[];for(const name of ['first-project','reuse-project']){
 const source=join(engineRoot,'examples/p4',name),target=join(fixture,'examples/p4',name);await mkdir(target,{recursive:true});await cp(source,target,{recursive:true});
 const originalBytes=await readFile(join(source,'frameweave.plugins.lock.json')),before=await json(join(target,'frameweave.plugins.lock.json'));
 // Deliberate SDK refresh only inside this new validation fixture, after retaining
 // the original bytes. No tracked example lock or plugin version is changed.
 await writeLock(target);const after=await json(join(target,'frameweave.plugins.lock.json'));assert.deepEqual(after.plugins,before.plugins,'Plugin content/version changed; this is not a mere SDK refresh');
 assert.deepEqual(await readFile(join(source,'frameweave.plugins.lock.json')),originalBytes);identities.push({name,originalRuntime:before.runtime,reviewedFixtureRuntime:after.runtime,pluginContentUnchanged:true});
 await buildProject(join(target,'project.tsx'));
}
const built=await buildProject(join(fixture,'examples/p4/reuse-project/project.tsx')),renderer=await Renderer.create(built,{cache:false}),video=join(directory,'sdr-p4.mp4'),encoder=await VideoEncoder.create(video,{num:30,den:1},480,270);
try{
 const a=await renderer.renderFrame(5);await renderer.renderFrame(0);assert.deepEqual((await renderer.renderFrame(5)).png,a.png);await writeFile(join(directory,'sdr-p4.png'),a.png);
 for(let frame=0;frame<12;frame++)await encoder.write((await renderer.renderFrame(frame)).png);await encoder.finish();
 const metadata=await sharp(a.png).metadata();assert.equal(metadata.width,480);assert.equal(metadata.height,270);
 const probe=await probeVideo(video);assert.deepEqual(probe,{width:480,height:270,fps:30,duration:.4,frames:12,decodable:true});
 await writeFile(join(directory,'results.json'),JSON.stringify({ok:true,baselineIntegrity,currentRuntime:runtimePin,identities,png:{width:metadata.width,height:metadata.height},video:probe},null,2));
 console.log(JSON.stringify({ok:true,directory,baselineIntegrity,currentIntegrity:runtimePin.integrity,identities,video:probe}));
}catch(e){await encoder.abort();throw e;}finally{await renderer.close();}
