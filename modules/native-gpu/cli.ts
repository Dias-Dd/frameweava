import {resolve,dirname,join} from 'node:path';
import {mkdir,readFile,unlink} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../../src/compiler/build.ts';
import {readProfessionalSettings} from '../../src/media/service.ts';
import {EngineError} from '../../src/core/errors.ts';
import {renderNativeProject,type NativeRenderOptions} from './service.ts';
import {previewCLI} from './preview.ts';
import {writeCLIResult} from '../../src/cli-output.ts';
import {createCLIProgress} from '../../src/cli-progress.ts';
export async function nativeMediaCLI(args:string[]){
 if(args[0]&&/\.(?:[cm]?[jt]sx?|json)$/i.test(args[0]))return previewCLI(args);
 const [command,entry,...rest]=args;if(!entry)throw new EngineError('E_ARGUMENT','Native media command requires a project');
 const flags:Record<string,string|boolean>={};for(let i=0;i<rest.length;i++){const name=rest[i].replace(/^--/,'');if(!rest[i].startsWith('--')||!['output','width','height','frame','frames','time','from','to','native','timeout','encoder','max-concurrency','initial-concurrency','memory-mib','json','allow-wasm','allow-ray-query','no-cache','settings','professional-backend'].includes(name))throw new EngineError('E_ARGUMENT',`Unknown native media argument ${rest[i]}`);if(['json','allow-wasm','allow-ray-query','no-cache'].includes(name)){flags[name]=true;continue;}const value=rest[++i];if(!value||value.startsWith('--'))throw new EngineError('E_ARGUMENT',`--${name} needs a value`);flags[name]=value;}
 const n=(name:string,fallback?:number)=>{if(flags[name]===undefined)return fallback;const value=Number(flags[name]);if(!Number.isFinite(value))throw new EngineError('E_ARGUMENT',`--${name} must be finite`);return value;};
 if(flags['professional-backend']!==undefined&&!['reference','gpu'].includes(String(flags['professional-backend'])))throw new EngineError('E_ARGUMENT','--professional-backend reference|gpu');
 if(flags.encoder!==undefined&&!['h264_nvenc','hevc_nvenc','av1_nvenc','libx264','libx265','libaom-av1'].includes(String(flags.encoder)))throw new EngineError('E_ARGUMENT','--encoder h264_nvenc|hevc_nvenc|av1_nvenc|libx264|libx265|libaom-av1');
 const progress=createCLIProgress(),controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 try{
  progress.update({phase:'compile'});
  const compileStart=performance.now(),build=await buildProject(entry),c=build.manifest.composition,fps=c.fps.num/c.fps.den,options:NativeRenderOptions={build,onProgress:progress.update,compileMs:performance.now()-compileStart,professionalBackend:flags['professional-backend'] as NativeRenderOptions['professionalBackend'],output:resolve(String(flags.output??(command==='frame'?'artifacts/frame.png':command==='storyboard'?'artifacts/storyboard.png':'artifacts/video.mp4'))),width:n('width'),height:n('height'),native:typeof flags.native==='string'?flags.native:undefined,timeoutMs:n('timeout'),encoder:flags.encoder as NativeRenderOptions['encoder'],maxConcurrency:n('max-concurrency'),initialConcurrency:n('initial-concurrency'),maxBytes:flags['memory-mib']===undefined?undefined:n('memory-mib')!*1024**2,allowWasm:flags['allow-wasm']===true,allowRayQuery:flags['allow-ray-query']===true,signal:controller.signal,...typeof flags.settings==='string'?{professional:await readProfessionalSettings(flags.settings)}:{}};
  let result:unknown;
  if(command==='frame'){
   if(flags.frame!==undefined&&flags.time!==undefined)throw new EngineError('E_ARGUMENT','Choose --frame or --time');const frame=flags.time===undefined?n('frame',0)!:Math.round(n('time')!*fps);result=await renderNativeProject(entry,{...options,start:frame,end:frame+1});
  }else if(command==='storyboard'){
   const frames=String(flags.frames??[0,Math.floor(c.durationInFrames/2),c.durationInFrames-1].join(',')).split(',').map(Number);if(!frames.length||frames.some(f=>!Number.isSafeInteger(f)||f<0||f>=c.durationInFrames))throw new EngineError('E_FRAME_RANGE','Supply composition frame indices');
   const width=Math.min(options.width??640,c.width),height=Math.round(width*c.height/c.width),files:string[]=[],images:string[]=[];await mkdir(dirname(options.output),{recursive:true});
   const boardBytes=Math.min(3,frames.length)*width*Math.ceil(frames.length/3)*height*4;if(!Number.isSafeInteger(boardBytes)||boardBytes>(options.maxBytes??1024**3))throw new EngineError('E_NATIVE_BUDGET','Storyboard exceeds the configured --memory-mib byte budget',{details:{boardBytes,maxBytes:options.maxBytes??1024**3}});
   progress.update({phase:'first-frame',completed:0,total:frames.length});
   try{for(const frame of frames){const file=join(dirname(options.output),`.frameweave-board-${randomBytes(8).toString('hex')}.png`);files.push(file);await renderNativeProject(entry,{...options,onProgress:undefined,width,height,output:file,start:frame,end:frame+1});images.push(file);progress.update({phase:'render',completed:images.length,total:frames.length});}progress.update({phase:'finalize'});const columns=Math.min(3,frames.length),rows=Math.ceil(frames.length/columns);await sharp({create:{width:columns*width,height:rows*height,channels:4,background:'#151515'}}).composite(images.map((input,i)=>({input,left:i%columns*width,top:Math.floor(i/columns)*height}))).png().toFile(options.output);result={version:1,ok:true,backend:'native-wgpu',output:options.output,frames};}
   finally{for(const f of files)for(const p of [f,`${f}.diagnostics.json`])await unlink(p).catch(()=>{});}
  }else{const start=Math.round(n('from',0)!*fps),end=flags.to===undefined?c.durationInFrames:Math.round(n('to')!*fps);result=await renderNativeProject(entry,{...options,start,end});}
  progress.close();writeCLIResult(result);return result;
 }finally{progress.close();process.off('SIGINT',cancel);process.off('SIGTERM',cancel);}
}
