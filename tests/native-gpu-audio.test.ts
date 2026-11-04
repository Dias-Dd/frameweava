import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath,probeVideo} from '../src/encoding/ffmpeg.ts';
test('native GPU video keeps placed AU-1 audio through real MP4 mux and decode',async()=>{
 const base=resolve('.frameweave/na');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'a-')),entry=join(dir,'project.tsx');process.env.FRAMEWEAVE_HOME=join(dir,'home');
 await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {linear709} from '@frameweave/engine/native';import {defineAudioStage,generateAudio} from '@frameweave/engine/audio';
 export const picture=defineNativeStage(async init=>{const k=await init.gpu.compile({abiVersion:1,id:'test/native-audio',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(.1,.4,.6,1.);}'});return {renderAt(){return init.gpu.run(k,[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}});}};});
 export const tone=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:24000},()=>({evaluateInterval(r){return {audio:generateAudio(r.local,'mono',({time})=>.2*Math.sin(2*Math.PI*440*time))};}}));
 export default <Composition width={320} height={180} fps={24} durationInFrames={12} background="transparent"><Stage id="picture" factory={picture}/><Stage id="sound" factory={tone}/><Layer source={ref('picture')}/><Layer source={ref('sound','audio')}/></Composition>;`);
 const output=resolve('artifacts/native-gpu-v2/with-audio.mp4'),result=await renderNativeProject(entry,{output,maxConcurrency:8});
 assert.equal(result.frames,12);assert.equal(result.audio?.sampleCount,24000);assert.equal((await probeVideo(output)).frames,12);
 assert.equal(result.stats.sourceOutput.color.primaries,'rec709');assert.equal(result.stats.sourceOutput.color.transfer,'linear');
 const decoded=await promisify(execFile)(ffmpegPath(),['-v','error','-i',output,'-map','0:a:0','-ac','2','-ar','48000','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024**2,windowsHide:true}),samples=decoded.stdout.length/8;
 // AAC pads its final codec block; source PCM interval remains exact and the
 // decoded tail must be bounded to one AAC frame, never a dropped/shifted track.
 assert.ok(samples>=24000&&samples<=25024);let energy=0;for(let i=0;i<24000;i++)energy+=decoded.stdout.readFloatLE(i*8)**2;assert.ok(energy/24000>.005);assert.ok(energy/24000<.05);
});
