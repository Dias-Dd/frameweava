import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {open,readFile,realpath,stat,type FileHandle} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join,extname} from 'node:path';
import type {BuiltProject} from '../core/types.ts';
import {EngineError} from '../core/errors.ts';
import {audioBlock,channelLayout,fields,integer,assertAudioBlock,type AudioBlockV1,type AudioLayout} from './block.ts';
import {assertInterval} from './time.ts';
import type {AudioResourceInfo,AudioResourceRequest} from './contract.ts';
import {audioResourceOptions,type AudioResourceOptions} from './resource-options.ts';
import {readExact,inspectWavFile,type WavFileInfo} from './wav-file.ts';
import {PcmIntervalDecoder} from './pcm-decoder.ts';
import {assertSelfContainedMp4} from '../../modules/native-gpu/video-container.ts';
const exec=promisify(execFile);
const demuxers:Record<string,string>={'.wav':'wav','.mp3':'mp3','.flac':'flac','.m4a':'mov','.mp4':'mov','.mov':'mov',
  '.aac':'aac','.ogg':'ogg','.opus':'ogg','.mkv':'matroska','.webm':'matroska','.avi':'avi'};
const stamp=(s:{dev:number|bigint;ino:number|bigint;size:number|bigint;mtimeNs:bigint;ctimeNs:bigint})=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');
type Source={id:string;path:string;file:FileHandle;stamp:string;size:number;wav?:WavFileInfo;metadata:Map<number,AudioResourceInfo>;decoder?:PcmIntervalDecoder;decoderKey?:string};
type Cached={id:string;bytes:number;value:AudioBlockV1|Uint8Array};

/** Compiler-sealed, host-owned source/decoder lease. Audio realm state is NOT
 * retained. All returned PCM is privately copied; no host paths/handles escape. */
