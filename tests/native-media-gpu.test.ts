import test from 'node:test';import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';import {prepareNativeMediaExport} from '../modules/native-gpu/media-export.ts';
import {injectHdrMetadata} from '../src/media/hdr-metadata.ts';
import {linear2020,pq2020,surfaceFromPixels,pixelsFromSurface} from '../src/media/surface.ts';import {ocioTransform} from '../src/media/ocio.ts';import {inspectMediaFile} from '../src/media/encoding.ts';
const native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
export const mastering={masteringDisplay:{red:[.708,.292] as [number,number],green:[.17,.797] as [number,number],blue:[.131,.046] as [number,number],white:[.3127,.329] as [number,number],minNits:.005,maxNits:1000},maxCLL:1000,maxFALL:400};
test('native OCIO GPU colour matches reference across HDR/negative RGB/alpha; direct 10-bit encoder reads GPU resources',async()=>{
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_MEDIA_RUNTIME=resolve('.frameweave/native-media/runtime');
 const parent=resolve('artifacts/native-hardware-media');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'colour-'));
 for(const codec of ['hevc_nvenc','av1_nvenc'] as const){
  const file=join(dir,codec==='av1_nvenc'?'gpu.ivf':'gpu.hevc'),s=new NativeRecordingScope(),g=s.api;
  const kernel=await g.compile({abiVersion:1,id:'test/ocio-gpu-grid',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{let values=array<f32,12>(-.25,0.,.001953125,.125,.25,.5,1.,2.,4.,8.,16.,64.);let alpha=array<f32,4>(0.,.25,.5,1.);return vec4f(values[p.x%12u],values[(p.y/4u)%12u],values[(p.x/12u)%12u],alpha[(p.y/16u)%4u]);}'});
  const image=await g.run(kernel,[],{output:{width:320,height:180,format:'rgba32float',alpha:'straight',color:linear2020}});s.publish(image);const {parameters,output,external:_e,kernelOffset:_k,moduleOffset:_m,resourceImages:_r,...packet}=s.packet();
  const transform={source:'Linear Rec.2020',display:'Rec.2100-PQ - Display',view:'ACES 2.0 - HDR 1000 nits (Rec.2020)'};
  const prepared=await prepareNativeMediaExport(file,linear2020,{preset:'hdr10',encoder:codec,width:320,height:180,fps:{num:60,den:1},outputColor:pq2020,conversion:{kind:'ocio',clip:true,transform},alpha:{mode:'flatten',matte:[0,0,0]},hdr10:mastering});
  const p:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:2,maxBytes:256*1024**2,display:null,mediaExport:{...prepared,image:output,alpha:2}};
  const client=await NativeGpuClient.create(p,{executable:native});let failure:unknown;
  try{
   const ticket=await client.submit(0,parameters);await ticket.completed;
   const input=(await client.inspectForTest(ticket.slot,output)).pixels;
   const flattened=Float32Array.from(input,(v,i)=>i%4===3?1:v*input[i-i%4+3]);
   const reference=pixelsFromSurface((await ocioTransform(surfaceFromPixels(320,180,flattened,{format:'rgba32float',color:linear2020,alpha:'opaque'}),{...transform,outputColor:pq2020})).surface);
   const gpu=(await client.inspectMediaForTest(ticket.slot)).pixels;let maxError=0,squared=0,at=0;
   for(let i=0;i<gpu.length;i++){const e=Math.abs(gpu[i]-Math.max(0,Math.min(1,reference[i])));if(e>maxError){maxError=e;at=i;}squared+=e*e;}
   await writeFile(join(dir,'numeric-debug.json'),JSON.stringify({maxError,at,input:input.slice(at-at%4,at-at%4+4),gpu:gpu.slice(at-at%4,at-at%4+4),cpu:reference.slice(at-at%4,at-at%4+4)}));
   await writeFile(join(dir,'reference.f32'),Buffer.from(reference.buffer));await writeFile(join(dir,'gpu.f32'),Buffer.from(Float32Array.from(gpu).buffer));
   assert.ok(maxError<=.0002,JSON.stringify({codec,maxError,at,gpu:gpu[at],cpu:reference[at]}));
   const batch=await client.submitBatch([{frame:1,parameters},{frame:2,parameters}]);await Promise.all(batch.map(t=>t.completed));
   const stats=await client.stats();assert.equal(stats.nativeEncoding.completed,3);assert.equal(stats.nativeEncoding.cpuPixelReadbacks,0);assert.equal(stats.nativeEncoding.cpuPixelUploads,0);assert.equal(stats.bufferExports.readbacks,0);assert.equal(stats.imageReadbacks,0);assert.equal(stats.export.hardwareEncode,true);assert.equal(stats.export.bytes,0);
   await writeFile(join(dir,codec+'.json'),JSON.stringify({maxError,rms:Math.sqrt(squared/gpu.length),at,stats,provenance:prepared.provenance},null,2));console.log(JSON.stringify({case:'native-direct-colour',codec,file,maxError,rms:Math.sqrt(squared/gpu.length),at,stats}));
   await client.reconfigure({...p,slots:1});assert.equal((await client.stats()).nativeEncoding.residentSlots,1);const next=await client.submit(3,parameters);await next.completed;await client.reconfigure({...p,slots:3});const more=await client.submitBatch([4,5,6].map(frame=>({frame,parameters})));await Promise.all(more.map(t=>t.completed));assert.equal((await client.stats()).nativeEncoding.residentSlots,3);
  }catch(e){failure=e;console.error('primary media failure',e);throw e;}finally{try{await client.close();}catch(e){if(!failure)throw e;console.error('media cleanup failure',e);}await g.dispose();}
  const tagged=file+'.tagged';if(codec==='av1_nvenc')await injectHdrMetadata(file,tagged,'av1',mastering);
  const meta=await inspectMediaFile(codec==='av1_nvenc'?tagged:file),stream=meta.streams[0];assert.equal(stream.codec_name,codec==='av1_nvenc'?'av1':'hevc');assert.equal(stream.pix_fmt,'yuv420p10le');
  const side=meta.frames.find((f:any)=>f.media_type==='video')?.side_data_list??[];
  assert.ok(side.some((v:any)=>v.side_data_type==='Mastering display metadata'));assert.ok(side.some((v:any)=>v.side_data_type==='Content light level metadata'&&v.max_content===1000));
 }
});
