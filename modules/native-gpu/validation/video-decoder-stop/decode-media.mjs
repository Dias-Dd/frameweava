import assert from'node:assert/strict';import{writeFile}from'node:fs/promises';import{resolve,join}from'node:path';
import{probeVideo,ffmpegPath}from'../../../../src/encoding/ffmpeg.ts';
const dir=resolve('modules/native-gpu/validation/video-decoder-stop/evidence/media'),results=[];
for(const[name,frames]of [['roundtrip.mp4',6],['fast-hevc_nvenc.mp4',2],['fast-av1_nvenc.mp4',2]]){const result=await probeVideo(join(dir,name));assert.equal(result.decodable,true);assert.equal(result.frames,frames);results.push({file:name,...result});}
console.log(JSON.stringify({decoder:ffmpegPath(),results}));await writeFile(join(dir,'../decoded-media.json'),JSON.stringify({decoder:ffmpegPath(),results},null,2)+'\n');
