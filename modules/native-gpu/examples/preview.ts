import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';

// No daemon, Chromium, PNG, HTTP or per-frame file seal. Build verifies sources
// once. Changes require explicit rebuild/new Renderer, not live file execution.
const entry=resolve(process.argv[2]??'modules/native-gpu/examples/two-stage.tsx');
const executable=resolve(process.argv[3]??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
const build=await buildProject(entry),renderer=await Renderer.create(build,{nativeGpu:{executable,window:true}});
try{
 const start=performance.now();const completed:Promise<void>[]=[];
 for(let frame=0;frame<build.manifest.composition.durationInFrames;frame++){
  const remaining=start+frame*1000*build.manifest.composition.fps.den/build.manifest.composition.fps.num-performance.now();
  if(remaining>0)await delay(remaining);
  const ticket=await renderer.submitNativeFrame(frame);completed.push(ticket.completed);
 }
 await Promise.all(completed);
 console.log(JSON.stringify({version:1,status:renderer.status(),stats:await renderer.nativeStats(),wallMs:performance.now()-start}));
 await delay(500);
}finally{await renderer.close();}
