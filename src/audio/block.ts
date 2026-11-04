import {EngineError} from '../core/errors.ts';

export type AudioSampleRate=48000|96000;
export type ChannelName='FC'|'FL'|'FR'|'BL'|'BR'|'LFE'|'SL'|'SR';
export const channelOrders={mono:['FC'],stereo:['FL','FR'],quad:['FL','FR','BL','BR'],'5.1':['FL','FR','FC','LFE','BL','BR']} as const;
export type AudioLayout=keyof typeof channelOrders;
export interface ChannelLayout {name:AudioLayout;channels:readonly ChannelName[]}
/** Binary, value-owned CPU data. Never a Json port, DOM AudioBuffer or device handle. */
export interface AudioBlockV1 {
  kind:'audio';schemaVersion:'frameweave.audio/1';sampleFormat:'f32-interleaved';
  sampleRate:AudioSampleRate;channelLayout:ChannelLayout;startSample:number;sampleCount:number;
  ownership:'value';validRange:{start:number;endExclusive:number};
  storage:{location:'cpu-inline';encoding:'binary';byteOrder:'little-endian';byteLength:number;data:Uint8Array};
}
export const audioLimits={samples:262144,bytes:16*1024*1024} as const;
export function audioFail(code:string,message:string):never {throw new EngineError(code,message);}
export const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
export function fields(value:unknown,names:readonly string[],path:string):asserts value is Record<string,unknown>{
  if(!plain(value))audioFail('E_AUDIO_SCHEMA',`${path}: expected a plain object`);
  for(const name of Object.keys(value))if(!names.includes(name))audioFail('E_AUDIO_SCHEMA',`${path}.${name}: unknown field`);
}
export function integer(v:unknown,path:string,min=0,max=Number.MAX_SAFE_INTEGER):asserts v is number {if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)audioFail('E_AUDIO_RANGE',`${path}: expected a safe integer in [${min},${max}]`);}
export function assertSampleRate(v:unknown):asserts v is AudioSampleRate {if(v!==48000&&v!==96000)audioFail('E_AUDIO_RATE','sampleRate: supported rates are exactly 48000 and 96000 Hz');}
export function channelLayout(name:AudioLayout):ChannelLayout {if(!Object.hasOwn(channelOrders,name))audioFail('E_AUDIO_LAYOUT','Unknown named channel layout');return {name,channels:[...channelOrders[name]]};}
export function assertChannelLayout(value:unknown):asserts value is ChannelLayout {
  fields(value,['name','channels'],'channelLayout');
  if(typeof value.name!=='string'||!Object.hasOwn(channelOrders,value.name))audioFail('E_AUDIO_LAYOUT','channelLayout.name: use an explicitly supported named layout');
  const order=channelOrders[value.name as AudioLayout];if(!Array.isArray(value.channels)||value.channels.length!==order.length||value.channels.some((c,i)=>c!==order[i]))audioFail('E_AUDIO_LAYOUT',`channelLayout.channels: expected ${order.join(',')}`);
}
export function isAudioBlock(value:unknown):value is AudioBlockV1{return !!value&&typeof value==='object'&&'kind'in value&&value.kind==='audio';}
/** Reserve the explicit versioned media namespace, preserving legacy Json metadata {kind:'audio'}. */
export function isAudioDescriptor(value:unknown):boolean{return isAudioBlock(value)&&typeof value.schemaVersion==='string'&&value.schemaVersion.startsWith('frameweave.audio/');}
export function assertAudioBlock(value:unknown):asserts value is AudioBlockV1 {
  fields(value,['kind','schemaVersion','sampleFormat','sampleRate','channelLayout','startSample','sampleCount','ownership','validRange','storage'],'audio');
  if(value.kind!=='audio'||value.schemaVersion!=='frameweave.audio/1')audioFail('E_AUDIO_VERSION','audio: expected frameweave.audio/1');
  if(value.sampleFormat!=='f32-interleaved'||value.ownership!=='value')audioFail('E_AUDIO_FORMAT','audio: expected value-owned interleaved Float32 PCM');
  assertSampleRate(value.sampleRate);assertChannelLayout(value.channelLayout);integer(value.startSample,'startSample');integer(value.sampleCount,'sampleCount',1,audioLimits.samples);integer(value.startSample+value.sampleCount,'endSample');
  integer((value.startSample+value.sampleCount)*value.channelLayout.channels.length,'interleaved sample index');
  fields(value.validRange,['start','endExclusive'],'validRange');integer(value.validRange.start,'validRange.start',0,value.sampleCount);integer(value.validRange.endExclusive,'validRange.endExclusive',value.validRange.start,value.sampleCount);
  fields(value.storage,['location','encoding','byteOrder','byteLength','data'],'storage');const s=value.storage;
  if(s.location!=='cpu-inline'||s.encoding!=='binary'||s.byteOrder!=='little-endian')audioFail('E_AUDIO_STORAGE','storage: expected explicit little-endian CPU binary transport');
  const expected=value.sampleCount*value.channelLayout.channels.length*4;
  if(expected>audioLimits.bytes||s.byteLength!==expected||!(s.data instanceof Uint8Array)||s.data.byteLength!==expected||s.data.byteOffset!==0||s.data.buffer.byteLength!==expected||typeof SharedArrayBuffer!=='undefined'&&s.data.buffer instanceof SharedArrayBuffer)audioFail('E_AUDIO_BYTES',`storage: expected ${expected} privately owned PCM bytes`);
  const view=new DataView(s.data.buffer,s.data.byteOffset,s.data.byteLength);for(let i=0;i<expected;i+=4)if(!Number.isFinite(view.getFloat32(i,true)))audioFail('E_AUDIO_FINITE',`storage: nonfinite PCM sample at byte ${i}`);
}
export function audioBlock(values:Float32Array,options:{sampleRate:AudioSampleRate;layout:AudioLayout;startSample?:number}):AudioBlockV1 {
  const layout=channelLayout(options.layout),count=values.length/layout.channels.length;integer(count,'sampleCount',1,audioLimits.samples);
  const data=new Uint8Array(values.length*4),view=new DataView(data.buffer);for(let i=0;i<values.length;i++)view.setFloat32(i*4,values[i],true);
  const result:AudioBlockV1={kind:'audio',schemaVersion:'frameweave.audio/1',sampleFormat:'f32-interleaved',sampleRate:options.sampleRate,channelLayout:layout,startSample:options.startSample??0,sampleCount:count,ownership:'value',validRange:{start:0,endExclusive:count},storage:{location:'cpu-inline',encoding:'binary',byteOrder:'little-endian',byteLength:data.byteLength,data}};assertAudioBlock(result);return result;
}
export function audioSamples(block:AudioBlockV1):Float32Array {assertAudioBlock(block);const data=block.storage.data,view=new DataView(data.buffer,data.byteOffset,data.byteLength),out=new Float32Array(data.byteLength/4);for(let i=0;i<out.length;i++)out[i]=view.getFloat32(i*4,true);return out;}
export function sliceAudio(block:AudioBlockV1,start:number,endExclusive:number):AudioBlockV1 {
  assertAudioBlock(block);integer(start,'slice.start',block.startSample,block.startSample+block.sampleCount);integer(endExclusive,'slice.endExclusive',start+1,block.startSample+block.sampleCount);
  const channels=block.channelLayout.channels.length,a=start-block.startSample,b=endExclusive-block.startSample;
  if(a<block.validRange.start||b>block.validRange.endExclusive)audioFail('E_AUDIO_COVERAGE','Requested samples are outside the valid PCM range');
  return audioBlock(audioSamples(block).slice(a*channels,b*channels),{sampleRate:block.sampleRate,layout:block.channelLayout.name,startSample:start});
}
