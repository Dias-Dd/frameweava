import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {engineRoot} from '../src/compiler/build.ts';
import {compareImageBuffers,compareInspections,readInspectionImage,serveInspectionImages,inspectProject,inspectIteration} from '../modules/render-inspection/index.ts';
import {writeImage} from '../modules/render-inspection/images.ts';
import {saveJson} from '../modules/render-inspection/common.ts';
import {inspectProject as publicInspectProject} from '../src/node.ts';
import type {InspectionPolicy} from '../modules/render-inspection/types.ts';

const parent=join(engineRoot,'.frameweave/render-inspection-unit'),fixtures:string[]=[],exec=promisify(execFile);
async function fixture(){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-'));fixtures.push(dir);return dir;}
after(async()=>{for(const dir of fixtures){assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}});
const png=(values:number[],width=1,height=1)=>sharp(Buffer.from(values),{raw:{width,height,channels:4}}).png().toBuffer();
const policy:InspectionPolicy={mode:'accurate',gpuPolicy:'swiftshader',capture:'png',cache:true,allowWasm:false,environment:{platform:process.platform,arch:process.arch,node:process.version,engineVersion:'0.1.0',sdkIntegrity:'unit-fixture',browserVersion:'not-exposed',gpuDevice:'not-probed'}};
async function report(bytes:Buffer,override:Partial<InspectionPolicy>={}){const dir=await fixture(),image=await writeImage(dir,'frame-0',bytes);await saveJson(join(dir,'inspection.json'),{schemaVersion:1,kind:'frameweave.render-inspection',project:'unit-only',policy:{...policy,...override},images:[image],frames:[{frame:0,ok:true,image}]});return {dir,image};}

test('RGBA8 exact comparison, explicit tolerance and dimensions are deterministic',async()=>{
  assert.equal(publicInspectProject,inspectProject,'the public Node adapter must expose the same shared service');
  const a=await png([10,20,30,255]),b=await png([11,22,33,254]);
  const exact=await compareImageBuffers(a,a);assert.equal(exact.report.ok,true);assert.equal(exact.report.metrics?.changedPixels,0);
  const diff=await compareImageBuffers(a,b);assert.equal(diff.report.ok,false);assert.equal(diff.report.metrics?.maxChannelDifference,3);assert.equal(diff.report.metrics?.mae,1.75);assert.equal(diff.report.metrics?.alpha.maxDifference,1);assert.equal(diff.report.metrics?.alpha.mae,1);
  assert.equal((await compareImageBuffers(a,b,{tolerance:{maxChannelDifference:3,mae:1.75,maxAlphaDifference:1}})).report.ok,true);
  assert.equal((await compareImageBuffers(a,b,{tolerance:{maxChannelDifference:3,mae:1.74,maxAlphaDifference:1}})).report.ok,false);
  const size=await compareImageBuffers(a,await png([10,20,30,255,10,20,30,255],2));assert.equal(size.report.status,'dimension-mismatch');assert.equal(size.report.metrics,undefined);
  await assert.rejects(()=>compareImageBuffers(a,b,{tolerance:{mae:NaN}}),{code:'E_ARGUMENT'});
});
test('transparent RGB, Alpha and black/white compositing are separate metrics; heatmap is actual PNG',async()=>{
  const a=await png([255,0,0,0]),b=await png([0,255,0,0]),result=await compareImageBuffers(a,b);
  assert.equal(result.report.metrics?.maxChannelDifference,255);assert.equal(result.report.metrics?.alpha.changedPixels,0);assert.equal(result.report.metrics?.black.maxDifference,0);assert.equal(result.report.metrics?.white.maxDifference,0);
  const alpha=await compareImageBuffers(await png([0,0,0,0]),await png([0,0,0,255]));assert.equal(alpha.report.metrics?.black.maxDifference,0);assert.equal(alpha.report.metrics?.white.maxDifference,255);assert.equal(alpha.report.metrics?.alpha.maxDifference,255);
  const {info}=await sharp(result.heatmap!).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1);assert.equal(info.channels,4);
});
test('JPEG uses opt-in decoded lossy policy and non-still media is explicitly rejected',async()=>{
  const a=await png([90,100,110,255]),jpeg=await sharp(a).jpeg({quality:90}).toBuffer();
  await assert.rejects(()=>compareImageBuffers(a,jpeg),{code:'E_COMPARE_MEDIA'});await assert.rejects(()=>compareImageBuffers(a,jpeg,{allowLossy:true}),{code:'E_COMPARE_MEDIA'});
  const result=await compareImageBuffers(a,jpeg,{allowLossy:true,tolerance:{maxChannelDifference:20,mae:20,maxAlphaDifference:0}});assert.equal(result.report.strategy,'lossy-decoded-rgba8-srgb');assert.equal(result.report.ok,true);
  await assert.rejects(()=>compareImageBuffers(a,Buffer.from('0000ftypisom movie data'),{allowLossy:true,tolerance:{mae:1}}),{code:'E_COMPARE_MEDIA'});
});
test('image resources deliver decoded bytes to an independent consumer; tamper/unknown IDs/version fail',async()=>{
  const bytes=await png([12,34,56,78]),r=await report(bytes),image=await readInspectionImage(r.dir,r.image.uri);assert.equal(image.content.type,'image');assert.deepEqual(Buffer.from(image.content.data,'base64'),bytes);
  const child=await exec(process.execPath,['--input-type=module','-e',`import sharp from 'sharp';import {readFile} from 'node:fs/promises';const r=JSON.parse(await readFile(process.argv[1],'utf8'));const b=await readFile(new URL(r.images[0].file,'file:///'+process.argv[2].replaceAll('\\\\','/')+'/'));const d=await sharp(b).ensureAlpha().raw().toBuffer();console.log(JSON.stringify([...d]));`,join(r.dir,'inspection.json'),r.dir],{cwd:engineRoot,windowsHide:true});assert.deepEqual(JSON.parse(child.stdout),[12,34,56,78]);
  await assert.rejects(()=>readInspectionImage(r.dir,'../../secret'),{code:'E_INSPECTION_IMAGE'});
  await writeFile(join(r.dir,r.image.file),await png([0,0,0,0]));await assert.rejects(()=>readInspectionImage(r.dir,r.image.id),{code:'E_INSPECTION_INTEGRITY'});
  const invalid=await report(bytes);const json=JSON.parse(await readFile(join(invalid.dir,'inspection.json'),'utf8'));json.schemaVersion=2;await writeFile(join(invalid.dir,'inspection.json'),JSON.stringify(json));await assert.rejects(()=>readInspectionImage(invalid.dir,invalid.image.id),{code:'E_INSPECTION_REPORT'});
});
test('allowlist blocks traversal and symbolic escapes; HTTP image endpoint is loopback token protected',async()=>{
  const bytes=await png([255,0,0,255]),r=await report(bytes),server=await serveInspectionImages(r.dir);
  try{const url=server.images[0].url;assert.equal((await fetch(url.split('?')[0])).status,403);assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()),bytes);assert.equal((await fetch(url.replace('/image/frame-0','/image/not-listed'))).status,404);assert.equal((await fetch(url.replace('/image/frame-0','/inspection.json'))).status,404);}finally{await server.close();}
  const json=JSON.parse(await readFile(join(r.dir,'inspection.json'),'utf8'));json.images[0].file='../elsewhere.png';await writeFile(join(r.dir,'inspection.json'),JSON.stringify(json));await assert.rejects(()=>readInspectionImage(r.dir,r.image.id),{code:'E_INSPECTION_IMAGE'});
  const linked=await report(bytes),outside=await fixture();await writeFile(join(outside,'frame-0.png'),bytes);const images=resolve(linked.dir,'images');assert.equal(dirname(images),resolve(linked.dir));await rm(images,{recursive:true});await symlink(outside,images,process.platform==='win32'?'junction':'dir');await assert.rejects(()=>readInspectionImage(linked.dir,linked.image.id),{code:'E_INSPECTION_PATH'});
});
test('directory comparison records policy review separately from differences and saves image resources',async()=>{
  const bytes=await png([12,23,34,255]),a=await report(bytes),b=await report(bytes,{gpuPolicy:'auto',mode:'preview'});
  const review=await compareInspections(a.dir,b.dir,{output:await fixture()});assert.equal(review.status,'needs-review');assert.equal(review.diagnostics[0].severity,'warning');assert.ok(review.pairs[0].comparison?.metrics?.exact);assert.ok(review.images.length===5);
  const empty=await compareInspections(a.dir,b.dir,{output:await fixture(),allowPolicyDifference:true,tolerance:{}});assert.equal(empty.status,'needs-review');
  const accepted=await compareInspections(a.dir,b.dir,{output:await fixture(),allowPolicyDifference:true,tolerance:{maxChannelDifference:0,mae:0,maxAlphaDifference:0}});assert.equal(accepted.status,'match');
  await readInspectionImage(accepted.reportFile.replace(/[\\/]inspection.json$/,''),accepted.images[0].id);
  await rm(join(b.dir,b.image.file));const missing=await compareInspections(a.dir,b.dir,{output:await fixture()});assert.equal(missing.status,'invalid');assert.equal(missing.anomalies[0].frame,0);assert.ok(missing.diagnostics.some(d=>d.code==='E_INSPECTION_IMAGE'&&d.frame===0));
});
test('bad requests and bounded sessions return structured diagnostics without changing source',async()=>{
  const directory=await fixture(),project=join(directory,'project.tsx');await writeFile(project,'deliberately not executed');
  const before=await readFile(project),bad=await inspectProject({project,frames:[-1]});assert.equal(bad.ok,false);assert.equal(bad.diagnostics[0].code,'E_ARGUMENT');assert.equal(bad.reportFile,'');assert.deepEqual(await readFile(project),before);
  const session=await fixture();await writeFile(join(session,'session.json'),JSON.stringify({schemaVersion:1,project,limit:1,count:1}));const exhausted=await inspectIteration({project,session});assert.equal(exhausted.ok,false);assert.equal(exhausted.diagnostics[0].code,'E_INSPECTION_BUDGET');assert.deepEqual(await readFile(project),before);
});
