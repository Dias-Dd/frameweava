import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {RenderSession} from '../modules/render-session/index.ts';
import {SharedSessionAdapter} from '../modules/shared-state/session-adapter.ts';
import {sharedVariable} from '../src/shared-state/authoring.ts';
import {Renderer} from '../src/render/renderer.ts';
import {buildProject} from '../src/compiler/build.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';
import {linear709,srgb,pixelsFromSurface} from '../src/media/surface.ts';
import {readExr} from '../src/media/ocio.ts';
import {ffmpegPath,probeVideo} from '../src/encoding/ffmpeg.ts';

const exec=promisify(execFile),root=resolve('artifacts/native-shared');
await mkdir(root,{recursive:true});
const out=await mkdtemp(join(root,'integration-'));
const original=await readFile('examples/native-shared/project.tsx','utf8');
const count=sharedVariable({id:'count',writer:'writer',kind:'number',initial:0});
const document=sharedVariable({id:'document',writer:'writer',kind:'json',initial:{items:[0],$expr:'literal shared data'}});
const media={workingColor:linear709,preview:{color:srgb,clip:true}};
const rows:Record<string,unknown>[]=[];
const report={ok:false,runtimePin,sourceBaseline:'3800f009bf0e25d40e37e5e37734093276bcdf56',ownerBoundary:'cc7ea5e6bdfc0b7d9e671ae98492cdec4c940abe',out,rows};
const save=()=>writeFile(join(out,'result.json'),JSON.stringify(report,null,2)+'\n');
const digest=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const code=(expected:string)=>(e:any)=>e?.code===expected;
async function project(name:string,props:Record<string,unknown>={},stall=false){
  const directory=join(out,name);await mkdir(directory,{recursive:true});const entry=join(directory,'project.tsx');
  let text=original.replace('export default sharedProject();','export default sharedProject('+JSON.stringify(props)+');');
  if(stall)text=text.replace('const draft=sharedFrame(context,inputs,props),seen=draft.get(count);','const draft=sharedFrame(context,inputs,props),seen=draft.get(count); if(context.globalFrame===2)await new Promise(()=>{});');
  await writeFile(entry,text);return entry;
}
async function step(name:string,run:()=>Promise<unknown>){
  const started=performance.now();try{const evidence=await run();rows.push({name,ok:true,ms:performance.now()-started,evidence});await save();console.log(JSON.stringify({name,ok:true}));}
  catch(e){rows.push({name,ok:false,ms:performance.now()-started,error:String(e),stack:(e as Error).stack});await save();throw e;}
}
const entry=resolve('examples/native-shared/project.tsx');
try{
  await step('real Native history, cache on/off, immutable JSON, HDR and close',async()=>{
    const histories=[];
    for(const cache of [true,false]){
      const session=new RenderSession(entry,{cache,media});const history=[];
      try{
        for(const [i,frame]of [100,0,100].entries()){
          const result=await session.renderFrame(frame);assert.equal(result.stageOutputs.reader.seen,i+1);assert.equal(result.stageOutputs.writer.calls,i+1);
          assert.equal(result.shared?.cells.count.version,i+1);const rgba=await sharp(result.png).ensureAlpha().raw().toBuffer();history.push(digest(rgba));
          await writeFile(join(out,`history-${cache}-${i}.png`),result.png);
        }
        assert.notEqual(history[0],history[2]);
        const hdr=await session.mediaFrame(0),pixels=pixelsFromSurface(hdr.surface);assert.equal(hdr.stageOutputs.reader.seen,4);
        assert.ok(pixels[1]<0&&pixels[2]>1);assert.equal(pixels[3],.75);
        const detached=await session.readShared(document);detached.value.items.push(999);assert.deepEqual((await session.readShared(document)).value.items,[4]);
        assert.deepEqual(await session.readShared(count),{value:4,version:4,revision:4});
        histories.push({cache,hashes:history,pixel:[...pixels.slice(0,4)],stats:await session.nativeStats()});
      }finally{await session.close();await session.close();}
      await assert.rejects(session.readShared(count),code('E_RENDER_SESSION_CLOSED'));
    }
    assert.deepEqual(histories[0].hashes,histories[1].hashes);return histories;
  });
  await step('writer/reader exceptions roll back managed cells and allow retry',async()=>{
    const evidence=[];
    for(const key of ['writerFailureFrame','readerFailureFrame']){
      const session=new RenderSession(await project(key,{[key]:1}),{media});
      try{await session.renderFrame(0);await assert.rejects(session.renderFrame(1),/NATIVE_SHARED_.*_FAILURE/);
        assert.deepEqual(await session.readShared(count),{value:1,version:1,revision:1});
        const retry=await session.renderFrame(0);assert.equal(retry.stageOutputs.reader.seen,2);assert.equal(retry.stageOutputs.writer.calls,3);
        evidence.push({key,read:await session.readShared(count),calls:retry.stageOutputs.writer.calls});
      }finally{await session.close();}
    }return evidence;
  });
  await step('reader write permission is preserved across real SpiderMonkey RPC',async()=>{
    const session=new RenderSession(await project('illegal-write',{illegalWrite:true}),{media});
    try{await assert.rejects(session.renderFrame(0),(e:any)=>e?.code==='E_SHARED_WRITER'&&e.frame===0&&e.stageId==='reader');assert.equal((await session.readShared(count)).value,0);}finally{await session.close();}
    return {code:'E_SHARED_WRITER',committed:false};
  });
  await step('prepared same-frame cache distinguishes transaction identity and copies overrides',async()=>{
    const build=await buildProject(entry),renderer=await Renderer.create(build,{media,nativeGpu:{executable:await nativeExecutable(),readback:'final-surface',slots:1}});
    const host=new SharedSessionAdapter('native-prepared-key');host.bind(build,'verified-local-fixture');const owner={assertActive(){}};
    try{
      await assert.rejects(renderer.prepareNativeFrame(0),code('E_SHARED_HOST_REQUIRED'));
      await assert.rejects(host.render(0,async execution=>{await renderer.prepareNativeFrame(0,{execution});throw Error('discard prepared transaction');},owner),/discard prepared/);
      const result=await host.render(0,async execution=>{const copy={stageProps:JSON.parse(JSON.stringify(execution!.stageProps)) as Record<string,Record<string,string>>};const pending=renderer.renderFrame(0,undefined,copy);copy.stageProps.writer.vSharedRuntime='invalid after API entry';return pending;},owner);
      assert.equal(result.stageOutputs.writer.calls,2);assert.equal(result.stageOutputs.reader.seen,1);assert.equal(host.read(count).version,1);
      return {transaction:result.shared?.transaction,calls:result.stageOutputs.writer.calls,read:host.read(count)};
    }finally{host.dispose();await renderer.close();}
  });
  await step('Native F16 producer preserves HDR/Alpha through the existing F32 compositor',async()=>{
    const session=new RenderSession(await project('half',{format:'rgba16float'}),{media});
    try{const frame=await session.mediaFrame(0),p=pixelsFromSurface(frame.surface);assert.ok(p[1]<0&&p[2]>1);assert.equal(p[3],.75);return {pixel:[...p.slice(0,4)],read:await session.readShared(count)};}finally{await session.close();}
  });
  await step('source seal changes invalidate the existing shared Session',async()=>{
    const source=await project('changed-source'),session=new RenderSession(source,{media});
    try{await session.renderFrame(0);await appendFile(source,'\n// deliberate source-seal mutation\n');await assert.rejects(session.readShared(count),code('E_SHARED_SESSION_REOPEN'));return {reopenRequired:true};}finally{await session.close();}
  });
  await step('cancel after actual GPU completion prevents a late shared commit',async()=>{
    let armed=false,observed=false;const controller=new AbortController();
    const session=new RenderSession(entry,{media,onProfile:event=>{if(armed&&event.phase==='renderer.frame'&&event.outcome==='ok'&&event.frame===2){armed=false;const current=session.status().shared;observed=current.enabled&&current.pending;controller.abort();}}});
    try{await session.renderFrame(0);armed=true;await assert.rejects(session.renderFrame(2,{signal:controller.signal}),code('E_RENDER_CANCELLED'));await session.close();assert.equal(observed,true);const state=session.status().shared;assert.ok(state.enabled);assert.equal(state.revision,1);assert.equal(state.pending,false);return state;}finally{await session.close();}
  });
  await step('official CLI PNG, floating EXR and decoded three-frame MP4',async()=>{
    const evidence=[];
    for(const [command,name,extra]of [['frame','cli.png',['--frame','100']],['frame','cli.exr',['--frame','0']],['render','cli.mp4',['--from','0','--to','0.1','--encoder','libx264']]] as const){
      const output=join(out,name),args=['--import','tsx','src/cli.ts',command,entry,'--output',output,'--json',...extra];
      const r=await exec(process.execPath,args,{windowsHide:true,timeout:60000,maxBuffer:2*1024**2});await writeFile(join(out,name+'.stdout.log'),r.stdout);await writeFile(join(out,name+'.stderr.log'),r.stderr);
      const result=JSON.parse(r.stdout);assert.equal(result.ok,true);evidence.push({command,name,frames:result.frames});
    }
    const decoded=await readExr(join(out,'cli.exr')),p=pixelsFromSurface(decoded.surface);assert.equal(p[1],-.25);assert.equal(p[2],2);assert.equal(p[3],.75);
    const raw=await exec(ffmpegPath(),['-v','error','-i',join(out,'cli.mp4'),'-f','rawvideo','-pix_fmt','rgba','pipe:1'],{windowsHide:true,encoding:'buffer',timeout:15000,maxBuffer:2*1024**2});
    assert.equal(raw.stdout.length,64*36*4*3);const stride=64*36*4;assert.notEqual(digest(raw.stdout.subarray(0,stride)),digest(raw.stdout.subarray(2*stride,3*stride)));
    return {outputs:evidence,exrPixel:[...p.slice(0,4)],decodedBytes:raw.stdout.length,probe:await probeVideo(join(out,'cli.mp4'))};
  });
  report.ok=true;await save();await writeFile(join(root,'latest-integration.json'),JSON.stringify({out,result:join(out,'result.json')},null,2)+'\n');
}catch(error){await save();throw error;}
