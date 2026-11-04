import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {EngineError} from '../core/errors.ts';
import type {AudioLayout,AudioSampleRate} from './block.ts';
import type {AudioResourceOptions} from './resource-options.ts';
import {ffmpegPath} from '../encoding/ffmpeg.ts';

/** One host-owned forward PCM stream. No approximate timestamp seeking: random
 * backward misses restart at decoded sample zero. stdout stays in paused mode,
 * with Node/OS pipe backpressure instead of an unbounded decoded-source array. */
export class PcmIntervalDecoder {
  private child?:ChildProcessWithoutNullStreams;private exited?:Promise<void>;
  private failure?:Error;private stderr='';private cursor=0;private closed=false;
  readonly channels:number;
  constructor(private path:string,private demuxer:string,private stream:number,
    private sampleRate:AudioSampleRate,private layout:AudioLayout,channels:number,
    private options:AudioResourceOptions,private counts:{decoderStarts:number;decoderRestarts:number;decodedBytes:number}) {this.channels=channels;}
  private start(){
    const child=spawn(this.options.ffmpeg??ffmpegPath(),['-hide_banner','-loglevel','error','-nostdin',
      '-protocol_whitelist','file,pipe',...this.demuxer==='mov'?['-enable_drefs','0','-use_absolute_path','0']:[],'-f',this.demuxer,'-i',this.path,'-map',`0:a:${this.stream}`,'-vn','-sn','-dn',
      '-af',`aresample=${this.sampleRate}:async=0`,'-ac',String(this.channels),'-channel_layout',this.layout,
      '-f','f32le','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;this.cursor=0;this.failure=undefined;this.stderr='';this.counts.decoderStarts++;
    child.stdin.end();child.stdout.on('error',error=>{this.failure=error;});
    child.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk).slice(-8192);});
    child.on('error',error=>{this.failure=error;child.stdout.destroy();});
    this.exited=new Promise<void>(done=>child.once('close',code=>{if(code!==0&&!this.closed)this.failure=new EngineError('E_AUDIO_DECODE',this.stderr||`Audio decoder exited ${code}`);done();}));
  }
  private async bytes(length:number,retain:boolean,signal:AbortSignal):Promise<Buffer|undefined>{
    const child=this.child!,result=retain?Buffer.alloc(length):undefined;let offset=0;
    while(offset<length){
      if(signal.aborted||this.closed)throw new EngineError('E_RENDER_CANCELLED','Audio resource decoding cancelled');
      if(this.failure)throw new EngineError('E_AUDIO_DECODE',this.failure.message.replaceAll(this.path,'<declared audio>'));
      // Consume an existing partial buffer before waiting for more. Waiting for
      // a fixed 64 KiB read can repeatedly re-emit readable with fewer bytes and
      // starve I/O/timeout callbacks on some Node pipe implementations.
      const chunk=child.stdout.read(Math.min(length-offset,Math.max(1,child.stdout.readableLength),65536)) as Buffer|null;
      if(chunk){if(result)chunk.copy(result,offset);offset+=chunk.length;this.cursor+=chunk.length;this.counts.decodedBytes+=chunk.length;continue;}
      if(child.stdout.readableEnded||child.stdout.destroyed){await this.exited;const failure=this.failure as Error|undefined;if(failure)throw new EngineError('E_AUDIO_DECODE',failure.message.replaceAll(this.path,'<declared audio>'));
        throw new EngineError('E_AUDIO_COVERAGE','Audio source cannot cover the complete requested sample interval',{details:{decodedSamples:this.cursor/(this.channels*4)}});}
      await new Promise<void>(done=>{const wake=()=>{child.stdout.off('readable',wake);child.stdout.off('end',wake);child.stdout.off('close',wake);signal.removeEventListener('abort',wake);done();};
        child.stdout.once('readable',wake);child.stdout.once('end',wake);child.stdout.once('close',wake);signal.addEventListener('abort',wake,{once:true});if(signal.aborted)wake();});
    }
    return result;
  }
  async read(start:number,count:number,signal:AbortSignal):Promise<Buffer>{
    if(this.closed)throw new EngineError('E_AUDIO_RESOURCE_CLOSED','Decoder is closed');
    const offset=start*this.channels*4;
    if(this.child&&(offset<this.cursor||this.failure||this.child.stdout.readableEnded||this.child.stdout.destroyed)){this.counts.decoderRestarts++;await this.stop();}
    if(!this.child)this.start();
    const cancel=()=>{this.child?.kill();this.child?.stdout.destroy();};signal.addEventListener('abort',cancel,{once:true});
    try{if(offset>this.cursor)await this.bytes(offset-this.cursor,false,signal);return (await this.bytes(count*this.channels*4,true,signal))!;}
    finally{signal.removeEventListener('abort',cancel);}
  }
  private async stop(){const child=this.child;if(!child)return;this.child=undefined;child.kill();child.stdout.destroy();child.stderr.resume();await this.exited;}
  async close(){this.closed=true;await this.stop();}
}
