import {mkdir,mkdtemp,readFile,writeFile,copyFile,access,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const exec=promisify(execFile),root=process.cwd(),out=resolve('artifacts/native-only-runtime');await mkdir(out,{recursive:true});
const parent=(await import('node:os')).tmpdir();const resume=process.argv[2],reinstall=process.argv[3]==='reinstall',scene=reinstall?'scene-final':'scene';const consumer=resume??await mkdtemp(join(parent,'fw-native-only-consumer-'));
const env={...process.env,FRAMEWEAVE_HOME:join(consumer,'home'),FRAMEWEAVE_SPIDERMONKEY:'',FRAMEWEAVE_NATIVE_GPU:'',FRAMEWEAVE_SERVO_RUNTIME:'',FRAMEWEAVE_ENGINE_ROOT:''},rows=[];for(const key of ['FRAMEWEAVE_SPIDERMONKEY','FRAMEWEAVE_NATIVE_GPU','FRAMEWEAVE_SERVO_RUNTIME','FRAMEWEAVE_ENGINE_ROOT'])delete env[key];env.FRAMEWEAVE_JS_HOST='spidermonkey';const start=performance.now();
async function run(name,file,args,cwd=consumer){const t=performance.now();try{const r=await exec(file,args,{cwd,env,windowsHide:true,maxBuffer:12*1024**2,timeout:60000});rows.push({name,ok:true,ms:performance.now()-t});await writeFile(join(out,name+'.stdout.txt'),r.stdout);await writeFile(join(out,name+'.stderr.txt'),r.stderr);return r.stdout;}catch(e){rows.push({name,ok:false,ms:performance.now()-t,error:{code:e.code,message:e.message}});await writeFile(join(out,name+'.stderr.txt'),e.stderr??String(e));throw e;}}
try{
 const npm=process.env.npm_execpath??join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');await access(npm);
 const packed=resume&&!reinstall?[{filename:'frameweave-engine-0.1.0.tgz'}]:JSON.parse(await run('pack',process.execPath,[npm,'pack',join(root,'dist'),'--pack-destination',out,'--ignore-scripts','--json'],root));
 const tar=join(out,packed[0].filename);await writeFile(join(consumer,'package.json'),JSON.stringify({name:'native-only-consumer',version:'1.0.0',private:true,type:'module'}));
 if(!resume||reinstall)await run('install',process.execPath,[npm,'install',tar,'--offline','--ignore-scripts','--no-audit','--no-fund']);
 const engine=join(consumer,'node_modules/@frameweave/engine'),bin=join(engine,'bin/frameweave.mjs'),manifest=JSON.parse(await readFile(join(engine,'package.json'),'utf8'));
 assert.equal(manifest.dependencies.playwright,undefined);assert.equal(manifest.exports['./web'],undefined);
 await assert.rejects(access(join(consumer,'node_modules/playwright')),{code:'ENOENT'});
 // No postinstall downloads. Provision the existing trusted FFmpeg binary into
 // this private consumer explicitly, and record its exact bytes.
 const ffmpegSource=resolve('node_modules/ffmpeg-static/ffmpeg.exe'),ffmpeg=join(consumer,'ffmpeg.exe');await copyFile(ffmpegSource,ffmpeg);env.FRAMEWEAVE_FFMPEG=ffmpeg;
 const ffmpegSha256=createHash('sha256').update(await readFile(ffmpeg)).digest('hex');
 await run('version',process.execPath,[bin,'--version','--json']);const doctor=JSON.parse(await run('doctor',process.execPath,[bin,'doctor','--json']));assert.equal(doctor.ok,true);
 if(!resume||reinstall)await run('init',process.execPath,[bin,'init',scene]);
 const frame=join(consumer,'frame.png');await run('frame',process.execPath,[bin,'frame',scene+'/project.tsx','--width','160','--frame','12','--output',frame,'--json']);
 const signature=await readFile(frame);assert.deepEqual([...signature.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 await run('preview',process.execPath,[bin,scene+'/project.tsx','--width','160','--no-open','--no-watch','--frames','3','--memory-mib','64']);
 const analysis=JSON.parse(await run('analysis-list',process.execPath,[bin,'analyze','list','--json']));assert.equal(analysis.ok,true);
 await writeFile(join(out,'install-result.json'),JSON.stringify({ok:true,consumer,engine:await realpath(engine),tar,ffmpeg:{provisioning:'explicit private copy; npm postinstall not run',sha256:ffmpegSha256},rows,wallMs:performance.now()-start,platform:process.platform,scope:'Local private installation; no public redistribution qualification; real Native PNG and preview without Chromium'},null,2));
 console.log(JSON.stringify({ok:true,consumer,rows,wallMs:performance.now()-start}));
}catch(e){await writeFile(join(out,'install-result.json'),JSON.stringify({ok:false,consumer,rows,wallMs:performance.now()-start,error:{code:e.code,message:e.message}},null,2));throw e;}
