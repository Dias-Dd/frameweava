import {writeFile} from 'node:fs/promises';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';import {surfaceFromPixels,linear709} from '../../../src/media/surface.ts';
await promisify(execFile)(ffmpegPath(),['-v','error','-y','-f','lavfi','-i','testsrc2=s=320x180:r=24:d=1','-c:v','libx264','-crf','12','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv','-chroma_sample_location','left','modules/editing/examples/motion.mp4'],{windowsHide:true,timeout:15000});
const pixels=Float32Array.from(Array.from({length:32},(_,i)=>[.8,-.2,2.5,[1,.9,.5,.1,0,.25,.75,1][i%8]]).flat());
await writeFile('modules/editing/validation/second.surface.json',JSON.stringify(surfaceFromPixels(8,4,pixels,{color:linear709,format:'rgba32float',alpha:'straight'}))+'\n');
console.log(JSON.stringify({prepared:['examples/motion.mp4','validation/second.surface.json'],seconds:1}));
