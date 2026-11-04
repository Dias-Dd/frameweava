import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';
import type {ModuleLoader} from '../src/plugins/sdk.ts';import type {FrameContext} from '../src/core/types.ts';
import {createDeformableTools} from '../modules/deformable-effects/src/api.ts';import {normalizeDeformable} from '../modules/deformable-effects/src/config.ts';
import {instantiateDeformable,encode} from '../modules/deformable-effects/runtime/physics.ts';import type {DeformableOptions} from '../modules/deformable-effects/src/types.ts';
const wasm=new Uint8Array(await readFile('modules/deformable-effects/dist/module.wasm')),tools=createDeformableTools((async()=>wasm.slice()) as ModuleLoader);
const context=(frame:number,num=24,den=1):FrameContext=>({frame,time:frame*den/num,globalFrame:frame,globalTime:frame*den/num,dt:den/num,seed:1,fps:{num,den},progress:0,durationInFrames:101});
const point=():DeformableOptions=>({fps:24,restPositions:[[0,2,0]],inverseMasses:[1],constraints:[]});
const bend=(restEnergy:number):DeformableOptions=>({fps:24,gravity:[0,0,0],restPositions:[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0]],positions:[[-1,0,.2],[1,0,-.1],[0,-1,0],[0,1,.1]],inverseMasses:[1,1,1,1],constraints:[{kind:'bend',particles:[0,1,2,3],restEnergy,compliance:.001}]});

test('nonpositive bend domain rejects before resource loading; permitted targets still run actual WASM',async()=>{
  let loads=0;const guarded=createDeformableTools((async()=>{loads++;return wasm.slice();}) as ModuleLoader),rows=[];
  for(const target of [Number.MIN_VALUE,.1,1e20,NaN,Infinity,null,'',true])await assert.rejects(guarded.createDeformables(bend(target as number),{worker:false}),{code:'E_DEFORM_PARAMETER'});
  assert.equal(loads,0);
  for(const target of [0,-.1]){const owner=await tools.createDeformables(bend(target),{worker:false});try{const at=await owner.sample(context(1));assert.equal(at.step,4);assert.ok(at.positions.flat().every(Number.isFinite));rows.push({target,result:at});}finally{assert.deepEqual(await owner.dispose(),{remainingBuffers:0});}}
  const atTarget=bend(-.06);atTarget.positions=structuredClone(atTarget.restPositions);atTarget.positions[0][2]=.2;atTarget.constraints[0].compliance=0;const exact=await tools.createDeformables(atTarget,{worker:false});try{const zero=await exact.sample(context(0)),after=await exact.sample(context(1));assert.ok(zero.maxBendResidual<1e-14);assert.ok(after.maxBendResidual<1e-14);for(let i=0;i<4;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(after.positions[i][j]-zero.positions[i][j])<1e-14);rows.push({target:-.06,result:after});}finally{await exact.dispose();}
  await mkdir('artifacts/deformable-effects',{recursive:true});await writeFile('artifacts/deformable-effects/rest-energy-domain-fixed.json',JSON.stringify({rejected:[Number.MIN_VALUE,.1,1e20,'NaN','Infinity',null,'',true],loadsBeforeRejection:loads,rows,analyticFixture:'Symmetric flat rest stencil: coefficient=-3/4, K=[2,2,-2,-2]; one opposite vertex at z=.2 gives energy=-1.5*z*z=-.06. This nonzero target extension is not present in the upstream zero-target method.',scope:'Reachable sign domain, finite results and one analytic nonzero target; no general convergence guarantee'},null,2));
});

test('rational FPS and substep-aligned fractional frames reuse Core time without advancing on repeat',async()=>{
  const spec={...point(),fps:{num:60000,den:2002},substeps:4},owner=await tools.createDeformables(spec,{worker:false});
  try{const at=await owner.sample(context(1.25,30000,1001)),h=1001/120000;assert.equal(at.step,5);assert.deepEqual(at.fps,{num:30000,den:1001});assert.ok(Math.abs(at.positions[0][1]-(2-9.81*h*h*5*6/2))<1e-14);assert.deepEqual(await owner.sample(context(1.25,60000,2002)),at);await owner.sample(context(0,30000,1001));assert.deepEqual(await owner.sample(context(1.25,30000,1001)),at);
    for(const bad of [context(.1,30000,1001),{...context(1,30000,1001),time:1},context(1,24)])await assert.rejects(owner.sample(bad),{code:'E_DEFORM_TIME'});
    for(const bad of [null,{...context(1),frame:'1'},{...context(1),time:null},{...context(1),fps:null}])await assert.rejects(owner.sample(bad as unknown as FrameContext),{code:'E_DEFORM_PARAMETER'});
    assert.equal((await owner.diagnostics()).failed,false);assert.deepEqual(await owner.sample(context(1.25,30000,1001)),at);
  }finally{await owner.dispose();}
});

