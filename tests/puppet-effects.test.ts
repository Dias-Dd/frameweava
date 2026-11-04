import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createPuppetTools,prepareMesh,encodeSolve} from '../modules/puppet-effects/src/solver.ts';
import {validateMeshData} from '../modules/graphics-contracts/index.ts';
import {gridMesh} from '../modules/puppet-effects/validation/fixtures.ts';
import {instantiateModule} from '../modules/puppet-effects/runtime/session.mjs';
import type {ModuleLoader} from '../src/plugins/sdk.ts';
const wasm=await readFile('modules/puppet-effects/dist/module.wasm'),load=(async()=>new Uint8Array(wasm)) as ModuleLoader;
const tools=createPuppetTools({validateMeshData},load);
test('real std-only Rust/WASM ARAP preserves identity, translation and a rigid rotation with exact pins',async()=>{
  const mesh=gridMesh(),owner=await tools.createPuppet(mesh,{worker:false});try{
    const identity=await owner.solve({pins:[{vertexId:'v0',position:[-1,-1]},{vertexId:'v4',position:[1,-1]}]});for(const [i,p]of identity.positions.entries())for(let c=0;c<3;c++)assert.ok(Math.abs(p[c]-mesh.restPositions[i][c])<1e-7);
    const translation=await owner.solve({pins:[{vertexId:'v12',position:[3,-2]}]});assert.deepEqual(translation.positions,mesh.restPositions.map(p=>[p[0]+3,p[1]-2,p[2]]));
    const rotated=await owner.solve({pins:[{vertexId:'v0',position:[1,-1]},{vertexId:'v4',position:[1,1]}],refine:4});for(const [i,p]of rotated.positions.entries()){assert.ok(Math.abs(p[0]+mesh.restPositions[i][1])<1e-6);assert.ok(Math.abs(p[1]-mesh.restPositions[i][0])<1e-6);}assert.deepEqual(rotated.positions[0],[1,-1,0]);assert.deepEqual(rotated.positions[4],[1,1,0]);assert.ok(rotated.diagnostics.maxRelativeResidual<=1e-8);assert.ok(rotated.diagnostics.cgIterations>0);assert.equal((await owner.diagnostics()).buffers,0);
  }finally{assert.deepEqual(await owner.dispose(),{remainingBuffers:0});assert.deepEqual(await owner.dispose(),{remainingBuffers:0});}
});
test('absolute constraints replay across arbitrary order and new instances; Starch and Bend change the numerical pose',async()=>{
  const mesh=gridMesh(),before=structuredClone(mesh),owner=await tools.createPuppet(mesh,{worker:false}),again=await tools.createPuppet(mesh,{worker:false});
  const constraints=(t:number)=>({pins:[{vertexId:'v0',position:[-1,-1] as [number,number]},{vertexId:'v4',position:[1,-1] as [number,number]},{vertexId:'v24',position:[1+Math.sin(t)*.3,1+Math.cos(t)*.1] as [number,number]}],refine:3});
  try{const reference=await owner.solve(constraints(1));for(const t of [0,1,2,1]){const result=await owner.solve(constraints(t));if(t===1)assert.deepEqual(result,reference);}assert.deepEqual(await again.solve(constraints(1)),reference);
    const starch=await owner.solve({...constraints(1),triangleWeights:mesh.indices.filter((_,i)=>i%3===0).map((_,i)=>i<16?50:1)});assert.notDeepEqual(starch.positions,reference.positions);
    const bend=await owner.solve({...constraints(1),edges:[{from:'v20',to:'v24',vector:[1.7,.5],weight:100}]});assert.notDeepEqual(bend.positions,reference.positions);assert.deepEqual(mesh,before);
    reference.positions[0][0]=100;assert.deepEqual((await owner.solve(constraints(1))).positions[0],[-1,-1,0]);
  }finally{await owner.dispose();await again.dispose();}
});
test('missing/duplicate pins, unknown vertices, planar/degenerate/unanchored topology and budgets reject without replacing mesh semantics',async()=>{
  const mesh=gridMesh(),p=prepareMesh(validateMeshData(mesh)),max=256000000;
  for(const c of [{pins:[]},{pins:[{vertexId:'missing',position:[0,0]}]},{pins:[{vertexId:'v0',position:[0,0]},{vertexId:'v0',position:[1,1]}]}])assert.throws(()=>encodeSolve(p,c as any,max),{code:'E_PUPPET_CONSTRAINT'});
  assert.throws(()=>encodeSolve(p,{pins:[{vertexId:'v0',position:[0,0]}]},1),{code:'E_PUPPET_BUDGET'});assert.throws(()=>encodeSolve(p,{pins:[{vertexId:'v0',position:[0,0]}],refine:2**32},Number.MAX_SAFE_INTEGER),{code:'E_PUPPET_PARAMETER'});
  const bad=structuredClone(mesh);bad.restPositions[1][2]=1;assert.throws(()=>prepareMesh(bad),{code:'E_PUPPET_SPACE'});bad.restPositions[1]=[0,-1,0];bad.restPositions[6]=[.5,-1,0];assert.throws(()=>prepareMesh(bad),{code:'E_PUPPET_TOPOLOGY'});
  const split=gridMesh(2,2);split.vertexIds.push('v4','v5','v6');split.restPositions.push([3,0,0],[4,0,0],[3,1,0]);split.indices.push(4,5,6);delete split.uv;delete split.uvOrigin;assert.throws(()=>encodeSolve(prepareMesh(validateMeshData(split)),{pins:[{vertexId:'v0',position:[0,0]}]},max),{code:'E_PUPPET_CONSTRAINT'});
});
test('Rust validates malformed byte input and numerical work budget, frees buffers; public owner closes and rejects reuse',async()=>{
  const session=await instantiateModule(wasm);try{assert.throws(()=>session.call(1,new Uint8Array([1]),100),{code:'E_WASM_CALL'});const encoded=encodeSolve(prepareMesh(gridMesh()),{pins:[{vertexId:'v0',position:[0,0]}]},256000000);new DataView(encoded.bytes.buffer).setFloat64(24,1,true);assert.throws(()=>session.call(1,encoded.bytes,1000),/\(-6\)/);assert.equal(session.diagnostics().buffers,0);}finally{session.dispose();}
  const owner=await tools.createPuppet(gridMesh(),{worker:false});await owner.dispose();assert.throws(()=>owner.solve({pins:[{vertexId:'v0',position:[0,0]}]}),{code:'E_PUPPET_DISPOSED'});
});
test('foldover policy is explicit and validation failures do not poison the stateless solver',async()=>{
  const mesh=gridMesh(2,2),owner=await tools.createPuppet(mesh,{worker:false}),pins=mesh.vertexIds.map((vertexId,i)=>({vertexId,position:[-mesh.restPositions[i][0],mesh.restPositions[i][1]] as [number,number]}));
  try{await assert.rejects(owner.solve({pins}),{code:'E_PUPPET_FOLDOVER'});const folded=await owner.solve({pins,foldovers:'allow'});assert.equal(folded.diagnostics.foldedTriangles,2);assert.equal(folded.diagnostics.collapsedTriangles,0);assert.equal((await owner.diagnostics()).buffers,0);const valid=await owner.solve({pins:[{vertexId:'v0',position:[-1,-1]}]});assert.deepEqual(valid.positions,mesh.restPositions);assert.throws(()=>owner.solve({pins:[{vertexId:'v0',position:[Infinity,0]}]}),{code:'E_PUPPET_PARAMETER'});assert.throws(()=>owner.solve({pins:[{vertexId:'v0',position:[0,0]}],edges:[{from:'v0',to:'v1',vector:[1,0],weight:0}]}),{code:'E_PUPPET_PARAMETER'});}
  finally{await owner.dispose();}
});
