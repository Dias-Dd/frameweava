import {readFile} from 'node:fs/promises';
import {createRigidBodyTools} from '../src/api.ts';
import {context} from './fixtures.ts';
import type {RigidWorldOptions} from '../src/types.ts';
import type {ModuleLoader} from '../../../src/plugins/sdk.ts';
const speed=Number(process.argv[2]??1000),substeps=Number(process.argv[3]??1),mode=process.argv[4]??'plane',wasm=await readFile('modules/rigid-body-effects/dist/module.wasm'),tools=createRigidBodyTools((async()=>new Uint8Array(wasm)) as ModuleLoader);
const spec:RigidWorldOptions={fps:24,substeps,gravity:[0,0,0],bodies:[{id:'wall',kind:'fixed',colliders:[{id:'wall-shape',shape:{kind:'cuboid',halfExtents:[5,.005,5]}}]},{id:'bullet',kind:'dynamic',position:[0,1,0],linearVelocity:[0,-speed,0],ccd:true,colliders:[{id:'bullet-shape',shape:{kind:'ball',radius:.02}}]}]};
spec.solver={allowedLinearError:.0001,ccdSubsteps:Number(process.argv[5]??4),iterations:Number(process.argv[6]??8),maxCorrectiveVelocity:Number(process.argv[7]??3)};
if(process.argv[8]==='hard')spec.solver.staticContactSoftness={frequency:1e6,dampingRatio:1};
if(mode==='finite'){spec.bodies[0].colliders[0].shape={kind:'cuboid',halfExtents:[.05,.005,.05]};spec.bodies[1].position=[1,1,0];spec.bodies[1].linearVelocity=[-speed,-speed,0];}
if(mode==='sphere')spec.bodies[0].colliders[0].shape={kind:'ball',radius:.02};
if(mode==='box')spec.bodies[1].colliders[0].shape={kind:'cuboid',halfExtents:[.02,.02,.02]};
if(mode==='dynamic'){spec.bodies[0].kind='dynamic';spec.bodies[0].colliders[0].shape={kind:'ball',radius:.02};}
console.log(JSON.stringify({marker:'init',speed,substeps,mode}));
const on=await tools.createRigidBodies(spec,{worker:false}),off=await tools.createRigidBodies({...spec,solver:{...spec.solver,ccdSubsteps:0},bodies:spec.bodies.map(b=>({...b,ccd:false}))},{worker:false});
try{console.log(JSON.stringify({marker:'before-on-1'}));const a=await on.sample(context(1));console.log(JSON.stringify({marker:'after-on-1',result:a}));const b=await off.sample(context(1));console.log(JSON.stringify({marker:'after-off-1',result:b}));await on.sample(context(0));console.log(JSON.stringify({marker:'after-on-0'}));const again=await on.sample(context(1));console.log(JSON.stringify({marker:'after-replay',result:again}));}finally{await on.dispose();await off.dispose();}
