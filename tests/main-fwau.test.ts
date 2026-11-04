import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {Composition,Stage,Layer,Rect,ref,content,planOutput,validateTVG} from '../src/index.ts';
import {defineAudioStage,generateAudio,readWavBlock,audioSamples} from '../src/audio/index.ts';
import {renderCreation} from '../src/authoring-tools/index.ts';
import {engineRoot} from '../src/compiler/build.ts';
import {openRenderSession} from '../modules/render-session/index.ts';
import {intervalFrame} from '../src/audio/execution.ts';
import {frameToSample} from '../src/audio/time.ts';
const factory=()=>defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:4000},()=>({evaluateInterval(r){return {audio:generateAudio(r.local,'mono',()=>.25)};}}));
test('ordinary Stage recognizes audio marker and retains Web/default ref contracts',()=>{
 const f=factory(),s=Stage({id:'a',factory:f});assert.equal(s.spec.engine,'audio');assert.deepEqual(s.spec.outputs,{audio:'audio'});
 assert.throws(()=>Stage({id:'bad',factory:f,engine:'web'}),{code:'E_ENGINE_INCOMPATIBLE'});
 assert.throws(()=>Stage({id:'bad',factory:()=>({renderAt(){return {};}}),audio:f[Symbol.for('@frameweave/engine.audio-stage') as keyof typeof f] as any}),{code:'E_AUDIO_FACTORY'});
 assert.equal(Stage({id:'v',children:Rect({})}).spec.engine,'web');assert.deepEqual(ref('a'),{$ref:'a',port:'surface'});
 const implicit=Composition({width:32,height:24,fps:12,children:s});assert.equal(implicit.composition.durationInFrames,1);assert.equal(planOutput(implicit).format,'wav');assert.deepEqual(validateTVG(implicit),[]);
});
test('placed finite content determines duration; unrelated audio does not extend it',()=>{
 const unused=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:480000},()=>({evaluateInterval(r){return {audio:generateAudio(r.local,'mono',()=>0)};}}));
 const tvg=Composition({width:32,height:24,fps:12,children:[Stage({id:'unused',factory:unused}),Stage({id:'v',children:Rect({})}),Layer({source:content.image(ref('v'))})]});
 assert.equal(tvg.composition.durationInFrames,1);assert.equal(tvg.layers.length,1);assert.equal(planOutput(tvg).format,'png');assert.deepEqual(validateTVG(tvg),[]);
 const placed=Composition({width:1,height:1,fps:12,children:[Stage({id:'a',factory:factory()}),Layer({source:ref('a','audio'),start:3})]});assert.equal(placed.composition.durationInFrames,4);
 const fractional=Composition({width:1,height:1,fps:12,children:[Stage({id:'a',factory:factory()}),Layer({source:content.audio(ref('a','audio'),{sampleRate:48000,durationSamples:4000}),start:3,audio:{startSample:12007}})]});assert.equal(fractional.composition.durationInFrames,5);
});
test('sample to frame inversion includes exact NTSC Stage start boundaries',()=>{
 const tvg=Composition({width:1,height:1,fps:{num:30000,den:1001},durationInFrames:30,children:Stage({id:'v',children:Rect({})})});
 for(let f=0;f<29;f++){const start=frameToSample(f,48000,tvg.composition.fps),end=frameToSample(f+1,48000,tvg.composition.fps);assert.equal(intervalFrame(tvg,{unit:'samples',sampleRate:48000,start,endExclusive:start+1}),f);if(end>start+1)assert.equal(intervalFrame(tvg,{unit:'samples',sampleRate:48000,start:end-1,endExclusive:end}),f);}
});
test('one authored video Layer explicitly links audio; colocated ports are not implicitly linked',()=>{
 const a=Stage({id:'a',factory:factory()}),v=Stage({id:'v',children:Rect({})});
 const tvg=Composition({width:32,height:24,fps:12,children:[a,v,Layer({source:content.video(ref('v'),{durationInFrames:1,audio:content.audio(ref('a','audio'),{durationSamples:4000,sampleRate:48000})})})]});
 assert.equal(tvg.layers.length,2);assert.equal(planOutput(tvg).audio,true);assert.equal(planOutput(tvg).format,'mp4');assert.deepEqual(validateTVG(tvg),[]);
 const visualOnly=Composition({width:32,height:24,fps:12,children:[a,v,Layer({source:ref('v')})]});assert.equal(planOutput(visualOnly).audio,false);
});
test('formal creation defaults PNG/WAV, infers 96k rate, and interval API observes Session close',{timeout:120000},async()=>{
 const base=join(engineRoot,'artifacts/main-fwau');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'creation-'));
 const still=join(dir,'still.tsx');await writeFile(still,"import {Composition,Stage,Rect} from '@frameweave/engine';export default <Composition width={32} height={24} fps={12}><Stage id='v'><Rect width={20} height={20} fill='#00ffff'/></Stage></Composition>;");
 const png=await renderCreation({project:still,output:join(dir,'still.png')});assert.equal(png.plan.format,'png');assert.equal((await readFile(png.output)).subarray(1,4).toString(),'PNG');
 const project=join(dir,'sound.tsx');await writeFile(project,"import {Composition,Stage,Layer,content,ref} from '@frameweave/engine';import {defineAudioStage,generateAudio} from '@frameweave/engine/audio';export const sound=defineAudioStage({sampleRate:96000,layout:'mono',durationSamples:8000},()=>({evaluateInterval(r){return {audio:generateAudio(r.local,'mono',({sample})=>sample===123?.5:0)};}}));export default <Composition width={1} height={1} fps={12}><Stage id='a' factory={sound}/><Layer source={content.audio(ref('a','audio'),{sampleRate:96000,durationSamples:8000})}/></Composition>;");
 const wav=await renderCreation({project,output:join(dir,'sound.wav')});assert.equal(wav.plan.format,'wav');const block=readWavBlock(new Uint8Array(await readFile(wav.output)));assert.equal(block.sampleRate,96000);assert.equal(block.sampleCount,8000);assert.ok(audioSamples(block)[246]>0);
 const s=await openRenderSession(project);await s.evaluateInterval({unit:'samples',sampleRate:96000,start:0,endExclusive:500},{stageId:'a'});assert.equal(s.status().hostStarts,0);await s.close();await assert.rejects(s.evaluateInterval({unit:'samples',sampleRate:96000,start:0,endExclusive:500}),{code:'E_RENDER_SESSION_CLOSED'});
});
