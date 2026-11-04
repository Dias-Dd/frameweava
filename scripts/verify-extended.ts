import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,stat,rename,access} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {engineRoot} from '../src/compiler/build.ts';
import {buildProject,Renderer,VideoEncoder,probeVideo,exportProject,ffmpegPath,writeLock,searchPlugins,projectPlugins,workflowInfo} from '../src/node.ts';

const exec=promisify(execFile),artifacts=resolve(process.argv[2]??join(engineRoot,'artifacts/extended/verified')),workspace=resolve(engineRoot,'../..'),work=join(workspace,'work',`extended-clean-${Date.now()}`),clean=join(work,'engine');
const demo=join(engineRoot,'examples/export-demo'),source=join(demo,'project.tsx'),privateDirectory=join(engineRoot,'plugins/shared');
await mkdir(artifacts,{recursive:true});await mkdir(clean,{recursive:true});
const assertInside=(base:string,path:string)=>{const r=relative(resolve(base),resolve(path));assert.ok(r!=='..'&&!r.startsWith('../')&&!r.startsWith('..\\')&&!isAbsolute(r));};
assertInside(workspace,work);assertInside(engineRoot,demo);assertInside(engineRoot,privateDirectory);
await writeLock(demo);
const portable=await exportProject(source,{output:join(artifacts,'Across-Machines.tsx'),singleFile:true});
const carried=await exportProject(source,{output:join(artifacts,'carried-project')});
assert.equal(portable.uniqueEmbeddedAssets,3);assert.equal(portable.embeddedAssetReferences,4);
assert.equal(portable.selfContained,true);assert.equal(carried.selfContained,true);
for(const name of ['src','plugins/builtin','scripts/verify-relocated.ts','package.json','package-lock.json','tsconfig.json','LICENSE'])await cp(join(engineRoot,name),join(clean,name),{recursive:true});
console.log('Installing a separate dependency tree in the clean engine instance...');
await exec('npm.cmd',['ci','--no-audit','--no-fund'],{cwd:clean,timeout:240000,maxBuffer:4*1024*1024,windowsHide:true,shell:true});
await writeFile(join(artifacts,'clean-install.json'),JSON.stringify({command:'npm ci --no-audit --no-fund',directory:clean,independentNodeModules:true,emptyUserLibrary:join(work,'empty-user-home')},null,2));
const original=await Renderer.create(await buildProject(source),{cache:false}),hashes:string[]=[],keyframes=[0,24,60,120,180,239],originalVideo=join(artifacts,'Original.mp4');
const encoder=await VideoEncoder.create(originalVideo,{num:24,den:1},640,360);
try{for(let i=0;i<240;i++){const frame=await original.renderFrame(i);assert.equal(frame.diagnostics.length,0);hashes.push(createHash('sha256').update(await sharp(frame.png).ensureAlpha().raw().toBuffer()).digest('hex'));await encoder.write(frame.png);if(keyframes.includes(i))await writeFile(join(artifacts,`original-${i}.png`),frame.png);if(i%48===0)console.log(`Original frame ${i}/240`);}await encoder.finish();}catch(e){await encoder.abort();throw e;}finally{await original.close();}
await writeFile(join(artifacts,'expected-rgba.json'),JSON.stringify(hashes,null,2));
const relocated=join(clean,'incoming','Across-Machines.tsx');await mkdir(dirname(relocated),{recursive:true});await cp(portable.entry,relocated);await cp(join(artifacts,'carried-project'),join(clean,'incoming/carried-project'),{recursive:true});
const hiddenSource=demo+'.__offline__',hiddenPlugins=privateDirectory+'.__offline__';
let sourceHidden=false,pluginsHidden=false;
try{
  await rename(demo,hiddenSource);sourceHidden=true;await rename(privateDirectory,hiddenPlugins);pluginsHidden=true;
  await assert.rejects(()=>access(source));await assert.rejects(()=>access(privateDirectory));
  const child=await exec(process.execPath,['--import','tsx','scripts/verify-relocated.ts',relocated,join(artifacts,'expected-rgba.json'),join(artifacts,'Across-Machines.mp4'),join(artifacts,'relocated-report.json'),engineRoot],{cwd:clean,env:{...process.env,FRAMEWEAVE_HOME:join(work,'empty-user-home')},timeout:240000,maxBuffer:4*1024*1024,windowsHide:true});console.log(child.stdout);
  const carriedFrame=join(artifacts,'carried-frame-120.png');await exec(process.execPath,['--import','tsx','src/cli.ts','frame',join(clean,'incoming/carried-project/project.tsx'),'--frame','120','--output',carriedFrame],{cwd:clean,env:{...process.env,FRAMEWEAVE_HOME:join(work,'empty-user-home')},timeout:60000,maxBuffer:4*1024*1024,windowsHide:true});
  assert.deepEqual(await sharp(carriedFrame).raw().toBuffer(),await sharp(join(artifacts,'original-120.png')).raw().toBuffer());
}finally{if(pluginsHidden)await rename(hiddenPlugins,privateDirectory);if(sourceHidden)await rename(hiddenSource,demo);}
const relocatedReport=JSON.parse(await readFile(join(artifacts,'relocated-report.json'),'utf8'));
const decoded:string[]=[];
for(const index of keyframes){const path=join(artifacts,`decoded-${index}.png`);await exec(ffmpegPath(),['-hide_banner','-loglevel','error','-y','-i',join(artifacts,'Across-Machines.mp4'),'-vf',`select=eq(n\\,${index})`,'-vsync','0','-frames:v','1',path],{windowsHide:true});decoded.push(path);}
const tiles=await Promise.all(decoded.map(path=>sharp(path).resize(320,180).png().toBuffer()));await sharp({create:{width:960,height:360,channels:4,background:'#071019'}}).composite(tiles.map((input,i)=>({input,left:i%3*320,top:Math.floor(i/3)*180}))).png().toFile(join(artifacts,'decoded-storyboard.png'));
const registry=(await projectPlugins(demo)).registry,queries=['文字按照顺序一个一个弹出来','模拟镜头曝光期间运动产生的拖影','旋转的发光能量漩涡'];
const retrieval=[];for(const query of queries){const results=await searchPlugins(registry,query,{}, {mode:'hybrid',offline:true,limit:3});retrieval.push({query,results:results.map(r=>({id:r.record.manifest.id,score:r.score,semanticScore:r.semanticScore,keywordScore:r.keywordScore}))});}
await writeFile(join(artifacts,'semantic-search.json'),JSON.stringify(retrieval,null,2));
const report={pass:true,portable,carried,cleanInstance:clean,freshDependencyInstall:true,originalDirectoriesRenamedDuringVerification:true,original:await probeVideo(originalVideo),relocated:relocatedReport,carriedFrame120Exact:true,fontDeduplication:{references:2,stored:1},storyboard:join(artifacts,'decoded-storyboard.png'),retrieval,workflow:workflowInfo().commands};
await writeFile(join(artifacts,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
