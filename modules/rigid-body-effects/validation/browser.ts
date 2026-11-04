import {meshWorld} from './mesh-fixtures.ts';
import {createRigidBodyTools} from '../src/api.ts';import {context,falling,jointFixture} from './fixtures.ts';import type {ModuleLoader} from '../../../src/plugins/sdk.ts';
function check(value:unknown,message:string){if(!value)throw Error(message);}
export async function rigidWorkerChecks(){
  const load=(async(request:{module:string})=>new Uint8Array(await(await fetch(request.module==='worker'?'/worker.js':'/module.wasm')).arrayBuffer())) as ModuleLoader,tools=createRigidBodyTools(load),source=falling(true),worker=await tools.createRigidBodies(source),direct=await tools.createRigidBodies(source,{worker:false}),rows=[];
  try{for(const frame of [0,24,100,0,100,25,24]){const a=await worker.sample(context(frame)),b=await direct.sample(context(frame));check(JSON.stringify(a)===JSON.stringify(b),'Worker/direct state or contacts disagree');rows.push({frame,bodies:a.bodies,contacts:a.contacts});}
    let invalidTime='';try{await worker.sample({...context(0),time:NaN});}catch(e){invalidTime=(e as {code:string}).code;}check(invalidTime==='E_RIGID_PARAMETER','Worker creator did not reject NaN before transport');
    const active=worker.sample(context(101));let busy='';try{await worker.sample(context(1));}catch(e){busy=(e as {code:string}).code;}check(busy==='E_RIGID_BUSY','Concurrent sample did not reject');const closing=worker.dispose(),r=await active,release=await closing;check(r.step===404&&release.remainingBuffers===0,'Close did not drain active work');const info=await direct.diagnostics();check(info.worlds===1&&info.buffers===0,'WASM world/buffer ownership wrong');rows.push({kind:'lifecycle',invalidTime,busy,info,release,closed:await worker.diagnostics()});
  }finally{await worker.dispose();await direct.dispose();}
  const abort=new AbortController(),cancelled=await tools.createRigidBodies(source,{signal:abort.signal});let cancellation='';try{const request=cancelled.sample(context(10000));abort.abort();try{await request;}catch(e){cancellation=(e as {code:string}).code;}check(cancellation==='E_RIGID_CANCELLED','Worker abort did not reject pending computation');}finally{await cancelled.dispose();}
  for(const kind of ['spherical','revolute','prismatic','spring'] as const){const w=await tools.createRigidBodies(jointFixture(kind));try{const a=await w.sample(context(48));await w.sample(context(0));check(JSON.stringify(await w.sample(context(48)))===JSON.stringify(a),'Joint Worker replay differs');rows.push({kind:'joint-worker',joint:kind,result:a});}finally{await w.dispose();}}
  const meshProof=await rigidMeshWorkerChecks(load);
  return {meshProof,rows,cancellation,cancelDrop:'Hard Worker termination, not a claim of cooperative Rust Drop',scope:'Actual browser Dedicated Worker and direct WASM with fixture resource loader; R1/CSP tested separately'};
}

async function rigidMeshWorkerChecks(load:ModuleLoader){
  const tools=createRigidBodyTools(load),worker=await tools.createRigidBodies(meshWorld()),direct=await tools.createRigidBodies(meshWorld(),{worker:false}),rows=[];
  try{for(const frame of [0,24,100,0,100,25]){
    const a=await worker.sample(context(frame)),b=await direct.sample(context(frame));check(JSON.stringify(a)===JSON.stringify(b),'Mesh Worker/direct physical state differs');
    const rays={origin:[0,6,0] as [number,number,number],direction:[0,-1,0] as [number,number,number],maxDistance:12},cast={shape:{kind:'ball' as const,radius:.1},position:[-3,.5,0] as [number,number,number],velocity:[1,0,0] as [number,number,number],maxTime:6},overlap={shape:{kind:'ball' as const,radius:5},position:[0,0,0] as [number,number,number],filter:{includeSensors:true}};
    const queries={geometry:await worker.colliderMeshes(),ray:await worker.castRay(rays),cast:await worker.castShape(cast),overlap:await worker.intersections(overlap)},expected={geometry:await direct.colliderMeshes(),ray:await direct.castRay(rays),cast:await direct.castShape(cast),overlap:await direct.intersections(overlap)};
    check(JSON.stringify(queries)===JSON.stringify(expected),'Actual mesh Worker/direct query/geometry values differ');check(JSON.stringify(await worker.sample(context(frame)))===JSON.stringify(a),'Passive queries advanced/changed physical state');rows.push({frame:frame,queries:queries,state:a});
  }return {rows:rows,worker:await worker.diagnostics(),direct:await direct.diagnostics()};}
  finally{const a=await worker.dispose(),b=await direct.dispose();check(a.remainingBuffers===0&&b.remainingBuffers===0,'Mesh owners did not release buffers');}
}
