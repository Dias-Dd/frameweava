import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ProfessionalOutputWorker} from '../src/media/output-worker.ts';
import {ProfessionalVideoEncoder,type ProfessionalEncodeOptions} from '../src/media/encoding.ts';
import {surfaceFromPixels,pixelsFromSurface,linear709,srgb} from '../src/media/surface.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');
const options:ProfessionalEncodeOptions={width:32,height:16,fps:{num:24,den:1},preset:'sdr-h264',encoder:'libx264',
  outputColor:srgb,conversion:{kind:'colorimetric',clip:true},alpha:{mode:'flatten',matte:[.1,.2,.3]}};
async function directory(){const parent=resolve('.frameweave/output-worker-tests');await mkdir(parent,{recursive:true});return mkdtemp(join(parent,'case-'));}
function surface(){return surfaceFromPixels(32,16,Float32Array.from({length:32*16*4},(_,i)=>[2,-.25,.5,.5][i%4]),{format:'rgba32float',color:linear709,alpha:'straight',deferBase64:true});}
test('output Worker preserves exact reference video, input ownership, busy semantics and repeated cleanup',async()=>{
  const dir=await directory(),reference=await ProfessionalVideoEncoder.create(join(dir,'reference.mp4'),options);
  const worker=await ProfessionalOutputWorker.create(join(dir,'worker.mp4'),options);
  const input=surface(),before=pixelsFromSurface(input);
  try{
    const pending=worker.write(input);
    await assert.rejects(worker.write(input),{code:'E_MEDIA_ENCODER_BUSY'});
    await assert.rejects(worker.finish(),{code:'E_MEDIA_ENCODER_BUSY'});
    await pending;await reference.write(input);
    for(let i=1;i<4;i++){await worker.write(input);await reference.write(input);}
    const [a,b]=await Promise.all([worker.finish(),reference.finish()]);assert.equal(a.frames,4);assert.equal(b.frames,4);
    assert.deepEqual(pixelsFromSurface(input),before);
    const decode=async(name:string)=>(await promisify(execFile)(ffmpegPath(),['-v','error','-i',join(dir,name),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{encoding:'buffer',windowsHide:true})).stdout;
    assert.deepEqual(await decode('worker.mp4'),await decode('reference.mp4'));
    await assert.rejects(worker.write(input),{code:'E_MEDIA_ENCODER_CLOSED'});
  }finally{await worker.abort();await worker.abort();}
});
test('output Worker propagates initialization/frame failures and cleans up after errors',async()=>{
  const dir=await directory();
  await assert.rejects(ProfessionalOutputWorker.create(join(dir,'invalid.mp4'),{...options,encoder:'invalid' as any}),{code:'E_MEDIA_CODEC'});
  const worker=await ProfessionalOutputWorker.create(join(dir,'size.mp4'),options);
  const bad=surfaceFromPixels(2,2,new Float32Array(16),{color:linear709,format:'rgba32float',alpha:'straight',deferBase64:true});
  await assert.rejects(worker.write(bad),{code:'E_MEDIA_ENCODE_SIZE'});await worker.abort();await worker.abort();
});
test('output Worker retains exact-duration stereo PCM through the existing audio mux path',async()=>{
  const dir=await directory(),samples=8000,pcm=new Float32Array(samples*2),audio=join(dir,'stereo.f32');
  for(let i=0;i<samples;i++){pcm[i*2]=.2*Math.sin(i*2*Math.PI*440/48000);pcm[i*2+1]=.2*Math.sin(i*2*Math.PI*660/48000);}
  await writeFile(audio,new Uint8Array(pcm.buffer));
  const output=join(dir,'audio.mp4'),worker=await ProfessionalOutputWorker.create(output,{...options,
    audio:{path:audio,sampleRate:48000,channels:2,channelLayout:'stereo',format:'f32le',startSample:0}});
  try{
    for(let i=0;i<4;i++)await worker.write(surface());const report=await worker.finish();assert.equal(report.frames,4);
    const bytes=(await promisify(execFile)(ffmpegPath(),['-v','error','-i',output,'-map','0:a:0','-f','f32le','-acodec','pcm_f32le','pipe:1'],{encoding:'buffer',windowsHide:true})).stdout;
    assert.ok(bytes.length>=samples*2*4);let left=0,right=0,difference=0;
    for(let i=1024;i<7000;i++){const a=bytes.readFloatLE(i*8),b=bytes.readFloatLE(i*8+4);left+=a*a;right+=b*b;difference+=(a-b)**2;}
    assert.ok(left>20&&right>20&&difference>20);
  }finally{await worker.abort();}
});
