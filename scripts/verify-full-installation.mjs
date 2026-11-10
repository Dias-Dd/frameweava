import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),install=resolve(process.argv[2]),proof=resolve(process.argv[3]);
await mkdir(proof,{recursive:true});
const pointer=JSON.parse(await readFile(join(install,'current.json'),'utf8'));
const release=join(install,pointer.release),app=join(release,'app'),node=join(release,'runtime/node/node.exe');
assert.equal(resolve(process.execPath),resolve(node),'Run acceptance with the installed private Node');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('FRAMEWEAVE_')&&!key.startsWith('PYTHON')&&!['NODE_PATH','NODE_OPTIONS'].includes(key)));
env.Path=[join(process.env.SystemRoot,'System32'),join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0'),process.env.SystemRoot].join(';');
const rows=[];
async function cli(args,label){const start=performance.now();try{const result=await exec(join(process.env.SystemRoot,'System32/cmd.exe'),['/d','/c',join(install,'bin/frameweave.cmd'),...args],{env,cwd:proof,windowsHide:true,timeout:45000,maxBuffer:4*1024**2});await writeFile(join(proof,label+'.json'),result.stdout);rows.push({name:label,ok:true,ms:performance.now()-start});return result.stdout;}catch(e){rows.push({name:label,ok:false,ms:performance.now()-start,stderr:e.stderr,stdout:e.stdout});throw e;}}
try{
 await cli(['--version'],'private-node-cli');
 await cli(['doctor','--json'],'distribution-doctor');
 const receipt=JSON.parse(await readFile(join(install,'data/full-installation.json'),'utf8'));
 assert.equal(receipt.packages.length,11);
 await cli(['packages','verify','--json'],'all-11-packages');
 const starter=join(proof,'starter');await cli(['init',starter,'--json'],'init');
 await cli(['frame',join(starter,'project.tsx'),'--frame','0','--width','160','--height','90','--output',join(proof,'core.png'),'--json'],'native-png');
 await cli(['frame',join(starter,'project.tsx'),'--frame','0','--width','160','--height','90','--output',join(proof,'core.exr'),'--json'],'native-exr');
 await cli(['create',join(app,'examples/creation/audio.tsx'),'--output',join(proof,'tone.wav'),'--json'],'pcm-wav');
 const servo=join(proof,'servo-audio.tsx');
 await writeFile(servo,`/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Layer,ref,content} from '@frameweave/engine';
import {servoStage} from '@frameweave/engine/servo';
import {defineAudioStage,generateAudio} from '@frameweave/engine/audio';
export const page=servoStage({html:'<main>FRAMEWEAVE</main>',css:'html,body{margin:0;background:#173844;color:#ffce70}main{padding:20px;font:16px sans-serif}'});
export const tone=defineAudioStage({sampleRate:48000,layout:'mono',durationSamples:24000},()=>({evaluateInterval(r){return {audio:generateAudio(r.local,'mono',({time})=>.15*Math.sin(2*Math.PI*440*time))};}}));
export default <Composition width={160} height={90} fps={12} durationInFrames={6}><Stage id="page" factory={page}/><Stage id="tone" factory={tone}/><Layer source={ref('page')}/><Layer source={content.audio(ref('tone','audio'),{sampleRate:48000,durationSamples:24000})}/></Composition>;
`);
 await cli(['create',servo,'--output',join(proof,'servo-audio.mp4'),'--json'],'servo-sound-video');
 const ffmpeg=join(app,'node_modules/ffmpeg-static/ffmpeg.exe'),ffprobe=join(app,'native-bin/win32-x64/ffmpeg/ffprobe.exe');
 for(const name of ['tone.wav','servo-audio.mp4']){
  const result=await exec(ffprobe,['-v','error','-show_streams','-show_format','-of','json',join(proof,name)],{env,windowsHide:true,timeout:10000});
  const data=JSON.parse(result.stdout);assert.ok(data.streams.some(s=>s.codec_type==='audio'&&s.sample_rate==='48000'));
  if(name.endsWith('.mp4'))assert.ok(data.streams.some(s=>s.codec_type==='video'&&s.width===160&&s.height===90));
  await writeFile(join(proof,name+'.probe.json'),result.stdout);
  await exec(ffmpeg,['-v','error','-xerror','-i',join(proof,name),'-f','null','-'],{env,windowsHide:true,timeout:15000});
 }
 rows.push({name:'real-audio-video-decode',ok:true});
 await cli(['frame',join(app,'examples/native-inference/project.tsx'),'--frame','0','--output',join(proof,'directml-espcn.png'),'--json'],'default-directml-model');
 // Exercise the pinned search model offline over a tiny controlled document set;
 // indexing the entire library is deliberately not part of every installation.
 process.env.FRAMEWEAVE_HOME=join(install,'data');
 const {rankSearch}=await import(pathToFileURL(join(app,'lib/plugins/search.js')).href);
 const ranked=await rankSearch([{item:'glow',key:'glow',text:'cinematic glowing neon bloom light'},{item:'audio',key:'audio',text:'audio sound mixing stereo'}],'glowing light',{mode:'semantic',offline:true,limit:2});
 assert.equal(ranked[0].item,'glow');rows.push({name:'default-offline-semantic-model',ok:true});
 const sharp=createRequire(pathToFileURL(join(app,'package.json')))('sharp');
 const image=await sharp(join(proof,'core.png')).raw().toBuffer({resolveWithObject:true});assert.equal(image.info.width,160);assert.ok(image.data.some(v=>v));
 for(const file of ['core.exr','directml-espcn.png'])assert.ok((await stat(join(proof,file))).size>100);
}catch(error){rows.push({name:'acceptance-failure',ok:false,error:String(error)});process.exitCode=1;}
await writeFile(join(proof,'results.json'),JSON.stringify({ok:rows.every(r=>r.ok),rows,install,release},null,2));
console.log(JSON.stringify({ok:rows.every(r=>r.ok),rows}));
