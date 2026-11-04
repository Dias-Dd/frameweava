import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {nativeExecutable} from '../../native-gpu/executable.ts';
const out=resolve(process.env.FRAMEWEAVE_VIDEO_ROTO_RUN!),rows:object[]=[],save=(n:string,v:unknown)=>writeFile(join(out,n),JSON.stringify(v,null,2)+'\n'),hash=(v:Float32Array)=>createHash('sha256').update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest('hex'),native=await nativeExecutable(),legacy=JSON.parse(await readFile('docs/native-video-roto-evidence/gpu-result.json','utf8')),legacyHashes=new Map<number,string>(legacy.rows.map((r:{frame:number;resultSha256:string})=>[r.frame,r.resultSha256]));
let segmentedHash='',legacyMatches=0;
try{
 const cases:readonly(readonly[string,readonly number[]])[]=process.argv[2]==='smoke'?[['project-long.tsx',[1,1,0]]]:[['project-long.tsx',[50,1,1,0]],['project-uncut.tsx',[50]]];
 for(const [entry,frames]of cases){
  const build=await buildProject(resolve('modules/native-effects/video-roto/'+entry)),r=await Renderer.create(build,{cache:false,timeoutMs:120000,nativeGpu:{executable:native,dynamic:'interactive',slots:1,maxBytes:6*1024**3}}),seen=new Map<number,string>();
  try{
   await assert.rejects(r.submitNativeFrame(0,{signal:AbortSignal.abort()}));
   for(const frame of frames){
    const started=performance.now(),ticket=await r.submitNativeFrame(frame);await ticket.completed;
    const get=async(name:string)=>{const data=await r.exportNativeBuffer(ticket,'video-roto/'+name);assert.ok(data.values instanceof Float32Array);assert.ok(data.values.every(Number.isFinite),name);return data.values;};
    const result=await get('result'),rgbaSha256=hash(result),scores=[];
    if(process.argv[2]==='smoke'){const names=['source','authored','f0-pixels','f0-features','f0-memory',...frame?['f1-pixels','f1-features','f1-memory_pos','f1-valid','f1-logits']:[]],diagnostics:Record<string,object>={};for(const name of names){const data=await get(name);diagnostics[name]={sha256:hash(data),first:[...data.slice(0,8)],absSum:data.reduce((s,v)=>s+Math.abs(v),0)};}await save('smoke-'+rows.length+'.json',{frame,rgbaSha256,diagnostics});}
    if(seen.has(frame))assert.equal(rgbaSha256,seen.get(frame));seen.set(frame,rgbaSha256);
    if(legacyHashes.has(frame)){assert.equal(rgbaSha256,legacyHashes.get(frame),'Existing qualified short replay pixels unchanged');legacyMatches++;}
    for(let j=0;j<=frame;j++)scores.push({frame:j,score:(await get('f'+j+'-object_score'))[0]});
    if(frame>=16){assert.ok(scores.filter(v=>v.frame>=8&&v.frame<=13).every(v=>v.score<0));assert.ok(scores[14].score>0&&scores[16].score>0);}
    if(frame===50){if(entry==='project-long.tsx'){
      segmentedHash=rgbaSha256;
      for(const name of ['features','high0','high1','logits','memory','pointer','object_score','memory_pos','pointer_pos','valid','spatial_memory','object_pointers']){const values=await get('f50-'+name);await writeFile(join(out,'f50-'+name+'.f32'),new Uint8Array(values.buffer,values.byteOffset,values.byteLength));}
     }else assert.equal(rgbaSha256,segmentedHash,'Segmented and uncut exact output parity');}
    rows.push({entry,frame,wallMs:performance.now()-started,rgbaSha256,scores});await save('progress.json',{rows,legacyMatches});
   }
   const stats=await r.nativeStats();assert.equal(stats.capabilities.hardwareVerified,true);assert.equal(stats.capabilities.nativeInference?.preallocatedOutputs,true);assert.equal(stats.inference.runtimeVerified,true);assert.equal(stats.inference.cpuPixelReadbacks,0);assert.equal(stats.inference.cpuPixelUploads,0);assert.equal(stats.imageReadbacks,0);if(entry==='project-long.tsx'&&frames.includes(50))assert.ok(stats.completed>frames.length,'Actual same-frame prefix submissions executed');
   await save(entry+'-stats.json',stats);
  }finally{await r.close();await r.close();await r.nativeExited();await save(entry+'-closed.json',{nativeExited:true,doubleClose:true});}
 }
 assert.ok(legacyMatches>=2);await save('result.json',{ok:true,rows,legacyMatches,segmentedEqualsUncut:process.argv[2]!=='smoke',maxObservedFramesPerRequest:Math.max(...cases.flatMap(([,frames])=>frames))+1});console.log(JSON.stringify({ok:true,requests:rows.length,legacyMatches}));
}catch(error){await save('result.json',{ok:false,rows,legacyMatches,error:String(error)});throw error;}
