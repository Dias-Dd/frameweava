import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir,mkdtemp,readFile,access,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath,probeVideo} from '../src/encoding/ffmpeg.ts';
const exec=promisify(execFile),root=resolve('.');
test('real export, preview startup, JSON and failure/cancel progress preserve media and cleanup',{skip:process.platform!=='win32',timeout:120000},async()=>{
 const base=resolve(root,'artifacts/cli-progress/media');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'case-'));
 const entry=join(dir,'project.tsx'),movie=join(dir,'human.mp4'),machine=join(dir,'json.mp4');
 const source=`import {Composition,Stage,Layer,ref,expr,linear709} from '@frameweave/engine';
 const pixel={version:1 as const,inputOrder:[],parameterTypes:['u32' as const],output:{format:'rgba32float' as const,alpha:'premultiplied' as const,color:linear709},kernel:{abiVersion:1 as const,id:'test/progress',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(f32(paramU32(0u))*.1+.1,.2,.3,1.);}'}};
 export default <Composition width={64} height={36} fps={24} durationInFrames={3}><Stage id="image" engine="native-gpu" outputs={{surface:'surface'}} props={{nativePixel:pixel,parameters:[expr.frame]}}/><Layer source={ref('image')}/></Composition>;`;
 await writeFile(entry,source);
 const tty=join(dir,'tty.mjs');await writeFile(tty,`Object.defineProperty(process.stdout,'isTTY',{value:true});Object.defineProperty(process.stderr,'isTTY',{value:true});const {runCLI}=await import(${JSON.stringify(new URL('../src/cli-entry.ts',import.meta.url).href)});await runCLI(process.argv.slice(2));`);
 async function cli(name:string,args:string[],terminal=false){
  let result;try{const out=await exec(process.execPath,['--import','tsx',terminal?tty:join(root,'src/cli.ts'),...args],{cwd:root,windowsHide:true,timeout:45000,maxBuffer:2*1024**2});result={code:0,stdout:out.stdout,stderr:out.stderr};}
  catch(error){const e=error as {code?:number;stdout?:string;stderr?:string};result={code:e.code??-1,stdout:e.stdout??'',stderr:e.stderr??''};}
  await writeFile(join(dir,name+'.json'),JSON.stringify(result,null,2));return result;
 }
 const human=await cli('human',['render',entry,'--output',movie,'--encoder','libx264'],true);assert.equal(human.code,0,human.stderr);
 assert.match(human.stderr,/正在编译工程/);assert.match(human.stderr,/正在初始化渲染器/);assert.match(human.stderr,/正在生成首帧/);assert.match(human.stderr,/3\/3 帧.*100\.0%/);assert.match(human.stderr,/帧\/秒.*预计剩余/);assert.match(human.stderr,/正在收尾编码与封装/);assert.match(human.stderr,/\x1b\[2K/);assert.match(human.stdout,/视频已导出/);
 const metadata=await probeVideo(movie);await writeFile(join(dir,'probe.json'),JSON.stringify(metadata,null,2));
 await exec(ffmpegPath(),['-v','error','-i',movie,'-f','null','-'],{windowsHide:true,timeout:15000});
 const json=await cli('json',['render',entry,'--output',machine,'--encoder','libx264','--json']);assert.equal(json.code,0,json.stderr);assert.equal(JSON.parse(json.stdout).frames,3);assert.equal(json.stderr,'');
 const preview=await cli('preview',[entry,'--no-open','--no-watch','--frames','2','--human'],true);assert.equal(preview.code,0,preview.stderr);assert.match(preview.stderr,/正在生成首帧/);assert.match(preview.stdout,/预览已就绪/);assert.doesNotMatch(preview.stdout,/\x1b/);
 const bad=join(dir,'bad.tsx');await writeFile(bad,'export default <Broken');
 const failure=await cli('failure',['render',bad,'--output',join(dir,'bad.mp4'),'--human'],true);assert.equal(failure.code,1);assert.match(failure.stderr,/E_COMPILE/);assert.match(failure.stderr,/\r\x1b\[2K工程编译失败/);
 const cancelEntry=join(dir,'cancel.tsx');await writeFile(cancelEntry,source.replace('durationInFrames={3}','durationInFrames={8}'));
 const controller=new AbortController(),events:unknown[]=[],cancelOutput=join(dir,'cancel.mp4');
 await assert.rejects(renderNativeProject(cancelEntry,{output:cancelOutput,encoder:'libx264',maxConcurrency:1,initialConcurrency:1,signal:controller.signal,onProgress:p=>{events.push(p);if(p.phase==='render'&&p.completed===1)controller.abort();}}),{code:'E_RENDER_CANCELLED'});
 await assert.rejects(access(cancelOutput));assert.equal((await readdir(dir)).filter(name=>name.startsWith('.frameweave-native-')).length,0);await writeFile(join(dir,'cancel-events.json'),JSON.stringify(events,null,2));
 const diagnostics=JSON.parse(await readFile(movie+'.diagnostics.json','utf8'));assert.equal(diagnostics.frames,3);
 await writeFile(resolve(root,'artifacts/cli-progress/media-result.json'),JSON.stringify({directory:dir,frames:3,decoded:true,humanTTY:'simulated terminal streams over real CLI',preview:true,json:true,failure:true,cancel:true},null,2));
});
