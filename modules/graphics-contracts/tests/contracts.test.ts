import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePathData,validateMaskData,validateMeshData,validateSkeletonData,validateTextLayoutData} from '../validate.ts';
import {bounded} from '../check.ts';
import {sha256,verifyResource,verifyResources,readJsonResource,resourceReferences} from '../resources.ts';
import {pathCommands,pathToMask,convertPathUnits,decodeRasterMask,sampleCoverage} from '../path-mask.ts';
import {validateTrackData,createTrackReader,queryStageTrack} from '../track.ts';
import {queryTrack} from '../track.ts';
import {makePath} from '../experiments/vector-producer.ts';
import type {MeshData,SkeletonData,Matrix4,TextLayoutData,ResourceReference,MaskData,Coordinates2D} from '../types.ts';
import {acceptMesh,acceptRig,acceptLayout} from '../examples/professional-modules.ts';

const roundtrip=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const ref:ResourceReference={resourceId:'font_main',kind:'font',sha256:'a'.repeat(64),bytes:4};
const space={spaceId:'model.local',unit:'meter',origin:'local',x:'right',y:'up',z:'toward-viewer',handedness:'right'} as const;
const identity:Matrix4=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function mesh():MeshData{return {schema:'frameweave.mesh',version:1,id:'mesh.panel',coordinates:space,topology:'triangles',vertexIds:['a','b','c'],restPositions:[[0,0,0],[1,0,0],[0,1,0]],indices:[0,1,2],uv:[[0,0],[1,0],[0,1]],uvOrigin:'top-left',controls:[{id:'pin.a',vertexId:'a'}],material:{baseColor:{space:'srgb',alpha:'straight',rgba:[1,0,0,.5]}}};}
function skeleton():SkeletonData{return {schema:'frameweave.skeleton',version:1,id:'skeleton.panel',coordinates:space,meshId:'mesh.panel',bones:[{id:'root',parentId:null,bindMatrix:[...identity],inverseBindMatrix:[...identity]}],weights:['a','b','c'].map(vertexId=>({vertexId,influences:[{boneId:'root',weight:1}]}))};}
function text():TextLayoutData{return {schema:'frameweave.text-layout',version:1,id:'text.label',coordinates:makePath().coordinates,text:'A😀',layout:{engine:'fixture.explicit-glyphs',version:'1',clusterUnit:'utf16'},fonts:[{id:'face',source:ref,faceIndex:0}],styles:[{id:'body',fontId:'face',fontSize:16,fill:{space:'srgb',alpha:'straight',rgba:[1,1,1,1]}}],paragraphs:[{id:'p0',start:0,end:3,direction:'ltr'}],lines:[{id:'l0',paragraphId:'p0',start:0,end:3,baseline:20}],glyphs:[{id:'g0',lineId:'l0',styleId:'body',glyphId:5,cluster:{start:0,end:1},x:8,y:20,advanceX:10,advanceY:0},{id:'g1',lineId:'l0',styleId:'body',glyphId:6,cluster:{start:1,end:3},x:18,y:20,advanceX:16,advanceY:0}]};}
async function realTrack(){return validateTrackData(JSON.parse(await readFile(new URL('../examples/track-mvp.json',import.meta.url),'utf8')));}
const fail=(run:()=>void,path:string,code='E_GRAPHICS_DATA')=>assert.throws(run,(e:unknown)=>e instanceof Error&&'code' in e&&e.code===code&&e.message.includes(path));