export class AudioResourceReader {
  private sources=new Map<string,Source>();private cache=new Map<string,Cached>();private cacheBytes=0;
  private seals?:Promise<Map<string,string>>;private stopped=false;private controller=new AbortController();
  private tail:Promise<unknown>=Promise.resolve();private closing?:Promise<void>;
  private options:ReturnType<typeof audioResourceOptions>;
  private counts={sourceOpens:0,cacheHits:0,sourceBytesRead:0,decoderStarts:0,decoderRestarts:0,decodedBytes:0};
  constructor(private build:BuiltProject,options:AudioResourceOptions={}){this.options=audioResourceOptions(options);}
  stats(){return {...this.counts,closed:this.stopped,openSources:this.sources.size,openDecoders:[...this.sources.values()].filter(s=>s.decoder).length,cacheBytes:this.cacheBytes,cacheEntries:this.cache.size};}
  private active(signal?:AbortSignal){if(signal?.aborted||this.controller.signal.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio resource request cancelled');if(this.stopped)throw new EngineError('E_AUDIO_RESOURCE_CLOSED','Audio resource lease is closed');}
  private run<T>(task:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>{
    const run=this.tail.then(async()=>{this.active(signal);const timeout=AbortSignal.timeout(this.options.decoderTimeoutMs),combined=AbortSignal.any([this.controller.signal,timeout,...signal?[signal]:[]]);
      try{return await task(combined);}catch(e){if(signal?.aborted||this.controller.signal.aborted)throw new EngineError('E_RENDER_CANCELLED','Audio resource request cancelled');if(timeout.aborted)throw new EngineError('E_AUDIO_DECODE_TIMEOUT','Audio resource request exceeded the configured timeout');if(e instanceof EngineError)throw e;throw new EngineError('E_AUDIO_RESOURCE','Audio resource I/O/probe failed; check the admitted file and host decoder configuration');}});
    this.tail=run.catch(()=>{});return run;
  }
  private async confined(path:string){const root=await realpath(this.build.dir),actual=await realpath(path),rel=relative(root,actual);
    if(rel==='..'||rel.startsWith('../')||rel.startsWith('..\\')||isAbsolute(rel))throw new EngineError('E_AUDIO_RESOURCE','Only compiler-prepared resources inside this build are exposed');return actual;}
  /** Same byte-sensitive digest/order as buildProject. Stream files, including
   * unrelated assets, for integrity only; never retain them as Stage resources. */
  private verify(signal:AbortSignal){return this.seals??=(async()=>{
    const manifest=await readFile(join(this.build.dir,'tvg.json'));
    if(JSON.stringify(JSON.parse(manifest.toString()))!==JSON.stringify(this.build.manifest))throw new EngineError('E_AUDIO_RESOURCE_INTEGRITY','Compiled manifest changed');
    const digest=createHash('sha256').update(manifest),seals=new Map<string,string>();
    for(const original of [...Object.values(this.build.stageBundles).map(p=>join(this.build.dir,p)),...Object.values(this.build.assets)].sort()){
      this.active(signal);const path=await this.confined(original),file=await open(path,'r');
      try{const before=await file.stat({bigint:true});if(!before.isFile())throw new EngineError('E_AUDIO_RESOURCE','Build assets must be ordinary files');
        const buffer=Buffer.alloc(65536);let position=0;
        for(;;){this.active(signal);const {bytesRead}=await file.read(buffer,0,buffer.length,position);if(!bytesRead)break;digest.update(buffer.subarray(0,bytesRead));position+=bytesRead;}
        const after=await file.stat({bigint:true});if(stamp(before)!==stamp(after))throw new EngineError('E_AUDIO_RESOURCE_INTEGRITY','Build bytes changed during verification');seals.set(path,stamp(after));
      }finally{await file.close();}
    }
    if(digest.digest('hex')!==this.build.hash)throw new EngineError('E_AUDIO_RESOURCE_INTEGRITY','Compiler build seal does not match its bytes');return seals;
  })();}
  private async validate(source:Source,signal:AbortSignal){this.active(signal);const [handle,current]=await Promise.all([source.file.stat({bigint:true}),stat(source.path,{bigint:true})]);
    if(stamp(handle)!==source.stamp||stamp(current)!==source.stamp||await this.confined(source.path)!==source.path)throw new EngineError('E_AUDIO_RESOURCE_INTEGRITY','Admitted audio resource changed; recompile/reopen the Session');}
  private async source(id:string,signal:AbortSignal){
    if(typeof id!=='string'||!id||!Object.hasOwn(Object.fromEntries(this.build.manifest.resources.map(r=>[r.id,true])),id))throw new EngineError('E_AUDIO_RESOURCE_UNDECLARED','Audio reads require an exact declared Resource ID');
    let source=this.sources.get(id);if(source){await this.validate(source,signal);this.sources.delete(id);this.sources.set(id,source);return source;}
    const declared=this.build.manifest.resources.find(r=>r.id===id)!;
    if(!Object.hasOwn(this.build.assets,declared.src))throw new EngineError('E_AUDIO_RESOURCE_UNDECLARED','Resource has no compiler-prepared asset');
    const seals=await this.verify(signal),path=await this.confined(this.build.assets[declared.src]),file=await open(path,'r');
    try{const info=await file.stat({bigint:true});if(!info.isFile()||stamp(info)!==seals.get(path))throw new EngineError('E_AUDIO_RESOURCE_INTEGRITY','Resource changed after compiler seal verification');
      if(info.size>BigInt(Number.MAX_SAFE_INTEGER))throw new EngineError('E_AUDIO_RANGE','Source exceeds exact byte addressing');
      if(this.sources.size>=this.options.maxOpenSources)await this.evict(this.sources.keys().next().value!);
      source={id,path,file,size:Number(info.size),stamp:stamp(info),metadata:new Map()};this.sources.set(id,source);this.counts.sourceOpens++;return source;
    }catch(e){await file.close();throw e;}
  }
  private async metadata(source:Source,stream:number,signal:AbortSignal):Promise<AudioResourceInfo>{
    integer(stream,'audio stream',0);const known=source.metadata.get(stream);if(known)return known;
    const demuxer=demuxers[extname(source.path).toLowerCase()];if(!demuxer)throw new EngineError('E_AUDIO_INPUT_FORMAT','Audio interval input requires a supported local WAV/MP3/FLAC/AAC/Ogg/MP4/MOV/Matroska/AVI asset');
    let info:AudioResourceInfo;
    if(demuxer==='wav'){
      if(stream!==0)throw new EngineError('E_AUDIO_STREAM','PCM WAV has exactly one audio stream (ordinal 0)');
      source.wav=await inspectWavFile(source.file,source.size,signal);const wav=source.wav;
      info={resourceId:source.id,stream,sampleRate:wav.sampleRate,channels:channelLayout(wav.layout).channels.length,layout:wav.layout,sampleCount:wav.sampleCount,decoder:'wav-pcm'};
    }else{
      if(demuxer==='mov')try{await assertSelfContainedMp4(source.path,this.options.maxProbeBytes);}catch{throw new EngineError('E_AUDIO_CONTAINER','Audio MP4/MOV requires a self-contained container; external data references are forbidden (check maxProbeBytes for large metadata)');}
      const executable=this.options.ffprobe??process.env.FRAMEWEAVE_FFPROBE;
      if(!executable)throw new EngineError('E_MEDIA_PROBE_UNAVAILABLE','Compressed/container audio requires an explicitly configured FRAMEWEAVE_FFPROBE (or audioResources.ffprobe)');
      const {stdout}=await exec(executable,['-v','error','-protocol_whitelist','file,pipe',...demuxer==='mov'?['-enable_drefs','0','-use_absolute_path','0']:[],'-f',demuxer,'-select_streams',`a:${stream}`,
        '-show_entries','stream=sample_rate,channels,channel_layout','-of','json',source.path],{windowsHide:true,signal,timeout:this.options.decoderTimeoutMs,maxBuffer:this.options.maxProbeBytes});
      const streams=JSON.parse(stdout).streams;if(!Array.isArray(streams)||streams.length!==1)throw new EngineError('E_AUDIO_STREAM','Selected audio stream is missing or ambiguous');
      const selected=streams[0],rate=Number(selected.sample_rate),channels=Number(selected.channels);integer(rate,'source sample rate',1);integer(channels,'source channels',1);
      const layout=selected.channel_layout as AudioLayout|undefined,knownLayout=layout&&['mono','stereo','quad','5.1'].includes(layout)&&channelLayout(layout).channels.length===channels?layout:undefined;
      info={resourceId:source.id,stream,sampleRate:rate,channels,...knownLayout?{layout:knownLayout}:{},decoder:'ffmpeg'};
    }
    await this.validate(source,signal);source.metadata.set(stream,info);return info;
  }
  private cached<T extends Cached['value']>(key:string):T|undefined{const found=this.cache.get(key);if(!found)return;this.cache.delete(key);this.cache.set(key,found);this.counts.cacheHits++;return structuredClone(found.value) as T;}
  private retain(id:string,key:string,value:Cached['value'],bytes:number){if(bytes>this.options.maxCacheBytes)return;while(this.cacheBytes+bytes>this.options.maxCacheBytes){const first=this.cache.keys().next().value!;this.cacheBytes-=this.cache.get(first)!.bytes;this.cache.delete(first);}this.cache.set(key,{id,bytes,value:structuredClone(value)});this.cacheBytes+=bytes;}
  private async evict(id:string){const source=this.sources.get(id);if(!source)return;this.sources.delete(id);for(const [key,cached]of this.cache)if(cached.id===id){this.cacheBytes-=cached.bytes;this.cache.delete(key);}try{await source.decoder?.close();}finally{await source.file.close();}}
  private async guarded<T>(id:string,signal:AbortSignal,read:(source:Source)=>Promise<T>){try{const source=await this.source(id,signal);const result=await read(source);await this.validate(source,signal);return result;}catch(e){await this.evict(id);throw e;}}
  info(resourceId:string,stream:number,signal?:AbortSignal):Promise<AudioResourceInfo>{return this.run(s=>this.guarded(resourceId,s,async source=>structuredClone(await this.metadata(source,stream,s))),signal);}
  /** Legacy byte API is lazy, separately bounded and explicitly points long sources to read(). */
  bytes(resourceId:string,signal?:AbortSignal):Promise<Uint8Array>{return this.run(s=>this.guarded(resourceId,s,async source=>{
    if(source.size>this.options.maxLegacyBytes)throw new EngineError('E_AUDIO_RESOURCE_BUDGET','Legacy whole-resource byte access exceeds audioResources.maxLegacyBytes; use init.audio.read() for bounded sample intervals');
    const key=JSON.stringify(['bytes',resourceId]),cached=this.cached<Uint8Array>(key);if(cached)return cached;
    const value=new Uint8Array(await readExact(source.file,0,source.size,s));this.counts.sourceBytesRead+=value.length;this.retain(resourceId,key,value,value.length);return value;
  }),signal);}
  read(request:AudioResourceRequest,signal?:AbortSignal):Promise<AudioBlockV1>{
    // Snapshot before queueing: authored code cannot mutate an accepted request.
    let r:AudioResourceRequest;try{r=structuredClone(request);fields(r,['resourceId','stream','interval','layout','conversion'],'audio read');assertInterval(r.interval);integer(r.stream,'audio stream');channelLayout(r.layout);
      fields(r.conversion,['sampleRate','layout'],'audio conversion');if(!['reject','resample'].includes(r.conversion.sampleRate)||!['reject','remix'].includes(r.conversion.layout))throw new EngineError('E_AUDIO_CONVERSION','Choose explicit sampleRate reject/resample and layout reject/remix policies');
    }catch(e){return Promise.reject(e);}
    return this.run(s=>this.guarded(r.resourceId,s,async source=>{
      const count=r.interval.endExclusive-r.interval.start,channels=channelLayout(r.layout).channels.length,bytes=count*channels*4;
      if(bytes>this.options.maxRequestBytes)throw new EngineError('E_AUDIO_BUDGET','PCM request exceeds audioResources.maxRequestBytes; request smaller intervals or review the operator budget');
      const info=await this.metadata(source,r.stream,s);
      if(info.sampleRate!==r.interval.sampleRate&&r.conversion.sampleRate!=='resample'||info.layout!==r.layout&&r.conversion.layout!=='remix')throw new EngineError('E_AUDIO_CONVERSION','Source rate/layout differs; conversion was explicitly rejected');
      const key=JSON.stringify(['pcm',r.resourceId,r.stream,r.interval.sampleRate,r.interval.start,r.interval.endExclusive,r.layout,r.conversion.sampleRate,r.conversion.layout]),cached=this.cached<AudioBlockV1>(key);if(cached)return cached;
      let values:Float32Array;
      if(source.wav&&info.sampleRate===r.interval.sampleRate&&info.layout===r.layout){
        const wav=source.wav;if(r.interval.endExclusive>wav.sampleCount)throw new EngineError('E_AUDIO_COVERAGE','WAV source cannot cover the complete requested interval',{details:{requested:r.interval,availableSamples:wav.sampleCount}});
        const width=wav.format==='pcm16'?2:wav.format==='pcm24'?3:4,raw=await readExact(source.file,wav.dataOffset+r.interval.start*channels*width,count*channels*width,s);this.counts.sourceBytesRead+=raw.length;
        values=new Float32Array(count*channels);for(let i=0;i<values.length;i++)values[i]=width===4?raw.readFloatLE(i*4):width===2?raw.readInt16LE(i*2)/32768:raw.readIntLE(i*3,3)/8388608;
      }else{
        const decoderKey=JSON.stringify([r.stream,r.interval.sampleRate,r.layout]);
        if(source.decoderKey!==decoderKey){await source.decoder?.close();source.decoder=new PcmIntervalDecoder(source.path,demuxers[extname(source.path).toLowerCase()],r.stream,r.interval.sampleRate,r.layout,channels,this.options,this.counts);source.decoderKey=decoderKey;}
        const raw=await source.decoder!.read(r.interval.start,count,s);values=new Float32Array(count*channels);for(let i=0;i<values.length;i++)values[i]=raw.readFloatLE(i*4);
      }
      const block=audioBlock(values,{sampleRate:r.interval.sampleRate,layout:r.layout,startSample:r.interval.start});assertAudioBlock(block);this.retain(r.resourceId,key,block,bytes);return block;
    }),signal);
  }
  close():Promise<void>{if(this.closing)return this.closing;this.stopped=true;this.controller.abort();this.closing=(async()=>{await this.tail;await Promise.all([...this.sources.keys()].map(id=>this.evict(id)));this.cache.clear();this.cacheBytes=0;})();return this.closing;}
}
