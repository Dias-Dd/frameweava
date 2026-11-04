import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';
import {linear709} from '../src/media/surface.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';

const exec=promisify(execFile),directory=resolve('artifacts/native-large-export');
const executable=resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'.frameweave/native-target/debug/frameweave-native-gpu.exe');
for(const [width,height] of [[1920,1080],[3840,2160]]){
 test(`real ${width}x${height} Float32 EXR packing crosses dispatch rows without changing any component`,async()=>{
  await mkdir(directory,{recursive:true});
  const scope=new NativeRecordingScope(),kernel=await scope.api.compile({abiVersion:1,id:'test/large-exr',version:'1.0.0',inputCount:0,parameterWords:0,code:
   'fn pixel(p:vec2u)->vec4f{return vec4f(-2.5+f32(p.x%17u)*.125,4.+f32(p.y%13u)*.25,f32((p.x+3u*p.y)%31u)/32.,.25+f32((p.x+p.y)%4u)*.125);}'});
  scope.publish(await scope.api.run(kernel,[],{output:{width,height,format:'rgba32float',alpha:'straight',color:linear709}}));
  const {parameters,output,external:_external,kernelOffset:_offset,...packet}=scope.packet();
  const file=resolve(directory,`${width}x${height}.exr`),program:NativeProgram={...packet,version:2,session:randomBytes(32).toString('hex'),slots:1,maxBytes:512*1024**2,display:null,
   export:{executable:ffmpegPath(),output:file,image:output,fps:[24,1],codec:'exr',format:'gbrapf32le',display:false}};
  const started=performance.now(),client=await NativeGpuClient.create(program,{executable});let stats:unknown;
  try{const ticket=await client.submit(0,parameters);await ticket.completed;stats=await client.stats();}finally{await client.close();await scope.api.dispose();}
  const encodedMs=performance.now()-started,n=width*height;
  const {stdout}=await exec(ffmpegPath(),['-v','error','-i',file,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',maxBuffer:n*16+1024*1024,windowsHide:true});
  assert.equal(stdout.length,n*16);
  let mismatches=0;let first:unknown;
  // Powers-of-two fractions are exactly representable in both F32 and JS.
  // Check every pixel of all four decoded planes, including row/plane borders.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=y*width+x,expected=[4+(y%13)*.25,((x+3*y)%31)/32,-2.5+(x%17)*.125,.25+((x+y)%4)*.125];
   for(let plane=0;plane<4;plane++){const actual=stdout.readFloatLE((plane*n+i)*4);if(actual!==expected[plane]){mismatches++;first??={x,y,plane,actual,expected:expected[plane]};}}
  }
  await writeFile(resolve(directory,`${width}x${height}.json`),JSON.stringify({version:1,width,height,format:'rgba32float',decodedComponents:n*4,mismatches,first:first??null,encodedMs,stats},null,2)+'\n');
  assert.equal(mismatches,0,JSON.stringify(first));
 });
}
