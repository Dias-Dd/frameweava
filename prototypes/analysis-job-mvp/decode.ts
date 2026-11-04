import {spawn} from 'node:child_process';
import {ffmpegPath} from '../../src/encoding/ffmpeg.ts';
import {EngineError} from '../../src/core/errors.ts';

/** Local extraction adapter around the engine's existing FFmpeg executable. */
export function decodeFrames(mediaPath:string,config:{startSeconds:number;endSeconds:number;sampleRate:number;analysisWidth:number},signal:AbortSignal){
  signal.throwIfAborted();
  const expected=Math.ceil((config.endSeconds-config.startSeconds)*config.sampleRate-1e-9);
  const args=['-hide_banner','-loglevel','error','-threads','1','-ss',String(config.startSeconds),'-i',mediaPath,'-t',String(config.endSeconds-config.startSeconds),'-vf',`fps=fps=${config.sampleRate}:start_time=0:round=near,scale=${config.analysisWidth}:-2:flags=lanczos,setsar=1`,'-frames:v',String(expected),'-an','-fps_mode','passthrough','-f','image2pipe','-vcodec','png','-threads','1','pipe:1'];
  const child=spawn(ffmpegPath(),args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stderr='',spawnError:Error|undefined,closed=false;
  child.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-12000);});
  const done=new Promise<void>(resolve=>{child.once('error',e=>{spawnError=e;});child.once('close',()=>{closed=true;resolve();});});
  const abort=()=>{child.kill();child.stdout.destroy();};signal.addEventListener('abort',abort,{once:true});
  return {pid:child.pid,args,
    async *frames(){
      let bytes=Buffer.alloc(0),count=0;
      try{
        for await(const chunk of child.stdout){
          signal.throwIfAborted();bytes=Buffer.concat([bytes,chunk as Buffer]);
          if(bytes.length>16*1024*1024)throw new EngineError('E_ANALYSIS_DECODE','Decoded PNG exceeds 16 MiB');
          while(bytes.length>=8){
            if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new EngineError('E_ANALYSIS_DECODE','Invalid FFmpeg PNG stream');
            let offset=8,end=0;
            while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset);if(length>16*1024*1024)throw new EngineError('E_ANALYSIS_DECODE','Invalid PNG chunk length');if(offset+length+12>bytes.length)break;const isEnd=bytes.toString('ascii',offset+4,offset+8)==='IEND';offset+=length+12;if(isEnd){end=offset;break;}}
            if(!end)break;
            const png=Buffer.from(bytes.subarray(0,end));bytes=bytes.subarray(end);yield {png,index:count++};signal.throwIfAborted();
          }
        }
        await done;signal.throwIfAborted();
        if(spawnError||child.exitCode!==0||bytes.length||count!==expected)throw new EngineError('E_ANALYSIS_DECODE',`FFmpeg produced ${count}/${expected} frames. ${spawnError?.message??stderr}`);
      }finally{signal.removeEventListener('abort',abort);if(!closed)child.kill();await done;}
    },
    async close(){signal.removeEventListener('abort',abort);if(!closed)child.kill();await done;return {decoderClosed:closed};}
  };
}
