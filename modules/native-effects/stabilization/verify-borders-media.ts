import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {nativeExecutable} from '../../native-gpu/executable.ts';
import {renderNativeProject} from '../../native-gpu/service.ts';
import {readExr} from '../../../src/media/ocio.ts';
import {pixelsFromSurface,surfaceFromPixels,linear709,srgb} from '../../../src/media/surface.ts';
import {mediaPreview} from '../../../src/media/node.ts';
import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';
const out=resolve(process.env.FRAMEWEAVE_BORDER_RUN!),entry=resolve('modules/native-effects/examples/stabilization-borders-scene.tsx'),rows:object[]=[],hash=(v:Float32Array)=>createHash('sha256').update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest('hex');
const save=(name:string,v:unknown)=>writeFile(join(out,name),JSON.stringify(v,null,2)+'\n');
try{
 const start=performance.now(),build=await buildProject(entry),compileMs=performance.now()-start,native=await nativeExecutable(),r=await Renderer.create(build,{cache:false,nativeGpu:{executable:native,dynamic:'interactive',slots:1}});let expected='';
 try{
  const ticket=await r.submitNativeFrame(3);await ticket.completed;
  const values=new Map<string,Float32Array>();
  for(const name of ['plain','framed','masked','result']){
   const data=await r.exportNativeBuffer(ticket,'borders/'+name);assert.ok(data.values instanceof Float32Array);values.set(name,data.values);
   const image=await mediaPreview(surfaceFromPixels(160,90,data.values,{color:linear709,alpha:'premultiplied',deferBase64:true}),{workingColor:linear709,preview:{color:srgb,clip:true}});
   await writeFile(join(out,name+'-preview.png'),image);
  }
  expected=hash(values.get('result')!);assert.notEqual(expected,hash(values.get('plain')!));
  assert.ok(values.get('result')!.some((v,i)=>i%4!==3&&v<0));assert.ok(values.get('result')!.some((v,i)=>i%4!==3&&v>1));
  await save('stats.json',await r.nativeStats());
 }finally{await r.close();await r.close();await r.nativeExited();await save('closed.json',{nativeExited:true,doubleClose:true});}
 const exr=join(out,'borders.exr'),exrStart=performance.now();await renderNativeProject(entry,{build,native,output:exr,start:3,end:4});
 assert.equal(hash(pixelsFromSurface((await readExr(exr,{color:linear709,alpha:'premultiplied'})).surface)),expected);
 rows.push({kind:'exr',file:exr,exactGpuHash:expected,format:'Float32',wallMs:performance.now()-exrStart});
 const png=join(out,'borders.png'),pngStart=performance.now();await renderNativeProject(entry,{build,native,output:png,start:3,end:4});
 const decoded=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,160);assert.equal(decoded.info.height,90);
 rows.push({kind:'png',file:png,rgbaSha256:createHash('sha256').update(decoded.data).digest('hex'),decodedBytes:decoded.data.length,wallMs:performance.now()-pngStart});
 const mp4=join(out,'borders.mp4'),mp4Start=performance.now();await renderNativeProject(entry,{build,native,output:mp4,start:0,end:3,encoder:'libx264'});
 const video=await promisify(execFile)(ffmpegPath(),['-v','error','-i',mp4,'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:4*1024**2});assert.equal(video.stdout.length,160*90*4*3);
 rows.push({kind:'mp4',file:mp4,decodedFrames:3,wallMs:performance.now()-mp4Start,policy:'Lossy SDR H264, independent decode; no float/HDR or PNG byte-parity claim'});
 await save('result.json',{ok:true,compileMs,rows});console.log(JSON.stringify({ok:true,rows:rows.length}));
}catch(error){await save('result.json',{ok:false,rows,error:String(error)});throw error;}
