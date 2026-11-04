import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {surfaceFromPixels,acescg,srgb,type AlphaMode} from '../src/media/surface.ts';
import {ocioTransform} from '../src/media/ocio.ts';
import {mediaPreview} from '../src/media/node.ts';

// Frozen display-v1 criteria, not HDR/intermediate accuracy thresholds:
// compare the visible premultiplied sRGB contribution within two byte codes,
// Alpha within one, and opaque straight RGB within one. Low/zero Alpha is not
// used to hide contribution error. Full F32 intermediates are never replaced.
test('resident GPU display: actual OCIO reference, Alpha/HDR samples, Canvas ownership and release',{timeout:180000},async()=>{
 const parent=join(engineRoot,'artifacts/gpu-resident');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'display-v1-'));process.env.FRAMEWEAVE_HOME=join(dir,'user-home');const report:any={version:1,scope:'explicit fixed ACES2 SDR100 display; browser Canvas2D quantization',thresholds:{maxPremultipliedByteError:2,maxAlphaByteError:1,maxOpaqueByteError:1},rows:[],allPassed:false};
 const values=[-4,-1,-.1,0,.1,1,4,64,65504],alphas=[0,2**-24,.125,.5,1],width=128;
 try{
  for(const alpha of ['opaque','straight','premultiplied'] as AlphaMode[]){
   const samples:number[]=[];for(const a of alpha==='opaque'?[1]:alphas)for(const r of values)for(const g of values)for(const b of values){const k=alpha==='premultiplied'?a:1;samples.push(r*k,g*k,b*k,a);}
   const height=Math.ceil(samples.length/4/width),p=new Float32Array(width*height*4);if(alpha==='opaque')for(let i=3;i<p.length;i+=4)p[i]=1;p.set(samples);
   const input=surfaceFromPixels(width,height,p,{format:'rgba32float',alpha,color:acescg,deferBase64:false}),file=join(dir,alpha+'.json'),source=Buffer.from(JSON.stringify(input)),sha256=createHash('sha256').update(source).digest('hex');await writeFile(file,source);
   const expected=await ocioTransform(input,{source:'ACEScg',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)',outputColor:srgb}),reference=await mediaPreview(expected.surface,{workingColor:acescg,preview:{color:srgb,clip:true}}),cpu=await sharp(reference).ensureAlpha().raw().toBuffer();await writeFile(join(dir,alpha+'-cpu.png'),reference);
   const entry=join(dir,alpha+'.tsx');await writeFile(entry,`import {Composition,Stage,Resource} from '@frameweave/engine';export default <Composition width={${width}} height={${height}} fps={24} durationInFrames={10}><Resource id="source" kind="file" src={${JSON.stringify(file)}}/><Stage id="display" entry={${JSON.stringify(join(engineRoot,'tests/fixtures/gpu-pixel-display-stage.ts'))}} outputs={{surface:'surface',stats:'json'}} props={{bytes:${source.length},sha256:'${sha256}'}}/></Composition>;`);
   const build=await buildProject(entry,{outputDir:join(dir,'build-'+alpha)}),renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false});
   try{const result=await renderer.renderFrame(0,'display'),stats=result.stageOutputs.display.stats as any;assert.equal(stats.failure,undefined,JSON.stringify(stats));assert.equal(stats.canvas2dOnly,true);assert.equal(stats.origin,'null');assert.equal(stats.scope.readbacks,0);assert.equal(stats.scope.readbackBytes,0);assert.equal(stats.scope.presentations,2);assert.equal(stats.scope.failed,false);assert.equal(stats.sourceRoundtripSha256,createHash('sha256').update(new Uint8Array(p.buffer)).digest('hex'),'Display must not modify professional source bits');
    const codes=Object.fromEntries(stats.rejected.map((x:any)=>[x.name,x.code]));assert.deepEqual(codes,{policy:'E_GPU_PIXEL_DISPLAY_POLICY',foreign:'E_GPU_PIXEL_SCOPE','cancel-preflight':'E_RENDER_CANCELLED','canvas-mutation':'E_GPU_PIXEL_DISPLAY_CANVAS'});
    const gpu=await sharp(result.png).ensureAlpha().raw().toBuffer();assert.equal(gpu.length,cpu.length);let maxContribution=0,maxAlpha=0,maxOpaque=0,worst:any=null;
    for(let i=0;i<gpu.length;i+=4){maxAlpha=Math.max(maxAlpha,Math.abs(gpu[i+3]-cpu[i+3]));for(let c=0;c<3;c++){const d=Math.abs(gpu[i+c]*gpu[i+3]/255-cpu[i+c]*cpu[i+3]/255);if(d>maxContribution){maxContribution=d;worst={pixel:i/4,channel:c,cpu:Array.from(cpu.subarray(i,i+4)),gpu:Array.from(gpu.subarray(i,i+4))};}if(cpu[i+3]===255)maxOpaque=Math.max(maxOpaque,Math.abs(gpu[i+c]-cpu[i+c]));}}
    report.rows.push({alpha,width,height,samples:samples.length/4,maxContribution,maxAlpha,maxOpaque,worst,stats,provenance:expected.provenance});await writeFile(join(dir,alpha+'-gpu.png'),result.png);
    assert.ok(maxContribution<=2,JSON.stringify(report.rows.at(-1)));assert.ok(maxAlpha<=1);assert.ok(maxOpaque<=1);
    build.manifest.stages[0].props.close=true;const close=(await renderer.evaluateFrame(1,'display')).stageOutputs.display.stats as any;assert.equal(close.scope.liveBytes,0);assert.equal(close.scope.buffersCreated,close.scope.buffersDestroyed);assert.equal(close.core.liveBuffers,0);report.rows.at(-1).cleanup=close;
   }finally{await renderer.close();await renderer.close();}
  }
  for(const [name,pixel,invalidProducer,code]of [['producer',[1,2,3,1],true,'E_GPU_PIXEL_PUBLICATION'],['domain',[70000,0,0,1],false,'E_GPU_PIXEL_DISPLAY_DOMAIN']] as const){
   const input=surfaceFromPixels(1,1,pixel,{format:'rgba32float',alpha:'opaque',color:acescg}),file=join(dir,name+'.json'),source=Buffer.from(JSON.stringify(input)),sha256=createHash('sha256').update(source).digest('hex');await writeFile(file,source);const entry=join(dir,name+'.tsx');
   await writeFile(entry,`import {Composition,Stage,Resource} from '@frameweave/engine';export default <Composition width={1} height={1} fps={24} durationInFrames={2}><Resource id="source" kind="file" src={${JSON.stringify(file)}}/><Stage id="display" entry={${JSON.stringify(join(engineRoot,'tests/fixtures/gpu-pixel-display-stage.ts'))}} outputs={{surface:'surface',stats:'json'}} props={{bytes:${source.length},sha256:'${sha256}',invalidProducer:${invalidProducer}}}/></Composition>;`);
   const build=await buildProject(entry,{outputDir:join(dir,'build-'+name)}),renderer=await Renderer.create(build,{preview:true,cache:false,allowWasm:false});
   try{const stats=(await renderer.evaluateFrame(0,'display')).stageOutputs.display.stats as any;assert.equal(stats.failure?.code,code,JSON.stringify(stats));assert.equal(stats.scope.failed,true);assert.equal(stats.scope.presentations,0);assert.equal(stats.scope.liveBytes,0);assert.equal(stats.scope.buffersCreated,stats.scope.buffersDestroyed);assert.equal(stats.core.status,'disposed');report.rows.push({name,expectedFailure:code,stats});}finally{await renderer.close();}
  }
  report.allPassed=true;
 }finally{await writeFile(join(dir,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({dir,allPassed:report.allPassed}));}
});
