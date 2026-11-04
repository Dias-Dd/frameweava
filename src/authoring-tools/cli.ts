import {readFile} from 'node:fs/promises';
import {renderCreation,type CreationRequest} from './index.ts';
import {EngineError} from '../core/errors.ts';
import {readProfessionalSettings} from '../media/service.ts';
import {createCLIProgress} from '../cli-progress.ts';
/** Creation output is separate from engineering-source export and interactive preview. */
export async function creationCLI(args:string[]){
 const [project,...rest]=args,flags:Record<string,string|boolean>={};
 if(!project||project.startsWith('--'))throw new EngineError('E_ARGUMENT','create <project.tsx> --output file [--format png|wav|mp4|mov]');
 const booleans=['json','allow-wasm'],values=['output','format','start','end','sample-rate','layout','wav-format','block-samples','audio-settings','settings'];
 for(let i=0;i<rest.length;i++){const key=rest[i].slice(2);if(!rest[i].startsWith('--')||Object.hasOwn(flags,key)||![...booleans,...values].includes(key))throw new EngineError('E_ARGUMENT','Unknown or repeated creation option');if(booleans.includes(key))flags[key]=true;else{const value=rest[++i];if(!value||value.startsWith('--'))throw new EngineError('E_ARGUMENT','Missing creation option value');flags[key]=value;}}
 if(typeof flags.output!=='string')throw new EngineError('E_ARGUMENT','--output is required');
 const integer=(key:string)=>{if(flags[key]===undefined)return undefined;const n=Number(flags[key]);if(!Number.isSafeInteger(n)||n<0)throw new EngineError('E_ARGUMENT',`--${key} must be a nonnegative integer`);return n;};
 if(flags.format!==undefined&&!['png','wav','mp4','mov'].includes(String(flags.format)))throw new EngineError('E_ARGUMENT','Unsupported creation format');
 let audio:CreationRequest['audio'];
 if(['sample-rate','layout','wav-format','block-samples','audio-settings'].some(k=>flags[k]!==undefined)){
  const rate=integer('sample-rate')??48000,layout=flags.layout??'stereo',wavFormat=flags['wav-format']??'float32';
  if(![48000,96000].includes(rate)||!['mono','stereo'].includes(String(layout))||!['pcm16','pcm24','float32'].includes(String(wavFormat)))throw new EngineError('E_ARGUMENT','Invalid audio rate/layout/WAV format');
  audio={sampleRate:rate as 48000|96000,layout:layout as 'mono'|'stereo',wavFormat:wavFormat as 'pcm16'|'pcm24'|'float32',blockSamples:integer('block-samples'),quantization:flags['audio-settings']?JSON.parse(await readFile(String(flags['audio-settings']),'utf8')):{clip:'reject',dither:{kind:'none'}}};
 }
 const settings=flags.settings?await readProfessionalSettings(String(flags.settings)):undefined;
 if(settings?.video){audio??={sampleRate:48000,layout:'stereo',quantization:{clip:'reject',dither:{kind:'none'}}};const {audio:externalAudio,...video}=settings.video;if(externalAudio)throw new EngineError('E_ARGUMENT','Creation audio comes from placed Layer ports; external PCM must use the professional media command');audio.video=video;}
 const progress=createCLIProgress(),controller=new AbortController(),stop=()=>controller.abort();process.once('SIGINT',stop);
 try{return await renderCreation({project,onProgress:progress.update,output:flags.output,format:flags.format as CreationRequest['format'],start:integer('start'),end:integer('end'),audio,render:{allowWasm:flags['allow-wasm']===true,...settings?{media:settings.media}:{}},signal:controller.signal});}
 finally{progress.close();process.off('SIGINT',stop);}
}
