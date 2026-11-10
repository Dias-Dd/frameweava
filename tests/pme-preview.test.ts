import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {setImmediate} from 'node:timers/promises';
import {engineRoot} from '../src/compiler/build.ts';
import {openMediaPreview} from '../src/media/preview-session.ts';
import {OcioWorker} from '../src/media/ocio-worker.ts';
import {ocioTransform} from '../src/media/ocio.ts';
import {readIccImage} from '../src/media/input.ts';
import {surfaceFromPixels,pixelsFromSurface,acescg,srgb} from '../src/media/surface.ts';

const policy={workingColor:acescg,preview:{color:srgb,clip:true,ocio:{source:'ACEScg',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)'}}};
test('ordinary PNG and tagged PNG use the installed ICC adapter and preserve alpha',async()=>{
 const parent=join(engineRoot,'.frameweave');await mkdir(parent,{recursive:true});
 const dir=await mkdtemp(join(parent,'media-png-'));
 const pixels=Buffer.from([0,0,0,0,128,0,0,128,255,255,255,255]);
 const image=()=>sharp(pixels,{raw:{width:3,height:1,channels:4}});
 const plain=join(dir,'plain.png'),tagged=join(dir,'tagged.png');
 await image().png().toFile(plain);
 await image().withIccProfile('p3').png().toFile(tagged);
 await assert.rejects(readIccImage(plain,{onMissing:'error'}),{code:'E_MEDIA_COLOR_MISSING'});
 const ordinary=await readIccImage(plain,{onMissing:'assume-srgb'});
 const profiled=await readIccImage(tagged,{onMissing:'error'});
 assert.equal(ordinary.source.icc,'explicit-srgb');
 assert.equal(profiled.source.icc,'embedded');
 for(const {surface} of [ordinary,profiled]){
  assert.equal(surface.width,3);assert.equal(surface.height,1);
  assert.deepEqual(pixelsFromSurface(surface).filter((_,i)=>i%4===3),Float32Array.of(0,128/255,1));
 }
});

test('retained fixed OCIO worker matches one-shot exactly, bounds protocol, propagates errors and closes',async()=>{
 const worker=new OcioWorker(),s=surfaceFromPixels(2,1,[-.1,4,.2,.5,1,0,0,0],{color:acescg}),transform={...policy.preview.ocio,outputColor:srgb};
 try{
  const ref=await ocioTransform(s,transform);for(let i=0;i<2;i++){const result=await ocioTransform(s,transform,worker);assert.deepEqual(pixelsFromSurface(result.surface),pixelsFromSurface(ref.surface));assert.equal(result.provenance.processorCacheID,ref.provenance.processorCacheID);}
  assert.equal(worker.status().starts,1);assert.equal(worker.status().pending,false);
  const bad=JSON.parse(await worker.run(join(engineRoot,'absent-ocio-request.json')));assert.equal(bad.ok,false);
  assert.deepEqual(pixelsFromSurface((await ocioTransform(s,transform,worker)).surface),pixelsFromSurface(ref.surface));
 }finally{await worker.close();await worker.close();}
 assert.equal(worker.status().running,false);await assert.rejects(worker.run('ignored'),{code:'E_MEDIA_OCIO_WORKER_CLOSED'});await assert.rejects(ocioTransform(s,transform,worker),{code:'E_MEDIA_OCIO_WORKER_CLOSED'});
});

test('real preview Session computes proxies early, coalesces stale work, reuses resources and drains close',async()=>{
 const parent=join(engineRoot,'.frameweave/pme-perf-preview');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-')),entry=join(dir,'project.tsx');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';export default <Composition width={3840} height={2160} fps={24} durationInFrames={4}><Stage id="s" entry=${JSON.stringify(join(engineRoot,'examples/professional-media/stages.ts'))} exportName="source" outputs={{surface:'surface'}}/><Layer id="l" source={ref('s')}/></Composition>;`);
 const preview=openMediaPreview(entry,{width:320,media:policy});
 try{
  const requests=[0,1,2].map(f=>preview.requestFrame(f));const results=await Promise.allSettled(requests);assert.equal(results[0].status,'rejected');assert.equal(results[1].status,'rejected');
  for(const r of results.slice(0,2))if(r.status==='rejected')assert.equal(r.reason.code,'E_MEDIA_PREVIEW_SUPERSEDED');
  const last=results[2];assert.equal(last.status,'fulfilled');if(last.status==='fulfilled'){const info=await sharp(last.value.png).metadata();assert.equal(info.width,320);assert.equal(info.height,180);assert.equal((last.value.stageOutputs.s.surface as any).width,320);await writeFile(join(dir,'proxy.png'),last.value.png);}
  const again=await preview.requestFrame(2);assert.equal(again.cacheHits,1);assert.equal(preview.status().session.builds,1);assert.equal(preview.status().session.hostStarts,1);
  const accepted=preview.requestFrame(3);const closing=preview.close();await accepted;await closing;assert.equal(preview.status().session.closed,true);await preview.close();await assert.rejects(preview.requestFrame(0),{code:'E_MEDIA_PREVIEW_CLOSED'});
 }finally{await preview.close();}
});

test('OCIO in-flight/queued cancellation waits for native exit; concurrent close shares completion',async()=>{
 const worker=new OcioWorker(),first=worker.run(join(engineRoot,'absent-ocio-inflight.json')),queued=worker.run(join(engineRoot,'absent-ocio-queued.json'));
 const rejection=assert.rejects(first,{code:'E_MEDIA_OCIO_WORKER'}),queuedRejection=assert.rejects(queued,{code:'E_MEDIA_OCIO_WORKER_CLOSED'});
 await setImmediate();assert.equal(worker.status().pending,true);const a=worker.close(),b=worker.close();assert.equal(a,b);await Promise.all([a,rejection,queuedRejection]);
 assert.deepEqual(worker.status(),{starts:1,pending:false,running:false,stopping:false,closed:true});await worker.close();
});
