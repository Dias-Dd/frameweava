import assert from'node:assert/strict';import{writeFile,readFile}from'node:fs/promises';import{resolve,join}from'node:path';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{renderNativeProject}from'../../../native-gpu/service.ts';import{ffmpegPath}from'../../../../src/encoding/ffmpeg.ts';
const{root}=JSON.parse(await readFile('.frameweave/servo-authoring/latest.json','utf8')),output=join(root,'hdr-overlay.exr');
await renderNativeProject(resolve('modules/servo/examples/hdr-overlay.tsx'),{native:resolve('.frameweave/native-target/release/frameweave-native-gpu.exe'),output,start:0,end:1,maxConcurrency:1});
const raw=(await promisify(execFile)(ffmpegPath(),['-v','error','-i',output,'-f','rawvideo','-pix_fmt','gbrapf32le','pipe:1'],{encoding:'buffer',maxBuffer:4*1024**2,windowsHide:true})).stdout,n=320*180,pixel=(x:number,y:number)=>[2,0,1,3].map(plane=>raw.readFloatLE((plane*n+y*320+x)*4));
const outside=pixel(240,90),inside=pixel(40,90),a=2-inside[0];assert.deepEqual(outside,[2,-.25,.5,1]);assert.ok(Math.abs(a-.5)<=1/255+1e-6);assert.ok(Math.abs(inside[1]-(-.25+1.25*a))<2e-6);assert.ok(Math.abs(inside[2]-(.5+.5*a))<2e-6);assert.equal(inside[3],1);
const result={version:1,output,outside,inside,hdrNegativePreserved:true};await writeFile(join(root,'hdr.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
