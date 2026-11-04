import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,linear2020,srgb} from '../src/media/surface.ts';
import {mediaPreview} from '../src/media/node.ts';

test('real opaque Stage GPU float compositor: CPU numeric oracle, blends, alpha, masks, groups, fallback and disposal',{timeout:120000},async()=>{
 const parent=join(engineRoot,'.frameweave/pme-gpu');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={31} height={19} fps={24} durationInFrames={8}><Stage id="gpu" entry=${JSON.stringify(join(engineRoot,'modules/gpu-effects/validation/professional-stage.ts'))} outputs={{surface:'surface',stats:'json'}}/><Layer id="out" source={ref('gpu')}/></Composition>;`);
 const build=await buildProject(entry),r=await Renderer.create(build,{preview:true,cache:false,media:{workingColor:linear2020,transport:'buffer-v1'}}),seen=new Map<number,Float32Array>(),reports=[];
 try{
  for(const frame of [0,5,0]){
   const result=await r.renderMediaFrame(frame),report=result.stageOutputs.gpu.stats as any,p=pixelsFromSurface(result.surface);reports.push({frame,...report});assert.equal(report.gpu.backend,'webgpu');assert.equal(report.gpu.owner.backendInfo.isFallbackAdapter,false);
   for(const row of report.rows){assert.ok(row.maxAbsolute<3e-4,JSON.stringify(row));assert.ok(row.alphaMax<3e-5,JSON.stringify(row));}
   assert.equal(report.gpu.liveBytes,0);assert.equal(report.gpu.buffersCreated,report.gpu.buffersDestroyed);assert.equal(report.fallback.stats.backend,'cpu');assert.deepEqual(report.fallback.pixels,[0,0,0,0]);
   if(seen.has(frame))assert.deepEqual(p,seen.get(frame));seen.set(frame,p);
   if(frame===0){await mkdir(join(engineRoot,'artifacts/pme-perf'),{recursive:true});await writeFile(join(engineRoot,'artifacts/pme-perf/gpu-preview.png'),await mediaPreview(result.surface,{workingColor:linear2020,preview:{color:srgb,clip:true}}));}
  }
  build.manifest.stages[0].props.cleanup=true;const cleanup=(await r.renderMediaFrame(0)).stageOutputs.gpu.stats as any;assert.equal(cleanup.liveBytes,0);assert.equal(cleanup.owner.liveTextures,0);assert.equal(cleanup.owner.liveBuffers,0);assert.equal(cleanup.owner.status,'disposed');reports.push({cleanup});
 }finally{await r.close();await r.close();}
 await writeFile(join(engineRoot,'artifacts/pme-perf/gpu-numeric.json'),JSON.stringify({version:1,reports},null,2));
});
