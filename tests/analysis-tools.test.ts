import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,readdir,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createAnalysisService,executeAnalysisTool,analysisToolDefinitions} from '../src/analysis-tools/index.ts';
import {sampleArtifact,inspectArtifact} from '../src/analysis-tools/artifacts.ts';
import {createTrackReader,validateTrackData} from '../modules/graphics-contracts/track.ts';
import type {AnalysisToolEvent} from '../src/analysis-tools/types.ts';
import {installPackages,installedPackages} from '../src/packages/manager.ts';
import {hashAnalysisFile} from '../src/analysis/artifact.ts';

const parent=resolve('.frameweave/acl2-tests');await mkdir(parent,{recursive:true});
async function fixture(){const root=await mkdtemp(join(parent,'project-'));await writeFile(join(root,'image.ppm'),Buffer.concat([Buffer.from('P6\n2 2\n255\n'),Buffer.from([0,0,0,255,255,255,255,0,0,0,255,0])]));return root;}
const cli=async(root:string,args:string[])=>{const r=await promisify(execFile)(process.execPath,['--import','tsx',resolve('src/cli.ts'),'analyze',...args,'--project',root,'--json'],{windowsHide:true,maxBuffer:1024*1024});return JSON.parse(r.stdout);};
test('discovery has stable IDs, bounded APIs, truthful readiness and no package-code auto-execution',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root});try{const r=await executeAnalysisTool(service,'list',{});assert.equal(r.ok,true);assert.equal(r.capabilities.length,2);assert.equal(r.capabilities.find((c:any)=>c.id.endsWith('image-brightness')).availability.ready,true);assert.equal(r.installedModules.length,0);assert.equal(r.lifecycle.backgroundHost,false);assert.equal(r.tools.length,8);assert.ok(analysisToolDefinitions.every(s=>s.inputSchema.additionalProperties===false));}finally{await service.close();}
});
test('shared service runs existing brightness via C3, persists terminal receipt and reuses its verified cache',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root}),events:AnalysisToolEvent[]=[];
  let id='',jobId='';try{const r=await service.run({capabilityId:'image-brightness',input:'image.ppm'},{onProgress:e=>events.push(e)});id=r.artifact.artifactId;jobId=r.job.jobId;assert.equal(r.job.state,'succeeded');assert.equal(r.artifact.summary.pixels,4);assert.equal(r.execution.cacheHit,false);assert.ok(events.some(e=>e.job.phase==='pixels'));assert.ok(!JSON.stringify(r).includes('"histogram":'));const again=await service.run({capabilityId:'brightness',input:'image.ppm'});assert.equal(again.execution.cacheHit,true);assert.equal(again.artifact.artifactId,id);}finally{await service.close();}
  const fresh=await createAnalysisService({projectRoot:root});try{const status=await fresh.status(jobId);assert.equal(status.scope,'terminal-receipt');assert.equal(status.controllable,false);assert.equal(status.artifactId,id);assert.equal((await fresh.cancel(jobId)).accepted,false);assert.equal((await fresh.inspect(id)).integrity.verified,true);await assert.rejects(fresh.sample(id,{time:0}),{code:'E_ANALYSIS_QUERY_UNSUPPORTED'});}finally{await fresh.close();}
});
test('live cancellation is same-instance only, settles cleanup, and close does not leave owned jobs running',async()=>{
  const root=await fixture(),w=128,h=1024;await writeFile(join(root,'large.ppm'),Buffer.concat([Buffer.from(`P6\n${w} ${h}\n255\n`),Buffer.alloc(w*h*3,90)]));
  const service=await createAnalysisService({projectRoot:root});try{const job=await service.start({capabilityId:'brightness',input:'large.ppm',parameters:{batchRows:1}});const peer=await createAnalysisService({projectRoot:root});try{await assert.rejects(peer.status(job.jobId),{code:'E_ANALYSIS_NOT_LIVE'});await assert.rejects(peer.cancel(job.jobId),{code:'E_ANALYSIS_NOT_LIVE'});}finally{await peer.close();}
    await service.cancel(job.jobId);await assert.rejects(service.wait(job.jobId),{code:'E_CANCELLED'});const s=await service.status(job.jobId);assert.equal(s.state,'cancelled');assert.equal(s.cleanup?.complete,true);assert.equal(s.cleanup?.processExited,true);
  }finally{await service.close();}await assert.rejects(service.start({capabilityId:'brightness',input:'image.ppm'}),{code:'E_ANALYSIS_SERVICE_CLOSED'});
});
test('invalid arguments, unregistered code paths, external inputs and links fail before execution',async()=>{
  const root=await fixture(),outside=await fixture();await symlink(outside,join(root,'alias'),'junction');const service=await createAnalysisService({projectRoot:root});try{
    await assert.rejects(service.run({capabilityId:'unknown',input:'image.ppm'}),{code:'E_ANALYSIS_CAPABILITY'});
    await assert.rejects(service.run({capabilityId:'brightness',input:join(outside,'image.ppm')}),{code:'E_ANALYSIS_PATH'});
    await assert.rejects(service.run({capabilityId:'brightness',input:'alias/image.ppm'}),{code:'E_ANALYSIS_PATH'});
    for(const parameters of [{module:'./evil.ts'},{batchRows:null},{batchRows:0}])await assert.rejects(service.run({capabilityId:'brightness',input:'image.ppm',parameters}),{code:'E_ARGUMENT'});
    await assert.rejects(executeAnalysisTool(service,'run',{capabilityId:'brightness',input:'image.ppm',worker:'evil'}),{code:'E_ARGUMENT'});
    await assert.rejects(service.inspect('../escape'),{code:'E_ARGUMENT'});await assert.rejects(service.status('../escape'),{code:'E_ARGUMENT'});
  }finally{await service.close();}
});
test('failure reports original code, job ID and verified cleanup; no result is published',async()=>{
  const root=await fixture();await writeFile(join(root,'bad.ppm'),'broken');const service=await createAnalysisService({projectRoot:root});let jobId='';try{await assert.rejects(service.run({capabilityId:'brightness',input:'bad.ppm'}),(e:any)=>{jobId=e.details.jobId;return e.code==='E_BRIGHTNESS_INPUT'&&e.details.job.cleanup.complete;});const s=await service.status(jobId);assert.equal(s.state,'failed');assert.equal(s.cleanup?.stagingRemoved,true);assert.deepEqual(await readdir(join(root,'.frameweave/analysis-tools/artifacts')),[]);}finally{await service.close();}
});
test('corrupt artifact cannot be inspected, sampled or represented as successful terminal status',async()=>{
  const root=await fixture(),service=await createAnalysisService({projectRoot:root});try{const r=await service.run({capabilityId:'brightness',input:'image.ppm'}),id=r.artifact.artifactId;await writeFile(join(root,'.frameweave/analysis-tools/artifacts',id,'brightness.json'),'corrupt');await assert.rejects(service.inspect(id),{code:'E_ANALYSIS_CACHE'});await assert.rejects(service.sample(id,{time:0}),{code:'E_ANALYSIS_CACHE'});const peer=await createAnalysisService({projectRoot:root});try{await assert.rejects(peer.status(r.job.jobId),{code:'E_ANALYSIS_CACHE'});}finally{await peer.close();}}finally{await service.close();}
});
test('pure query adapter preserves all 64 frozen real samples, gaps, interpolation, boundaries and random order',async()=>{
  // The real frozen JSON is queried directly here. Full C3 PNG/file validation is exercised by the live E2E tool test.
  const root=await fixture(),directory=join(root,'frozen-reader');await mkdir(directory);const bytes=await readFile(resolve('docs/analysis-c3-validation/track-example.json'));await writeFile(join(directory,'track.json'),bytes);
  const manifest=JSON.parse(await readFile(resolve('docs/analysis-c3-validation/face-artifact.json'),'utf8')),data=validateTrackData(JSON.parse(bytes.toString())),reader=createTrackReader(data),artifact={directory,manifest};
  for(const s of data.samples){const result=await sampleArtifact(artifact,{time:s.timestampUs/1e6});assert.ok('result' in result);assert.deepEqual(result.result,reader.query(s.timestampUs/1e6));}
  for(const time of [4,.125,-1,8,4.0625,.2,7.99,4])for(const mode of ['linear','nearest'] as const){const r=await sampleArtifact(artifact,{time,mode});assert.ok('result' in r);assert.deepEqual(r.result,reader.query(time,{mode}));}
  const report=await inspectArtifact(artifact);assert.equal(report.summary.sampleCount,64);assert.equal(report.summary.validSamples,57);assert.equal(report.summary.missingSamples,7);assert.ok(!JSON.stringify(report).includes('"samples"'));
  const page=await sampleArtifact(artifact,{from:0,to:8,limit:16,offset:16});assert.equal(page.totalMatches,64);assert.equal(page.records?.length,16);assert.equal(page.truncated,true);assert.equal((await inspectArtifact(artifact,{from:4,to:5})).summary.sampleCount,8);
});
test('independent Agent parses CLI JSON, terminal status, inspect, argument errors and events without internal module paths',async()=>{
  const root=await fixture(),list=await cli(root,['list']);assert.equal(list.ok,true);const r=await cli(root,['run','brightness','--input','image.ppm','--events']);assert.equal(r.ok,true);const s=await cli(root,['status',r.job.jobId]);assert.equal(s.job.scope,'terminal-receipt');const i=await cli(root,['inspect',r.artifact.artifactId]);assert.equal(i.summary.pixels,4);
  await assert.rejects(cli(root,['run','brightness','--input','image.ppm','--worker','secret.ts']),(e:any)=>JSON.parse(e.stderr).diagnostics[0].code==='E_ARGUMENT');
});
test('unavailable models are reported, never downloaded; metadata cannot register executable module paths',async()=>{
  const root=await fixture();await writeFile(join(root,'model.task'),'not a model');await writeFile(join(root,'frameweave.analysis.json'),JSON.stringify({schemaVersion:1,faceModel:{path:'model.task',version:'test',sha256:'a'.repeat(64)}}));const service=await createAnalysisService({projectRoot:root});try{const list=await service.list();assert.equal(list.capabilities.find(c=>c.aliases.includes('face-tracking'))!.availability.ready,false);await assert.rejects(service.run({capabilityId:'face-tracking',input:'image.ppm'}),{code:'E_ANALYSIS_UNAVAILABLE'});}finally{await service.close();}
  await writeFile(join(root,'frameweave.analysis.json'),JSON.stringify({schemaVersion:1,module:'./untrusted.ts'}));const other=await createAnalysisService({projectRoot:root});try{await assert.rejects(other.list(),{code:'E_ANALYSIS_CONFIG'});}finally{await other.close();}
});

