import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {performance} from 'node:perf_hooks';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {buildProject} from '../../../../src/compiler/build.ts';import {Renderer} from '../../../../src/render/renderer.ts';
const run=resolve(process.env.CREATION_RUN!),out=resolve(process.env.CREATION_EVIDENCE!),pack=resolve(process.env.CREATION_PACKAGE!),exec=promisify(execFile),rows:any[]=[];await mkdir(run,{recursive:true});
const original=await readFile('modules/native-2d/validation/phase3/scale-fixture.tsx','utf8');
for(const [width,height]of [[1920,1080],[3840,2160]]){
 const entry=join(run,'scale-'+width+'.tsx');await writeFile(entry,original.replace('width:1920,height:1080',`width:${width},height:${height}`));
 const installed=await exec(process.execPath,['--import','tsx','src/cli.ts','packages','install',pack,'--project',entry,'--trust','local:frameweave.native-2d-candidate'],{windowsHide:true,timeout:30000});await writeFile(join(out,'scale-install-'+width+'.json'),installed.stdout);
 const start=performance.now(),build=await buildProject(entry,{outputDir:join(run,'scale-build-'+width)}),compiled=performance.now(),renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU!),dynamic:'interactive',slots:1,maxBytes:2*1024**3}}),created=performance.now();
 const frames:any[]=[];try{for(const frame of [0,1,2,3,4]){
  const t=performance.now(),ticket=await renderer.submitNativeFrame(frame),submitted=performance.now();await ticket.completed;const completed=performance.now(),data=(await renderer.exportNativeBuffer(ticket,'scale/stats')).values,stats=JSON.parse(Array.from(data,v=>String.fromCharCode(v)).join(''));
  assert.equal(stats.last.batches,1,'1024 separate opaque objects must share one final mesh batch');assert.equal(stats.last.isolatedGroups,0);assert.equal(stats.last.resourceImports,0);assert.equal(stats.last.staticGeometryReused,frame!==4);assert.equal(stats.last.geometry.preparations,frame===4?1025:1024);
  if(frame===3)assert.equal(stats.tree.nodes,1025);
  frames.push({frame,change:['static-cold','new-time','transform','style','geometry'][frame],recordAndSubmitMs:submitted-t,submitToQueueCompletedMs:completed-submitted,stats});
 }rows.push({width,height,objects:1024,buildMs:compiled-start,sessionCreateMs:created-compiled,frames,backend:await renderer.nativeStats(),gpuExecutionMs:null,physicalPeakMemory:null});}finally{await renderer.close();}
 await writeFile(join(out,'scale-results.json'),JSON.stringify({ok:true,rows,measurement:'Node perf_hooks wall clocks. Record/submit combines JS, binary serialization and submission; queue completion is separate. No isolated GPU timestamp or peak-memory claim. Each new frame is actually recorded; no frame-result caching.'},null,2)+'\n');
}
console.log('PASS 1024 objects share one mesh batch at 1080p/4K; independent transform/style edits retain local geometry, geometry edit invalidates one object');
