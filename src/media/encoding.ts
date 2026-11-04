import {spawn,execFile,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {promisify} from 'node:util';
import {once} from 'node:events';
import {access,mkdir,writeFile,stat,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {injectHdrMetadata} from './hdr-metadata.ts';
import {OcioWorker} from './ocio-worker.ts';
import {randomBytes} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {EngineError} from '../core/errors.ts';
import type {Rational} from '../core/types.ts';
import {ffmpegPath} from '../encoding/ffmpeg.ts';
import {pixelsFromSurface,surfaceFromPixels,assertColor,pq2020,type ProfessionalSurface,type ColorEncoding} from './surface.ts';
import {transformSurface} from './color.ts';
import {ocioTransform,ocioInfo,type OcioTransform} from './ocio.ts';

export type ProfessionalPreset='sdr-av1'|'av1-10'|'sdr-hevc'|'sdr-h264'|'hevc10'|'hdr10'|'hlg'|'prores422'|'prores422hq'|'prores4444'|'prores4444xq'|'dnxhr-hqx'|'tiff16';
export type ProfessionalEncoderName='libx264'|'libx265'|'libaom-av1'|'h264_nvenc'|'hevc_nvenc'|'av1_nvenc';
const presets={
 'sdr-av1':{codec:'libaom-av1',pixel:'yuv420p',args:['-cpu-used','8','-crf','18','-b:v','0','-threads','2'],alpha:false},
 'av1-10':{codec:'libaom-av1',pixel:'yuv420p10le',args:['-cpu-used','8','-crf','18','-b:v','0','-threads','2'],alpha:false},
 'sdr-hevc':{codec:'libx265',pixel:'yuv420p',args:['-crf','18','-preset','ultrafast'],alpha:false},
 'sdr-h264':{codec:'libx264',pixel:'yuv420p',args:['-crf','18','-preset','fast'],alpha:false},
 hevc10:{codec:'libx265',pixel:'yuv420p10le',args:['-crf','12','-preset','ultrafast'],alpha:false},
 hdr10:{codec:'libx265',pixel:'yuv420p10le',args:['-crf','12','-preset','ultrafast','-profile:v','main10','-tag:v','hvc1'],alpha:false},
 hlg:{codec:'libx265',pixel:'yuv420p10le',args:['-crf','12','-preset','ultrafast','-profile:v','main10','-tag:v','hvc1'],alpha:false},
 prores422:{codec:'prores_ks',pixel:'yuv422p10le',args:['-profile:v','2'],alpha:false},
 prores422hq:{codec:'prores_ks',pixel:'yuv422p10le',args:['-profile:v','3'],alpha:false},
 prores4444:{codec:'prores_ks',pixel:'yuva444p10le',args:['-profile:v','4','-alpha_bits','16'],alpha:true},
 prores4444xq:{codec:'prores_ks',pixel:'yuva444p10le',args:['-profile:v','5','-alpha_bits','16'],alpha:true},
 'dnxhr-hqx':{codec:'dnxhd',pixel:'yuv422p10le',args:['-profile:v','dnxhr_hqx'],alpha:false},
 tiff16:{codec:'tiff',pixel:'rgba64le',args:['-compression_algo','deflate'],alpha:true},
} as const;
export interface Hdr10Metadata {
  masteringDisplay:{red:[number,number];green:[number,number];blue:[number,number];white:[number,number];minNits:number;maxNits:number};
  maxCLL:number;maxFALL:number;
}
export interface PcmAsset {path:string;sampleRate:48000|96000;channels:number;channelLayout?:'mono'|'stereo'|'2.1'|'3.0'|'quad'|'5.0'|'5.1'|'7.1';format:'s24le'|'f32le';startSample:0}
export interface ProfessionalEncodeOptions {
  encoder?:ProfessionalEncoderName;preset:ProfessionalPreset;fps:Rational;width:number;height:number;outputColor:ColorEncoding;
  conversion:{kind:'colorimetric';clip:boolean}|{kind:'ocio';transform:Omit<OcioTransform,'outputColor'>;clip:boolean};
  alpha:{mode:'preserve'}|{mode:'flatten';matte:[number,number,number]};
  hdr10?:Hdr10Metadata;audio?:PcmAsset;ffmpeg?:string;
}
const exec=promisify(execFile);
const primaries=(c:ColorEncoding)=>c.primaries==='rec709'?'bt709':c.primaries==='rec2020'?'bt2020':c.primaries==='display-p3'?'smpte432':'unknown';
const transfer=(c:ColorEncoding)=>({linear:'linear',srgb:'iec61966-2-1',rec709:'bt709',pq:'smpte2084',hlg:'arib-std-b67'}[c.transfer]);
const matrix=(c:ColorEncoding)=>c.primaries==='rec2020'?'bt2020nc':'bt709';
export function zscale(c:ColorEncoding,decode=false){const p=c.primaries==='rec2020'?'2020':'709',t=transfer(c),m=c.primaries==='rec2020'?'2020_ncl':'709';return decode?`zscale=matrixin=${m}:matrix=gbr:primariesin=${p}:primaries=${p}:transferin=${t}:transfer=${t}:rangein=limited:range=full`:`zscale=matrixin=gbr:matrix=${m}:primariesin=${p}:primaries=${p}:transferin=${t}:transfer=${t}:rangein=full:range=limited`;}
function hdrParams(m:Hdr10Metadata):string {
  const d=m.masteringDisplay,xy=(p:[number,number])=>p.map(v=>Math.round(v*50000)).join(',');
  if(!d||[d.red,d.green,d.blue,d.white].some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v)||v<=0||v>=1))||!Number.isFinite(d.minNits)||!Number.isFinite(d.maxNits)||d.minNits<0||d.maxNits<=d.minNits||d.maxNits>10000||![m.maxCLL,m.maxFALL].every(v=>Number.isInteger(v)&&v>=0&&v<=65535)||m.maxFALL>m.maxCLL)throw new EngineError('E_MEDIA_HDR_METADATA','Invalid mastering display / MaxCLL / MaxFALL');
  return `hdr10=1:hdr10-opt=1:master-display=G(${xy(d.green)})B(${xy(d.blue)})R(${xy(d.red)})WP(${xy(d.white)})L(${Math.round(d.maxNits*10000)},${Math.round(d.minNits*10000)}):max-cll=${m.maxCLL},${m.maxFALL}`;
}
export function assertHdr10Metadata(metadata:Hdr10Metadata):void{hdrParams(metadata);}
export async function mediaEncodingCapabilities(ffmpeg=ffmpegPath()){
  const [version,encoders,filters]=await Promise.all([exec(ffmpeg,['-version'],{windowsHide:true}),exec(ffmpeg,['-hide_banner','-encoders'],{windowsHide:true}),exec(ffmpeg,['-hide_banner','-filters'],{windowsHide:true})]);
  let ocio:unknown;try{ocio={available:true,...await ocioInfo()};}catch(e){ocio={available:false,diagnostic:{code:(e as EngineError).code??'E_MEDIA_OCIO',message:(e as Error).message}};}
  return {schemaVersion:1,ffmpeg:{path:ffmpeg,version:version.stdout.split(/\r?\n/)[0],configuration:version.stdout.split(/\r?\n/).find(s=>s.startsWith('configuration:'))},formats:Object.entries(presets).map(([id,p])=>({id,encoder:p.codec,pixelFormat:p.pixel,alpha:p.alpha,available:new RegExp(`\\b${p.codec}\\s`).test(encoders.stdout)&&filters.stdout.includes('zscale'),runtimeVerified:false})),ocio,
    filters:{zscale:filters.stdout.includes('zscale')},surface:{schemaVersion:'frameweave.surface/2',formats:['rgba8unorm','rgb10a2unorm','rgba16float','rgba32float'],transport:'cpu-inline-base64',gpuTextureTransfer:false,multiplaneYuv:'explicit-ffmpeg-adapter',rawGpuHdr:false},
    limitations:['Listed encoders still require an actual encode/decode validation on this platform','No automatic tools, model or browser download','ICC float-HDR and arbitrary OCIO file configs require a future verified adapter','Hardware encoder availability is not inferred from the encoder list']};
}
/** Packed RGBA to planar GBR(A) float32; nonlinear codes are retained, not reinterpreted as linear. */
export function planarFloat(s:ProfessionalSurface,alpha:boolean):Buffer {
  const p=pixelsFromSurface(s),n=s.width*s.height,out=Buffer.allocUnsafe(n*(alpha?4:3)*4);
  for(let i=0;i<n;i++){const a=p[i*4+3],factor=s.alpha==='premultiplied'?a?1/a:0:1;for(const [plane,c]of [[0,1],[1,2],[2,0]])out.writeFloatLE(p[i*4+c]*factor,(plane*n+i)*4);if(alpha)out.writeFloatLE(a,(3*n+i)*4);}return out;
}
function packedRgba16(s:ProfessionalSurface):Buffer {
  const p=pixelsFromSurface(s),out=Buffer.allocUnsafe(p.length*2);for(let i=0;i<p.length;i++){const a=p[i-i%4+3],v=i%4!==3&&s.alpha==='premultiplied'?a?p[i]/a:0:p[i];if(v<0||v>1)throw new EngineError('E_MEDIA_CODE_RANGE','TIFF requires bounded display codes');out.writeUInt16LE(Math.round(v*65535),i*2);}return out;
}
function flatten(s:ProfessionalSurface,matte:[number,number,number]):ProfessionalSurface {
  if(s.color.transfer!=='linear'||matte.length!==3||matte.some(v=>!Number.isFinite(v)))throw new EngineError('E_MEDIA_ALPHA_COLOR','Flatten against an explicit linear-working-space matte before any display/output transform');
  const p=pixelsFromSurface(s);for(let i=0;i<p.length;i+=4){const a=p[i+3];for(let c=0;c<3;c++)p[i+c]=(s.alpha==='premultiplied'?p[i+c]:p[i+c]*a)+matte[c]*(1-a);p[i+3]=1;}
  return surfaceFromPixels(s.width,s.height,p,{format:'rgba32float',color:s.color,alpha:'opaque'});
}
/** One bounded frame transform. Alpha is kept out of zscale's limited-range YUV conversion. */
async function binaryTransform(ffmpeg:string,args:string[],input:Buffer,expectedBytes:number):Promise<Buffer>{
  return new Promise((done,reject)=>{const child=spawn(ffmpeg,args,{windowsHide:true,stdio:'pipe'}),parts:Buffer[]=[];let length=0,stderr='',error:unknown;
    const timer=setTimeout(()=>{error=new EngineError('E_MEDIA_CONVERT_TIMEOUT','Frame conversion exceeded 120 seconds');child.kill();},120000);
    child.stdout.on('data',b=>{length+=b.length;if(length>expectedBytes){error=new EngineError('E_MEDIA_BYTES','Unexpected conversion output length');child.kill();}else parts.push(b);});child.stderr.on('data',b=>stderr=(stderr+b).slice(-16000));child.stdin.on('error',()=>{});child.once('error',e=>{error=e;});child.once('close',code=>{clearTimeout(timer);if(error||code!==0||length!==expectedBytes)reject(error??new EngineError('E_MEDIA_CONVERT',stderr||'Frame conversion failed'));else done(Buffer.concat(parts,length));});child.stdin.end(input);
  });
}
async function proresAlphaFrame(surface:ProfessionalSurface,ffmpeg:string):Promise<Buffer>{
  const n=surface.width*surface.height,color=await binaryTransform(ffmpeg,['-v','error','-threads','2','-f','rawvideo','-pixel_format','gbrpf32le','-video_size',`${surface.width}x${surface.height}`,'-i','pipe:0','-frames:v','1','-vf',`${zscale(surface.color)},format=yuv444p10le`,'-f','rawvideo','pipe:1'],planarFloat(surface,false),n*6),out=Buffer.allocUnsafe(n*8),p=pixelsFromSurface(surface);color.copy(out);
  for(let i=0;i<n;i++)out.writeUInt16LE(Math.round(p[i*4+3]*1023),n*6+i*2);return out;
}
export class ProfessionalVideoEncoder {
  private child:ChildProcessWithoutNullStreams;private complete:Promise<void>;private stderr='';private busy=false;private closed=false;private frames=0;
  readonly conversions:{frame:number;clippedSamples:number;ocio?:unknown}[]=[];
  readonly timings:{frame:number;phase:string;durationMs:number}[]=[];
  private clippedTotal=0;private ocioIdentity?:string;private ocioWorker?:OcioWorker;
  private constructor(readonly output:string,readonly options:ProfessionalEncodeOptions,readonly args:string[],ffmpeg:string,private encodedOutput=output,private metadataCodec?:'av1'|'hevc'){
    this.child=spawn(ffmpeg,args,{windowsHide:true,stdio:'pipe'});this.child.stdout.resume();this.child.stderr.on('data',b=>{this.stderr=(this.stderr+b.toString()).slice(-65536);});this.child.stdin.on('error',()=>{});
    this.complete=new Promise((done,reject)=>{this.child.once('error',e=>reject(new EngineError('E_MEDIA_ENCODE',String(e))));this.child.once('close',code=>code===0?done():reject(new EngineError('E_MEDIA_ENCODE',this.stderr||`Encoder exited ${code}`)));});this.complete.catch(()=>{});
  }
  static async create(output:string,options:ProfessionalEncodeOptions){
    options=structuredClone(options);
    const base=Object.hasOwn(presets,options.preset)?presets[options.preset]:undefined;
    const name=options.encoder??base?.codec;const hardware=name?.endsWith('_nvenc');
    if(name&&!['libx264','libx265','libaom-av1','h264_nvenc','hevc_nvenc','av1_nvenc','prores_ks','dnxhd','tiff'].includes(name))throw new EngineError('E_MEDIA_CODEC','Unknown encoder');
    if(base&&options.encoder){const hdr=options.preset==='hdr10'||options.preset==='hlg',family=(v:string)=>v.includes('264')?'h264':(v.includes('265')||v.includes('hevc'))?'hevc':v.includes('av1')?'av1':v;if(!hdr&&family(name!)!==family(base.codec))throw new EngineError('E_MEDIA_CODEC','Encoder does not match preset family');if(hdr&&!['hevc','av1'].includes(family(name!)))throw new EngineError('E_MEDIA_CODEC','HDR output needs a 10-bit HEVC/AV1 encoder');}
    const p=base?{...base,codec:name!,pixel:hardware&&base.pixel==='yuv420p10le'?'p010le':base.pixel,args:options.encoder?(hardware?['-preset','p4','-rc','vbr','-cq',base.pixel==='yuv420p10le'?'12':'18','-b:v','0']:name==='libaom-av1'?['-cpu-used','8','-crf','18','-b:v','0','-threads','2']:base.args):base.args}:undefined;if(!p)throw new EngineError('E_MEDIA_CODEC','Unknown professional preset');
    if(!options.outputColor||!options.conversion||!['colorimetric','ocio'].includes(options.conversion.kind)||typeof options.conversion.clip!=='boolean'||!options.alpha||!['preserve','flatten'].includes(options.alpha.mode))throw new EngineError('E_MEDIA_POLICY','Explicit color conversion, clipping and alpha policy required');
    if(!Number.isInteger(options.width)||!Number.isInteger(options.height)||options.width<2||options.height<2||!Number.isInteger(options.fps.num)||!Number.isInteger(options.fps.den)||options.fps.num<=0||options.fps.den<=0)throw new EngineError('E_MEDIA_ENCODE_SIZE','Finite even video dimensions and rational FPS required');
    if(options.preset!=='tiff16'&&(options.width%2||options.height%2))throw new EngineError('E_MEDIA_ENCODE_SIZE','Subsampled professional video requires even dimensions');
    if(!p.alpha&&options.alpha.mode==='preserve')throw new EngineError('E_MEDIA_ALPHA_UNSUPPORTED','This codec cannot preserve alpha; request an explicit linear matte');
    const c=options.outputColor;assertColor(c);if(!['rec709','rec2020'].includes(c.primaries))throw new EngineError('E_MEDIA_CODEC_COLOR','Video adapter currently supports explicit Rec.709/Rec.2020 output; ACEScg/P3 remain valid intermediates');
    if(options.preset==='hdr10'&&(c.primaries!=='rec2020'||c.transfer!=='pq'||!options.hdr10))throw new EngineError('E_MEDIA_HDR_METADATA','HDR10 requires Rec.2020 PQ and explicit mastering/CLL/FALL metadata');
    if(options.preset==='hlg'&&(c.primaries!=='rec2020'||c.transfer!=='hlg'||options.hdr10))throw new EngineError('E_MEDIA_CODEC_COLOR','HLG requires Rec.2020 HLG and must not carry PQ HDR10 metadata');
    if(options.hdr10)hdrParams(options.hdr10);
    output=resolve(output);try{await access(output);throw new EngineError('E_MEDIA_OUTPUT_EXISTS','Refusing to overwrite an existing professional output');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}await mkdir(dirname(output),{recursive:true});
    const caps=await mediaEncodingCapabilities(options.ffmpeg);if(!caps.filters.zscale)throw new EngineError('E_MEDIA_CODEC_UNAVAILABLE','zscale is required for professional output');const listed=(await exec(options.ffmpeg??ffmpegPath(),['-hide_banner','-encoders'],{windowsHide:true})).stdout;if(!new RegExp('\\b'+p.codec+'\\s').test(listed))throw new EngineError('E_MEDIA_CODEC_UNAVAILABLE','Required encoder unavailable: '+p.codec);
    const metadataCodec: 'av1'|'hevc'|undefined=options.preset==='hdr10'&&p.codec!=='libx265'?(p.codec.includes('av1')?'av1':'hevc'):undefined;const encodedOutput=metadataCodec?output+'.encoded-'+randomBytes(12).toString('hex')+(metadataCodec==='av1'?'.ivf':'.hevc'):output;
    const separateAlpha=p.codec==='prores_ks'&&p.alpha;
    const audio=options.audio,args=['-hide_banner','-loglevel','error','-n','-threads','2','-f','rawvideo','-pixel_format',separateAlpha?'yuva444p10le':options.preset==='tiff16'?'rgba64le':'gbrpf32le','-video_size',`${options.width}x${options.height}`,'-framerate',`${options.fps.num}/${options.fps.den}`,'-i','pipe:0'];
    if(audio){
      const layouts:Record<string,number>={mono:1,stereo:2,'2.1':3,'3.0':3,quad:4,'5.0':5,'5.1':6,'7.1':8},layout=audio.channelLayout??(audio.channels===1?'mono':audio.channels===2?'stereo':undefined);
      if(![48000,96000].includes(audio.sampleRate)||!layout||layouts[layout]!==audio.channels||!['s24le','f32le'].includes(audio.format)||audio.startSample!==0)throw new EngineError('E_MEDIA_AUDIO','PCM requires 48/96kHz, s24le/f32le, origin 0 and an explicit matching multichannel layout');
      if(options.preset==='tiff16')throw new EngineError('E_MEDIA_AUDIO','A TIFF still cannot carry PCM audio');
      await stat(resolve(audio.path));if(!metadataCodec)args.push('-f',audio.format,'-ar',String(audio.sampleRate),'-ac',String(audio.channels),'-channel_layout',layout,'-i',resolve(audio.path),'-map','0:v:0','-map','1:a:0','-c:a',output.toLowerCase().endsWith('.mp4')?'aac':'pcm_s24le');
    }else args.push('-an');
    // zscale cannot write semiplanar P010. Force a planar 10-bit intermediate;
    // otherwise format negotiation may insert an 8-bit swscale conversion.
    if(!separateAlpha&&options.preset!=='tiff16')args.push('-vf',`${zscale(c)},${p.pixel==='p010le'?'format=yuv420p10le,':''}format=${p.pixel}`);
    args.push('-c:v',p.codec,...p.args,'-pix_fmt',p.pixel,'-color_primaries',primaries(c),'-color_trc',transfer(c),'-colorspace',matrix(c),'-color_range',options.preset==='tiff16'?'pc':'tv');
    if(p.codec==='libx265')args.push('-x265-params',`pools=1:frame-threads=1:log-level=error:repeat-headers=1${options.hdr10?':'+hdrParams(options.hdr10):''}`);
    if(options.preset==='tiff16')args.push('-frames:v','1');if(metadataCodec)args.push('-bf','0','-f',metadataCodec==='av1'?'ivf':'hevc');args.push(encodedOutput);return new ProfessionalVideoEncoder(output,options,args,options.ffmpeg??ffmpegPath(),encodedOutput,metadataCodec);
  }
  async write(surface:ProfessionalSurface):Promise<void>{
    if(this.closed)throw new EngineError('E_MEDIA_ENCODER_CLOSED','Encoder is closed');if(this.busy)throw new EngineError('E_MEDIA_ENCODER_BUSY','Await the previous frame write');if(this.options.preset==='tiff16'&&this.frames)throw new EngineError('E_MEDIA_FRAME_COUNT','TIFF preset writes one still; use explicit per-frame filenames for a sequence');this.busy=true;
    const began=performance.now();try{
      if(surface.width!==this.options.width||surface.height!==this.options.height)throw new EngineError('E_MEDIA_ENCODE_SIZE','Frame dimensions changed');
      let s=this.options.alpha.mode==='flatten'?flatten(surface,this.options.alpha.matte):surface,ocio:unknown,clippedSamples=0;
      if(this.options.conversion.kind==='ocio'){this.ocioWorker??=new OcioWorker();const r=await ocioTransform(s,{...this.options.conversion.transform,outputColor:this.options.outputColor},this.ocioWorker);s=r.surface;ocio=r.provenance;const identity=JSON.stringify([r.provenance.version,r.provenance.configSha256,r.provenance.processorCacheID]);if(this.ocioIdentity&&identity!==this.ocioIdentity)throw new EngineError('E_MEDIA_COLOR_RUNTIME_CHANGED','OCIO runtime/config/processor changed within one output');this.ocioIdentity=identity;}
      else{const r=transformSurface(s,this.options.outputColor,{clip:this.options.conversion.clip});s=r.surface;clippedSamples=r.clippedSamples;}
      const values=pixelsFromSurface(s);for(let i=0;i<values.length;i++)if(i%4!==3){const a=values[i-i%4+3],v=s.alpha==='premultiplied'?a?values[i]/a:0:values[i];if(v<0||v>1){if(!this.options.conversion.clip)throw new EngineError('E_MEDIA_CODE_RANGE','Video output codes exceed [0,1]; explicitly clip or choose an OCIO output view');values[i]=Math.max(0,Math.min(1,v))*(s.alpha==='premultiplied'?a:1);clippedSamples++;}}
      const transformed=performance.now();s=surfaceFromPixels(s.width,s.height,values,{format:'rgba32float',color:s.color,alpha:s.alpha,deferBase64:true});const preset=presets[this.options.preset],bytes=this.options.preset==='tiff16'?packedRgba16(s):preset.codec==='prores_ks'&&preset.alpha?await proresAlphaFrame(s,this.options.ffmpeg??ffmpegPath()):planarFloat(s,false);const packed=performance.now();
      if(this.child.exitCode!==null||this.child.stdin.destroyed){await this.complete;throw new EngineError('E_MEDIA_ENCODE','Encoder exited early');}
      if(!this.child.stdin.write(bytes))await Promise.race([once(this.child.stdin,'drain'),this.complete.then(()=>{throw new EngineError('E_MEDIA_ENCODE','Encoder closed before input completed');})]);
      if(this.timings.length<768)this.timings.push({frame:this.frames,phase:'output-transform-and-code-range',durationMs:transformed-began},{frame:this.frames,phase:'pack-and-alpha-color-adapter',durationMs:packed-transformed},{frame:this.frames,phase:'stdin-write-and-backpressure',durationMs:performance.now()-packed});
      if(this.conversions.length<256)this.conversions.push({frame:this.frames,clippedSamples,...ocio?{ocio}:{}});this.frames++;this.clippedTotal+=clippedSamples;
    }catch(e){await this.abort();throw e;}finally{this.busy=false;}
  }
  async finish(){if(this.closed)throw new EngineError('E_MEDIA_ENCODER_CLOSED','Encoder is closed');if(this.busy)throw new EngineError('E_MEDIA_ENCODER_BUSY','Await frame write');
    if(!this.frames){await this.abort();throw new EngineError('E_MEDIA_ENCODE','No frames supplied');}
    if(this.options.audio){const a=this.options.audio,bytes=(await stat(resolve(a.path))).size,bytesPerSample=a.format==='s24le'?3:4,samples=bytes/(bytesPerSample*a.channels),expected=this.frames*this.options.fps.den/this.options.fps.num*a.sampleRate;if(!Number.isInteger(samples)||Math.abs(samples-expected)>1){await this.abort();throw new EngineError('E_MEDIA_AUDIO_DURATION','PCM sample count must match the exact video frame duration within one sample');}}
    this.closed=true;const start=performance.now();this.child.stdin.end();await this.complete;await this.ocioWorker?.close();
    if(this.metadataCodec){const tagged=this.encodedOutput+'.tagged';try{await injectHdrMetadata(this.encodedOutput,tagged,this.metadataCodec,this.options.hdr10!);const c=this.options.outputColor,a=this.options.audio,args=['-hide_banner','-loglevel','error','-n',...this.metadataCodec==='hevc'?['-r',this.options.fps.num+'/'+this.options.fps.den,'-f','hevc']:[],'-i',tagged];if(a)args.push('-f',a.format,'-ar',String(a.sampleRate),'-ac',String(a.channels),'-i',resolve(a.path),'-map','0:v:0','-map','1:a:0','-c:a',this.output.toLowerCase().endsWith('.mp4')?'aac':'pcm_s24le');args.push('-c:v','copy','-color_primaries',primaries(c),'-color_trc',transfer(c),'-colorspace',matrix(c),'-color_range','tv');if(this.metadataCodec==='hevc')args.push('-tag:v','hvc1');if(/\.(mp4|mov)$/i.test(this.output))args.push('-movflags','+faststart');args.push(this.output);await exec(this.options.ffmpeg??ffmpegPath(),args,{windowsHide:true,timeout:120000,maxBuffer:1024*1024});}finally{await unlink(this.encodedOutput).catch(()=>{});await unlink(tagged).catch(()=>{});}}
    const report={schemaVersion:1,frames:this.frames,options:this.options,args:this.args,conversions:this.conversions,clippedTotal:this.clippedTotal,frameRecordsTruncated:this.frames>256,timings:this.timings,finalDrainMs:performance.now()-start};await writeFile(`${this.output}.media.json`,JSON.stringify(report,null,2));return report;}
  async abort(){this.closed=true;this.child.stdin.destroy();this.child.kill();try{await this.complete;}catch{}await this.ocioWorker?.close();if(this.encodedOutput!==this.output)await unlink(this.encodedOutput).catch(()=>{});}
}
export const localVideoInputArgs=['-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,avi,mpegts,ogg'] as const;
export async function inspectMediaFile(file:string,ffprobe=process.env.FRAMEWEAVE_FFPROBE,options:{localVideo?:boolean;signal?:AbortSignal;probeFrames?:boolean}={}){
  if(!ffprobe)throw new EngineError('E_MEDIA_PROBE_UNAVAILABLE','Set explicit FRAMEWEAVE_FFPROBE for external metadata/quality inspection');
  // One packet can be audio or a reordered picture. Bounded preroll is needed
  // before a real video frame (and its mastering metadata) becomes available.
  return JSON.parse((await exec(resolve(ffprobe),['-v','error',...options.localVideo?localVideoInputArgs:[],'-show_streams','-show_format',...options.probeFrames===false?[]:['-read_intervals','%+#64','-show_frames'],'-of','json',resolve(file)],{windowsHide:true,maxBuffer:4*1024*1024,timeout:120000,signal:options.signal})).stdout);
}
export async function decodeVideoFloat(file:string,options:{color:ColorEncoding;width:number;height:number;ffmpeg?:string;alpha?:boolean}):Promise<ProfessionalSurface>{
  const result=await exec(options.ffmpeg??ffmpegPath(),['-v','error','-i',resolve(file),'-frames:v','1','-vf',`${zscale(options.color,true)},format=gbrpf32le`,'-f','rawvideo','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:options.width*options.height*16+1024*1024,timeout:120000});
  const b=result.stdout,n=options.width*options.height,p=new Float32Array(n*4);if(b.length!==n*12)throw new EngineError('E_MEDIA_DECODE','Unexpected decoded frame layout');
  let alpha:Buffer|undefined;if(options.alpha){alpha=(await exec(options.ffmpeg??ffmpegPath(),['-v','error','-i',resolve(file),'-frames:v','1','-pix_fmt','yuva444p16le','-f','rawvideo','pipe:1'],{encoding:'buffer',windowsHide:true,maxBuffer:n*8+1024*1024,timeout:120000})).stdout;if(alpha.length!==n*8)throw new EngineError('E_MEDIA_DECODE','Invalid integer alpha plane');}
  for(let i=0;i<n;i++){p[i*4]=b.readFloatLE((2*n+i)*4);p[i*4+1]=b.readFloatLE(i*4);p[i*4+2]=b.readFloatLE((n+i)*4);p[i*4+3]=alpha?alpha.readUInt16LE(n*6+i*2)/65535:1;}
  return surfaceFromPixels(options.width,options.height,p,{format:'rgba32float',color:options.color,alpha:options.alpha?'straight':'opaque'});
}
