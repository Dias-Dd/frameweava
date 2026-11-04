// One bounded checkpoint campaign; diagnostic reads never enter performance.
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../../src/compiler/build.ts';
import type {BuiltProject} from '../../src/core/types.ts';
import {Renderer} from '../../src/render/renderer.ts';
import type {NativeProgram,NativeGpuClient} from '../native-gpu/client.ts';
import {renderNativeProject} from '../native-gpu/service.ts';
import {linear709,pixelsFromSurface} from '../../src/media/surface.ts';
import {readExr} from '../../src/media/ocio.ts';
import {ffmpegPath} from '../../src/encoding/ffmpeg.ts';
import {referencePixels} from './reference.ts';
import {nativeImageEffectNames} from './images.ts';
import {geometrySeed} from './workload.ts';
import {extendedCases,extendedChainReference} from './extended-cases.ts';
import {additionalNativeEffectNames} from './extended.ts';
import {quantize} from '../gpu-image-effects/resident/foundations/reference.ts';
const exec=promisify(execFile),root=resolve('.'),dir=resolve(process.env.FRAMEWEAVE_NATIVE_EFFECTS_RUN!),phase=process.argv[2];
const exe=resolve('.frameweave/native-target',['gpu','contracts','extended','extendedChain','regression'].includes(phase)?'debug':'release','frameweave-native-gpu.exe');
const hash=(p:Float32Array|Buffer)=>createHash('sha256').update(new Uint8Array(p.buffer,p.byteOffset,p.byteLength)).digest('hex');
const save=async(name:string,value:unknown)=>writeFile(join(dir,name),JSON.stringify(value,null,2)+'\n');
// Diagnostic binary/private plan access is test-only, never an effect API.
interface DiagnosticRenderer {nativePlan:{program:NativeProgram};nativeClient:NativeGpuClient}
function internal(r:Renderer){return r as unknown as DiagnosticRenderer;}
function variant(b:BuiltProject,props:Record<string,boolean|string>){return {...b,manifest:{...b.manifest,stages:b.manifest.stages.map(s=>({...s,props:{...s.props,...props}}))}};}
async function renderer(b:BuiltProject,width:number,height:number){return Renderer.create({...b,manifest:{...b.manifest,composition:{...b.manifest.composition,width,height}}},{width,height,nativeGpu:{executable:exe,dynamic:'interactive',slots:1}});}
async function capture(r:Renderer,frame:number){const ticket=await r.submitNativeFrame(frame);await ticket.completed;const v=internal(r),program=v.nativePlan.program,final=program.passes.at(-1)!,published=final.output,source=0;
 return {ticket,source:new Float32Array((await v.nativeClient.inspectForTest(ticket.slot,source)).pixels),pixels:new Float32Array((await v.nativeClient.inspectForTest(ticket.slot,published)).pixels),output:new Float32Array((await v.nativeClient.inspectForTest(ticket.slot,final.output)).pixels)};}
