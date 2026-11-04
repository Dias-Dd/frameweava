import test from 'node:test';import assert from 'node:assert/strict';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {restoreNativeDataSeeds} from '../modules/native-gpu/data-seeds.ts';
import {residentWireProgram} from '../modules/native-gpu/resident-buffers.ts';
import {borrowNativeScope} from '../modules/native-gpu/borrow.ts';

test('resident geometry created on first frame survives later epochs while ordinary buffers expire',async()=>{
 const s=new NativeRecordingScope(),g=s.api;s.sealInitialization();s.beginFrame();
 const temporary=await g.createBuffer({type:'f32',length:2},Float32Array.of(1,2)),positions=await g.createResidentField({type:'f32',dimensions:[2,1,1],components:3,semantic:'position',space:'object',units:'unitless'},Float32Array.of(1,2,3,4,5,6));
 assert.equal(positions.info.readOnly,true);let packet=s.packet(false);assert.equal(packet.data[1].resident!.id,'r1');assert.equal(packet.data[1].initial.length,6);
 const initial=new Map(),frame=new Map(),resident=new Map();restoreNativeDataSeeds(packet.data,0,initial,frame,resident);
 s.beginFrame();await assert.rejects(g.writeBuffer(temporary,Float32Array.of(1,2)),{code:'E_NATIVE_SCOPE'});await assert.rejects(g.writeBuffer(positions,Float32Array.of(1,2,3,4,5,6)),{code:'E_NATIVE_SCOPE'});
 packet=s.packet(false);assert.equal(packet.data[0].resident!.id,'r1');assert.equal(packet.data[0].seedOmitted,true);const restored=restoreNativeDataSeeds(packet.data,0,initial,new Map(),resident);assert.equal(restored[0].initial.length,6);
 const writable=await g.compileCompute({abiVersion:1,id:'resident/forbid-store',version:'1.0.0',bindings:[{type:'f32',access:'read_write'}],parameterWords:0,workgroupSize:[1,1,1],code:'fn compute(p:vec3u,l:vec3u,w:vec3u){store0(0u,1.);}'});await assert.rejects(g.dispatch(writable,[positions],{workItems:[1,1,1]}),{code:'E_NATIVE_SCOPE'});
 const clone=await g.cloneBuffer(positions);assert.equal(clone.info.readOnly,undefined);await g.releaseBuffer(positions);await g.releaseBuffer(positions);s.beginFrame();assert.deepEqual(s.packet(false).residentLive,[]);await assert.rejects(g.cloneBuffer(positions),{code:'E_NATIVE_SCOPE'});await g.dispose();
});
test('module leases own their resident allocations and release them on disposal',async()=>{
 const probe=new NativeRecordingScope(),cap=probe.api.capabilities();await probe.api.dispose();
 const s=new NativeRecordingScope({version:1,backend:'native-wgpu',owner:'a'.repeat(64),hardwareVerified:true,capabilities:{...cap,hardwareVerified:true,nativeResidentBuffers:{version:1,readOnly:true,runtimeCreation:true}}});
 s.sealInitialization();s.beginFrame();const a=borrowNativeScope(s.api),b=borrowNativeScope(s.api),buffer=await a.scope.createResidentBuffer({type:'u32',length:1},Uint32Array.of(5));
 await assert.rejects(b.scope.replaceResidentBuffer(buffer,Uint32Array.of(6)),{code:'E_NATIVE_RESOURCE_OWNER'});await assert.rejects(b.scope.releaseBuffer(buffer),{code:'E_NATIVE_RESOURCE_OWNER'});
 const next=await a.scope.replaceResidentBuffer(buffer,Uint32Array.of(7));s.beginFrame();assert.equal(s.packet(false).residentLive!.length,1);await a.dispose();await a.dispose();assert.equal(s.packet(false).residentLive!.length,0);await assert.rejects(a.scope.cloneBuffer(next),{code:'E_PACKAGE_DISPOSE'});await b.dispose();await s.api.dispose();
});
test('resident buffers mix with initialization seeds; replacement is atomic and byte budgets are configurable',async()=>{
 const s=new NativeRecordingScope(undefined,undefined,32),g=s.api;
 const a=await g.createResidentBuffer({type:'u32',length:4},Uint32Array.of(1,2,3,4)),normal=await g.createBuffer({type:'u32',length:1},Uint32Array.of(9));s.sealInitialization();assert.equal(s.initialSeedCount(),1);s.beginFrame();
 await assert.rejects(g.replaceResidentBuffer(a,Uint32Array.of(1)),{code:'E_NATIVE_RESIDENT_DATA'});
 const b=await g.replaceResidentBuffer(a,Uint32Array.of(5,6,7,8));await assert.rejects(g.cloneBuffer(a),{code:'E_NATIVE_SCOPE'});const packet=s.packet(false);assert.equal(packet.data[0].initial[0],9);assert.equal(packet.residentLive!.length,1);
 await assert.rejects(g.createResidentBuffer({type:'u32',length:8},new Uint32Array(8)),{code:'E_NATIVE_RESIDENT_BUDGET'});s.beginFrame();await g.cloneBuffer(b);await g.cloneBuffer(normal);await g.releaseBuffer(b);await g.dispose();
});
test('resident seed omission is bound to immutable identity, shape/type and exact words; native transport omits admitted seeds',()=>{
 const cache=new Map(),d={type:'f32' as const,length:2,initial:[0x3f800000,0x40000000],immutable:true,resident:{version:1 as const,id:'r1'}};
 restoreNativeDataSeeds([d],0,new Map(),new Map(),cache);
 for(const value of [{...d,type:'u32' as const,initial:[],seedOmitted:true},{...d,length:3,initial:[],seedOmitted:true},{...d,immutable:false,initial:[],seedOmitted:true},{...d,resident:{version:1 as const,id:'r2'},initial:[],seedOmitted:true},{...d,initial:[1,2],seedOmitted:true}])assert.throws(()=>restoreNativeDataSeeds([value],0,new Map(),new Map(),cache));
 const p:any={version:2,data:[{...d,resident:{version:1,id:'owner~r1'}}]},wire=residentWireProgram(p,new Set(['owner~r1']));assert.deepEqual(wire.data![0].initial,[]);assert.equal(p.data[0].initial.length,2);
});
