import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readWavFile,writeWavFile,decodeAudioFile} from '../src/audio/io.ts';
import {exportAudioProject} from '../src/audio/service.ts';
import {audioBlock} from '../src/audio/block.ts';

test('host WAV I/O refuses overwrite and reports a structured path without granting Stage I/O',async()=>{
  const parent=fileURLToPath(new URL('../.frameweave',import.meta.url));await mkdir(parent,{recursive:true});const root=await mkdtemp(join(parent,'test-audio-io-')),file=join(root,'test.wav');
  try{const block=audioBlock(new Float32Array([0,.75,-1]),{sampleRate:96000,layout:'mono'}),options={format:'pcm24' as const,quantization:{clip:'reject' as const,dither:{kind:'none' as const}}};
    await writeWavFile(file,block,options);const before=await readFile(file),read=await readWavFile(file);assert.equal(read.info.sampleRate,96000);assert.equal(read.info.sampleCount,3);
    await assert.rejects(writeWavFile(file,block,options),{code:'E_AUDIO_IO',details:{path:resolve(file),systemCode:'EEXIST'}});assert.deepEqual(await readFile(file),before);
    await assert.rejects(readWavFile(join(root,'missing.wav')),{code:'E_AUDIO_IO',details:{path:join(root,'missing.wav'),systemCode:'ENOENT'}});
    await assert.rejects(decodeAudioFile(join(root,'missing.mp3'),{sampleRate:48000,layout:'mono'}),{code:'E_AUDIO_IO'});
  }finally{assert.equal(dirname(root),resolve(parent));await rm(root,{recursive:true,force:true});}
});
test('pre-cancelled export/decode fail before compiling, spawning a browser or decoder',async()=>{
  const signal=AbortSignal.abort();await assert.rejects(exportAudioProject({project:'missing.tsx',output:'missing.wav',format:'wav',sampleRate:48000,layout:'mono',quantization:{clip:'reject',dither:{kind:'none'}},signal}),{code:'E_RENDER_CANCELLED'});
  await assert.rejects(decodeAudioFile('missing.mp3',{sampleRate:48000,layout:'mono',signal}),{code:'E_RENDER_CANCELLED'});
  await assert.rejects(decodeAudioFile('missing.mp3',{sampleRate:48000,layout:'mono',timeoutMs:Infinity}),{code:'E_AUDIO_RANGE'});
});