test('catalog reuses R1 trust and integrity without authorizing or evaluating installed JavaScript',async()=>{
  const root=await fixture(),pkg=await fixture();
  await writeFile(join(pkg,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id:'test.analysis-description',name:'Test metadata',version:'1.0.0',description:'No authorized analysis entry',source:{kind:'local',authority:'acl2.tests'},compatible:'^0.1.0',platforms:['web'],capabilities:[],permissions:{filesystem:false,network:false,process:false},entry:'main',modules:{main:{format:'javascript',path:'./index.ts'}},dependencies:{}}));
  await writeFile(join(pkg,'index.ts'),"throw Error('PACKAGE_MUST_NOT_EXECUTE');");
  await assert.rejects(installPackages(root,[pkg]),{code:'E_PACKAGE_TRUST'});
  await installPackages(root,[pkg],{trust:['local:acl2.tests']});
  const service=await createAnalysisService({projectRoot:root});try{const list=await service.list();assert.equal(list.capabilities.length,2);assert.equal(list.installedModules[0].id,'test.analysis-description');assert.equal(list.installedModules[0].analysisExecution,'not-authorized-by-R1-v1-manifest');await assert.rejects(service.run({capabilityId:'test.analysis-description',input:'image.ppm'}),{code:'E_ANALYSIS_CAPABILITY'});
    const state=await installedPackages(root);await writeFile(join(state.records[0].directory,'index.ts'),'changed');await assert.rejects(service.list(),{code:'E_PACKAGE_INTEGRITY'});
  }finally{await service.close();}
});

