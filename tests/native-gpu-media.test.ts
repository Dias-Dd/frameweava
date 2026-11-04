import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {compileNativePlan} from '../modules/native-gpu/program.ts';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {surfaceFromPixels,pixelsFromSurface,acescg,srgb} from '../src/media/surface.ts';
import {ocioTransform} from '../src/media/ocio.ts';

test('native swapchain fixed ACES2 display matches actual OCIO; diagnostic readback is explicitly separate',{timeout:60000},async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/nh');
 const built=await buildProject(resolve('modules/native-gpu/examples/two-stage.tsx'));
 const width=320,height=180,frame=7,plan=compileNativePlan(built.manifest,{width,height,window:true});
 const executable=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
 const client=await NativeGpuClient.create(plan.program,{executable,window:true});
 const out=resolve('.frameweave/native-evidence');await mkdir(out,{recursive:true});
 try{
  const half=new Uint32Array(new Float32Array([.5]).buffer)[0];
  const ticket=await client.submit(frame,[[frame],[half]]);await ticket.completed;
  const scene=await client.inspectForTest(ticket.slot,1),display=await client.inspectDisplayForTest(ticket.slot);
  const reference=await ocioTransform(surfaceFromPixels(width,height,scene.pixels,{format:'rgba32float',alpha:'premultiplied',color:acescg}),
   {source:'ACEScg',display:'sRGB - Display',view:'ACES 2.0 - SDR 100 nits (Rec.709)',outputColor:srgb});
  const cpu=pixelsFromSurface(reference.surface),gpu=display.pixels;
  let maxContribution=0,maxAlpha=0;
  for(let i=0;i<gpu.length;i+=4){maxAlpha=Math.max(maxAlpha,Math.abs(cpu[i+3]-gpu[i+3]));for(let c=0;c<3;c++)maxContribution=Math.max(maxContribution,Math.abs(cpu[i+c]-gpu[i+c]));}
  assert.ok(maxContribution<=2/255,JSON.stringify({maxContribution,maxAlpha}));assert.equal(maxAlpha,0);
  const png=async(values:ArrayLike<number>,name:string)=>{
   const bytes=new Uint8Array(values.length);for(let i=0;i<bytes.length;i++)bytes[i]=i%4===3?255:Math.round(Math.max(0,Math.min(1,values[i]))*255);
   const file=join(out,name);await sharp(bytes,{raw:{width,height,channels:4}}).png().toFile(file);
   const decoded=await sharp(file).raw().toBuffer();assert.deepEqual(decoded,Buffer.from(bytes));
  };
  await png(gpu,'native-display-gpu-reference-readback.png');await png(cpu,'native-display-ocio-reference.png');
  const result={version:1,width,height,frame,maxContribution,maxAlpha,
   scope:'test-only F32 display readback, native swapchain also presented; not physical scanout capture',
   stats:await client.stats(),ocio:reference.provenance};
  await writeFile(join(out,'media.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await client.close();}
});
