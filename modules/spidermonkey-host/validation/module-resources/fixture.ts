// Host integration fixture. Uses the real existing R1 ModuleLoader with the
// explicitly proposed Core callback hook, not a substitute package loader.
import {packageModuleLoader} from '../../../../src/packages/runtime.ts';
import {nativeDispatcher} from '../../bootstrap.ts';
import {createNativePuppetTools,createNativePuppetProcessorTools,createNativePuppetRenderer} from '../../../puppet-effects/native.ts';
import {createNativeRigidBodyTools} from '../../../rigid-body-effects/native.ts';
import {createNativeDeformableTools} from '../../../deformable-effects/native.ts';
import {gridMesh} from '../../../puppet-effects/validation/fixtures.ts';
import {linear709,surfaceFromPixels} from '../../../../src/media/surface.ts';
let evidence:any={},owners:any[]=[],puppet:any,processor:any,rigid:any,deform:any,collision:any,renderer:any,disposed=false;
const host=(globalThis as any).__frameweaveNativeHost;
const dispatch=nativeDispatcher(async(init:any)=>{
 const g=init.gpu,packs=init.fixturePackages,options={readModuleBytes:init.readModuleBytes},loader=(id:string)=>packageModuleLoader(id,packs,{'puppet/api':async()=>({answer:42})},init.resources,options as any),p=loader('puppet'),r=loader('rigid'),d=loader('deform'),errors:Record<string,string>={};
 async function failure(name:string,run:()=>unknown){try{await run();errors[name]='ACCEPTED';}catch(e:any){errors[name]=e.code??e.name;}}
 await failure('undeclared',()=>p({module:'missing',format:'resource'}));await failure('dependency',()=>p({module:'bytes',format:'resource',dependency:'foreign'}));await failure('format',()=>p({module:'bytes',format:'wgsl'}));
 evidence.js=(await p({module:'api',format:'javascript'})).answer;
 if(typeof WebAssembly==='undefined'){
  await failure('wasm',()=>p({module:'empty',format:'wasm'}));await failure('solver',()=>createNativePuppetTools(p).createPuppet(gridMesh(3,3)));evidence={...evidence,errors,wasm:typeof WebAssembly,fetch:typeof fetch,worker:typeof Worker};
  return {renderAt(){throw Error('WASM was explicitly denied');}};
 }
 await p({module:'empty',format:'wasm'});await failure('hostImports',()=>p({module:'imports',format:'wasm'}));
 const altered=packageModuleLoader('puppet',packs,{},init.resources,{readModuleBytes:async()=>Uint8Array.of(1,2,3)} as any);await failure('independentIntegrity',()=>altered({module:'bytes',format:'resource'}));
 const own=<T>(v:T)=>{owners.push(v);return v;},mesh=gridMesh(3,3);
 puppet=own(await createNativePuppetTools(p).createPuppet(mesh));processor=own(await createNativePuppetProcessorTools(p).createPuppetProcessor());
 rigid=own(await createNativeRigidBodyTools(r).createRigidBodies({fps:24,seed:51,substeps:4,gravity:[0,-10,0],bodies:[{id:'ball',kind:'dynamic',position:[0,10,0],canSleep:false,colliders:[{id:'ball',shape:{kind:'ball',radius:.2}}]}]}));
 deform=own(await createNativeDeformableTools(d).createDeformables({fps:24,substeps:4,restPositions:[[0,2,0]],inverseMasses:[1],constraints:[]}));
 collision=own(await createNativeRigidBodyTools(r).createCollisionEnvironment({fps:24,bodies:[{id:'floor',kind:'fixed',position:[0,-.1,0],colliders:[{id:'floor-shape',shape:{kind:'cuboid',halfExtents:[2,.1,2]}}]}]}));
 const pixels=new Float32Array(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<8;x++)pixels.set([2,.5,1,x===0||y===0||x===7||y===7?0:1],(y*8+x)*4);const image=surfaceFromPixels(8,8,pixels,{color:linear709,format:'rgba32float',alpha:'straight'}),meshed=await processor.generateMesh(image,{id:'mask',world:{left:-1,right:1,bottom:-1,top:1},edgeLengthPx:2});
 renderer=await createNativePuppetRenderer(g,mesh,{width:init.width,height:init.height,bounds:{left:-1.5,right:1.5,bottom:-1,top:1}});evidence={...evidence,errors,mesh:meshed.mesh,components:meshed.components.length,area:meshed.diagnostics.areaPixels,sweep:collision.sweepSphere({position:[0,1,0],velocity:[0,-2,0],radius:.1,duration:1}),wasm:typeof WebAssembly,fetch:typeof fetch,worker:typeof Worker};
 return {async renderAt(c:any){const pose=await puppet.solve({pins:[{vertexId:'v0',position:[-1+c.frame/500,-1]}]}),body=await rigid.sample(c),cloth=await deform.sample(c),texture=await g.upload(image);try{evidence.latest={frame:c.frame,pose:pose.positions,body,cloth,puppet:await puppet.diagnostics(),processor:await processor.diagnostics(),rigid:await rigid.diagnostics(),deform:await deform.diagnostics()};return await renderer.render(pose.positions,texture);}finally{await g.release(texture);}},async dispose(){await renderer.dispose();for(const owner of owners.reverse())await owner.dispose();disposed=true;}};
},host.setFrame,host.stopFrame);
host.register(async(method:string,payload:any)=>{if(method==='fixture.evidence')return {...evidence,disposed};return dispatch(method,payload);});
