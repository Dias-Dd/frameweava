import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,cp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface,acescg,srgb,type ProfessionalSurface} from '../src/media/surface.ts';
import {mediaPreview} from '../src/media/node.ts';

test('time controls real Stage: source math + Core signals + GPU float Glow; fractional time, seek, half/full and lifecycle',{timeout:90000},async()=>{
 const base=resolve('.frameweave/pa3-time');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'scene-'));await cp('examples/pro-animation/pa3-time',dir,{recursive:true});
 const entry=join(dir,'project.tsx'),build=await buildProject(entry),policy={workingColor:acescg,transport:'buffer-v1' as const,preview:{color:srgb,clip:true}};build.manifest.stages[0].props.reference=true;
 const start=performance.now(),renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false,media:policy}),initializationMs=performance.now()-start,seen=new Map<number,Float32Array>(),rows:any[]=[];
 try{
  for(const frame of [5,0,11,3,5,11,0]){
   const begin=performance.now(),out=await renderer.renderMediaFrame(frame),s=out.stageOutputs.timecontrols.surface as ProfessionalSurface,p=pixelsFromSurface(s),stats=out.stageOutputs.timecontrols.stats as any;rows.push({frame,ms:performance.now()-begin,stats});
   assert.equal(stats.gpu,true);assert.equal(stats.owner.backend,'webgpu');assert.equal(stats.time,frame/12);assert.equal(stats.sourceTimes[0],stats.time);assert.ok(stats.x.every((x:number)=>Number.isFinite(x)&&x>=20&&x<=300));assert.ok(Math.abs(stats.sourceTimes[3]*6-Math.round(stats.sourceTimes[3]*6))<1e-10);assert.ok(stats.minimum<0&&stats.maximum>1&&stats.fractional>0&&stats.transparent>0);assert.ok(stats.reference.maxScaled<=3e-6);assert.equal(stats.float.liveBuffers,0);assert.equal(stats.float.buffersCreated,stats.float.buffersDestroyed);assert.equal(s.alpha,'premultiplied');assert.deepEqual(s.color,acescg);
   if(seen.has(frame))assert.deepEqual(p,seen.get(frame));seen.set(frame,p);const png=await mediaPreview(out.surface,policy),info=await sharp(png).metadata();assert.equal(info.width,320);assert.equal(info.height,160);await writeFile(join(dir,'frame-'+frame+'.png'),png);
  }
  assert.notDeepEqual(seen.get(0),seen.get(11));build.manifest.stages[0].props.format='rgba16float';const half=await renderer.renderMediaFrame(5),s=half.stageOutputs.timecontrols.surface as ProfessionalSurface,stats=half.stageOutputs.timecontrols.stats as any;assert.equal(s.format,'rgba16float');assert.ok(stats.reference.maxScaled<=1e-3);assert.ok(stats.minimum<0&&stats.maximum>1);rows.push({half:stats});
  build.manifest.stages[0].props.cleanup=true;const clean=(await renderer.renderMediaFrame(5)).stageOutputs.timecontrols.stats as any;assert.equal(clean.cleanup,true);assert.equal(clean.owner.liveTextures,0);assert.equal(clean.owner.liveBuffers,0);assert.equal(clean.owner.status,'disposed');rows.push({cleanup:clean});
 }finally{await renderer.close();await renderer.close();}
 await writeFile(join(base,'time-scene-proof.json'),JSON.stringify({entry,dir,initializationMs,order:[5,0,11,3,5,11,0],randomFrameTolerance:0,rows,boundary:'Pure source-time/Signal sampling, not automatic whole-Stage/video/audio retiming or pixel temporal blur'},null,2));
});
