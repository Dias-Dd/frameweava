import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../../../src/encoding/ffmpeg.ts';
import type {PortValue} from '../../../src/core/types.ts';
import {makePath} from '../experiments/vector-producer.ts';
import {convertPathUnits} from '../path-mask.ts';
import {validateMaskData} from '../validate.ts';
import {validateTrackData} from '../track.ts';
import {queryTrack} from '../track.ts';
import {object} from '../check.ts';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),proof=join(engineRoot,'artifacts/graphics-contracts'),parent=join(engineRoot,'.frameweave/graphics-contracts-tests'),fixtures:string[]=[];
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const raw=(b:Buffer)=>sharp(b).ensureAlpha().raw().toBuffer();
function png(v:PortValue):Buffer{assert.ok(v&&typeof v==='object'&&!Array.isArray(v)&&'dataUrl' in v&&typeof v.dataUrl==='string');return Buffer.from(v.dataUrl.split(',')[1],'base64');}
const pixel=(b:Buffer,x:number,y:number)=>Array.from(b.subarray((y*128+x)*4,(y*128+x)*4+4));
async function fixture(files:Record<string,string|Buffer>){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-'));fixtures.push(dir);for(const [name,data]of Object.entries(files))await writeFile(join(dir,name),data);return dir;}
after(async()=>{for(const dir of fixtures){assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}});
function maskProject(fillRule:'evenodd'|'nonzero',normalized=false,open=false){
  const path=normalized?convertPathUnits(makePath(fillRule),'normalized'):makePath(fillRule);if(open)path.commands.pop();
  return `import {Composition,Stage,Layer} from '@frameweave/engine';import {maskConsumer} from ${JSON.stringify(join(root,'experiments/mask-consumer.ts'))};export {maskConsumer};export default Composition({width:128,height:96,fps:16,durationInFrames:8,background:'transparent',children:[Stage({id:'mask',factory:maskConsumer,inputs:{path:${JSON.stringify(path)}},inputTypes:{path:'json'},outputs:{surface:'surface',mask:'json'}}),Layer({source:{$ref:'mask',port:'surface'}})]});`;
}
test('A: independent Vector → JSON → Mask modules render fill rules, curves, normalized coordinates and open closure',{timeout:180000},async()=>{
  await mkdir(proof,{recursive:true});const results:Record<string,string>={};let reference:Buffer|undefined;
  for(const [name,rule,normalized,open]of [['evenodd','evenodd',false,false],['normalized','evenodd',true,false],['open','evenodd',false,true],['nonzero','nonzero',false,false]] as const){
    const dir=await fixture({'project.ts':maskProject(rule,normalized,open)}),build=await buildProject(join(dir,'project.ts'));assert.equal(build.manifest.schemaVersion,'0.1');const r=await Renderer.create(build,{cache:false});
    try{
      const a=await r.renderFrame(0),bytes=await raw(a.png);assert.deepEqual(a.diagnostics,[]);assert.deepEqual(pixel(bytes,20,48),[255,255,255,255]);assert.deepEqual(pixel(bytes,2,2),[0,0,0,0]);assert.deepEqual(pixel(bytes,64,16),[255,255,255,255]);
      assert.deepEqual(pixel(bytes,64,48),rule==='evenodd'?[0,0,0,0]:[255,255,255,255]);
      assert.ok(Array.from(bytes).some((n,i)=>i%4===3&&n>0&&n<255),'Bezier boundary has fractional coverage');
      const mask=validateMaskData(a.stageOutputs.mask.mask);assert.equal(mask.kind,'vector');
      for(const frame of [7,3,0])assert.deepEqual(await raw((await r.renderFrame(frame)).png),bytes);
      if(name==='evenodd')reference=bytes;else if(rule==='evenodd')assert.deepEqual(bytes,reference);
      results[name]=hash(bytes);await writeFile(join(proof,`path-mask-${name}.png`),a.png);
    }finally{await r.close();}
  }
  await writeFile(join(proof,'path-mask-proof.json'),JSON.stringify({ok:true,backend:'Chromium Canvas2D Path2D',rgbaTolerance:0,results,interiorPixel:[255,255,255,255],holePixel:[0,0,0,0],seekOrder:[0,7,3,0]},null,2)+'\n');
});
test('A file: exact-hash PathData Resource renders the same result and tampering fails in the real Stage',{timeout:120000},async()=>{
  const path=await readFile(join(root,'examples/path.json')),identity={resourceId:'pathFile',kind:'file',sha256:hash(path),bytes:path.length};
  const source=(sha:string)=>`import {Composition,Stage,Resource} from '@frameweave/engine';import {fileMaskConsumer} from ${JSON.stringify(join(root,'experiments/mask-consumer.ts'))};export {fileMaskConsumer};export default Composition({width:128,height:96,fps:16,durationInFrames:2,background:'transparent',children:[Resource({id:'pathFile',kind:'file',src:'./path.json'}),Stage({id:'mask',factory:fileMaskConsumer,props:{identity:${JSON.stringify({...identity,sha256:sha})}},outputs:{surface:'surface',verified:'boolean'}})]});`;
  const dir=await fixture({'path.json':path,'good.ts':source(identity.sha256),'bad.ts':source('0'.repeat(64)),'direct.ts':maskProject('evenodd')});
  const direct=await Renderer.create(await buildProject(join(dir,'direct.ts')),{cache:false});let expected:Buffer;try{expected=await raw((await direct.renderFrame(0)).png);}finally{await direct.close();}
  const r=await Renderer.create(await buildProject(join(dir,'good.ts')),{cache:false});try{const frame=await r.renderFrame(0);assert.equal(frame.stageOutputs.mask.verified,true);assert.deepEqual(await raw(frame.png),expected);}finally{await r.close();}
  const bad=await Renderer.create(await buildProject(join(dir,'bad.ts')),{cache:false});try{await assert.rejects(()=>bad.renderFrame(0),/SHA-256 mismatch/);}finally{await bad.close();}
});
test('B: frozen real MVP Track → Reader → existing Stage animation, missing frames, seeks and decoded video',{timeout:240000},async()=>{
  await mkdir(proof,{recursive:true});const data=validateTrackData(JSON.parse(await readFile(join(root,'examples/track-mvp.json'),'utf8'))),build=await buildProject(join(root,'examples/project.tsx'));
  assert.equal(build.manifest.schemaVersion,'0.1');
  const provenance: {files:string[]}=JSON.parse(await readFile(join(build.dir,'sources.json'),'utf8'));assert.ok(provenance.files.every(f=>!/[\\/](?:face-session|worker)\.ts$/.test(f)));assert.equal(build.manifest.resources.length,1);
  const r=await Renderer.create(build,{cache:false}),frames=new Map<number,Buffer>(),order=[0,64,127,2,5,7,13,64,0],queries:object[]=[];
  try{
    for(const f of order){const result=await r.renderFrame(f),q=queryTrack(data,f/16),motion=object(result.stageOutputs.track.motion,'motion',['visible','sourceMediaSeconds'],['reason','targetId','x','y','confidence','interpolated']);assert.equal(motion.visible,q.valid);assert.equal(result.stageOutputs.marker.drawn,q.valid);
      const rgba=await raw(result.png),marker=await raw(png(result.stageOutputs.marker.surface));
      if(frames.has(f))assert.deepEqual(rgba,frames.get(f));frames.set(f,rgba);
      if(q.valid){assert.equal(result.stageOutputs.marker.x,q.anchor.x*128);assert.equal(result.stageOutputs.marker.y,q.anchor.y*96);assert.equal(motion.interpolated,q.interpolated);if(f===5)assert.equal(q.interpolated,true);assert.deepEqual(pixel(marker,Math.round(q.anchor.x*128),Math.round(q.anchor.y*96)),[53,244,164,255]);}
      else {assert.equal(motion.reason,q.reason);assert.ok(marker.every((n,i)=>i%4!==3||n===0),'missing observations produce a fully transparent marker');}
      queries.push({frame:f,sourceMediaSeconds:f/16,query:q,marker:result.stageOutputs.marker.drawn});await writeFile(join(proof,`track-frame-${f}.png`),result.png);
    }
    const encoder=await VideoEncoder.create(join(proof,'Graphics-Contracts.mp4'),{num:16,den:1},128,96);try{for(let f=0;f<128;f++){const result=await r.renderFrame(f),q=queryTrack(data,f/16);assert.equal(result.stageOutputs.marker.drawn,q.valid);if(q.valid){assert.equal(result.stageOutputs.marker.x,q.anchor.x*128);assert.equal(result.stageOutputs.marker.y,q.anchor.y*96);}await encoder.write(result.png);}await encoder.finish();}catch(e){await encoder.abort();throw e;}
  }finally{await r.close();}
  const fresh=await Renderer.create(build,{cache:false});try{for(const f of [127,0,13,2,64,7,5])assert.deepEqual(await raw((await fresh.renderFrame(f)).png),frames.get(f));}finally{await fresh.close();}
  const video=await probeVideo(join(proof,'Graphics-Contracts.mp4'));assert.equal(video.decodable,true);assert.equal(video.frames,128);assert.equal(video.fps,16);assert.equal(video.width,128);assert.equal(video.height,96);
  await writeFile(join(proof,'track-animation-proof.json'),JSON.stringify({ok:true,source:'frozen real MediaPipe MVP output; no inference run',sourceSha256:hash(await readFile(join(root,'examples/track-mvp.json'))),samples:data.samples.length,missing:data.samples.filter(s=>!s.valid).length,queries,seekOrder:order,freshContextOrder:[127,0,13,2,64,7,5],uncached:true,rgbaTolerance:0,rgbaHashes:Object.fromEntries([...frames].map(([f,b])=>[f,hash(b)])),video},null,2)+'\n');
});
