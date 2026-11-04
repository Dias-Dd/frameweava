import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {Renderer} from '../../src/render/renderer.ts';
import type {BuiltProject,Surface} from '../../src/core/types.ts';

// A new Node process, browser and set of Stage contexts per invocation; no cache.
const [buildPath,order,out]=process.argv.slice(2);
const build=JSON.parse(await readFile(buildPath,'utf8')) as BuiltProject;
const frames=order==='sequential'?Array.from({length:181},(_,i)=>i):order==='direct'?[180]:[240,30,180,0,120];
await mkdir(out,{recursive:true});
const renderer=await Renderer.create(build,{cache:false});
try {
  for(const frame of frames) {
    const result=await renderer.renderFrame(frame);
    if(![0,30,120,180,240].includes(frame))continue;
    await writeFile(join(out,`${frame}.png`),result.png);
    for(const [id,ports] of Object.entries(result.stageOutputs)) {
      const image=Object.values(ports).find(value=>value&&typeof value==='object'&&!Array.isArray(value)&&value.kind==='surface') as Surface|undefined;
      if(image)await writeFile(join(out,`${id}-${frame}.png`),Buffer.from(image.dataUrl.split(',')[1],'base64'));
    }
  }
} finally {await renderer.close();}
