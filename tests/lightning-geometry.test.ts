import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createLightningGeometry} from '../modules/skeletal-effects/src/lightning-geometry.ts';
import {context} from '../modules/skeletal-effects/validation/fixtures.ts';
import {seededRandom} from '../src/core/time.ts';
import {keyframes} from '../src/core/animation.ts';
import {validateMeshData} from '../modules/graphics-contracts/validate.ts';
import {initialize} from '../modules/skeletal-effects/src/bindings.ts';
import type {PluginInit} from '../src/plugins/sdk.ts';
import type {Vec3} from '../modules/skeletal-effects/src/types.ts';
const start:Vec3=[0,0,0],end:Vec3=[4,0,0];
test('analytic straight root, exact anchors, linear taper and existing Graphics validation without GPU',()=>{
  const g=createLightningGeometry({id:'lightning.straight',subdivisions:2,branchGenerations:0,radialSegments:4,tipScale:.25}),s=g.sample({start,end,amplitude:0,radius:.2,context:context(100)});
  assert.deepEqual(s.bolts[0].points,[[0,0,0],[1,0,0],[2,0,0],[3,0,0],[4,0,0]]);
  assert.deepEqual(s.bolts[0].radii,[.2,.1625,.125,.08750000000000001,.05]);
  assert.equal(s.active,true);for(const mesh of g.meshes)validateMeshData(mesh);assert.equal(g.describe().triangles,32);
  const zero=g.sample({start,end:start,context:context(0)});assert.equal(zero.active,false);assert.ok(zero.bolts.every(b=>b.points.every(p=>p.every(x=>x===0))));g.dispose();
});
test('independent scalar midpoint and quintic-noise recurrence matches a two-level world-axis construction',async()=>{
  const seed=37,ctx=context(12),phase=.375,g=createLightningGeometry({id:'lightning.oracle',seed,subdivisions:2,branchGenerations:0,roughness:.5}),s=g.sample({start,end,phase,amplitude:.1,context:ctx}),localSeed=(seed^ctx.seed)>>>0;
  const u=phase,fade=6*u**5-15*u**4+10*u**3,noise=(mid:number,axis:string)=>{const a=2*seededRandom(localSeed,0,`0:${mid}:${axis}`)-1,b=2*seededRandom(localSeed,1,`0:${mid}:${axis}`)-1;return (1-fade)*a+fade*b;};
  // Root +X chooses +Z normal, -Y binormal; x stays uniform at every level.
  const expected:Vec3[]=[[0,0,0],[1,0,0],[2,-.4*noise(2,'y'),.4*noise(2,'x')],[3,0,0],[4,0,0]];
  for(const mid of [1,3]){expected[mid][1]=expected[2][1]/2-.2*noise(mid,'y');expected[mid][2]=expected[2][2]/2+.2*noise(mid,'x');}
  let maximum=0;for(let i=0;i<5;i++)for(let k=0;k<3;k++)maximum=Math.max(maximum,Math.abs(s.bolts[0].points[i][k]-expected[i][k]));assert.ok(maximum<2e-16);
  await mkdir('artifacts/lightning',{recursive:true});await writeFile('artifacts/lightning/midpoint-oracle.json',JSON.stringify({seed,ctx,phase,expected,actual:s.bolts[0].points,maximum,scope:'Independent scalar two-level recurrence and polynomial fade, no imported geometry helper/reference generator.'},null,2));g.dispose();
});
test('complete three-generation tree keeps exact moving parent attachments, declared lengths and local radius inheritance',()=>{
  const g=createLightningGeometry({id:'lightning.tree',subdivisions:3,branchGenerations:3,branchesPerBolt:2,branchLength:.4,branchRadius:.5}),s=g.sample({start,end,context:context(24)});assert.equal(s.bolts.length,15);
  for(let i=1;i<s.bolts.length;i++){const b=s.bolts[i],parent=s.bolts[b.parent!];assert.equal(b.parent,Math.floor((i-1)/2));assert.equal(b.generation,parent.generation+1);assert.ok(b.attachment!>0&&b.attachment!<8);assert.deepEqual(b.points[0],parent.points[b.attachment!]);assert.equal(b.radii[0],parent.radii[b.attachment!]*.5);const length=(p:Vec3[])=>Math.hypot(...p.at(-1)!.map((x,k)=>x-p[0][k]));assert.ok(Math.abs(length(b.points)/length(parent.points)-.4)<1e-14);}
  assert.deepEqual(s.bolts[0].points[0],start);assert.deepEqual(s.bolts[0].points.at(-1),end);assert.ok(g.meshes.every(m=>m.coordinates.unit==='meter'));g.dispose();
});
test('100/0/100, arbitrary repeats, new instance, explicit phase and existing Signals never accumulate wall time',()=>{
  const options={id:'lightning.replay',seed:57},g=createLightningGeometry(options),radius=keyframes([{frame:0,value:0},{frame:100,value:.04}]),sample=(frame:number)=>({start,end,radius,context:context(frame)}),first=g.sample(sample(100));
  assert.equal(g.sample(sample(0)).active,false);for(const f of [37,2,99,100,0])g.sample(sample(f));assert.deepEqual(g.sample(sample(100)),first);const other=createLightningGeometry(options);assert.deepEqual(other.sample(sample(100)),first);
  const a=g.sample({...sample(100),phase:.7,radius:.03}),b=g.sample({...sample(0),phase:.7,radius:.03});assert.deepEqual(a,b);
  const mutable=g.sample(sample(100));mutable.bolts[0].points[0][0]=999;mutable.draws[0].positions![0][0]=999;assert.deepEqual(g.sample(sample(100)),first);g.dispose();other.dispose();
});
test('coherent noise is continuous across positive and negative integer phase and retains stateless replay after errors',()=>{
  const g=createLightningGeometry({id:'lightning.coherent'}),at=(phase:number)=>g.sample({start,end,phase,context:context(0)}),difference=(a:ReturnType<typeof at>,b:ReturnType<typeof at>)=>Math.max(...a.bolts.flatMap((bolt,i)=>bolt.points.flatMap((p,j)=>p.map((x,k)=>Math.abs(x-b.bolts[i].points[j][k])))));
  for(const boundary of [-2,-1,0,1,2]){const a=at(boundary),left=at(boundary-1e-6),right=at(boundary+1e-6);assert.ok(difference(a,left)<1e-12);assert.ok(difference(a,right)<1e-12);}
  const old=at(.4);assert.throws(()=>at(Number.MAX_SAFE_INTEGER),{code:'E_LIGHTNING_PARAMETER'});assert.throws(()=>g.sample({start,end,radius:-1,context:context(0)}),{code:'E_LIGHTNING_PARAMETER'});assert.deepEqual(at(.4),old);g.dispose();
});
test('whole-tree planning rejects exponential/linear/zero-branch extremes before allocation; chunks preserve every station',()=>{
  for(const extra of [{subdivisions:1000},{branchGenerations:1000},{branchesPerBolt:1,branchGenerations:Number.MAX_SAFE_INTEGER},{maxBytes:1},{maxWork:1},{radialSegments:16384}])assert.throws(()=>createLightningGeometry({id:'lightning.budget',...extra}),{code:'E_LIGHTNING_BUDGET'});
  const zero=createLightningGeometry({id:'lightning.none',branchesPerBolt:0,branchGenerations:Number.MAX_SAFE_INTEGER});assert.equal(zero.describe().bolts,1);zero.dispose();
  const g=createLightningGeometry({id:'lightning.chunk',subdivisions:9,branchGenerations:0,radialSegments:4,maxVerticesPerMesh:40}),s=g.sample({start,end,context:context(0)});assert.equal(s.bolts[0].points.length,513);assert.equal(g.describe().triangles,512*8);assert.ok(g.meshes.length>1);for(const m of g.meshes){assert.ok(m.vertexIds.length<=40);validateMeshData(m);}for(let i=1;i<s.draws.length;i++)assert.deepEqual(s.draws[i-1].positions!.slice(-5),s.draws[i].positions!.slice(0,5));g.dispose();
});
test('binding owns CPU geometry, inputs reject unknown/accessor data, close is idempotent and retains caller output',async()=>{
  const binding=await initialize({} as PluginInit),g=binding.exports.createLightningGeometry({id:'lightning.binding'}),data=g.sample({start,end,context:context(0)});assert.throws(()=>g.sample({start,end,context:context(0),get phase():number{throw Error('must not run');}}),{code:'E_LIGHTNING_PARAMETER'});assert.throws(()=>createLightningGeometry({id:'bad',typo:1} as any),{code:'E_LIGHTNING_PARAMETER'});await binding.dispose();await binding.dispose();assert.throws(()=>g.describe(),{code:'E_LIGHTNING_DISPOSED'});assert.throws(()=>g.sample({start,end,context:context(0)}),{code:'E_LIGHTNING_DISPOSED'});assert.throws(()=>binding.exports.createLightningGeometry({id:'closed'}),{code:'E_RIG_DISPOSED'});assert.equal(data.bolts.length,7);
});
test('rotated chords retain monotone projected stations and geometric scaling across small/large local units',async()=>{
  const g=createLightningGeometry({id:'lightning.scale',subdivisions:4,branchGenerations:1}),a:Vec3=[-.3,.6,-.2],b:Vec3=[2.3,-1.1,3.7],at=(scale:number)=>g.sample({context:context(37),start:a.map(x=>x*scale) as Vec3,end:b.map(x=>x*scale) as Vec3,radius:.02*scale,phase:.712}),reference=at(1),rows=[];
  for(const scale of [1e-100,1e-9,1,1e9,1e100]){const s=at(scale);let maximum=0;for(let i=0;i<s.bolts.length;i++){const bolt=s.bolts[i],first=bolt.points[0],chord=bolt.points.at(-1)!.map((x,k)=>(x-first[k])/scale),square=chord.reduce((sum,x)=>sum+x*x,0);for(let j=0;j<bolt.points.length;j++){const p=bolt.points[j],u=p.reduce((sum,x,k)=>sum+(x-first[k])/scale*chord[k],0)/square;assert.ok(Math.abs(u-j/16)<2e-14);for(let k=0;k<3;k++)maximum=Math.max(maximum,Math.abs(p[k]/scale-reference.bolts[i].points[j][k]));}}assert.ok(maximum<4e-14);rows.push({scale,maximumNormalizedPositionError:maximum});}
  await mkdir('artifacts/lightning',{recursive:true});await writeFile('artifacts/lightning/local-scale.json',JSON.stringify({rows,scope:'Same phase/seed, rotated non-axis-aligned chords and widths scaled together. Local representability fixtures only, not arbitrary-origin/scale proof or cross-libm bit guarantee.'},null,2));g.dispose();
});
