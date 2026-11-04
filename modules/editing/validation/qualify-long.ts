import {readFile,writeFile,open,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';import sharp from 'sharp';

const root=resolve(process.env.EDIT_FROZEN_CORE!),out=resolve(process.env.EDIT_EVIDENCE!),tag=process.env.EDIT_RUN!,exec=promisify(execFile);
const input=JSON.parse(await readFile(join(out,'long-input.json'),'utf8')),started=performance.now(),allowance=Number(process.env.EDIT_REMAINING_MS),rows:any[]=[];
const load=(path:string)=>import(pathToFileURL(join(root,path)).href),{runCLI}=await load('src/cli-entry.ts'),{ffmpegPath}=await load('src/encoding/ffmpeg.ts');
const remaining=()=>allowance-(performance.now()-started),sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
async function evidence(){await writeFile(join(out,'qualification-'+tag+'.json'),JSON.stringify({ok:rows.every(r=>r.ok),scope:'Same coherent round7 ledger; public CLI on frozen3b59 + reviewed audio fix + Main final audioTrack cancellation + cf214 lifecycle ordering; matched original binaries',rows},null,2)+'\n');}
async function check(name:string,fn:()=>Promise<any>){const begin=performance.now();try{const detail=await fn();rows.push({name,ok:true,wallMs:performance.now()-begin,detail});console.log('PASS',name);await evidence();return detail;}catch(e:any){rows.push({name,ok:false,wallMs:performance.now()-begin,error:{code:e.code,message:e.message,stack:e.stack,stderr:e.stderr}});await evidence();throw e;}}
async function cli(args:string[],budget:number){const timer=setTimeout(()=>process.emit('SIGINT'),Math.max(1,Math.floor(budget)));try{const r=await runCLI([...args,'--json']);assert.equal(r?.ok,true,'Public CLI diagnostic retained in stdout/stderr');return r;}finally{clearTimeout(timer);}}
const project=join(input.example,'long-final-hardware-'+tag+'.tsx'),video=join(out,'long-final-'+tag+'.mp4');
const source=await readFile('modules/editing/examples/long.tsx','utf8'),hardware=source.replace('{width:640,height:360}',"{width:640,height:360,decoder:'hardware'}");assert.notEqual(source,hardware);await writeFile(project,hardware);
await writeFile(join(out,'project-'+tag+'.tsx'),hardware);
try{
 if(!process.env.EDIT_LONG_ONLY){await check('public one-second A/V across the first seven-minute cut',async()=>{
  const output=join(out,'av-cut-calibration-'+tag+'.mp4'),r=await cli(['render',project,'--from','419.5','--to','420.5','--output',output,'--encoder','h264_nvenc','--max-concurrency','8','--initial-concurrency','8'],Math.min(60000,remaining()-(process.env.EDIT_LONG_QUICK?5000:35000)));
  assert.equal(r.frames,24);assert.equal(r.audio.sampleCount,48000);await writeFile(join(out,'av-cut-calibration-'+tag+'.json'),JSON.stringify(r,null,2)+'\n');
  await exec(ffmpegPath(),['-v','error','-xerror','-i',output,'-map','0:v:0','-map','0:a:0','-f','null','-'],{windowsHide:true,timeout:10000});
  return {output,frames:24,seconds:1,timelineRange:[419.5,420.5],sourceRanges:[[419.5,420],[840,840.5]],completeAVDecode:true,timings:r.timings,hardwareVideo:r.stats.hardwareVideo};
 });}
 if(!process.env.EDIT_LONG_QUICK){await check('public CLI actual 21-minute edited Native A/V file',async()=>{
  assert.ok(remaining()>40000,'Remaining round7 budget cannot qualify a complete long output');
  const r=await cli(['render',project,'--output',video,'--encoder','h264_nvenc','--max-concurrency','8','--initial-concurrency','8'],remaining()-18000);
  assert.equal(r.frames,30240);assert.equal(r.audio.sampleCount,60480000);await writeFile(join(out,'long-render-'+tag+'.json'),JSON.stringify(r,null,2)+'\n');
  return {output:video,frames:30240,seconds:1260,audioSamples:60480000,timings:r.timings,scheduling:r.scheduling,hardwareVideo:r.stats.hardwareVideo,format:r.transfer,sourceDecoder:'explicit hardware; no CPU fallback',compileAndInitializationIncluded:true};
 });
 await check('complete 21-minute decode, real frames and audio around both edit boundaries',async()=>{
  const frames=[0,10079,10080,15120,20159,20160,30239],pattern=join(out,'long-selected-'+tag+'-%02d.png'),pcm=join(input.example,'decoded-long-'+tag+'.f32');
  const select='select='+frames.map(f=>'eq(n\\,'+f+')').join('+'),decodeStart=performance.now();
  const decoded=await exec(ffmpegPath(),['-v','error','-xerror','-nostdin','-n','-threads','4','-i',video,'-progress','pipe:1','-nostats','-map','0:v:0','-f','null','-','-map','0:v:0','-vf',select,'-fps_mode','passthrough','-start_number','0',pattern,'-map','0:a:0','-c:a','pcm_f32le','-f','f32le',pcm],{windowsHide:true,timeout:Math.max(1000,Math.floor(remaining()-3000)),maxBuffer:2*1024**2});
  await writeFile(join(out,'long-decode-'+tag+'.txt'),decoded.stdout+'\n'+decoded.stderr);const decodedFrames=[...decoded.stdout.matchAll(/^frame=(\d+)/gm)].map(m=>Number(m[1]));assert.equal(decodedFrames.at(-1),30240);
  const decodedSamples=(await stat(pcm)).size/8;assert.ok(decodedSamples>=60480000&&decodedSamples-60480000<=2048);
  const probe=JSON.parse((await exec(process.env.FRAMEWEAVE_FFPROBE!,['-v','error','-show_streams','-show_format','-of','json',video],{windowsHide:true,timeout:5000})).stdout);await writeFile(join(out,'long-probe-'+tag+'.json'),JSON.stringify(probe,null,2)+'\n');
  const v=probe.streams.find((s:any)=>s.codec_type==='video'),a=probe.streams.find((s:any)=>s.codec_type==='audio');assert.equal(Number(v.nb_frames),30240);assert.equal(Number(v.duration),1260);assert.ok(Math.abs(Number(a.duration)-1260)<.03);assert.equal(Number(v.start_time),0);assert.equal(Number(a.start_time),0);
  const images=[],imageRecords=[];
  for(let i=0;i<frames.length;i++){
   const frame=frames[i],sourceFrame=frame<10080?frame:frame<20160?frame+10080:frame-10080,image=pattern.replace('%02d',String(i).padStart(2,'0'));
   const actual=await sharp(image).removeAlpha().raw().toBuffer(),expected=(await exec(ffmpegPath(),['-v','error','-ss',(sourceFrame/24).toFixed(9),'-i',join(input.example,'long-source.mp4'),'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,timeout:5000,encoding:'buffer',maxBuffer:1024**2})).stdout;assert.equal(actual.length,expected.length);let sum=0,max=0;for(let j=0;j<actual.length;j++){const d=Math.abs(actual[j]-expected[j])/255;sum+=d;max=Math.max(max,d);}const mean=sum/actual.length;assert.ok(mean<.06,'Actual frame must match its selected source within separately measured lossy encoding error');imageRecords.push({frame,sourceFrame,meanRGBError:mean,maxRGBError:max,sha256:sha(actual)});images.push({input:image,left:i*640,top:0});
  }
  await sharp({create:{width:640*frames.length,height:360,channels:3,background:'#000'}}).composite(images).png().toFile(join(out,'long-storyboard-'+tag+'.png'));
  const actualFile=await open(pcm,'r'),expectedFile=await open(join(input.example,'long-source.wav'),'r'),audio=[];
  try{for(const center of [2048,10080*2000,15120*2000,20160*2000,60480000-2048]){
   const first=center-2048,count=4096,actual=Buffer.alloc(count*8),expected=Buffer.alloc(count*8);assert.equal((await actualFile.read(actual,0,actual.length,first*8)).bytesRead,actual.length);
   let offset=0;while(offset<count){const n=first+offset,sourceSample=n<20160000?n:n<40320000?n+20160000:n-20160000,length=Math.min(count-offset,(Math.floor(n/20160000)+1)*20160000-n);assert.equal((await expectedFile.read(expected,offset*8,length*8,input.dataOffset+sourceSample*8)).bytesRead,length*8);offset+=length;}
   let best={lag:0,rms:Infinity},zeroRms=0;for(let lag=-16;lag<=16;lag++){let error=0;for(let i=16;i<count-16;i++)for(let channel=0;channel<2;channel++){const d=actual.readFloatLE(((i+lag)*2+channel)*4)-expected.readFloatLE((i*2+channel)*4);error+=d*d;}const rms=Math.sqrt(error/((count-32)*2));if(!lag)zeroRms=rms;if(rms<best.rms)best={lag,rms};}assert.ok(Math.abs(best.lag)<=2);assert.ok(zeroRms<.015);audio.push({firstSample:first,sampleCount:count,aacRmsError:zeroRms,bestLagSamples:best.lag,bestLagRms:best.rms,scope:'Lossy AAC comparison; not sample-exact PCM identity'});
  }}finally{await actualFile.close();await expectedFile.close();}
  return {completeVideoDecodeFrames:30240,completeAudioDecodeSamples:decodedSamples,codecPaddingSamples:decodedSamples-60480000,seconds:1260,decodeAndChecksMs:performance.now()-decodeStart,images:imageRecords,imageComparisonScope:'Encoded SDR RGB content check includes declared source BT709/output sRGB conversion and lossy H264; not a linear-domain pixel identity test',audio,storyboard:join(out,'long-storyboard-'+tag+'.png'),sampleReference:'Actual original WAV read by byte offsets, with explicit0/14/7 minute source order',physicalPeakMemory:'unknown'};
 });}
}catch(e:any){console.error('FAIL long qualification',e.message);process.exitCode=1;}
const prefix=resolve('.').replaceAll("'","''"),script=`$rows=@(Get-CimInstance Win32_Process|Where-Object { $_.Name -match '^(frameweave-native-gpu|frameweave-spidermonkey-host|ffmpeg)(\\.exe)?$' -and ($_.ExecutablePath -like '${prefix}\\*' -or ($_.CommandLine -and $_.CommandLine.Contains('${prefix}'))) }|Select-Object ProcessId,ParentProcessId,Name);ConvertTo-Json -InputObject $rows -Compress`;
await check('owned backend cleanup after final long qualification',async()=>{const result=JSON.parse((await exec('powershell.exe',['-NoProfile','-Command',script],{windowsHide:true,timeout:5000})).stdout||'[]');assert.deepEqual(result,[]);return {ownedProcesses:result};});