function compare(a:Float32Array,b:Float32Array,tolerance:number){assert.equal(a.length,b.length);let max=0,worst=0;for(let i=0;i<a.length;i++){assert.ok(Number.isFinite(a[i]),'finite sample '+i);const e=Math.abs(a[i]-b[i]);if(e>max){max=e;worst=i;}}assert.ok(max<=tolerance,`max ${max} > ${tolerance}; sample ${worst}: ${a[worst]} vs ${b[worst]}`);return {max,worst,tolerance};}
await mkdir(dir,{recursive:true});
const compileStart=performance.now(),base=await buildProject(resolve('modules/native-effects/examples/combined.tsx')),compileMs=performance.now()-compileStart;
await save('compile.json',{compileMs,stages:base.manifest.stages.map(s=>({id:s.id,engine:s.engine})),source:base.manifest.composition});
if(phase==='gpu'){
 const results:unknown[]=[];
 for(const format of ['rgba32float','rgba16float'] as const){const half=format==='rgba16float',width=17,height=13,tolerance=half?6e-4:3e-6;
  const r=await renderer(variant(base,{format,partial:true,single:true}),width,height);
  try{for(let i=0;i<20;i++){const a=await capture(r,i),diff=compare(a.pixels,referencePixels(a.source,width,height,i,i,half),tolerance);results.push({effect:nativeImageEffectNames[i],format,...diff,hash:hash(a.pixels)});await save('numeric.json',results);}
   const c=new AbortController();c.abort();const before=await r.nativeStats();await assert.rejects(r.submitNativeFrame(0,{signal:c.signal}),{code:'E_RENDER_CANCELLED'});assert.equal((await r.nativeStats()).submitted,before.submitted);
  }finally{await r.close();await r.close();assert.equal(await r.nativeExited(),undefined);}
  const chain=await renderer(variant(base,{format,partial:true}),width,height),seen=new Map<number,string>();
  try{for(const frame of [12,0,6,239,0,12]){const a=await capture(chain,frame),diff=compare(a.pixels,referencePixels(a.source,width,height,frame,undefined,half),half?.003:6e-6),digest=hash(a.pixels);if(seen.has(frame))assert.equal(digest,seen.get(frame));seen.set(frame,digest);results.push({chain:20,format,frame,...diff,hash:digest});await save('numeric.json',results);}const stats=await chain.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.pixelTransferBytes,0);await save(format+'-stats.json',stats);}finally{await chain.close();}
 }
 const geometry=await renderer(variant(base,{geometryOnly:true}),8,1);
 try{const a=await capture(geometry,0),expected=new Float32Array(32);for(let i=0;i<8;i++){const [x,y,z]=geometrySeed.slice(i*3,i*3+3),t=.7*y+.2;expected.set([x*Math.cos(t)+z*Math.sin(t),y,z*Math.cos(t)-x*Math.sin(t),1],i*4);}results.push({geometry:'original twistPositions',...compare(a.pixels,expected,6e-6)});}finally{await geometry.close();}
 await save('result.json',{ok:true,compileMs,results});
}else if(phase==='contracts'){
 const checked=await renderer(await buildProject(resolve('modules/native-effects/examples/checks.tsx')),32,18);
 try{for(const frame of [0,119,239,6,0]){const ticket=await checked.submitNativeFrame(frame);await ticket.completed;}await save('lifecycle.json',{ok:true,checked:['foreign result','pre-cancel no recording','recipe exception cleanup','busy rejection','mid-recipe cancel cleanup','retained result','repeated dispose','closed rejection','shared owner remains alive'],stats:await checked.nativeStats()});}finally{await checked.close();await checked.close();await checked.nativeExited();}
 const gap=await renderer(await buildProject(resolve('modules/native-effects/examples/publication-gap.tsx')),32,18);
 try{const a=await capture(gap,0);assert.equal(a.source[3],2);assert.equal(a.pixels[3],1);await save('publication-policy.json',{observed:true,intermediate:Array.from(a.source.slice(0,4)),final:Array.from(a.pixels.slice(0,4)),policy:'Native production per-publication GPU numerical scanning is intentionally disabled by owner policy. This is not full Web rejection parity; callers must not rely on invalid intermediate values being rejected.',stats:await gap.nativeStats()});}finally{await gap.close();}
 await save('result.json',{ok:true});
}else if(phase==='regression'){
 const r=await renderer(variant(base,{partial:true}),32,18),results:unknown[]=[];
 try{for(const frame of [0,239,0]){const a=await capture(r,frame);results.push({frame,hash:hash(a.pixels),...compare(a.pixels,referencePixels(a.source,32,18,frame),6e-6)});}assert.equal((results[0] as {hash:string}).hash,(results[2] as {hash:string}).hash);await save('result.json',{ok:true,results,stats:await r.nativeStats()});}finally{await r.close();}
}else if(phase==='extended'){
 assert.equal(extendedCases.length,61);assert.deepEqual([...extendedCases.map(c=>c.name)].sort(),[...additionalNativeEffectNames].sort());const build=await buildProject(resolve('modules/native-effects/examples/extended-checks.tsx')),results:unknown[]=[];
 for(const format of ['rgba32float','rgba16float'] as const){const r=await renderer(variant(build,{format}),17,13);try{for(let i=0;i<extendedCases.length;i++){const c=extendedCases[i],a=await capture(r,i),expected=quantize(c.reference(a.source,17,13),format==='rgba16float');let maxScaled=0,worst=0;for(let j=0;j<expected.length;j++){assert.ok(Number.isFinite(a.pixels[j]),c.name+' finite sample '+j);const e=Math.abs(a.pixels[j]-expected[j])/Math.max(1,Math.abs(expected[j]));if(e>maxScaled){maxScaled=e;worst=j;}}const tolerance=format==='rgba16float'?6e-4:3e-6;assert.ok(maxScaled<=tolerance,JSON.stringify({effect:c.name,format,maxScaled,tolerance,worst,actual:a.pixels[worst],expected:expected[worst]}));results.push({effect:c.name,format,maxScaled,tolerance,hash:hash(a.pixels)});await save('numeric.json',results);}await save(format+'-stats.json',await r.nativeStats());}finally{await r.close();}}
 await save('result.json',{ok:true,results});
}else if(phase==='extendedChain'){
 const build=await buildProject(resolve('modules/native-effects/examples/extended-chain.tsx')),results:unknown[]=[];
 for(const format of ['rgba32float','rgba16float']){const r=await renderer(variant(build,{format,diagnosticRetain:true}),32,18),seen=new Map<number,string>();try{for(const frame of [12,0,119,239,0,12]){const a=await capture(r,frame),expected=extendedChainReference(a.source,32,18,frame,format==='rgba16float'),diff=compare(a.pixels,expected,format==='rgba16float'?.003:6e-6),digest=hash(a.pixels);if(seen.has(frame))assert.equal(digest,seen.get(frame));seen.set(frame,digest);results.push({frame,format,hash:digest,...diff});await save('numeric.json',results);}await save(format+'-stats.json',await r.nativeStats());}finally{await r.close();}}
 await save('result.json',{ok:true,results});
}else if(phase==='extendedMedia'){
 const build=await buildProject(resolve('modules/native-effects/examples/extended-chain.tsx')),results:unknown[]=[];process.env.FRAMEWEAVE_MEDIA_PYTHON=resolve('.frameweave/pme-python/Scripts/python.exe');
 for(const format of ['rgba32float','rgba16float']){const project=variant(build,{format}),output=join(dir,`${format}.exr`),exported=await renderNativeProject('modules/native-effects/examples/extended-chain.tsx',{build:project,output,native:exe,width:320,height:180,start:12,end:13});const decoded=await readExr(output,{color:linear709,alpha:'premultiplied'}),pixels=pixelsFromSurface(decoded.surface);assert.ok(pixels.every(Number.isFinite));assert.ok(pixels.some(v=>v>1));assert.ok(pixels.some(v=>v<0));results.push({format,hash:hash(pixels),exported});await save('media.json',results);}
 const png=join(dir,'extended.png'),pngResult=await renderNativeProject('modules/native-effects/examples/extended-chain.tsx',{build,output:png,native:exe,width:320,height:180,start:119,end:120}),image=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(image.data.length,320*180*4);results.push(pngResult);
 const mp4=join(dir,'extended.mp4'),mp4Result=await renderNativeProject('modules/native-effects/examples/extended-chain.tsx',{build,output:mp4,native:exe,width:320,height:180,start:0,end:3,encoder:'libx264'}),raw=await exec(ffmpegPath(),['-v','error','-i',mp4,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:8*1024*1024});assert.equal(raw.stdout.length,320*180*4*3);results.push(mp4Result);await save('result.json',{ok:true,results});
}else if(phase==='performance'){
 const isolated=await buildProject(resolve('modules/native-effects/examples/isolated.tsx')),results:unknown[]=[];
 let device:unknown,power:unknown;try{device=(await exec('nvidia-smi',['--query-gpu=name,driver_version,pstate,power.draw','--format=csv'],{windowsHide:true})).stdout;}catch(e){device=String(e);}try{power=(await exec('powercfg',['/getactivescheme'],{windowsHide:true})).stdout;}catch(e){power=String(e);}
 await save('environment.json',{date:new Date().toISOString(),platform:process.platform,device,power,measurement:'Node request through JS recording, submission and GPU completion; excludes file output, decode, scanout',softwareFallback:false});
 const summary=(samples:number[])=>{const sorted=[...samples].sort((a,b)=>a-b),n=sorted.length;return {n,median:n%2?sorted[n>>1]:(sorted[n/2-1]+sorted[n/2])/2,p95:sorted[Math.ceil(n*.95)-1],min:sorted[0],max:sorted[n-1],samples};};
 for(const [width,height] of [[1920,1080],[3840,2160]])for(const [layout,build] of [['isolated',isolated],['combined',base]] as const){const start=performance.now(),r=await renderer(build,width,height);try{
   const initialized=performance.now()-start,firstStart=performance.now(),t=await r.submitNativeFrame(0);await t.completed;const firstMs=performance.now()-firstStart;
   const groups={newFrames:Array.from({length:20},(_,i)=>i+1),repeated:Array(10).fill(20) as number[],random:[71,3,238,8,92,0,147,13,59,20]};const timings:Record<string,ReturnType<typeof summary>>={};for(const [name,frames] of Object.entries(groups)){const samples:number[]=[];for(const frame of frames){const begin=performance.now(),ticket=await r.submitNativeFrame(frame);await ticket.completed;samples.push(performance.now()-begin);}timings[name]=summary(samples);}
   const stats=await r.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.pixelTransferBytes,0);assert.equal(stats.imageReadbacks,0);results.push({layout,width,height,format:'rgba32float',stageCount:build.manifest.stages.length,initialized,firstMs,timings,stats});await save('performance.json',results);
  }finally{const close=performance.now();await r.close();await save(`${width}-${layout}-closed.json`,{closeMs:performance.now()-close,exited:await r.nativeExited()});}}
 await save('result.json',{ok:true,results});
}else if(phase==='media'){
 process.env.FRAMEWEAVE_MEDIA_PYTHON=resolve('.frameweave/pme-python/Scripts/python.exe');
 const isolated=await buildProject(resolve('modules/native-effects/examples/isolated.tsx')),results:unknown[]=[];
 // Production final-output A/B, same frame and quality; no diagnostic full-frame JSON channel.
 // Current encode.rs pack dispatch exceeds device X limit at 1080p Float32.
 // Preserve the failed original 10-media log. This smaller media check makes no
 // claim that the blocked 1080p/4K final-output qualification passed.
 for(const [width,height] of [[960,540]]){let expected:Float32Array|undefined;for(const [layout,build] of [['isolated',isolated],['combined',base]] as const){const file=join(dir,`${width}-${layout}.exr`),exported=await renderNativeProject('modules/native-effects/examples/combined.tsx',{build,width,height,start:12,end:13,output:file,native:exe});const decoded=await readExr(file,{color:linear709,alpha:'premultiplied'}),pixels=pixelsFromSurface(decoded.surface);if(expected)compare(pixels,expected,0);else expected=pixels;results.push({layout,width,height,hash:hash(pixels),exported,decoded:decoded.metadata});await save('media.json',results);}}
 for(const frame of [0,119,239,6]){const file=join(dir,`frame-${frame}.png`),exported=await renderNativeProject('modules/native-effects/examples/combined.tsx',{build:base,width:320,height:180,start:frame,end:frame+1,output:file,native:exe}),bytes=await readFile(file),png=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(png.info.width,320);assert.equal(png.info.height,180);results.push({frame,hash:hash(bytes),exported,png:{width:png.info.width,height:png.info.height,rgbaHash:hash(png.data)}});await save('media.json',results);}
 const file=join(dir,'twenty-effects.mp4'),exported=await renderNativeProject('modules/native-effects/examples/combined.tsx',{build:base,width:320,height:180,start:0,end:4,encoder:'libx264',output:file,native:exe}),decoded=await exec(ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:8*1024*1024});assert.equal(decoded.stdout.length,320*180*4*4);results.push({exported,decodedFrames:4,lossy:true,rgbaHash:hash(decoded.stdout)});await save('result.json',{ok:true,results});
}else throw Error('Unknown validation phase');
console.log(JSON.stringify({phase,ok:true,dir}));
