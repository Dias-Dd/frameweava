// Run in an installed npm consumer: node verify-hdr.mjs project.tsx hdr10.mp4 proof.json
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import * as sdk from '@frameweave/engine/node';
const [project,movie,output]=process.argv.slice(2);if(!project||!movie||!output)throw Error('project, movie and proof output are required');
const budget=.03,policy={workingColor:sdk.acescg,transport:'buffer-v1',preview:{color:sdk.srgb,clip:true}};
const renderer=await sdk.Renderer.create(await sdk.buildProject(project),{cache:false,media:policy}),frames=[];
try{for(let frame=0;frame<9;frame++)frames.push((await renderer.renderMediaFrame(frame)).surface);}finally{await renderer.close();}
const decoded=(await promisify(execFile)(sdk.ffmpegPath(),['-hide_banner','-loglevel','error','-i',movie,'-f','rawvideo','-pix_fmt','gbrpf32le','pipe:1'],{encoding:'buffer',maxBuffer:8*1024*1024,windowsHide:true})).stdout;
const n=frames[0].width*frames[0].height;assert.equal(decoded.byteLength,n*3*4*frames.length);
const codes=new Float32Array(decoded.buffer.slice(decoded.byteOffset,decoded.byteOffset+decoded.byteLength)),errors=[];
for(let f=0;f<frames.length;f++){
 const s=frames[f],pixels=sdk.pixelsFromSurface(s);
 for(let i=0;i<pixels.length;i+=4){if(s.alpha!=='premultiplied')for(let c=0;c<3;c++)pixels[i+c]*=pixels[i+3];pixels[i+3]=1;}
 const expected=sdk.transformPixels(pixels,s.color,{...sdk.pq2020,peakNits:4000},'opaque',true).pixels;let sum=0,max=0;
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const d=Math.abs(codes[f*n*3+[2,0,1][c]*n+i]-expected[i*4+c]);sum+=d;max=Math.max(max,d);}
 const mean=sum/(n*3);assert.ok(mean<=budget,`frame ${f}: ${mean} exceeds original PQ budget ${budget}`);errors.push({frame:f,meanAbsolutePQCodeError:mean,maxAbsolutePQCodeError:max});
}
const result={project,movie,decodedFrames:frames.length,width:frames[0].width,height:frames[0].height,budget,errors,maxMeanError:Math.max(...errors.map(e=>e.meanAbsolutePQCodeError)),maxEdgeError:Math.max(...errors.map(e=>e.maxAbsolutePQCodeError)),limitations:'Lossy HEVC/YUV420; black flatten and negative/PQ clipping are explicit delivery operations. Maximum edge error is not a lossless precision claim.'};
await writeFile(output,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