test('budget plans and malformed data fail before instantiation, including arrays with accessors',async()=>{
  let loads=0,accessed=false;const guarded=createDeformableTools((async()=>{loads++;return wasm.slice();}) as ModuleLoader);
  for(const budgets of [{maxSnapshotBytes:1},{maxSnapshotBytes:1024,maxCheckpointBytes:1000},{maxParticles:0},{maxOutputBytes:16*1024*1024+1}])await assert.rejects(guarded.createDeformables({...point(),budgets},{worker:false}),{code:/E_DEFORM_(BUDGET|PARAMETER)/});
  const decorated=point();Object.defineProperty(decorated.restPositions[0],'0',{enumerable:true,get(){accessed=true;return 0;}});await assert.rejects(guarded.createDeformables(decorated,{worker:false}),{code:'E_DEFORM_PARAMETER'});assert.equal(accessed,false);
  const sparse=point();Reflect.deleteProperty(sparse.restPositions[0],'0');await assert.rejects(guarded.createDeformables(sparse,{worker:false}),{code:'E_DEFORM_PARAMETER'});
  for(const fps of [null,0,'24',{num:24,den:0}])assert.throws(()=>normalizeDeformable({...point(),fps} as DeformableOptions),{code:/E_DEFORM_PARAMETER|E_TIME/});
  assert.equal(loads,0);
});

test('real reply budget failure stops the owner; reset cannot raise an immutable output budget',async()=>{
  const owner=await tools.createDeformables({...point(),budgets:{maxOutputBytes:64}},{worker:false});try{await assert.rejects(owner.sample(context(0)),{code:'E_DEFORM_BYTES'});assert.equal((await owner.diagnostics()).failed,true);await assert.rejects(owner.sample(context(0)),{code:'E_DEFORM_FAILED'});await owner.reset();assert.equal((await owner.diagnostics()).failed,false);await assert.rejects(owner.sample(context(0)),{code:'E_DEFORM_BYTES'});}finally{assert.deepEqual(await owner.dispose(),{remainingBuffers:0});}
  const retry=await tools.createDeformables(point(),{worker:false});try{assert.equal((await retry.sample(context(0))).step,0);}finally{await retry.dispose();}
});

test('actual native configuration failure closes coefficients/buffers and cannot be used as an owner',async()=>{
  const session=await instantiateDeformable(wasm.slice().buffer),spec=bend(0);spec.restPositions=spec.restPositions.map(()=>[0,0,0]);
  assert.throws(()=>session.call(100,encode(spec),64),{code:'E_DEFORM_GEOMETRY'});const diagnostic=session.diagnostics() as {disposed:boolean;buffers:number;kernels:number};assert.equal(diagnostic.disposed,true);assert.equal(diagnostic.buffers,0);assert.equal(diagnostic.kernels,0);assert.throws(()=>session.call(101,encode(context(0)),1024),{code:'E_DEFORM_DISPOSED'});assert.deepEqual(session.dispose(),{remainingBuffers:0});
  await assert.rejects(createDeformableTools((async()=>new Uint8Array([0,1,2])) as ModuleLoader).createDeformables(point(),{worker:false}),{code:'E_WASM_BINARY'});
});

test('unrepresentable prediction stops rather than publishing nonfinite state and reset restores frame zero',async()=>{
  const owner=await tools.createDeformables({...point(),restPositions:[[Number.MAX_VALUE,0,0]],velocities:[[Number.MAX_VALUE,0,0]],gravity:[0,0,0]},{worker:false});try{const zero=await owner.sample(context(0));await assert.rejects(owner.sample(context(1)),{code:'E_DEFORM_PARAMETER'});assert.equal((await owner.diagnostics()).failed,true);await assert.rejects(owner.sample(context(0)),{code:'E_DEFORM_FAILED'});await owner.reset();assert.deepEqual(await owner.sample(context(0)),zero);}finally{await owner.dispose();}
});