test('six concrete wire contracts serialize, validate and return detached typed data',async()=>{
  const p=makePath(),m=mesh(),s=skeleton(),t=text(),track=await realTrack();
  assert.deepEqual(validatePathData(roundtrip(p)),p);assert.deepEqual(validateMaskData(roundtrip(pathToMask(p,'mask.a'))),pathToMask(p,'mask.a'));
  assert.deepEqual(validateMeshData(roundtrip(m)),m);assert.deepEqual(validateSkeletonData(roundtrip(s),m),s);assert.deepEqual(validateTextLayoutData(roundtrip(t)),t);assert.deepEqual(validateTrackData(roundtrip(track)),track);
  const copy=validateMeshData(m);copy.restPositions[0][0]=999;assert.equal(m.restPositions[0][0],0);
});
test('schema identity/version mismatches are diagnostic and upgrades are per contract',()=>{
  for(const [value,validate]of [[makePath(),validatePathData],[pathToMask(makePath(),'mask.a'),validateMaskData],[mesh(),validateMeshData],[text(),validateTextLayoutData]] as const){
    fail(()=>validate({...value,version:2}),'version','E_GRAPHICS_VERSION');fail(()=>validate({...value,schema:'other'}),'schema','E_GRAPHICS_SCHEMA');fail(()=>validate({...value,unexpected:1}),'unexpected');
  }
  fail(()=>validateSkeletonData({...skeleton(),version:3},mesh()),'version','E_GRAPHICS_VERSION');
  assert.equal(validatePathData({...makePath(),label:'optional descriptive field'}).version,1);
});
test('Path requires M, absolute explicit controls, stable unique point IDs and closed field sets',()=>{
  const p=makePath();for(const commands of [[{op:'L',point:{id:'a',x:0,y:0}}],[{op:'M',point:{id:'a',x:0,y:0}},{op:'Z'},{op:'Z'}],[{op:'M',point:{id:'a',x:0,y:0}},{op:'L',point:{id:'a',x:1,y:1}}],[{op:'M',point:{id:'a',x:NaN,y:0}}],[{op:'M',point:{id:'a',x:0,y:0},control:{id:'b',x:1,y:1}}],[{op:'arc'}]])assert.throws(()=>validatePathData({...p,commands}));
  fail(()=>validatePathData({...p,coordinates:{...p.coordinates,y:'up'}}),'coordinates.y');fail(()=>validatePathData({...p,fillRule:'winding'}),'fillRule');
  assert.match(pathCommands(p),/Q 8 8 32 8.*C 120 8 120 8 120 32/);assert.equal(convertPathUnits(convertPathUnits(p,'normalized'),'px').commands.length,p.commands.length);assert.deepEqual(convertPathUnits(convertPathUnits(p,'normalized'),'px'),p);
});
test('bounded preflight rejects live handles, cycles, getters, sparse/decorated arrays and nonfinite values',()=>{
  const cyclic:{child?:object}={};cyclic.child=cyclic;fail(()=>bounded(cyclic),'child','E_GRAPHICS_LIMIT');
  for(const value of [new Date(),new Uint8Array(1),{x:()=>1},[1,,2],Object.assign([1],{extra:1}),{x:Infinity}])assert.throws(()=>bounded(value));
  let invoked=false;const getter=Object.defineProperty({},'x',{enumerable:true,get(){invoked=true;return 1;}});assert.throws(()=>bounded(getter));assert.equal(invoked,false);
  let depth:object={};for(let i=0;i<10000;i++)depth={next:depth};bounded(depth);
  bounded(Array(116004).fill(0));bounded('x'.repeat(65537));
  bounded(Array.from({length:1001},()=>Array(500).fill(0)));
  const large=mesh();large.indices=Array.from({length:116004},(_,i)=>i%3);assert.equal(validateMeshData(large).indices.length,116004);
  const many=makePath();many.commands=Array.from({length:8194},(_,i)=>({op:i===0?'M':'L',point:{id:'p'+i,x:i,y:0}}));assert.equal(validatePathData(many).commands.length,8194);
});
test('Mask rejects mismatched spaces, dimensions, feather and uninterpreted raster metadata',()=>{
  const mask=pathToMask(makePath(),'mask.a');
  fail(()=>validateMaskData({...mask,coordinates:{...mask.coordinates,spaceId:'different'}}),'path.coordinates','E_GRAPHICS_SPACE');
  fail(()=>validateMaskData({...mask,feather:{radius:5,unit:'px'}}),'feather.radius');
  const large={width:32768,height:32768};assert.equal(validateMaskData({...mask,coordinates:{...mask.coordinates,...large},path:{...mask.path,coordinates:{...mask.coordinates,...large}}}).coordinates.width,32768);
  fail(()=>validateMaskData({...mask,kind:'raster',source:ref}),'path');
});
test('resource integrity verifies exact bytes, hash/size syntax, missing assets and conflicting IDs',async()=>{
  const bytes=Uint8Array.of(1,2,3,4),identity={...ref,sha256:await sha256(bytes)};await verifyResource(identity,bytes);
  await assert.rejects(()=>verifyResource(identity,Uint8Array.of(1,2,3,5)),{code:'E_GRAPHICS_INTEGRITY'});await assert.rejects(()=>verifyResource(identity,bytes.slice(1)),{code:'E_GRAPHICS_INTEGRITY'});
  await assert.rejects(()=>verifyResource({...identity,sha256:'A'.repeat(64)},bytes),/source.sha256/);
  await assert.rejects(()=>verifyResources([identity],async()=>undefined),{code:'E_GRAPHICS_RESOURCE'});
  await assert.rejects(()=>verifyResources([identity,{...identity,sha256:'b'.repeat(64)}],async()=>bytes),{code:'E_GRAPHICS_INTEGRITY'});
  let reads=0;await verifyResources([identity,identity],async()=>{reads++;return bytes;});assert.equal(reads,1);
  const data=new TextEncoder().encode(JSON.stringify(makePath())),file={resourceId:'pathFile',kind:'file' as const,sha256:await sha256(data),bytes:data.length};assert.deepEqual(await readJsonResource(file,data,validatePathData),makePath());
  const read=readJsonResource(file,data,validatePathData);data.fill(0);assert.deepEqual(await read,makePath(),'decoder must use the verified byte snapshot, even if caller mutates its buffer');
  assert.equal(resourceReferences(text())[0].resourceId,'font_main');assert.deepEqual(resourceReferences(makePath()),[]);
});
test('raster alpha/luma are linear coverage with explicit center sampling and zero/clamp boundaries',async()=>{
  const pixels=Uint8Array.of(255,0,0,128,0,255,0,255),mask:MaskData={schema:'frameweave.mask',version:1,id:'raster.test',kind:'raster',coordinates:{...makePath().coordinates,width:2,height:1},sampling:'linear',boundary:'zero',feather:{radius:0,unit:'px'},source:{resourceId:'raw',kind:'file',sha256:await sha256(pixels),bytes:8},format:'rgba8',channel:'alpha',colorSpace:'srgb',alpha:'straight'};
  const alpha=await decodeRasterMask(mask,pixels),luma=await decodeRasterMask({...mask,channel:'luma'},pixels);assert.ok(Math.abs(alpha[0]-128/255)<1e-7);assert.ok(Math.abs(luma[0]-.2126*128/255)<1e-7);assert.ok(Math.abs(luma[1]-.7152)<1e-7);
  const copy=new Uint8Array(pixels),decoding=decodeRasterMask(mask,copy);copy.fill(0);assert.deepEqual(await decoding,alpha);
  assert.equal(sampleCoverage(alpha,2,1,.5,.5,'nearest','zero'),alpha[0]);assert.equal(sampleCoverage(alpha,2,1,-1,.5,'nearest','zero'),0);assert.equal(sampleCoverage(alpha,2,1,-1,.5,'nearest','clamp'),alpha[0]);assert.ok(Math.abs(sampleCoverage(alpha,2,1,1,.5,'linear','zero')-(alpha[0]+1)/2)<1e-7);assert.equal(sampleCoverage(alpha,2,1,0,.5,'linear','zero'),alpha[0]/2);
  fail(()=>validateMaskData({...mask,alpha:'premultiplied'}),'alpha');fail(()=>validateMaskData({...mask,source:{...mask.source,bytes:7}}),'source.bytes');
});
test('Mesh validates topology, stable vertices, UVs, controls, texture identities and finite rest pose',()=>{
  const m=mesh();for(const patch of [{vertexIds:['a','a','c']},{indices:[0,1,3]},{indices:[0,0,1]},{indices:[0,1]},{restPositions:[[Infinity,0,0],[1,0,0],[0,1,0]]},{uv:[[0,0]]},{controls:[{id:'bad',vertexId:'unknown'}]},{material:{baseColor:{space:'srgb',alpha:'straight',rgba:[1,2,0,1]}}},{material:{texture:ref}}])assert.throws(()=>validateMeshData({...m,...patch}));
  assert.equal(validateMeshData({...m,material:{texture:{...ref,kind:'image'}}}).material?.texture?.kind,'image');
});
test('Skeleton validates mesh-space global bind inverses, parent graphs and normalized vertex weights',()=>{
  const s=skeleton(),m=mesh();const translated=skeleton();translated.bones[0].bindMatrix[12]=2;translated.bones[0].inverseBindMatrix[12]=-2;validateSkeletonData(translated,m);
  fail(()=>validateSkeletonData({...s,meshId:'other'},m),'meshId');fail(()=>validateSkeletonData({...s,coordinates:{...s.coordinates,spaceId:'other'}},m),'coordinates','E_GRAPHICS_SPACE');
  const wrong=skeleton();wrong.bones[0].inverseBindMatrix[0]=2;fail(()=>validateSkeletonData(wrong,m),'inverseBindMatrix');
  for(const parentId of ['root','missing'])fail(()=>validateSkeletonData({...s,bones:[{...s.bones[0],parentId}]},m),'parentId');
  for(const influences of [[{boneId:'root',weight:.5}],[{boneId:'unknown',weight:1}],[{boneId:'root',weight:NaN}],[{boneId:'root',weight:.5},{boneId:'root',weight:.5}]])assert.throws(()=>validateSkeletonData({...s,weights:s.weights.map(w=>({...w,influences}))},m));
});
test('TextLayout enforces UTF-16 clusters, explicit fonts/hashes, lines, style IDs and layout provenance',()=>{
  const t=text();fail(()=>validateTextLayoutData({...t,glyphs:[{...t.glyphs[1],cluster:{start:1,end:2}}]}),'surrogate');
  fail(()=>validateTextLayoutData({...t,glyphs:[{...t.glyphs[0],lineId:'unknown'}]}),'cluster');fail(()=>validateTextLayoutData({...t,styles:[{...t.styles[0],fontId:'unknown'}]}),'fontId');
  fail(()=>validateTextLayoutData({...t,fonts:[{...t.fonts[0],source:{...ref,sha256:'invalid'}}]}),'sha256');
  fail(()=>validateTextLayoutData({...t,layout:{...t.layout,clusterUnit:'utf8'}}),'clusterUnit');
  assert.equal(validateTextLayoutData({...t,paragraphs:[{...t.paragraphs[0],direction:'rtl'}]}).paragraphs[0].direction,'rtl');
});
test('frozen real MVP TrackData is byte-identical and keeps complete provenance',async()=>{
  const a=await readFile(new URL('../examples/track-mvp.json',import.meta.url)),b=await readFile(new URL('../../../prototypes/analysis-job-mvp/validation/track-example.json',import.meta.url));assert.deepEqual(a,b);assert.equal(await sha256(a),'7a8b35155ed646379b9e9de7d3e6a6fe9557d5cbb7bc6dcc5522a571edb728b2');
  const data=await realTrack();assert.equal(data.samples.length,64);assert.ok(data.samples.some(s=>!s.valid));assert.equal(data.time.unit,'microseconds');assert.equal(data.media.sha256,'4bbe69b7d097379af4d7ad128f02692820dc57a6d8275ea2b9e7eef4399a3e61');
});
test('Track Reader facade matches the canonical query at exact/half/random times and missing boundaries',async()=>{
  const data=await realTrack(),reader=createTrackReader(data),times=[-1,0,8,7.99,3.147,...data.samples.flatMap(s=>[s.timestampUs/1e6,s.timestampUs/1e6+.0625])];
  for(const t of times.reverse())for(const mode of ['linear','nearest'] as const)for(const maxGapSeconds of [.01,.25])assert.deepEqual(reader.query(t,{mode,maxGapSeconds}),queryTrack(data,t,{mode,maxGapSeconds}));
  for(const s of data.samples.filter(s=>!s.valid)){assert.deepEqual(reader.query(s.timestampUs/1e6),{valid:false,reason:'missing-detection'});if(s.timestampUs>0)assert.equal(reader.query(s.timestampUs/1e6-.03125).valid,false);}
  const expected=reader.query(0);data.samples[0].anchor!.x=999;assert.deepEqual(reader.query(0),expected);
  assert.throws(()=>reader.query(NaN));assert.throws(()=>reader.query(.1,{maxGapSeconds:-1}));
});
test('Track strict boundary rejects unsupported axes/time, invalid samples and invented confidence',async()=>{
  const d=await realTrack();fail(()=>validateTrackData({...d,schemaVersion:'analysis.track/2'}),'schemaVersion','E_GRAPHICS_VERSION');
  fail(()=>validateTrackData({...d,time:{...d.time,origin:'stage-frame'}}),'time.origin');fail(()=>validateTrackData({...d,coordinates:{...d.coordinates,y:'up'}}),'coordinates.y');
  fail(()=>validateTrackData({...d,samples:d.samples.map((s,i)=>i?{...s,timestampUs:0}:s)}),'timestampUs');
  fail(()=>validateTrackData({...d,samples:[{...d.samples[0],confidence:.8}]}),'confidence');fail(()=>validateTrackData({...d,samples:[{...d.samples[0],valid:false}]}),'missing observation');
  fail(()=>validateTrackData({...d,samples:Array(601).fill(d.samples[0])}),'samples');
  for(const config of [{...d.config,sampleRate:0},{...d.config,sampleRate:.5},{...d.config,sampleRate:31},{...d.config,analysisWidth:641}])fail(()=>validateTrackData({...d,config}),'config');
});
test('Stage projection uses source seconds, explicit rate/offset, and reports absence instead of animating across it',async()=>{
  const d=await realTrack(),r=createTrackReader(d),target:Coordinates2D={...makePath().coordinates,unit:'px'};
  const a=queryStageTrack(r,.25,{sourceStartSeconds:1,rate:2},target),b=r.query(1.5);assert.ok(a.visible&&b.valid);if(a.visible&&b.valid){assert.equal(a.x,b.anchor.x*128);assert.equal(a.y,b.anchor.y*96);assert.equal(a.targetId,b.trackId);}
  const reverse=queryStageTrack(r,.5,{sourceStartSeconds:2,rate:-1},target);assert.deepEqual(reverse,a);
  assert.deepEqual(queryStageTrack(r,.125,{sourceStartSeconds:0,rate:1},target),{visible:false,sourceMediaSeconds:.125,reason:'missing-detection'});
  const normalized=queryStageTrack(r,0,{sourceStartSeconds:0,rate:0},{...target,unit:'normalized'});assert.ok(normalized.visible);if(normalized.visible)assert.equal(normalized.x,d.samples[0].anchor!.x);
});
test('professional module examples enforce geometry/rig relationships and verified font bytes',async()=>{
  const m=await acceptMesh(roundtrip(mesh()),async()=>undefined);assert.equal(acceptRig(roundtrip(skeleton()),m).meshId,m.id);
  // Deliberately synthetic font bytes: tests integrity plumbing, not font parsing or shaping.
  const bytes=Uint8Array.of(1,2,3,4),layout=text();layout.fonts[0].source={...ref,sha256:await sha256(bytes)};
  assert.deepEqual(await acceptLayout(roundtrip(layout),async id=>id==='font_main'?bytes:undefined),layout);
  await assert.rejects(()=>acceptLayout(layout,async()=>undefined),{code:'E_GRAPHICS_RESOURCE'});
});
