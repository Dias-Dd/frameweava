import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,acescg,srgb,type ProfessionalSurface} from '../src/media/surface.ts';
import {mediaPreview} from '../src/media/node.ts';

test('PA-3 shape composition: real Stage + auto-selected GPU Glow, signed HDR, half/full, hole, Signals, seek and cleanup',{timeout:120000},async()=>{
 const base=resolve('.frameweave/pa3');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'scene-'));await cp('examples/pro-animation/pa3-shapes',dir,{recursive:true});
 const entry=join(dir,'project.tsx'),build=await buildProject(entry),policy={workingColor:acescg,transport:'buffer-v1' as const,preview:{color:srgb,clip:true}};
 build.manifest.stages[0].props.reference=true;
 const init=performance.now(),renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false,media:policy}),initializationMs=performance.now()-init,seen=new Map<number,Float32Array>(),rows:any[]=[];
 let source:ProfessionalSurface|undefined;
 try{
  for(const frame of [5,0,11,3,5,11,0]){
   const start=performance.now(),out=await renderer.renderMediaFrame(frame),s=out.stageOutputs.shapes.surface as ProfessionalSurface,p=pixelsFromSurface(s),stats=out.stageOutputs.shapes.stats as any;
   rows.push({frame,ms:performance.now()-start,stats});assert.equal(stats.gpu,true);assert.equal(stats.copyCount,13);assert.equal(stats.holeSourceAlpha,0);assert.equal(stats.owner.backend,'webgpu');assert.ok(stats.minimum<0);assert.ok(stats.maximum>1);assert.ok(stats.transparent>0);assert.ok(stats.fractional>0);assert.ok(stats.reference.maxScaled<=3e-6,JSON.stringify(stats.reference));
   assert.deepEqual(s.color,acescg);assert.equal(s.format,'rgba32float');if(seen.has(frame))assert.deepEqual(p,seen.get(frame));seen.set(frame,p);source=s;
   const png=await mediaPreview(out.surface,policy),info=await sharp(png).metadata();assert.equal(info.width,384);assert.equal(info.height,192);await writeFile(join(dir,'frame-'+frame+'.png'),png);
  }
  assert.notDeepEqual(seen.get(0),seen.get(11));
  build.manifest.stages[0].props.format='rgba16float';const half=await renderer.renderMediaFrame(5),s=half.stageOutputs.shapes.surface as ProfessionalSurface,stats=half.stageOutputs.shapes.stats as any;assert.equal(s.format,'rgba16float');assert.ok(stats.minimum<0&&stats.maximum>1);assert.ok(stats.reference.maxScaled<=1e-3,JSON.stringify(stats.reference));await writeFile(join(dir,'half.png'),await mediaPreview(half.surface,policy));
  build.manifest.stages[0].props.cleanup=true;const clean=(await renderer.renderMediaFrame(5)).stageOutputs.shapes.stats as any;assert.equal(clean.cleanup,true);assert.equal(clean.owner.liveTextures,0);assert.equal(clean.owner.liveBuffers,0);assert.equal(clean.owner.status,'disposed');rows.push({cleanup:clean});
 }finally{await renderer.close();await renderer.close();}
 await writeFile(join(dir,'source-frame.json'),JSON.stringify(source));await writeFile(join(base,'shape-scene-proof.json'),JSON.stringify({entry,dir,initializationMs,order:[5,0,11,3,5,11,0],randomFrameTolerance:0,rows,pixelPrecision:'CPU geometry/A8 coverage, linear signed HDR ink, actual GPU-required Glow, no implicit fallback',l3:'R1/export wiring intentionally owned by Main'},null,2));
});
