/** Real ACL-2 acceptance harness. Provision the existing MVP SDK/model/video first; never downloads. */
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,copyFile,readFile,writeFile,readdir,appendFile} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {createAnalysisService,executeAnalysisTool} from '../src/analysis-tools/index.ts';
import {hashAnalysisFile} from '../src/analysis/artifact.ts';
import {createTrackReader,validateTrackData} from '../modules/graphics-contracts/track.ts';
import type {AnalysisToolEvent} from '../src/analysis-tools/types.ts';

const parent=resolve(process.argv[2]??'outputs/acl2/e2e');await mkdir(parent,{recursive:true});
const root=await mkdtemp(join(parent,'run-')),logs=join(root,'logs');await mkdir(logs);
await mkdir(join(root,'assets'));await copyFile(resolve('prototypes/analysis-job-mvp/assets/david.webm'),join(root,'assets/person.webm'));
await writeFile(join(root,'image.ppm'),Buffer.concat([Buffer.from('P6\n2 2\n255\n'),Buffer.from([0,0,0,255,255,255,255,0,0,0,255,0])]));
const metrics:Record<string,unknown>={projectRoot:root,node:process.version,platform:process.platform,arch:process.arch};let sequence=0;
async function cli(label:string,args:string[],expectedError?:string){
  const start=performance.now(),file=join(logs,`${String(++sequence).padStart(2,'0')}-${label}`);
  let stdout='',stderr='',error:any;try{const r=await promisify(execFile)(process.execPath,['--import','tsx',resolve('src/cli.ts'),'analyze',...args,'--project',root,'--json'],{windowsHide:true,maxBuffer:4*1024*1024});stdout=r.stdout;stderr=r.stderr;}catch(e:any){error=e;stdout=e.stdout;stderr=e.stderr;}
  await writeFile(file+'.stdout.json',stdout);await writeFile(file+'.stderr.jsonl',stderr);await writeFile(file+'.command.json',JSON.stringify({args,project:root,exitCode:error?.code??0,elapsedMs:performance.now()-start},null,2));
  // Existing CLI failures are one pretty-printed JSON document; progress is JSONL.
  const lines=expectedError?[JSON.parse(stderr)]:stderr.trim().split(/\r?\n/).filter(Boolean).map(s=>JSON.parse(s));
  if(expectedError){assert.ok(error,`${label} must fail`);const failed=lines.find(l=>l.ok===false);assert.equal(failed?.diagnostics[0].code,expectedError);return failed;}
  assert.ifError(error);const data=JSON.parse(stdout);assert.equal(data.ok,true);return {data,events:lines,elapsedMs:performance.now()-start};
}
const list=await cli('list',['list']);assert.equal(list.data.capabilities.find((c:any)=>c.aliases.includes('face-tracking')).availability.ready,true);
const run=await cli('real-face',['run','face-tracking','--input','assets/person.webm','--events']),id=run.data.artifact.artifactId;
assert.equal(run.data.artifact.summary.sampleCount,64);assert.equal(run.data.artifact.summary.validSamples,57);assert.equal(run.data.artifact.summary.missingSamples,7);assert.equal(run.data.execution.cacheHit,false);assert.equal(run.data.job.cleanup.complete,true);
assert.ok(run.events.some((e:any)=>e.job.phase==='analyzing'&&e.job.completed===64));metrics.analysis=run.data.execution;metrics.cliRunMs=run.elapsedMs;metrics.progressEvents=run.events.length;
const inspected=await cli('inspect',['inspect',id]);const trackResource=inspected.data.resources[0];
assert.deepEqual(await hashAnalysisFile(trackResource.path),{sha256:trackResource.reference.sha256,bytes:trackResource.reference.bytes});
const data=validateTrackData(JSON.parse(await readFile(trackResource.path,'utf8'))),reader=createTrackReader(data);
assert.equal(inspected.data.summary.visibleSegments,new Set(data.samples.filter(s=>s.valid).map(s=>s.trackId)).size);
metrics.artifactId=id;metrics.summary=inspected.data.summary;
const status=await cli('status',['status',run.data.job.jobId]);assert.equal(status.data.job.scope,'terminal-receipt');assert.equal(status.data.job.controllable,false);
await cli('cancel-terminal',['cancel',run.data.job.jobId]);
const sample=await cli('sample',['sample',id,'--time','4']);assert.deepEqual(sample.data.result,reader.query(4));
const range=await cli('range',['sample',id,'--from','0','--to','8','--limit','128']);assert.equal(range.data.records.length,64);
const service=await createAnalysisService({projectRoot:root});
try{
  const start=performance.now();for(const s of data.samples){const q=await executeAnalysisTool(service,'sample',{artifactId:id,time:s.timestampUs/1e6});assert.deepEqual(q.result,reader.query(s.timestampUs/1e6));}metrics.all64QueriesMs=performance.now()-start;
  for(const time of [7.99,4.0625,.125,8,-1,4,0,.2,4.0625])for(const mode of ['linear','nearest']as const){const q=await executeAnalysisTool(service,'sample',{artifactId:id,time,mode});assert.deepEqual(q.result,reader.query(time,{mode}));}
  const events:AnalysisToolEvent[]=[],controller=new AbortController();let cancelId='';let ticks=0;const timer=setInterval(()=>ticks++,5);
  try{await assert.rejects(service.run({capabilityId:'face-tracking',input:'assets/person.webm',parameters:{endSeconds:7.75}},{signal:controller.signal,onProgress:e=>{events.push(e);cancelId=e.job.jobId;if(e.job.phase==='analyzing'&&e.job.completed===2)controller.abort();}}),(e:any)=>e.code==='E_CANCELLED'&&e.details.job.cleanup.complete);}finally{clearInterval(timer);}
  const cancelled=await service.status(cancelId);assert.equal(cancelled.state,'cancelled');assert.equal(cancelled.cleanup?.forced,false);assert.equal(cancelled.cleanup?.processExited,true);assert.ok(ticks>20);metrics.cancelled={job:cancelled,mainLoopTicks:ticks};await writeFile(join(logs,'cancel-events.json'),JSON.stringify(events,null,2));
  await writeFile(join(root,'assets/bad.mp4'),'broken real input');let failedId='';await assert.rejects(service.run({capabilityId:'face-tracking',input:'assets/bad.mp4'}),(e:any)=>{failedId=e.details.jobId;metrics.failure=e.details.job;return e.details.job.cleanup.complete&&e.code==='E_ANALYSIS_DECODE';});assert.equal((await service.status(failedId)).state,'failed');
}finally{await service.close();}
const hit=await cli('cache-hit',['run','face-tracking','--input','assets/person.webm','--events']);assert.equal(hit.data.execution.cacheHit,true);assert.equal(hit.data.artifact.artifactId,id);assert.ok(!hit.events.some((e:any)=>e.job.phase==='analyzing'));metrics.cacheHit=hit.data.execution;
await copyFile(join(root,'assets/person.webm'),join(root,'assets/changed.webm'));await appendFile(join(root,'assets/changed.webm'),Buffer.from([0]));
const changed=await cli('changed-content',['run','face-tracking','--input','assets/changed.webm']);assert.equal(changed.data.execution.cacheHit,false);assert.notEqual(changed.data.artifact.artifactId,id);assert.equal(changed.data.artifact.summary.sampleCount,64);metrics.changedContent={artifactId:changed.data.artifact.artifactId,execution:changed.data.execution};
// Tamper only this harness's new result; preserve all original MVP/C3 evidence.
const original=await readFile(trackResource.path);try{await writeFile(trackResource.path,Buffer.concat([original,Buffer.from(' ')]));await cli('integrity-error',['inspect',id],'E_ANALYSIS_CACHE');}finally{await writeFile(trackResource.path,original);}
const previews=[];for(const [name,time]of [['initial',0],['missing',.125],['middle',4],['interpolated',4.0625],['final',7.875],['middle-repeat',4]]as const){
  const p=await cli('preview-'+name,['preview',id,'--time',String(time),'--output',`previews/${name}.png`]),output=p.data.output;
  assert.deepEqual(await hashAnalysisFile(output.path),{sha256:output.reference.sha256,bytes:output.reference.bytes});const png=await sharp(output.path).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(png.info.width,640);assert.equal(png.info.height,480);
  const query=reader.query(time);assert.deepEqual(p.data.result,query);if(query.valid){const x=Math.round(query.anchor.x*640),y=Math.round(query.anchor.y*480),offset=(y*640+x)*4;assert.deepEqual([...png.data.subarray(offset,offset+3)],[122,255,209]);}else{const frame=data.samples.find(s=>s.timestampUs===p.data.backgroundTimestampUs)!;assert.deepEqual(png.data,await sharp(await readFile(join(dirname(trackResource.path),frame.frameAsset))).ensureAlpha().raw().toBuffer());}
  previews.push({name,time,path:output.path,sha256:output.reference.sha256,elapsedMs:p.elapsedMs,observation:p.data.observation,backgroundTimestampUs:p.data.backgroundTimestampUs});
}
assert.equal(previews.find(p=>p.name==='middle')!.sha256,previews.find(p=>p.name==='middle-repeat')!.sha256);
metrics.previews=previews;assert.deepEqual(await readdir(join(root,'.frameweave/analysis-tools/previews')),[]);
await cli('preview-no-overwrite',['preview',id,'--time','4','--output','previews/middle.png'],'E_ANALYSIS_OUTPUT_EXISTS');
await cli('preview-range-error',['preview',id,'--time','8','--output','previews/outside.png'],'E_ANALYSIS_TIME_RANGE');
await cli('path-error',['preview',id,'--time','4','--output',join(dirname(root),'escape.png')],'E_ANALYSIS_PATH');
const brightness=await cli('brightness',['run','image-brightness','--input','image.ppm']);assert.equal(brightness.data.artifact.summary.pixels,4);metrics.brightness=brightness.data;
metrics.completedAt=new Date().toISOString();metrics.passed=true;await writeFile(join(root,'acceptance.json'),JSON.stringify(metrics,null,2));
await writeFile(join(parent,'latest.json'),JSON.stringify({root,acceptance:join(root,'acceptance.json')},null,2));console.log(JSON.stringify(metrics,null,2));