test('failed foreground CLI with progress preserves JSONL through its final Diagnostic',async()=>{
  const root=await fixture();await writeFile(join(root,'bad.ppm'),'broken');
  await assert.rejects(cli(root,['run','brightness','--input','bad.ppm','--events']),(e:any)=>{const lines=e.stderr.trim().split(/\r?\n/).map((line:string)=>JSON.parse(line));assert.ok(lines.some((line:any)=>line.event==='analysis.progress'));const last=lines.at(-1);assert.equal(last.ok,false);assert.equal(last.diagnostics[0].code,'E_BRIGHTNESS_INPUT');assert.equal(last.diagnostics[0].details.job.cleanup.complete,true);assert.equal(e.stdout,'');return true;});
});

test('missing provisioned model reports unavailable; query options validate even on empty pages',async()=>{
  const root=await fixture();await writeFile(join(root,'frameweave.analysis.json'),JSON.stringify({schemaVersion:1,faceModel:{path:'absent.task',version:'test',sha256:'a'.repeat(64)}}));
  const service=await createAnalysisService({projectRoot:root});try{const list=await service.list();assert.equal(list.capabilities[0].availability.ready,false);assert.equal(list.capabilities[1].availability.ready,true);}finally{await service.close();}
  const directory=join(root,'reader');await mkdir(directory);await writeFile(join(directory,'track.json'),await readFile(resolve('docs/analysis-c3-validation/track-example.json')));const manifest=JSON.parse(await readFile(resolve('docs/analysis-c3-validation/face-artifact.json'),'utf8'));
  await assert.rejects(sampleArtifact({directory,manifest},{from:100,to:101,mode:'invalid' as any}),/linear or nearest/);
});

test('a hash-valid Track file cannot contradict its Artifact model version, time or parameters',async()=>{
  const root=await fixture(),original=JSON.parse(await readFile(resolve('docs/analysis-c3-validation/track-example.json'),'utf8'));
  for(const mutate of [(d:any)=>{d.model.version='different';},(d:any)=>{d.config.minTrackingConfidence=.6;}]){
    const data=structuredClone(original);mutate(data);await writeFile(join(root,'track.json'),JSON.stringify(data));const manifest=JSON.parse(await readFile(resolve('docs/analysis-c3-validation/face-artifact.json'),'utf8'));Object.assign(manifest.files.find((f:any)=>f.path==='track.json'),await hashAnalysisFile(join(root,'track.json')));await assert.rejects(inspectArtifact({directory:root,manifest}),{code:'E_ANALYSIS_ARTIFACT'});
  }
});
