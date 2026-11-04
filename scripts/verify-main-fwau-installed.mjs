// Copy this file into a fresh npm consumer, then run with plain Node (no source checkout loader).
import assert from 'node:assert/strict';
import {writeFile,readFile,mkdir,rename} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import * as node from '@frameweave/engine/node';
import {Composition,Stage,Rect} from '@frameweave/engine';
import {generateAudio,audioSamples,readWavBlock} from '@frameweave/engine/audio';
import {writeWavFile} from '@frameweave/engine/audio/node';
const cwd=dirname(fileURLToPath(import.meta.url)),exec=promisify(execFile),require=createRequire(import.meta.url);
const root=dirname(dirname(fileURLToPath(import.meta.resolve('@frameweave/engine/cli')))),bin=join(root,'bin/frameweave.mjs');
const proof=join(cwd,'proof'),input=join(proof,'input');await mkdir(input,{recursive:true});
const quantization={clip:'reject',dither:{kind:'none'}},rows=[];
const run=async(name,fn)=>{const start=Date.now();try{const data=await fn();rows.push({name,ok:true,durationMs:Date.now()-start,data});}catch(e){rows.push({name,ok:false,message:e.message,stack:e.stack});throw e;}finally{await writeFile(join(proof,'installed-results.json'),JSON.stringify({ok:rows.every(r=>r.ok),root,rows},null,2));}};
async function cli(args){const result=await exec(process.execPath,[bin,...args],{cwd,windowsHide:true,maxBuffer:8*1024*1024,timeout:180000});const data=JSON.parse(result.stdout);assert.equal(data.ok,true);return data.data??data;}
const common=`import {Composition,Stage,Layer,Resource,Rect,ref,content} from '@frameweave/engine';
import {defineAudioStage,readWavBlock,gainAudio,type AudioBlockV1} from '@frameweave/engine/audio';
export const source=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:4800},({resources})=>({evaluateInterval(r){return {audio:readWavBlock(resources.input,r.local.start,r.local.endExclusive)};}}));
export const filter=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:4800},()=>({evaluateInterval(_r,inputs:{source:AudioBlockV1}){return {audio:gainAudio(inputs.source,.5)};}}));
const audio=content.audio(ref('filter','audio'),{sampleRate:48000,durationSamples:4800});
const stages=[Resource({id:'input',src:'./input.wav',kind:'media'}),Stage({id:'source',factory:source}),Stage({id:'filter',factory:filter,inputs:{source:ref('source','audio')}})];
`;
const project=join(input,'project.tsx'),pure=join(input,'pure.tsx');
const mono=generateAudio({unit:'samples',sampleRate:48000,start:0,endExclusive:4800},'mono',({sample,time})=>sample===101?.5:.15*Math.sin(2*Math.PI*440*time));
await writeWavFile(join(input,'input.wav'),mono,{format:'float32',quantization});
await writeFile(project,common+`export default Composition({width:32,height:24,fps:30,durationInFrames:3,children:[...stages,Stage({id:'visual',children:Rect({width:20,height:20,fill:'#65e9d5'})}),Layer({source:content.video(ref('visual'),{durationInFrames:3,audio})})]});`);
await writeFile(pure,common+`export default Composition({width:1,height:1,fps:30,children:[...stages,Layer({source:audio})]});`);
await run('public doctor inventory and managed incompatibility',async()=>{const d=await cli(['doctor','--json']);assert.equal(d.distribution.verified,true);assert.throws(()=>Stage({id:'bad',requires:[{id:'a',engines:['web']},{id:'b',engines:['audio']}]}),{code:'E_ENGINE_CONFLICT'});return {runtimePin:d.runtimePin,files:d.distribution.files};});
await run('public types strict and non-strict',async()=>{
 const file=join(cwd,'consumer.ts');await writeFile(file,"import {Stage,Layer,content,ref} from '@frameweave/engine';import {defineAudioStage,generateAudio} from '@frameweave/engine/audio';import {renderCreation} from '@frameweave/engine/node';import {openRenderSession} from '@frameweave/engine/render-session';const f=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:4000},()=>({evaluateInterval(r){return {audio:generateAudio(r.local,'mono',()=>0)};}}));Stage({id:'a',factory:f});Layer({source:content.audio(ref('a','audio'),{sampleRate:48000,durationSamples:4000})});void renderCreation;void openRenderSession;");
 for(const strict of ['true','false'])await exec(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit','--strict',strict,'--skipLibCheck','--moduleResolution','bundler','--module','esnext','--target','es2022','--allowImportingTsExtensions',file],{cwd,windowsHide:true,maxBuffer:2*1024*1024});return {strict:true,nonStrict:true};
});
await run('public creation CLI PNG and audio-only WAV with zero browser',async()=>{
 const still=join(input,'still.tsx');await writeFile(still,"import {Composition,Stage,Rect} from '@frameweave/engine';export default Composition({width:32,height:24,fps:30,children:Stage({id:'v',children:Rect({width:20,height:20,fill:'#65e9d5'})})});");
 await cli(['create',still,'--output',join(proof,'still.png'),'--json']);
 const wav=await cli(['create',pure,'--output',join(proof,'pure.wav'),'--json']);assert.equal(wav.plan.format,'wav');
 const s=await node.openRenderSession(pure);try{const r=await s.evaluateInterval({unit:'samples',sampleRate:48000,start:0,endExclusive:500},{stageId:'filter'});assert.equal(s.status().browserStarts,0);assert.equal(audioSamples(r.stageOutputs.filter.audio)[101],.25);}finally{await s.close();}
 const output=readWavBlock(new Uint8Array(await readFile(join(proof,'pure.wav'))));assert.equal(output.sampleCount,4800);return {sampleCount:output.sampleCount,browserStarts:0};
});
await run('public linked Layer video CLI, ffprobe and independent PCM/AAC decode',async()=>{
 const reference=audioSamples(readWavBlock(new Uint8Array(await readFile(join(proof,'pure.wav'))))),reports=[];
 for(const format of ['mov','mp4']){const output=join(proof,'linked.'+format);await cli(['create',project,'--format',format,'--output',output,'--json']);
  const p=JSON.parse((await exec(process.env.FRAMEWEAVE_FFPROBE??'ffprobe',['-v','error','-show_streams','-of','json',output],{windowsHide:true})).stdout),a=p.streams.find(s=>s.codec_type==='audio'),v=p.streams.find(s=>s.codec_type==='video');assert.equal(a.codec_name,format==='mov'?'pcm_s24le':'aac');assert.equal(a.sample_rate,'48000');assert.equal(Number(v.nb_frames),3);
  const decoded=(await exec(node.ffmpegPath(),['-v','error','-i',output,'-map','0:a:0','-f','f32le','pipe:1'],{encoding:'buffer',maxBuffer:1024*1024,windowsHide:true})).stdout;assert.ok(decoded.length>=reference.length*4);
  let sum=0;for(let i=0;i<reference.length;i++)sum+=(decoded.readFloatLE(i*4)-reference[i])**2;const rmse=Math.sqrt(sum/reference.length);assert.ok(rmse<(format==='mov'?2e-7:.02));reports.push({format,rmse,audioCodec:a.codec_name,decodedSamples:decoded.length/8,videoFrames:3});
 }return reports;
});
await run('all six existing exports carry binary WAV, native factory and Layer linkage',async()=>{
 const original=await node.openRenderSession(project);let expected,rgba;try{expected=audioSamples((await original.evaluateInterval({unit:'samples',sampleRate:48000,start:0,endExclusive:500},{stageId:'filter'})).stageOutputs.filter.audio);rgba=await sharp((await original.renderFrame(1)).png).ensureAlpha().raw().toBuffer();}finally{await original.close();}
 const policies=[{singleFile:true},{singleFile:true,layout:'capsule'},{sources:'preserve',modules:'copy',assets:'copy'},{sources:'merge',modules:'copy',assets:'copy'},{sources:'preserve',modules:'merge',assets:'embed'},{sources:'merge',modules:'external',assets:'external'}],reports=[];
 for(let n=0;n<policies.length;n++){const p=policies[n],result=await node.exportProject(project,{...p,output:join(proof,'export-'+n+(p.singleFile?'.tsx':''))}),offline=n===5?project:input;
  await rename(offline,offline+'.offline');
  try{const s=await node.openRenderSession(result.entry);try{const r=await s.evaluateInterval({unit:'samples',sampleRate:48000,start:0,endExclusive:500},{stageId:'filter'});assert.deepEqual(audioSamples(r.stageOutputs.filter.audio),expected);assert.deepEqual(await sharp((await s.renderFrame(1)).png).ensureAlpha().raw().toBuffer(),rgba);}finally{await s.close();}}finally{await rename(offline+'.offline',offline);}
  reports.push({mode:n,policy:p,entry:result.entry,samples:500,pixelTolerance:0,sourceEntryUnavailable:true,sourceAssetsUnavailable:n!==5});
 }return reports;
});
await run('formal installed Session.run loop, independent shared commits and CLI run',async()=>{
 const project=join(root,'examples/stage-orchestration/public.tsx'),s=await node.openRenderSession(project);
 let value=0,calls=0;
 try{
  for(let n=0;n<100;n++){const a=await s.run('A',{inputs:{value}});calls++;if(a.outputs.score>5)break;const b=await s.run('B',{inputs:{value:a.outputs.score}});calls++;value=b.outputs.value;}
  assert.equal(value,6);assert.equal(calls,13);
  const snap=await s.run('A',{inputs:{value:0}}),fps=snap.context.fps.num;snap.context.fps.num=1;assert.equal((await s.run('A',{inputs:{value:0}})).context.fps.num,fps);
  for(let n=0;n<4;n++)await s.run('writer',{inputs:{step:1}});
  await assert.rejects(s.run('writer',{inputs:{fail:true}}));
  assert.equal((await s.run('reader')).outputs.value,4);
  await assert.rejects(s.run('dependent'),{code:'E_INPUT_MISSING'});
 }finally{await s.close();}
 const result=await cli(['session','run',project,'--stage','A','--inputs','{"value":9}','--json']);assert.equal(result.outputs.score,9);assert.equal(result.cacheHit,false);
 return {value,calls,writerValueAfterFailure:4,cli:true};
});
await run('installed opt-in binary PME transport retains exact float pixels and cache behavior',async()=>{
 const project=join(root,'examples/professional-media/project.tsx'),a=await node.openRenderSession(project,{media:{workingColor:node.acescg,transport:'base64'}}),b=await node.openRenderSession(project,{media:{workingColor:node.acescg,transport:'buffer-v1'}});
 try{for(const frame of [0,5,0]){const x=await a.mediaFrame(frame),y=await b.mediaFrame(frame);assert.deepEqual(node.pixelsFromSurface(x.surface),node.pixelsFromSurface(y.surface));}return {frames:[0,5,0],maxError:0};}finally{await a.close();await b.close();}
});
console.log(JSON.stringify({ok:true,proof,checks:rows.length}));
