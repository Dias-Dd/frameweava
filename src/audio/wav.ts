import {audioBlock,audioSamples,audioLimits,assertSampleRate,channelLayout,assertChannelLayout,integer,fields,audioFail,type AudioBlockV1,type AudioSampleRate,type AudioLayout} from './block.ts';
export type WavFormat='pcm16'|'pcm24'|'float32';
export interface Quantization {clip:'reject'|'clip';dither:{kind:'none'}|{kind:'tpdf';seed:number}}
const masks:Record<AudioLayout,number>={mono:4,stereo:3,quad:0x33,'5.1':0x3f};
const ascii=(data:Uint8Array,at:number,length:number)=>String.fromCharCode(...data.subarray(at,at+length));
function text(data:Uint8Array,at:number,value:string){for(let i=0;i<value.length;i++)data[at+i]=value.charCodeAt(i);}
export interface WavInfo {sampleRate:AudioSampleRate;layout:AudioLayout;sampleCount:number;format:WavFormat;dataOffset:number;dataBytes:number}
/** Strict RIFF/WAVE subset. No silent resampling, layout guessing, corrupt chunk truncation or RF64. */
export function inspectWav(data:Uint8Array):WavInfo {
  if(data.length<44||ascii(data,0,4)!=='RIFF'||ascii(data,8,4)!=='WAVE')audioFail('E_AUDIO_WAV','Expected little-endian RIFF/WAVE');const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
  if(view.getUint32(4,true)+8!==data.byteLength)audioFail('E_AUDIO_WAV','RIFF length does not match file bytes');
  let format:WavFormat|undefined,sampleRate:AudioSampleRate|undefined,layout:AudioLayout|undefined,align=0,dataOffset=0,dataBytes=0,at=12,fact:number|undefined;
  for(;at+8<=data.length;){const id=ascii(data,at,4),size=view.getUint32(at+4,true),start=at+8,end=start+size;if(end>data.length)audioFail('E_AUDIO_WAV','Chunk exceeds RIFF bounds');
    if(id==='fmt '){if(format||size<16)audioFail('E_AUDIO_WAV','Missing or duplicate WAV format');let tag=view.getUint16(start,true);const channels=view.getUint16(start+2,true),rate=view.getUint32(start+4,true),bits=view.getUint16(start+14,true);assertSampleRate(rate);sampleRate=rate;align=view.getUint16(start+12,true);
      let mask=0;if(tag===0xfffe){if(size<40||view.getUint16(start+16,true)<22||view.getUint16(start+18,true)!==bits)audioFail('E_AUDIO_WAV','Invalid WAVEFORMATEXTENSIBLE valid bits');mask=view.getUint32(start+20,true);tag=view.getUint16(start+24,true);const guid=[0,0,0,0,16,0,128,0,0,170,0,56,155,113];if(guid.some((v,i)=>data[start+26+i]!==v))audioFail('E_AUDIO_WAV','Unsupported WAV subformat GUID');}
      format=tag===1&&bits===16?'pcm16':tag===1&&bits===24?'pcm24':tag===3&&bits===32?'float32':undefined;if(!format)audioFail('E_AUDIO_WAV_FORMAT','Supported WAV PCM formats are s16, s24 and Float32');
      layout=mask?(Object.keys(masks) as AudioLayout[]).find(k=>masks[k]===mask):channels===1?'mono':channels===2?'stereo':undefined;
      if(!layout||channelLayout(layout).channels.length!==channels)audioFail('E_AUDIO_LAYOUT','Multichannel WAV requires a recognized explicit speaker mask');
      if(align!==channels*bits/8||view.getUint32(start+8,true)!==rate*align)audioFail('E_AUDIO_WAV','Invalid block alignment or byte rate');
    }else if(id==='data'){if(dataOffset)audioFail('E_AUDIO_WAV','Multiple data chunks are unsupported');dataOffset=start;dataBytes=size;}
    else if(id==='fact'){if(size<4||fact!==undefined)audioFail('E_AUDIO_WAV','Invalid/duplicate WAV fact chunk');fact=view.getUint32(start,true);}
    at=end+(size%2);if(at>data.length)audioFail('E_AUDIO_WAV','Missing RIFF padding byte');
  }
  if(!format||!sampleRate||!layout||!dataOffset||dataBytes%align||!dataBytes)audioFail('E_AUDIO_WAV','WAV requires aligned nonempty format and data chunks');
  if(at!==data.length||fact!==undefined&&fact!==dataBytes/align)audioFail('E_AUDIO_WAV','WAV trailing chunk bytes or fact sample count are inconsistent');
  return {sampleRate,layout,sampleCount:dataBytes/align,format,dataOffset,dataBytes};
}
export function readWavBlock(data:Uint8Array,start=0,endExclusive?:number):AudioBlockV1 {
  const info=inspectWav(data),end=endExclusive??info.sampleCount;integer(start,'WAV start',0,info.sampleCount-1);integer(end,'WAV end',start+1,Math.min(info.sampleCount,start+audioLimits.samples));
  const channels=channelLayout(info.layout).channels.length,bytes=info.format==='pcm16'?2:info.format==='pcm24'?3:4,view=new DataView(data.buffer,data.byteOffset,data.byteLength),values=new Float32Array((end-start)*channels);
  for(let i=0;i<values.length;i++){const at=info.dataOffset+(start*channels+i)*bytes;values[i]=info.format==='float32'?view.getFloat32(at,true):bytes===2?view.getInt16(at,true)/32768:(data[at]|data[at+1]<<8|data[at+2]<<16)<<8>>8 /* sign extend */;if(bytes===3)values[i]/=8388608;}
  return audioBlock(values,{sampleRate:info.sampleRate,layout:info.layout,startSample:start});
}
function uniform(index:number,seed:number,salt:number){let x=(Math.imul(index>>>0,0x9e3779b1)^Math.imul(Math.floor(index/4294967296),0x85ebca6b)^seed^salt)>>>0;x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);return ((x^(x>>>16))>>>0)/4294967296;}
export function encodePcm(block:AudioBlockV1,format:WavFormat,policy:Quantization):{bytes:Uint8Array;overloads:number} {
  fields(policy,['clip','dither'],'quantization');fields(policy.dither,['kind','seed'],'dither');
  if(!['pcm16','pcm24','float32'].includes(format))audioFail('E_AUDIO_FORMAT','Unsupported output PCM format');
  if(!policy||!['reject','clip'].includes(policy.clip)||!['none','tpdf'].includes(policy.dither?.kind))audioFail('E_AUDIO_QUANTIZATION','Choose explicit clipping and dither policies');
  if(policy.dither.kind==='tpdf')integer(policy.dither.seed,'dither.seed',0,0xffffffff);
  if(format==='float32'&&policy.dither.kind!=='none')audioFail('E_AUDIO_QUANTIZATION','Dither applies only to integer quantization');
  const samples=audioSamples(block),bytesPer=format==='pcm16'?2:format==='pcm24'?3:4,out=new Uint8Array(samples.length*bytesPer),view=new DataView(out.buffer),scale=bytesPer===2?32768:8388608;let overloads=0;
  for(let i=0;i<samples.length;i++){let value=samples[i];if(Math.abs(value)>1){overloads++;if(format!=='float32'&&policy.clip==='reject')audioFail('E_AUDIO_CLIPPING',`Integer quantization overload at sample ${block.startSample+Math.floor(i/block.channelLayout.channels.length)}`);}
    if(format==='float32'){view.setFloat32(i*4,value,true);continue;}
    value=Math.max(-1,Math.min(1,value));const index=block.startSample*block.channelLayout.channels.length+i;
    const noise=policy.dither.kind==='tpdf'?uniform(index,policy.dither.seed,0x12345)-uniform(index,policy.dither.seed,0x98765):0,q=Math.max(-scale,Math.min(scale-1,Math.round(value*scale+noise)));
    if(bytesPer===2)view.setInt16(i*2,q,true);else {out[i*3]=q&255;out[i*3+1]=(q>>8)&255;out[i*3+2]=(q>>16)&255;}
  }return {bytes:out,overloads};
}
export function wavHeader(options:{sampleRate:AudioSampleRate;layout:AudioLayout;sampleCount:number;format:WavFormat}):Uint8Array {
  assertSampleRate(options.sampleRate);const layout=channelLayout(options.layout);assertChannelLayout(layout);integer(options.sampleCount,'WAV sampleCount',1);const channels=layout.channels.length,bytesPer=options.format==='pcm16'?2:options.format==='pcm24'?3:4;
  if(!['pcm16','pcm24','float32'].includes(options.format))audioFail('E_AUDIO_FORMAT','Unsupported WAV format');
  const float=options.format==='float32',size=float?80:68,dataBytes=options.sampleCount*channels*bytesPer,padding=dataBytes%2;integer(dataBytes+size-8+padding,'RIFF bytes',1,0xffffffff);
  const out=new Uint8Array(size),v=new DataView(out.buffer);text(out,0,'RIFF');v.setUint32(4,dataBytes+size-8+padding,true);text(out,8,'WAVEfmt ');v.setUint32(16,40,true);v.setUint16(20,0xfffe,true);v.setUint16(22,channels,true);v.setUint32(24,options.sampleRate,true);v.setUint32(28,options.sampleRate*channels*bytesPer,true);v.setUint16(32,channels*bytesPer,true);v.setUint16(34,bytesPer*8,true);v.setUint16(36,22,true);v.setUint16(38,bytesPer*8,true);v.setUint32(40,masks[options.layout],true);v.setUint32(44,float?3:1,true);out.set([0,0,16,0,128,0,0,170,0,56,155,113],48);
  if(float){text(out,60,'fact');v.setUint32(64,4,true);v.setUint32(68,options.sampleCount,true);}text(out,size-8,'data');v.setUint32(size-4,dataBytes,true);return out;
}
export function encodeWav(block:AudioBlockV1,options:{format:WavFormat;quantization:Quantization}){const encoded=encodePcm(block,options.format,options.quantization),header=wavHeader({sampleRate:block.sampleRate,layout:block.channelLayout.name,sampleCount:block.sampleCount,format:options.format}),out=new Uint8Array(header.length+encoded.bytes.length+encoded.bytes.length%2);out.set(header);out.set(encoded.bytes,header.length);return {bytes:out,overloads:encoded.overloads};}
