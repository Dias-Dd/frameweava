import type {FileHandle} from 'node:fs/promises';
import {EngineError} from '../core/errors.ts';
import {inspectWav,type WavInfo} from './wav.ts';
export type WavFileInfo=Omit<WavInfo,'sampleRate'>&{sampleRate:number};

export async function readExact(file:FileHandle,position:number,length:number,signal?:AbortSignal):Promise<Buffer> {
  const out=Buffer.alloc(length);let offset=0;
  while(offset<length){if(signal?.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio file read cancelled');const {bytesRead}=await file.read(out,offset,length-offset,position+offset);
    if(!bytesRead)throw new EngineError('E_AUDIO_COVERAGE','Audio source ended before the requested bytes');offset+=bytesRead;}
  return out;
}
/** Scan RIFF chunk headers, never the PCM payload. Reuse the public WAV format
 * validator with a one-frame probe so both paths have the same format contract. */
export async function inspectWavFile(file:FileHandle,size:number,signal?:AbortSignal):Promise<WavFileInfo> {
  const fail=(message:string):never=>{throw new EngineError('E_AUDIO_WAV',message);};
  const head=await readExact(file,0,12,signal);
  if(head.toString('ascii',0,4)!=='RIFF'||head.toString('ascii',8,12)!=='WAVE'||head.readUInt32LE(4)+8!==size)fail('Expected a complete little-endian RIFF/WAVE file (RF64 is not supported)');
  let fmt:Buffer|undefined,dataOffset=0,dataBytes=0,fact:number|undefined,at=12;
  while(at+8<=size){const chunk=await readExact(file,at,8,signal),name=chunk.toString('ascii',0,4),length=chunk.readUInt32LE(4),start=at+8,end=start+length;
    if(end>size)fail('Chunk exceeds RIFF bounds');
    if(name==='fmt '){if(fmt||length<16)fail('Missing or duplicate WAV format');fmt=await readExact(file,start,Math.min(length,40));}
    else if(name==='data'){if(dataOffset)fail('Multiple data chunks are unsupported');dataOffset=start;dataBytes=length;}
    else if(name==='fact'){if(fact!==undefined||length<4)fail('Invalid/duplicate WAV fact chunk');fact=(await readExact(file,start,4)).readUInt32LE(0);}
    at=end+length%2;if(at>size)fail('Missing RIFF padding byte');
  }
  if(!fmt||!dataOffset||!dataBytes||at!==size)fail('WAV requires nonempty format/data chunks and complete padding');
  const format=fmt!,align=format.readUInt16LE(12),sampleRate=format.readUInt32LE(4);
  if(!sampleRate||format.readUInt32LE(8)!==sampleRate*align)fail('Invalid WAV source sample rate/byte rate');
  if(!align||dataBytes%align||fact!==undefined&&fact!==dataBytes/align)fail('WAV alignment/fact sample count is inconsistent');
  // The format chunk retains the source bytes. Only the synthetic data payload
  // is shortened; actual file bounds and sample counts were validated above.
  const probe=Buffer.alloc(12+8+format.length+format.length%2+8+align+align%2);head.copy(probe);probe.writeUInt32LE(probe.length-8,4);
  probe.write('fmt ',12,'ascii');probe.writeUInt32LE(format.length,16);format.copy(probe,20);
  // External PCM may be 44.1k or another source rate. Validate its original byte
  // rate above, then use a supported probe rate solely for the shared format
  // validator. Actual conversion still requires an explicit resample policy.
  if(sampleRate!==48000&&sampleRate!==96000){probe.writeUInt32LE(48000,24);probe.writeUInt32LE(48000*align,28);}
  const data=20+format.length+format.length%2;probe.write('data',data,'ascii');probe.writeUInt32LE(align,data+4);
  const checked=inspectWav(probe);return {...checked,sampleRate,dataOffset,dataBytes,sampleCount:dataBytes/align};
}
