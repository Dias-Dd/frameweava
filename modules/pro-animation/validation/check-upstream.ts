import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {upstreamFixture} from './prepare-upstream.ts';
import {methods} from './upstream-scene/settings.ts';
import {planTrace} from './upstream-scene/plans.ts';
import {shutterTimeSamples} from '../src/native-time/plans.ts';
import {fromHalf,toHalf} from '../../../src/media/surface.ts';
import {temporalReference} from './native-time-reference.ts';
const root=resolve(import.meta.dirname,'../../..'),out=join(root,'.frameweave/pa3-upstream'),start=performance.now(),records:any[]=[];await mkdir(join(out,'media'),{recursive:true});
process.env.FRAMEWEAVE_HOME=join(root,'.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY=join(root,'outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');process.env.FRAMEWEAVE_NATIVE_GPU=join(root,'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe');process.env.FRAMEWEAVE_MEDIA_PYTHON=join(root,'.frameweave/pa3-native-controls/media-python/Scripts/python.exe');
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex'),bytes=(p:Float32Array)=>new Uint8Array(p.buffer,p.byteOffset,p.byteLength),exec=promisify(execFile);
function compare(a:any,b:any,path='$'):number{if(typeof b==='number'){assert.equal(typeof a,'number',path);const error=Math.abs(a-b);assert.ok(error<=1e-9*Math.max(1,Math.abs(b)),path+':'+error);return error;}if(b&&typeof b==='object'){assert.deepEqual(Object.keys(a),Object.keys(b),path);return Math.max(0,...Object.keys(b).map(k=>compare(a[k],b[k],path+'.'+k)));}assert.equal(a,b,path);return 0;}
function oracle(c:any,half:boolean){const f=Math.fround,q=(n:number)=>half?fromHalf(toHalf(n)):f(n),samples=[...shutterTimeSamples({count:3,angleDegrees:360},c)];return Float32Array.from({length:64*32*4},(_,i)=>{
 const x=Math.floor(i/4)%64,y=Math.floor(i/(4*64)),channel=i%4;
 const value=temporalReference(samples.map(s=>{const center=f(8+3*s.context.frame),hit=Math.abs(x+.5-center)<1.75&&Math.abs(y+.5-16)<8,u=Math.max(0,Math.min(1,s.context.frame/7)),gain=f(1-.5*u*u),source=[f(2+f(f(s.context.globalFrame)*.03125)),-.25,f(8+f(f(s.context.progress)*.25)),.5];return {pixel:source.map(n=>hit?q(q(n)*gain):0) as any,weight:s.weight};}),'weighted-mean')[channel];return q(value);
 });}
const resume=process.argv.includes('--after-comparison');if(resume){const previous=JSON.parse(await readFile(join(out,'failed-resident-stats-field.json'),'utf8'));assert.equal(previous.records.filter((r:any)=>r.method).length,80);records.push(...previous.records,{phase:'reuse-completed-comparisons',source:'failed-resident-stats-field.json',reason:'Only the stats assertion used a nonexistent field; completed 80 GPU comparisons remain unchanged.'});}
let ok=false;
try{
 const prep=performance.now(),fixture=await upstreamFixture(resume);records.push({phase:'bundle-and-private-R1-install',ms:performance.now()-prep,receipt:fixture.receipt});
 const {buildProject}=await fixture.api('src/compiler/build.ts'),{Renderer}=await fixture.api('src/render/renderer.ts'),{frameContext}=await fixture.api('src/core/time.ts');
 const config={nativeGpu:{executable:process.env.FRAMEWEAVE_NATIVE_GPU,dynamic:'interactive',slots:2}} as any;
 let residentBuild:any;
 if(resume)residentBuild=await buildProject(join(fixture.project,'project.tsx'));
 for(const entry of resume?[]:['project','half']){
  const began=performance.now(),build=await buildProject(join(fixture.project,entry+'.tsx')),renderer=await Renderer.create(build,config);if(entry==='project')residentBuild=build;
  try{const seen=new Map<string,string>();for(const frame of [3,0,7,3]){
   const at=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   for(const [i,method]of methods.entries()){
    const a=await renderer.exportNativeBuffer(ticket,'m'+i+'/pixels'),b=await renderer.exportNativeBuffer(ticket,'r'+i+'/pixels');assert.ok(a.values instanceof Float32Array&&b.values instanceof Float32Array);assert.equal(a.values.length,64*32*4);let maxError=0;for(let n=0;n<a.values.length;n++){assert.ok(Number.isFinite(a.values[n]));maxError=Math.max(maxError,Math.abs(a.values[n]-b.values[n]));if(n%4===3)assert.ok(a.values[n]>=0&&a.values[n]<=1);if(entry==='half')assert.equal(a.values[n],fromHalf(toHalf(a.values[n])));}
    assert.ok(maxError<=5e-7,JSON.stringify({entry,method,frame,maxError}));
    const digest=hash(bytes(a.values)),key=method+':'+frame;if(seen.has(key))assert.equal(digest,seen.get(key));seen.set(key,digest);
    let oracleError:number|undefined;
    if(method==='shutterBlur'){const c=frameContext(build.manifest,build.manifest.stages.find((s:any)=>s.id==='m'+i),frame),expected=oracle(c,entry==='half');oracleError=0;for(let n=0;n<expected.length;n++)oracleError=Math.max(oracleError,Math.abs(a.values[n]-expected[n]));assert.ok(oracleError<=4e-6,JSON.stringify({entry,frame,oracleError}));assert.ok(a.values.some((v:number,n:number)=>n%4!==3&&v<0));assert.ok(a.values.some((v:number,n:number)=>n%4!==3&&v>1));assert.ok(a.values.some((v:number,n:number)=>n%4===3&&v===0));}
    records.push({entry,frame,method,maxError,oracleError,sha256:digest});
   }
   const trace=await renderer.exportNativeBuffer(ticket,'m0/trace');assert.ok(trace.values instanceof Uint32Array);let text='';for(const n of trace.values)text+=String.fromCharCode(n);const expected=planTrace(frameContext(build.manifest,build.manifest.stages.find((s:any)=>s.id==='m0'),frame)),planError=compare(JSON.parse(text),expected);assert.equal(Object.keys(expected).length,12);records.push({entry,frame,planError,planFunctions:12,frameMs:performance.now()-at});
  }const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);records.push({entry,totalMs:performance.now()-began,stats,diagnostic:'Explicit buffer exports above are readbacks; not a zero-readback run.'});
  }finally{await renderer.close();}
 }
 // No exports/readbacks in this separate resident three-frame run.
 const resident=await Renderer.create(residentBuild,config);try{const tickets=await resident.submitNativeBatch([0,3,7]);await Promise.all(tickets.map((t:any)=>t.completed));const stats=await resident.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);assert.equal(stats.diagnosticReadbacks,0);records.push({phase:'resident-batch',stats});}finally{await resident.close();}
 for(const mode of ['cancel','parameters','callback']){
  const build=await buildProject(join(fixture.project,mode+'.tsx')),renderer=await Renderer.create(build,config);try{let digest:string|undefined;for(const frame of [0,3,0]){const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;const result=await renderer.exportNativeBuffer(ticket,'preview/pixels');assert.ok(result.values instanceof Float32Array);if(frame===0){const actual=hash(bytes(result.values));if(digest)assert.equal(actual,digest);digest=actual;}}records.push({phase:'failure-rollback-and-reuse',mode,frames:[0,3,0],ok:true,stats:await renderer.nativeStats()});}finally{await renderer.close();}
 }
 const {renderNativeProject}=await fixture.api('modules/native-gpu/service.ts'),{ffmpegPath,probeVideo}=await fixture.api('src/encoding/ffmpeg.ts');
 for(const entry of ['preview','preview-half']){
  const project=join(fixture.project,entry+'.tsx'),build=await buildProject(project),renderer=await Renderer.create(build,config);let reference:Float32Array;
  try{const ticket=await renderer.submitNativeFrame(3);await ticket.completed;reference=(await renderer.exportNativeBuffer(ticket,'preview/pixels')).values as Float32Array;await writeFile(join(out,'media',entry+'.f32'),bytes(reference));}finally{await renderer.close();}
  for(const extension of entry==='preview'?['png','exr','mp4']:['exr']){
   const output=join(out,'media',entry+'.'+extension),movie=extension==='mp4',begin=performance.now(),result=await renderNativeProject(project,{build,native:process.env.FRAMEWEAVE_NATIVE_GPU,output,start:movie?0:3,end:movie?8:4,encoder:'libx264',initialConcurrency:1,maxConcurrency:1});assert.equal(result.stats.devicesCreated,1);assert.equal(result.stats.webBridge.enabled,false);assert.equal(result.stats.diagnosticReadbacks,0);const file=await readFile(output),record:any={entry,extension,ms:performance.now()-begin,bytes:file.length,sha256:hash(file),stats:result.stats};
   if(extension==='exr'){
    const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2});assert.equal(stdout.length,160*64*16);let maxError=0,low=Infinity,high=-Infinity;for(let n=0;n<reference!.length;n++){const c=n%4,v=stdout.readFloatLE(([2,0,1,3][c]*160*64+Math.floor(n/4))*4);maxError=Math.max(maxError,Math.abs(v-reference![n]));if(c<3){low=Math.min(low,v);high=Math.max(high,v);}}assert.ok(maxError<=4e-5,JSON.stringify({entry,maxError}));assert.ok(low<0&&high>1);Object.assign(record,{maxError,low,high});
   }else if(extension==='png'){
    const image=await sharp(file).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,160);assert.equal(image.info.height,64);assert.equal(image.info.channels,4);let alphaError=0;for(let i=0;i<160*64;i++)alphaError=Math.max(alphaError,Math.abs(reference![i*4+3]-image.data[i*4+3]/255));assert.ok(alphaError<=1/255+1e-6);assert.ok(image.data.some((v:number,i:number)=>i%4===3&&v===0));await sharp(file).flatten({background:'#000000'}).png().toFile(join(out,'media/preview-black.png'));record.alphaError=alphaError;
   }else{
    const video=await probeVideo(output);assert.ok(video.decodable);assert.equal(video.frames,8);const {stdout}=await exec(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{windowsHide:true,encoding:'buffer',maxBuffer:1024**2}),size=160*64*3;assert.equal(stdout.length,size*8);assert.notDeepEqual(stdout.subarray(0,size),stdout.subarray(7*size,8*size));for(const frame of [0,3,7])await sharp(stdout.subarray(frame*size,(frame+1)*size),{raw:{width:160,height:64,channels:3}}).png().toFile(join(out,'media/decoded-'+frame+'.png'));record.video=video;
   }records.push(record);
  }
 }
 // Verify that the isolated candidate source remained byte-identical after execution.
 const receipt=JSON.parse(await readFile(join(out,'consumer-source.json'),'utf8'));for(const file of receipt.files)assert.equal(hash(await readFile(join(fixture.core,file.path))),file.sha256,file.path);records.push({phase:'candidate-source-authenticity',files:receipt.files.length,unchanged:true});
 ok=true;
}finally{const proof={version:1,ok,seconds:(performance.now()-start)/1000,records,scope:'Exact frozen candidate Core consumer, same-Stage sealed stateless two-step R1 prefix only. Ten existing GPU image operations and twelve existing time/plan functions; one new thin factory, no new timeline/query algorithm. Candidate not a Main release. No arbitrary JS, cross-Stage/history/VSHARED, external image import, or export-mode coverage claim.'};await writeFile(join(out,'result.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({ok,seconds:proof.seconds,records:records.length}));}
