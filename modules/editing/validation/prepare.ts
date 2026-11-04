import {writeFile,mkdir,copyFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {resolve} from 'node:path';import sharp from 'sharp';
import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';import {surfaceFromPixels,linear709} from '../../../src/media/surface.ts';
const exec=promisify(execFile);await mkdir('modules/editing/examples',{recursive:true});
await exec(ffmpegPath(),['-v','error','-y','-f','lavfi','-i','color=white:s=320x180:r=24:d=0.5','-f','lavfi','-i','color=black:s=320x180:r=24:d=0.5','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-crf','0','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-chroma_sample_location','left','modules/editing/examples/footage.mp4'],{windowsHide:true,timeout:15000});
const alphas=[0,.1,.25,.5,.75,.9,1,0],values=Float32Array.from(Array.from({length:32},(_,i)=>[2,.2,-.1,alphas[i%8]]).flat());
await copyFile('modules/editing/examples/footage.mp4','modules/editing/validation/footage.mp4');
await writeFile('modules/editing/validation/input.surface.json',JSON.stringify(surfaceFromPixels(8,4,values,{color:linear709,format:'rgba32float',alpha:'straight'}))+'\n');
const rgba=Buffer.alloc(80*80*4);for(let y=0;y<80;y++)for(let x=0;x<80;x++){const d=Math.hypot(x-39.5,y-39.5),n=(y*80+x)*4;rgba[n]=255;rgba[n+1]=180;rgba[n+2]=32;rgba[n+3]=Math.round(Math.max(0,Math.min(1,36-d))*255);}await sharp(rgba,{raw:{width:80,height:80,channels:4}}).png().toFile('modules/editing/examples/badge.png');
console.log(JSON.stringify({prepared:['footage.mp4','badge.png','input.surface.json'],root:resolve('modules/editing')}));
