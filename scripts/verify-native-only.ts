import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {nativeBootstrapProgram} from '../modules/native-gpu/bootstrap-program.ts';
import {buildNativeImagePackage} from '../modules/native-effects/scripts/build-package.ts';
import {installPackages,verifyPackages} from '../src/packages/manager.ts';
import {readExr} from '../src/media/ocio.ts';
import {linear709,pixelsFromSurface,toHalf,fromHalf} from '../src/media/surface.ts';
import {ffmpegPath} from '../src/encoding/ffmpeg.ts';
import {initProject} from '../src/workflow.ts';
import {statisticsReference} from '../modules/native-effects/color/reference.ts';
import {sourceColor,statisticNames,statisticOptions} from '../modules/native-effects/color/stage.ts';

const run=promisify(execFile),parent=resolve('artifacts/native-only-cleanup/media');await mkdir(parent,{recursive:true});const out=await mkdtemp(join(parent,'run-'));let success=false;
const entry=resolve('examples/native-only-effects/project.tsx'),build=await buildProject(entry),executable=await nativeExecutable(),rows:unknown[]=[];
const oldHost=process.env.FRAMEWEAVE_JS_HOST;process.env.FRAMEWEAVE_JS_HOST='spidermonkey';
const digest=(p:Uint8Array)=>createHash('sha256').update(p).digest('hex');
function expected(frame:number,half:boolean){const q=(v:number)=>half?fromHalf(toHalf(Math.fround(v))):Math.fround(v),offset=Math.fround(frame*.01),source=[q(Math.fround(-.25+offset)),q(2),q(.5),q(.5)],exposed=[q(source[0]*2),q(source[1]*2),q(source[2]*2),source[3]];
 return [q(exposed[0]+exposed[1]*.125-.25*exposed[3]),exposed[1],exposed[2],exposed[3]];
}
try{
 // The deleted private Web command/lease is refused by the actual production binary.
 for(const request of [{id:1,op:'bridgeRead',session:'0'.repeat(64),frame:0,slot:0,image:0,file:'old.f32'},{id:2,op:'init',program:{...nativeBootstrapProgram(16,16,false,1024**2),bridge:{version:1,directory:out}}}]){
  const raw=await new Promise<string>((resolve,reject)=>{const child=spawn(executable,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',reject);child.on('close',code=>code===0?resolve(stdout):reject(Error(stderr||String(code))));child.stdin.end(JSON.stringify(request)+'\n');});
  assert.match(raw,/"ok":false/);assert.match(raw,/bridge/i);rows.push({kind:'removed-private-protocol',request:request.op,reply:raw.trim()});
 }
 // One real session checks random/duplicate requests, JS/React reconciliation and release.
 const renderer=await Renderer.create(build,{nativeGpu:{executable,dynamic:'interactive'},cache:false});
 try{for(const frame of [6,0,3,0,6]){const ticket=await renderer.submitNativeFrame(frame);await ticket.completed;}const stats=await renderer.nativeStats();assert.equal(stats.capabilities.hardwareVerified,true);assert.equal(Object.hasOwn(stats,'webBridge'),false);assert.equal(renderer.status().initializationFailed,false);rows.push({kind:'random-session',frames:[6,0,3,0,6],stats});}
 finally{await renderer.close();await renderer.close();await renderer.nativeExited();}
 // Automatic statistics use the readonly Native GPU image view, with no former CPU/readback branch.
 const statisticsBuild=await buildProject(resolve('modules/native-effects/examples/color-numeric.tsx'));
 for(const format of ['rgba32float','rgba16float'] as const)for(const alpha of ['premultiplied','straight','opaque'] as const){
  const selected=structuredClone(statisticsBuild);selected.manifest.stages[0].props={mode:'statistics',format,alpha,reference:true};
  const session=await Renderer.create(selected,{nativeGpu:{executable,dynamic:'interactive'},cache:false});const hashes=new Map<number,string>();
  try{for(const frame of [3,0,2,1,0]){const ticket=await session.submitNativeFrame(frame);await ticket.completed;const a=await session.exportNativeBuffer(ticket,'color/sourceA'),b=await session.exportNativeBuffer(ticket,'color/result');assert.ok(a.values instanceof Float32Array);assert.ok(b.values instanceof Float32Array);
   const reference=statisticsReference(statisticNames[frame],a.values,alpha,sourceColor,statisticOptions[frame],format==='rgba16float'),tolerance=format==='rgba16float'?6e-4:3e-6;let maxScaled=0;
   for(let i=0;i<reference.length;i++)maxScaled=Math.max(maxScaled,Math.abs(reference[i]-b.values[i])/Math.max(1,Math.abs(reference[i])));assert.ok(maxScaled<=tolerance,JSON.stringify({frame,format,alpha,maxScaled,tolerance}));
   const hash=digest(new Uint8Array(b.values.buffer));if(hashes.has(frame))assert.equal(hash,hashes.get(frame));hashes.set(frame,hash);rows.push({kind:'gpu-statistics',name:statisticNames[frame],format,alpha,frame,hash,maxScaled,tolerance});
  }}finally{await session.close();await session.nativeExited();}
 }
 for(const half of [false,true]){
  const selected=structuredClone(build);selected.manifest.stages[0].props.format=half?'rgba16float':'rgba32float';const hashes=new Map<number,string>();
  for(const [index,frame]of [6,0,3,0].entries()){
   const file=join(out,`${half?'f16':'f32'}-${index}-${frame}.exr`),result=await renderNativeProject(entry,{build:selected,output:file,start:frame,end:frame+1,native:executable});
   const pixels=pixelsFromSurface((await readExr(file,{color:linear709,alpha:'premultiplied'})).surface),oracle=expected(frame,half),tolerance=half?6e-4:3e-6;let maxScaled=0,maxAbs=0;
   for(let i=0;i<pixels.length;i++){const error=Math.abs(pixels[i]-oracle[i%4]);maxAbs=Math.max(maxAbs,error);maxScaled=Math.max(maxScaled,error/Math.max(1,Math.abs(oracle[i%4])));}
   assert.ok(maxScaled<=tolerance,JSON.stringify({frame,half,oracle,maxAbs,maxScaled,tolerance}));
   const hash=digest(new Uint8Array(pixels.buffer));if(hashes.has(frame))assert.equal(hash,hashes.get(frame));hashes.set(frame,hash);
   if(frame===0){assert.ok(pixels[0]<0);assert.ok(pixels[1]>1);assert.equal(pixels[3],.5);}
   rows.push({kind:'numeric-exr',frame,half,hash,maxAbs,maxScaled,tolerance,backend:result.backend,device:result.stats});
  }
 }
 const png=join(out,'native-react.png');await renderNativeProject(entry,{build,output:png,start:0,end:1,native:executable});const decoded=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(decoded.info.width,160);assert.equal(decoded.info.height,90);assert.equal(decoded.info.channels,4);rows.push({kind:'png',path:png,rgbaHash:digest(decoded.data),bytes:decoded.data.length});
 const video=join(out,'native-react.mp4');await renderNativeProject(entry,{build,output:video,start:0,end:4,native:executable,encoder:'libx264'});const decodedVideo=await run(ffmpegPath(),['-v','error','-i',video,'-f','rawvideo','-pix_fmt','rgba','-'],{encoding:'buffer',windowsHide:true,maxBuffer:16*1024**2,timeout:20000});assert.equal(decodedVideo.stdout.length,160*90*4*4);rows.push({kind:'mp4',path:video,decodedFrames:4,policy:'lossy SDR; no PNG-byte or HDR equivalence claimed'});
 const resourceEntry=resolve('modules/native-effects/examples/io-resource.tsx'),resourceBuild=await buildProject(resourceEntry),resourceExr=join(out,'declared-resource.exr'),resourceResult=await renderNativeProject(resourceEntry,{build:resourceBuild,output:resourceExr,start:0,end:1,native:executable});
 const resourcePixels=pixelsFromSurface((await readExr(resourceExr,{color:linear709,alpha:'premultiplied'})).surface);assert.equal(resourcePixels.length,160*128*4);assert.ok(resourceResult.stats.resourceImports.uploadBytes>0);assert.ok(resourcePixels.some(v=>v<0));assert.ok(resourcePixels.some(v=>v>1));rows.push({kind:'declared-resource',hash:digest(new Uint8Array(resourcePixels.buffer)),stats:resourceResult.stats.resourceImports});
 // Same JS/React source also records Native GPU work through the optional Chromium logic host.
 process.env.FRAMEWEAVE_JS_HOST='chromium';const chromiumPng=join(out,'chromium-logic.png');const v8=await renderNativeProject(entry,{build,output:chromiumPng,start:0,end:1,native:executable});const v8Pixels=await sharp(chromiumPng).ensureAlpha().raw().toBuffer();assert.deepEqual(v8Pixels,decoded.data);rows.push({kind:'chromium-js-only',backend:v8.backend,rgbaHash:digest(v8Pixels)});process.env.FRAMEWEAVE_JS_HOST='spidermonkey';
 // Build/install/verify a fresh immutable Native-only package, without changing an existing lock.
 const packageRoot=await mkdtemp(resolve('.frameweave/native-only-package-')),pack=join(packageRoot,'package');await buildNativeImagePackage(pack);
 const projectRoot=await mkdtemp(resolve('.frameweave/native-only-consumer-')),project=join(projectRoot,'project.tsx');
 let source=await readFile(resolve('examples/native-image-effects/project.tsx'),'utf8');source=source.replace('width={960} height={540}','width={160} height={90}');await writeFile(project,source);
 await installPackages(projectRoot,[pack],{add:['native-image-effects@0.5.0'],trust:['local:frameweave.gpu-images']});const verified=await verifyPackages(projectRoot);assert.equal(verified.valid,true);
 const managed=await buildProject(project),managedPng=join(out,'managed-native.png');await renderNativeProject(project,{build:managed,output:managedPng,start:0,end:1,native:executable});const managedMetadata=await sharp(managedPng).metadata();assert.equal(managedMetadata.width,160);rows.push({kind:'managed-native-package',reference:'native-image-effects@0.5.0',bindings:managed.manifest.stages.map(s=>({id:s.id,engine:s.engine})),verified});
 const starterParent=await mkdtemp(resolve('.frameweave/native-only-starter-')),starter=await initProject([join(starterParent,'project')]),starterPng=join(out,'starter-cli.png');
 const cli=await run(process.execPath,['--import','tsx',resolve('src/cli.ts'),'frame',starter.entry,'--frame','3','--width','160','--output',starterPng,'--json'],{windowsHide:true,maxBuffer:4*1024**2,timeout:30000});const cliResult=JSON.parse(cli.stdout);assert.equal(cliResult.backend,'native-wgpu');const starterImage=await sharp(starterPng).metadata();assert.equal(starterImage.width,160);rows.push({kind:'native-starter-cli',entry:starter.entry,backend:cliResult.backend,dimensions:[starterImage.width,starterImage.height]});
 success=true;await writeFile(join(out,'result.json'),JSON.stringify({ok:true,rows,untested:['Servo execution','other GPU/OS','whole repository','all six export modes','Native CPU-port/session materialization limitations']},null,2));console.log(JSON.stringify({ok:true,rows:rows.length,output:out}));
}finally{if(!success)await writeFile(join(out,'result.json'),JSON.stringify({ok:false,rows,qualification:'Incomplete run; successful rows do not qualify later failed/unfinished checks'},null,2));if(oldHost===undefined)delete process.env.FRAMEWEAVE_JS_HOST;else process.env.FRAMEWEAVE_JS_HOST=oldHost;}
