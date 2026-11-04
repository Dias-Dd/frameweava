import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {build} from 'esbuild';
import {engineRoot} from '../src/compiler/build.ts';
import {AudioAdapter} from '../src/audio/adapter.ts';
import {audioSamples,type AudioBlockV1} from '../src/audio/block.ts';
import type {AudioStageMetadata,IntervalRequest} from '../src/audio/contract.ts';
import type {StageSpec,BuiltProject} from '../src/core/types.ts';
const metadata:AudioStageMetadata={schemaVersion:1,sampleRate:48000,layout:'mono',durationSamples:48000,seek:'stateless',lookbehindSamples:0,lookaheadSamples:0,latencySamples:0,tailSamples:0};
const request:IntervalRequest={global:{unit:'samples',sampleRate:48000,start:0,endExclusive:100},local:{unit:'samples',sampleRate:48000,start:0,endExclusive:100},fps:{num:12,den:1},seed:1};
async function fixture(body:string,timeout=3000){const parent=join(engineRoot,'.frameweave/audio-adapter');await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'test-')),entry=join(dir,'stage.ts'),bundle=join(dir,'stage.js');const sdk=join(engineRoot,'src/audio/index.ts').replaceAll('\\','/');await writeFile(entry,`import {generateAudio,audioBlock,audioSamples} from ${JSON.stringify(sdk)};${body}`);await build({entryPoints:[entry],outfile:bundle,platform:'browser',format:'iife',globalName:'__fw_audio_module',bundle:true,logLevel:'silent'});
  const stage:StageSpec&{audio:AudioStageMetadata}={id:'sound',engine:'audio',entry,inputs:{},outputs:{},props:{},time:{start:0,duration:12,offset:0,rate:{num:1,den:1}},seek:'stateless',audio:metadata};
  const built:BuiltProject={dir,manifest:{schemaVersion:'0.1',composition:{id:'audio',width:1,height:1,fps:{num:12,den:1},durationInFrames:12,background:'transparent',seed:1},stages:[stage],layers:[],resources:[],effects:[]},stageBundles:{sound:'stage.js'},assets:{},hash:'test'};const adapter=new AudioAdapter(built,timeout);await adapter.init(stage);return {adapter,stage,dir};}
test('real CPU worker evaluates authored functions with binary PCM, isolated globals and fresh stateless factories',{timeout:30000},async()=>{
  const {adapter,stage}=await fixture(`let residue=0;export default()=>({evaluateInterval(r){residue++;return {audio:generateAudio(r.local,'mono',({sample})=>sample*.01),state:{residue,process:typeof process,fetch:typeof fetch,require:typeof globalThis.require,wasm:typeof WebAssembly}};}});`);
  try{const first=await adapter.evaluateInterval(stage,request,{},{}),second=await adapter.evaluateInterval(stage,request,{},{});assert.deepEqual(first,second);assert.deepEqual(first.outputs.state,{residue:1,process:'undefined',fetch:'undefined',require:'undefined',wasm:'undefined'});assert.deepEqual([...audioSamples(first.outputs.audio as AudioBlockV1)].slice(0,3),[0,Math.fround(.01),Math.fround(.02)]);assert.deepEqual(first.coverage.audio,request.local);}
  finally{await Promise.all([adapter.dispose(),adapter.dispose()]);}
});
test('runtime code generation is denied, CPU timeout and cancellation terminate actual workers',{timeout:30000},async()=>{
  const denied=await fixture(`export default()=>({evaluateInterval(){return {value:Function('return process')()};}});`);try{await assert.rejects(denied.adapter.evaluateInterval(denied.stage,request,{},{}),/Code generation/);}finally{await denied.adapter.dispose();}
  const loop=await fixture(`export default()=>({evaluateInterval(){while(true){};return {};}});`,150);try{await assert.rejects(loop.adapter.evaluateInterval(loop.stage,request,{},{}),{code:'E_STAGE_TIMEOUT'});}finally{await loop.adapter.dispose();}
  const wait=await fixture(`export default()=>({evaluateInterval(){return new Promise(()=>{});}});`);const pending=wait.adapter.evaluateInterval(wait.stage,request,{},{});const rejected=assert.rejects(pending,{code:'E_AUDIO_WORKER_CLOSED'});await new Promise(r=>setTimeout(r,50));await Promise.all([wait.adapter.dispose(),wait.adapter.dispose()]);await rejected;
});
