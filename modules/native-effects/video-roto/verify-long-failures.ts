import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildProject} from '../../../src/compiler/build.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {nativeExecutable} from '../../native-gpu/executable.ts';
const rows:object[]=[],out=resolve(process.env.FRAMEWEAVE_VIDEO_ROTO_RUN!);
try{
 for(const kind of ['cancel','failure']){
  const build=await buildProject(resolve('modules/native-effects/video-roto/'+(kind==='cancel'?'project-long.tsx':'project-failure.tsx'))),r=await Renderer.create(build,{cache:false,timeoutMs:120000,nativeGpu:{executable:await nativeExecutable(),dynamic:'interactive',slots:1,maxBytes:6*1024**3}});let error:unknown;
  try{
   const controller=new AbortController();let pending=true,observer:Promise<void>|undefined;
   const request=r.submitNativeFrame(20,{signal:controller.signal});
   if(kind==='cancel')observer=(async()=>{while(pending){const s=await r.nativeStats();if(s.stateContinuations.segments>0){controller.abort();return;}await new Promise(resolve=>setTimeout(resolve,100));}})();
   try{await(await request).completed;}catch(e){error=e;}finally{pending=false;await observer;}
   assert.ok(error,'Authored failure must reject');const e=error as Error,description=JSON.stringify({...e,message:e.message});assert.match(description,kind==='cancel'?/E_RENDER_CANCELLED|cancelled|abort/i:/Intentional source failure/);
   const stats=await r.nativeStats();assert.ok(stats.inference?.models?.some((m:{completed:number})=>m.completed>=8),'Failure happened after a real accepted inference segment');
   rows.push({kind,error:{...e,message:e.message},stats});
  }finally{await r.close();await r.close();await r.nativeExited();}
 }
 await writeFile(join(out,'result.json'),JSON.stringify({ok:true,rows,nativeExited:true,scope:'Cancellation and authored source exception after actual accepted eight-observation GPU inference segment; no claim of interrupting in-flight provider execution'},null,2));
}catch(error){await writeFile(join(out,'result.json'),JSON.stringify({ok:false,rows,error:String(error)},null,2));throw error;}
