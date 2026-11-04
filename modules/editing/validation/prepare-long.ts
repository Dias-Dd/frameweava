import {mkdir,writeFile,copyFile,stat,open} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {performance} from 'node:perf_hooks';
import {ffmpegPath} from '../../../src/encoding/ffmpeg.ts';
const root=resolve(process.env.EDIT_FROZEN_CORE??'.'),out=process.env.EDIT_EVIDENCE??resolve('modules/editing/validation/evidence-round7'),example=join(root,'modules/editing/examples'),exec=promisify(execFile),commands:any[]=[];
await mkdir(example,{recursive:true});await mkdir(out,{recursive:true});
// Re-overlay current editing code without modifying the frozen Core itself.
const {readdir}=await import('node:fs/promises');for(const name of await readdir('modules/editing'))if(name.endsWith('.ts'))await copyFile(resolve('modules/editing',name),join(root,'modules/editing',name));
if(root!==resolve('.'))await copyFile('modules/editing/examples/long.tsx',join(example,'long.tsx'));
for(const [name,args]of [
 ['long-source.mp4',['-f','lavfi','-i','testsrc2=size=640x360:rate=24:duration=1260','-an','-c:v','libx264','-preset','ultrafast','-crf','30','-threads','4','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-color_range','tv']],
 ['long-source.wav',['-f','lavfi','-i','aevalsrc=0.2*sin(2*PI*(440+110*floor(t/420))*t)|0.15*sin(2*PI*(660+110*floor(t/420))*t):s=48000:d=1260','-c:a','pcm_f32le']],
] as const){const file=join(example,name);try{await stat(file);throw Error('Do not silently reuse or overwrite long qualification media');}catch(e:any){if(e.code!=='ENOENT')throw e;}const start=performance.now();await exec(ffmpegPath(),['-v','error','-nostdin','-n',...args,file],{windowsHide:true,timeout:90000,maxBuffer:2*1024**2});commands.push({file,command:[ffmpegPath(),...args,file],wallMs:performance.now()-start,bytes:(await stat(file)).size});}
// Record an independently scanned WAV data offset for byte comparisons. This
// only reads RIFF chunk headers, without invoking the Core audio service.
const file=await open(join(example,'long-source.wav'),'r');let at=12,dataOffset=0,dataBytes=0;try{const size=(await file.stat()).size;while(at+8<=size){const b=Buffer.alloc(8);await file.read(b,0,8,at);const n=b.readUInt32LE(4);if(b.toString('ascii',0,4)==='data'){dataOffset=at+8;dataBytes=n;break;}at+=8+n+(n%2);}}finally{await file.close();}
if(dataBytes!==1260*48000*8)throw Error('Unexpected long WAV sample count');
await writeFile(join(example,'long-audio.tsx'),`import {audioSource,audioClip,audioSequence,audioComposition} from '../index.ts';\nexport const sound=audioSource('long-sound','./long-source.wav',{sampleRate:48000,layout:'stereo',sampleCount:60480000});\nexport default audioComposition({fps:24,tracks:[audioSequence(audioClip(sound,{duration:10080}),audioClip(sound,{from:20160,duration:10080}),audioClip(sound,{from:10080,duration:10080}))]});\n`);
await writeFile(join(out,'long-input.json'),JSON.stringify({root,example,width:640,height:360,fps:24,seconds:1260,frames:30240,sampleRate:48000,sampleCount:60480000,dataOffset,dataBytes,commands,scope:'Actual 21-minute input files; no assertion about completed long output yet'},null,2)+'\n');console.log(JSON.stringify({root,frames:30240,sourceBytes:commands.map(c=>c.bytes)}));
