import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';
import {inspectProject,inspectIteration,compareInspections,readInspectionImage} from '../modules/render-inspection/index.ts';
import {hash} from '../modules/render-inspection/common.ts';
import {writeLock} from '../src/plugins/registry.ts';

const parent=join(engineRoot,'.frameweave/render-inspection-e2e'),fixtures:string[]=[],exec=promisify(execFile),evidence=join(engineRoot,'artifacts/render-inspection/e2e');
async function fixture(files:Record<string,string|Buffer>={}){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-'));fixtures.push(dir);for(const [name,data]of Object.entries(files))await writeFile(join(dir,name),data);return dir;}
after(async()=>{for(const dir of fixtures){assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}});
const scene=`import {Composition,Stage,Rect,Resource,keyframes,ref} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';export const driver=defineWebStage(()=>({renderAt(c){return {value:c.frame};}}));console.log('project logs must not corrupt inspection JSON');export default Composition({width:96,height:64,fps:12,durationInFrames:13,background:'transparent',children:[Resource({id:'logo',kind:'image',src:'./logo.png'}),Stage({id:'driver',factory:driver,outputs:{value:'number'}}),Stage({id:'visual',inputs:{value:ref('driver','value')},inputTypes:{value:'number'},children:Rect({x:keyframes([{frame:0,value:4},{frame:12,value:64}]),y:20,width:20,height:20,fill:'#65e9d5'})})]});`;
async function cli(args:string[]){try{return {code:0,...await exec(process.execPath,['--import','tsx',join(engineRoot,'src/cli.ts'),...args],{cwd:engineRoot,windowsHide:true,maxBuffer:8*1024*1024,timeout:120000})};}catch(e){const f=e as Error&{stdout:string;stderr:string;code:number};return {code:f.code,stdout:f.stdout,stderr:f.stderr};}}
async function project(){return fixture({'project.ts':scene,'logo.png':await sharp({create:{width:2,height:2,channels:4,background:'#ffffff'}}).png().toBuffer()});}

test('inspect builds without a browser, returns compact graph/assets, and renders ordered/repeated PNG resources via public CLI',{timeout:180000},async()=>{
  const dir=await project(),entry=join(dir,'project.ts'),before=hash(await readFile(entry));
  const checked=await inspectProject({project:entry,output:await fixture()});assert.equal(checked.ok,true);assert.equal(checked.rendered,false);assert.equal(checked.frames.length,0);assert.equal(checked.summary?.stageCount,2);assert.deepEqual(checked.summary?.stages.find(s=>s.id==='visual')?.dependencies,['driver']);assert.equal(checked.summary?.resources[0].sha256,hash(await readFile(join(dir,'logo.png'))));
  const output=await fixture(),result=await cli(['inspect',entry,'--frames','12,0,6,0','--storyboard','--output',output,'--json']);assert.equal(result.code,0,result.stderr);const report=JSON.parse(result.stdout);assert.equal(report.ok,true);assert.deepEqual(report.frames.map((f:{frame:number})=>f.frame),[12,0,6,0]);assert.equal(report.frames[3].cache.stageHits,2);assert.equal(report.frames[3].cache.finalImageReused,false);assert.equal(report.frames[1].image.rgbaSha256,report.frames[3].image.rgbaSha256);assert.ok(report.storyboard);assert.equal(report.policy.gpuPolicy,'swiftshader');assert.equal(report.policy.environment.gpuDevice,'not-probed');assert.ok(!result.stdout.includes('dataUrl'));assert.equal(hash(await readFile(entry)),before);
  const delivered=await cli(['inspect','image',output,'--id',report.frames[0].image.id,'--json']);const content=JSON.parse(delivered.stdout).content[0];assert.equal(content.type,'image');assert.equal((await sharp(Buffer.from(content.data,'base64')).metadata()).width,96);
  assert.deepEqual(report.frames[0].backend,{renderer:'FrameWeave.Renderer',capture:'composition',gpuPolicy:'swiftshader',stageEngines:['web']});
  const preview=await inspectProject({project:entry,frames:[0],width:48,mode:'preview',output:await fixture()});assert.equal(preview.ok,true);assert.equal(preview.frames[0].image?.width,48);assert.equal(preview.frames[0].image?.height,32);assert.equal(preview.policy.gpuPolicy,'auto');assert.equal(preview.frames[0].image?.mime,'image/png');
});
test('missing resources, invalid visual parameters, unknown plugins and TypeScript errors have stable locatable diagnostics',{timeout:120000},async()=>{
  const dir=await project(),entry=join(dir,'project.ts');await rm(join(dir,'logo.png'));const missing=await inspectProject({project:entry,output:await fixture()});assert.equal(missing.ok,false);assert.ok(missing.diagnostics.some(d=>d.code==='E_RESOURCE_MISSING'&&d.path===join(dir,'logo.png')));assert.ok(missing.suggestedActions.length);
  await writeFile(entry,`import {Composition,Stage,Rect} from '@frameweave/engine';export default Composition({width:96,height:64,fps:12,durationInFrames:13,children:Stage({id:'bad',children:Rect({width:-1,height:10})})});`);const bad=await inspectProject({project:entry,output:await fixture()});assert.equal(bad.ok,false);assert.ok(bad.diagnostics.some(d=>d.stageId==='bad'));
  await writeFile(entry,`import {Composition,Stage,Rect} from '@frameweave/engine';export default Composition({width:96,height:64,fps:12,durationInFrames:13,children:Stage({id:'bad',children:Rect({width:'wrong'})})});`);const typed=await inspectProject({project:entry,output:await fixture()});assert.ok(typed.diagnostics.some(d=>d.code==='E_TYPECHECK'&&d.location?.line));
  await writeFile(join(dir,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:[],userLibrary:false}));await writeFile(entry,`import {Composition} from '@frameweave/engine';import {PluginStage,plugin} from '@frameweave/engine/plugins';export default Composition({width:96,height:64,fps:12,durationInFrames:13,children:PluginStage({id:'bad',pipeline:[plugin('example.not-installed@1.0.0')]})});`);const plugin=await inspectProject({project:entry,output:await fixture()});assert.ok(plugin.diagnostics.some(d=>d.code==='E_PLUGIN_MISSING'&&d.source==='module'));
  await writeFile(entry,`import {Composition} from '@frameweave/engine';import {PluginStage,plugin} from '@frameweave/engine/plugins';export default Composition({width:96,height:64,fps:12,durationInFrames:13,children:PluginStage({id:'locked',pipeline:[plugin('fw.particles@1.0.0')]})});`);await writeLock(dir);
  const lockPath=join(dir,'frameweave.plugins.lock.json'),lock=JSON.parse(await readFile(lockPath,'utf8'));lock.runtime.integrity='0'.repeat(64);await writeFile(lockPath,JSON.stringify(lock));const lockBefore=await readFile(lockPath),mismatch=await inspectProject({project:entry,output:await fixture()});assert.ok(mismatch.diagnostics.some(d=>d.code==='E_PLUGIN_LOCK'));assert.deepEqual(await readFile(lockPath),lockBefore,'inspection must never silently refresh a lock');
  const invalid=await cli(['inspect',entry,'--allow-wasm=false','--json']);assert.equal(invalid.code,1);assert.equal(JSON.parse(invalid.stdout).diagnostics[0].code,'E_ARGUMENT');
});
test('inspection preserves default WASM denial and enables it only with explicit authorization',{timeout:120000},async()=>{
  const source=`import {Composition,Stage,Resource} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';export const wasm=defineWebStage(async({container,resources,width,height})=>{await WebAssembly.compile(await (await fetch(resources.code)).arrayBuffer());const c=document.createElement('canvas');c.width=width;c.height=height;container.append(c);return {renderAt(){c.getContext('2d')!.fillStyle='#65e9d5';c.getContext('2d')!.fillRect(0,0,width,height);return {};}};});export default Composition({width:96,height:64,fps:12,durationInFrames:13,children:[Resource({id:'code',kind:'file',src:'./module.wasm'}),Stage({id:'wasm',factory:wasm})]});`;
  const dir=await fixture({'project.ts':source,'module.wasm':Buffer.from([0,97,115,109,1,0,0,0])}),entry=join(dir,'project.ts');
  const denied=await inspectProject({project:entry,frames:[0],output:await fixture()});assert.equal(denied.ok,false);assert.equal(denied.policy.allowWasm,false);assert.ok(denied.diagnostics.some(d=>d.code==='E_INSPECTION_WASM_AUTH'));
  const allowed=await inspectProject({project:entry,frames:[0],allowWasm:true,output:await fixture()});assert.equal(allowed.ok,true);assert.ok(allowed.frames[0].image);
});
test('bounded repair workflow records a real failing frame, caller edit, recovered frame, visual diff and decodable MP4',{timeout:180000},async()=>{
  await mkdir(evidence,{recursive:true});const proof=await mkdtemp(join(evidence,'run-')),dir=await fixture(),entry=join(dir,'project.tsx'),before=await readFile(join(engineRoot,'examples/render-inspection/before.tsx')),fixed=await readFile(join(engineRoot,'examples/render-inspection/after.tsx'));await writeFile(entry,before);
  const session=join(proof,'session'),first=await inspectIteration({project:entry,session,maxIterations:2,frames:[0,6,12],storyboard:true});assert.equal(first.ok,false);assert.ok(first.inspection?.diagnostics.some(d=>d.frame===6&&d.stageId==='marker'&&d.message.includes('E_DEMO_LAYOUT')));assert.deepEqual(await readFile(entry),before);
  // The caller deliberately edits its own fixture. The inspection/session services never edit source.
  await writeFile(entry,fixed);const second=await inspectIteration({project:entry,session,maxIterations:2,frames:[0,6,12],storyboard:true});assert.equal(second.ok,true);assert.deepEqual(second.inspection?.diagnostics,[]);assert.deepEqual(await readFile(entry),fixed);assert.equal(second.comparison?.status,'different');assert.ok(second.comparison?.anomalies.some(a=>a.code==='W_FRAME_RECOVERED'));assert.ok(second.comparison?.pairs[0].comparison?.metrics?.maxChannelDifference);
  const third=await inspectIteration({project:entry,session,frames:[0]});assert.equal(third.ok,false);assert.equal(third.diagnostics[0].code,'E_INSPECTION_BUDGET');
  const r=await Renderer.create(await buildProject(entry),{cache:false}),encoder=await VideoEncoder.create(join(proof,'Fixed-Inspection.mp4'),{num:12,den:1},160,90);try{for(let f=0;f<13;f++)await encoder.write((await r.renderFrame(f)).png);await encoder.finish();}catch(e){await encoder.abort();throw e;}finally{await r.close();}
  const video=await probeVideo(join(proof,'Fixed-Inspection.mp4'));assert.equal(video.decodable,true);assert.equal(video.frames,13);
  const unsupported=await cli(['inspect','compare','--before',join(proof,'Fixed-Inspection.mp4'),'--after',join(session,'revision-002',second.inspection!.frames[0].image!.file),'--allow-lossy','--max-diff','3','--json']);assert.equal(JSON.parse(unsupported.stdout).diagnostics[0].code,'E_COMPARE_MEDIA');
  await writeFile(join(proof,'proof.json'),JSON.stringify({ok:true,before:first.inspection?.reportFile,after:second.inspection?.reportFile,comparison:second.comparison?.reportFile,budgetEnforced:true,sourceEditedOnlyByCaller:true,video},null,2));await writeFile(join(engineRoot,'artifacts/render-inspection/latest-example.json'),JSON.stringify({directory:proof},null,2));
  await readInspectionImage(join(session,'comparison-2'),second.comparison!.images[0].id);
});
test('legacy frame/storyboard/render and direct TSX interactive preview keep their existing behavior',{timeout:180000},async()=>{
  const dir=await project(),entry=join(dir,'project.ts');
  for(const [command,extra,name]of [['frame',['--frame','6'],'frame.png'],['storyboard',['--frames','0,6,12'],'board.png'],['render',[],'video.mp4']] as const){const result=await cli([command,entry,...extra,'--output',join(dir,name),'--json']);assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).ok,true);}
  assert.equal((await probeVideo(join(dir,'video.mp4'))).frames,13);
  const child=spawn(process.execPath,['--import','tsx',join(engineRoot,'src/cli.ts'),entry,'--no-open','--accurate','--width','48'],{cwd:engineRoot,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stderr.on('data',b=>stderr+=b);const exited=new Promise<number|null>(r=>child.once('close',r));
  try{
    const url=await new Promise<string>((r,j)=>{const timer=setTimeout(()=>j(Error('Direct preview did not start: '+stderr)),30000);child.stdout.on('data',b=>{stdout+=b;try{const v=JSON.parse(stdout);if(v.preview){clearTimeout(timer);r(v.preview);}}catch{}});});
    let state:{ready?:boolean;error?:unknown}={};const stop=Date.now()+60000;
    while(!state.ready&&Date.now()<stop){state=await (await fetch(url.replace('/?','/state?'))).json();if(state.error)throw Error(JSON.stringify(state.error));if(!state.ready)await new Promise(r=>setTimeout(r,100));}
    assert.equal(state.ready,true);const image=await fetch(url.replace('/?','/frame?')+'&frame=0&format=png');assert.equal(image.headers.get('content-type'),'image/png');assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).width,48);
    await fetch(url.replace('/?','/close?'),{method:'POST'});assert.equal(await exited,0);
  }finally{if(child.exitCode===null)child.kill();}
});
