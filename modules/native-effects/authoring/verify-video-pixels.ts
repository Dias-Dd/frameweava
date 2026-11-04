import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import sharp from 'sharp';import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';
const out=resolve(process.env.FRAMEWEAVE_AUTHORING_RUN!),base=resolve('artifacts/native-effects/authoring-video');
// Independent lossy-delivery gate, declared before comparison. No re-render.
// H264 YUV420 quantizes/chroma-subsamples; use mean RGB byte error, not exact PNG.
const budgetMeanRgbByteError=8;
const source=await sharp(join(base,'5-media/frame-0.png')).ensureAlpha().raw().toBuffer(),decoded=await promisify(execFile)(ffmpegPath(),['-v','error','-i',join(base,'5-media/look.mp4'),'-f','rawvideo','-pix_fmt','rgba','-'],{windowsHide:true,encoding:'buffer',maxBuffer:16*1024**2});
assert.equal(decoded.stdout.length,source.length*3);let total=0,foreground=0,background=0,fgCount=0,bgCount=0;const actual=decoded.stdout;
for(let i=0;i<source.length;i+=4){const alpha=source[i+3]/255;for(let c=0;c<3;c++)total+=Math.abs(actual[i+c]-source[i+c]*alpha);const luma=(actual[i]+actual[i+1]+actual[i+2])/3;if(alpha>.9){foreground+=luma;fgCount++;}if(alpha===0){background+=luma;bgCount++;}}
const result={version:1,meanRgbByteError:total/(source.length/4*3),budgetMeanRgbByteError,foregroundMean:foreground/fgCount,backgroundMean:bgCount?background/bgCount:null,reference:'Independent PNG preview composited on black using actual Alpha',decodedFrames:3,lossy:true};await writeFile(join(out,'result.json'),JSON.stringify(result,null,2)+'\n');
assert.ok(result.meanRgbByteError<=budgetMeanRgbByteError);assert.ok(result.foregroundMean>20);
