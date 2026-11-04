import test from 'node:test';import assert from 'node:assert/strict';
import{mkdir,mkdtemp,writeFile,readFile}from'node:fs/promises';import{resolve,join}from'node:path';
import{execFileSync}from'node:child_process';import sharp from'sharp';
import{linear709,pq2020,pixelsFromSurface}from'../src/media/surface.ts';import{readExr}from'../src/media/ocio.ts';import{inspectMediaFile}from'../src/media/encoding.ts';
import{renderNativeProject}from'../modules/native-gpu/service.ts';import{ffmpegPath}from'../src/encoding/ffmpeg.ts';
const native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
test('real TSX long state replay keeps one encoder and exports only complete frames',{timeout:60000},async()=>{
 const base=resolve('.frameweave/native-capacity/media');await mkdir(base,{recursive:true});
 const dir=await mkdtemp(join(base,'case-')),entry=join(dir,'project.tsx'),output=join(dir,'long.mp4');
 await writeFile(entry,`import{Composition,Stage,Layer,ref,linear709}from'@frameweave/engine';import{defineNativeStage,createNativeReplay}from'@frameweave/engine/native';
 export const scene=defineNativeStage(async init=>{const g=init.gpu,state=await g.createStateBuffer({type:'f32',length:1},new Float32Array([0]),{version:1,id:'value'}),replay=createNativeReplay(g,[state],{substeps:10});
 const add=await g.compileCompute({abiVersion:1,id:'test/capacity-add',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[1,1,1],code:'fn compute(p:vec3u,l:vec3u,w:vec3u){store0(0u,load0(0u)+1.);}'});
 const draw=await g.compile({abiVersion:2,id:'test/capacity-draw',version:'1.0.0',inputCount:0,dataInputs:[{type:'f32'}],parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(data0(0u)*.0005,.125,.25,1.);}'});
 return{async renderAt(c){await replay.record(c,async()=>{await g.dispatch(add,[state],{workItems:[1,1,1]});});return g.run(draw,[],{data:[state],output:{width:init.width,height:init.height,format:'rgba32float',alpha:'premultiplied',color:linear709}});}};});
 export default <Composition width={32} height={16} fps={24} durationInFrames={104}><Stage id="image" factory={scene}/><Layer source={ref('image')}/></Composition>;`);
 const result=await renderNativeProject(entry,{output,native,start:100,end:104,encoder:'libx264',maxConcurrency:1,maxBytes:32*1024**2});
 assert.equal(result.frames,4);const stats=result.stats as any;assert.equal(stats.export.framesWritten,4);assert.equal(stats.devicesCreated,1);assert.ok(stats.stateContinuations.segments>=8);assert.equal(stats.stateCheckpoints.count,0);
 const frames=join(dir,'decoded-%d.png');execFileSync(ffmpegPath(),['-v','error','-y','-i',output,'-fps_mode','passthrough',frames],{windowsHide:true,timeout:15000});
 for(let i=1;i<=4;i++){const image=await sharp(join(dir,'decoded-'+i+'.png')).raw().toBuffer();assert.ok(image.some(v=>v>64));}
 await assert.rejects(readFile(join(dir,'decoded-5.png')),{code:'ENOENT'});

 const exr=join(dir,'accurate.exr');await renderNativeProject(entry,{output:exr,native,start:100,end:101,encoder:'libx264',maxConcurrency:1,maxBytes:32*1024**2});
 const surface=(await readExr(exr,{color:linear709,alpha:'premultiplied'})).surface,values=pixelsFromSurface(surface);for(let i=0;i<values.length;i+=4)assert.deepEqual(Array.from(values.subarray(i,i+4)),[.5,.125,.25,1]);
 const hdr=join(dir,'hdr10.mp4'),hdrResult=await renderNativeProject(entry,{output:hdr,native,width:320,height:160,start:100,end:104,maxConcurrency:1,maxBytes:64*1024**2,professionalBackend:'gpu',professional:{schemaVersion:1,media:{workingColor:linear709},video:{preset:'hdr10',encoder:'hevc_nvenc',outputColor:pq2020,conversion:{kind:'ocio',clip:true,transform:{source:'Linear Rec.709 (sRGB)',display:'Rec.2100-PQ - Display',view:'ACES 2.0 - HDR 1000 nits (Rec.2020)'}},alpha:{mode:'flatten',matte:[0,0,0]},hdr10:{masteringDisplay:{red:[.708,.292],green:[.17,.797],blue:[.131,.046],white:[.3127,.329],minNits:.005,maxNits:1000},maxCLL:1000,maxFALL:400}}}});
 const probe=await inspectMediaFile(hdr),stream=probe.streams.find((s:any)=>s.codec_type==='video');assert.equal(stream.codec_name,'hevc');assert.equal(stream.pix_fmt,'yuv420p10le');assert.equal(stream.color_transfer,'smpte2084');assert.equal(stream.color_primaries,'bt2020');assert.equal((hdrResult.stats as any).nativeEncoding.completed,4);assert.equal((hdrResult.stats as any).nativeEncoding.cpuPixelReadbacks,0);assert.equal((hdrResult.stats as any).imageReadbacks,0);
 execFileSync(join(resolve(process.env.FRAMEWEAVE_FFPROBE!),'..','ffmpeg.exe'),['-v','error','-i',hdr,'-f','null','-'],{windowsHide:true,timeout:15000});
await writeFile(join(base,'result.json'),JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),entry,output,frames:result.frames,exr,hdr,hdrResult,probe,stats},null,2));
});
