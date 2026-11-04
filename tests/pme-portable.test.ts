import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,copyFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {exportProject,type ExportOptions} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,linear2020} from '../src/media/surface.ts';

test('professional binary bridge preserves six export policies and exact random-frame pixels',{timeout:180000},async()=>{
 const parent=join(engineRoot,'.frameweave/pme-perf-portable');await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'case-')),source=join(root,'source');await mkdir(source);
 await copyFile(join(engineRoot,'examples/professional-media/stages.ts'),join(source,'stage.ts'));const entry=join(source,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={32} height={16} fps={24} durationInFrames={6}><Stage id="a" entry="./stage.ts" exportName="source" outputs={{surface:'surface'}}/><Stage id="b" entry="./stage.ts" exportName="exposure" inputs={{image:ref('a')}} inputTypes={{image:'surface'}} outputs={{surface:'surface'}}/><Layer id="l" source={ref('b')}/></Composition>;`);
 async function frames(file:string){const r=await Renderer.create(await buildProject(file),{media:{workingColor:linear2020,transport:'buffer-v1'}});try{const seen=[];for(const f of [0,3,0])seen.push(pixelsFromSurface((await r.renderMediaFrame(f)).surface));return seen;}finally{await r.close();}}
 const reference=await frames(entry),options:ExportOptions[]=[
  {output:join(root,'flat.tsx'),singleFile:true,layout:'flat'},
  {output:join(root,'capsule.tsx'),singleFile:true,layout:'capsule'},
  {output:join(root,'tree'),sources:'preserve',modules:'copy',assets:'copy'},
  {output:join(root,'merged'),sources:'merge',modules:'copy',assets:'copy'},
  {output:join(root,'preserved'),sources:'preserve',modules:'merge',assets:'embed'},
  {output:join(root,'external'),sources:'merge',modules:'external',assets:'external'},
 ];
 const carried=[];for(const option of options)carried.push(await exportProject(entry,option));await rename(source,source+'-offline');
 for(const result of carried)assert.deepEqual(await frames(result.entry),reference,`export ${result.layout}`);
 await mkdir(join(engineRoot,'artifacts/pme-perf'),{recursive:true});await writeFile(join(engineRoot,'artifacts/pme-perf/portable.json'),JSON.stringify({version:1,originalUnavailable:true,actualFrames:[0,3,0],exactFloatPixels:true,exports:carried.map(r=>({entry:r.entry,layout:r.layout,selfContained:r.selfContained,externalFiles:r.externalFiles}))},null,2));
});
