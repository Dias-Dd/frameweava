import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
import {writeLock,projectPlugins} from '../src/plugins/registry.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';

// Explicit SDK-only lock review in NEW PRIVATE copies. Never edits old example locks.
const root=resolve('.'),parent=join(root,'.frameweave/v-shared-phase2-p4-copies'),output=resolve(process.argv[2]??'artifacts/v-shared-phase2/p4-private');
await mkdir(parent,{recursive:true});await mkdir(output,{recursive:true});const fixture=await mkdtemp(join(parent,'copy-'));
await cp(join(root,'plugins/shared'),join(fixture,'plugins/shared'),{recursive:true});
const names=['first-project','reuse-project'],audit=[];
for(const name of names){
  const source=join(root,'examples/p4',name),target=join(fixture,'examples/p4',name),lock='frameweave.plugins.lock.json',before=await readFile(join(source,lock));
  await cp(source,target,{recursive:true});await writeLock(target);
  const old=JSON.parse(before.toString()),next=JSON.parse(await readFile(join(target,lock),'utf8'));assert.deepEqual(next.plugins,old.plugins);
  assert.deepEqual(Object.keys(next),Object.keys(old));assert.deepEqual(next.runtime,runtimePin);assert.deepEqual(await readFile(join(source,lock)),before);
  audit.push({name,source,fixture:target,before:old,after:next,sdkOnly:true,runtimeChanged:JSON.stringify(next.runtime)!==JSON.stringify(old.runtime),originalBytesUnchanged:true});
}
const [first,second]=await Promise.all(names.map(name=>buildProject(join(fixture,'examples/p4',name,'project.tsx'))));
const [a,b]=await Promise.all(names.map(name=>projectPlugins(join(fixture,'examples/p4',name))));assert.equal(a.registry.get('example.energy-vortex@1.0.0').directory,b.registry.get('example.energy-vortex@1.0.0').directory);
assert.ok(first.stageBundles.vortex);assert.ok(second.stageBundles.reused);
const renderer=await Renderer.create(second,{cache:false}),video=join(output,'private-reuse.mp4'),encoder=await VideoEncoder.create(video,{num:30,den:1},480,270);
try{for(let i=0;i<12;i++){const f=await renderer.renderFrame(i);if([0,6,11].includes(i))await writeFile(join(output,`frame-${i}.png`),f.png);await encoder.write(f.png);}await encoder.finish();}catch(e){await encoder.abort();throw e;}finally{await renderer.close();}
const metadata=await probeVideo(video);assert.deepEqual(metadata,{width:480,height:270,fps:30,duration:.4,frames:12,decodable:true});
await writeFile(join(output,'sdk-only-copy-audit.json'),JSON.stringify({ok:true,fixture,audit,metadata,scope:'New private copies only; tracked lock bytes and historical results are unchanged by this script'},null,2));console.log(JSON.stringify({ok:true,output,metadata,originalLocksChanged:false}));
