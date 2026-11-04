import test from 'node:test';
import assert from 'node:assert/strict';
import {getEventListeners} from 'node:events';
import {NativeGpuClient} from '../modules/native-gpu/client.ts';
import {Renderer} from '../src/render/renderer.ts';

// Deterministic transport/slot control tests, NOT GPU or performance evidence.
// Uses the actual Client submit/request/receive/close implementations.
function transport(){
 const client=Object.create(NativeGpuClient.prototype) as any,commands:any[]=[];
 let closeRequest:any;
 let exit!:()=>void;
 const closed=new Promise<void>(r=>{exit=r;});
 const ack=(r:any)=>client.receive(JSON.stringify({version:1,id:r.id,ok:true,result:{}})+'\n');
 Object.assign(client,{admitted:{version:1,session:'a'.repeat(64),slots:2,kernels:[{parameterWords:1}],passes:[{kernel:0}]},
  nextId:0,pending:new Map(),completions:new Map(),free:[0,1],waiters:[],buffer:'',timeoutMs:2000,stderr:[],transport:{maxControlBytes:1024**2,maxSeedBytes:1024**2},transportQueue:Promise.resolve(),queuedWrites:0,
  closeEvent:{promise:closed,resolve:exit,reject:()=>{}},child:{stdin:{
   write(line:string,callback:(e?:Error)=>void){const r=JSON.parse(line);commands.push(r);
    if(r.op==='close'&&client.completions.size)closeRequest=r;else queueMicrotask(()=>ack(r));callback();
   },end(){client.closed=true;exit();},
  },kill(){client.closed=true;exit();}}});
 const complete=(slot:number,frame:number)=>{
  client.receive(JSON.stringify({version:1,event:'completed',slot,frame})+'\n');
  if(closeRequest&&!client.completions.size){const r=closeRequest;closeRequest=undefined;queueMicrotask(()=>ack(r));}
 };
 return {client:client as NativeGpuClient,raw:client,commands,complete};
}
async function busy(){
 const m=transport(),a=await m.client.submit(0,[[0]]),b=await m.client.submit(1,[[1]]);
 return {...m,a,b};
}
test('waiting cancellation removes listener/waiter and does not submit; next frame can use slot',async()=>{
 const m=await busy(),c=new AbortController(),pending=m.client.submit(2,[[2]],{signal:c.signal});
 assert.equal(m.raw.waiters.length,1);c.abort();
 await assert.rejects(pending,{code:'E_RENDER_CANCELLED'});
 assert.equal(m.raw.waiters.length,0);assert.equal(getEventListeners(c.signal,'abort').length,0);
 m.complete(m.a.slot,0);assert.equal(m.commands.filter(v=>v.op==='submit').length,2);
 const next=await m.client.submit(3,[[3]]);assert.equal(next.slot,m.a.slot);
 m.complete(next.slot,3);m.complete(m.b.slot,1);await Promise.all([next.completed,m.a.completed,m.b.completed]);
 await m.client.close();await m.client.close();
});
test('slot assignment/abort race returns the reserved slot instead of submitting',async()=>{
 const m=await busy(),c=new AbortController(),pending=m.client.submit(2,[[2]],{signal:c.signal});
 m.complete(m.a.slot,0);c.abort(); // Before the slot await continuation.
 await assert.rejects(pending,{code:'E_RENDER_CANCELLED'});
 assert.equal(m.commands.filter(v=>v.op==='submit').length,2);assert.deepEqual(m.raw.free,[m.a.slot]);
 const next=await m.client.submit(3,[[3]]);assert.equal(next.slot,m.a.slot);
 m.complete(next.slot,3);m.complete(m.b.slot,1);await m.client.close();
});
test('cancelling a queued head preserves FIFO for remaining live waiters',async()=>{
 const m=await busy(),c=new AbortController(),first=m.client.submit(2,[[2]],{signal:c.signal}),second=m.client.submit(3,[[3]]);
 c.abort();await assert.rejects(first,{code:'E_RENDER_CANCELLED'});m.complete(m.a.slot,0);
 const ticket=await second;assert.equal(ticket.slot,m.a.slot);m.complete(ticket.slot,3);m.complete(m.b.slot,1);
 assert.equal(m.raw.waiters.length,0);await m.client.close();
});
test('close rejects waiting and just-assigned frames and drains existing GPU slots',async()=>{
 const m=await busy(),c=new AbortController(),assigned=m.client.submit(2,[[2]],{signal:c.signal}),waiting=m.client.submit(3,[[3]]);
 m.complete(m.a.slot,0);const closing=m.client.close();
 await assert.rejects(assigned,{code:'E_NATIVE_CLOSED'});await assert.rejects(waiting,{code:'E_NATIVE_CLOSED'});
 assert.equal(m.commands.filter(v=>v.op==='submit').length,2);assert.equal(m.raw.waiters.length,0);
 assert.equal(getEventListeners(c.signal,'abort').length,0);m.complete(m.b.slot,1);await closing;
 assert.equal(m.raw.completions.size,0);assert.equal(m.client.connected(),false);
});
test('device failure rejects waiters/completions and clears slot/listener bookkeeping',async()=>{
 const m=await busy(),c=new AbortController(),pending=m.client.submit(2,[[2]],{signal:c.signal});
 const failed=Object.assign(new Error('lost'),{code:'E_NATIVE_DEVICE'});m.raw.fail(failed);
 await assert.rejects(pending,{code:'E_NATIVE_DEVICE'});await assert.rejects(m.a.completed,{code:'E_NATIVE_DEVICE'});await assert.rejects(m.b.completed,{code:'E_NATIVE_DEVICE'});
 assert.equal(m.raw.waiters.length,0);assert.equal(m.raw.completions.size,0);assert.deepEqual(m.raw.free,[]);
 assert.equal(getEventListeners(c.signal,'abort').length,0);await m.client.close();
});
test('abort after transport submission cannot retract already accepted work',async()=>{
 const m=transport(),c=new AbortController(),pending=m.client.submit(0,[[0]],{signal:c.signal});c.abort();
 const ticket=await pending;assert.equal(m.commands.filter(v=>v.op==='submit').length,1);
 m.complete(ticket.slot,0);await ticket.completed;await m.client.close();
});
test('Renderer forwards AbortSignal into actual client slot acquisition',async()=>{
 const c=new AbortController(),renderer=Object.create(Renderer.prototype) as any;
 Object.assign(renderer,{queue:Promise.resolve(),closed:false,nativePending:new Set(),build:{manifest:{composition:{width:16,height:9,fps:{num:24,den:1},durationInFrames:10},layers:[{id:'layer',source:{$ref:'image',port:'surface'},start:0,end:10}],stages:[{id:'image',engine:'native-gpu',outputs:{surface:'surface'},time:{start:0,duration:10}}]}},
  nativePlan:{output:{stage:'image',port:'surface'},program:{passes:[{}]},stages:new Map([['image',{}]])},
  execute:async(...args:any[])=>{args[5].parameters[0]=[0];args[5].published.add('image');},
  nativeClient:{async submit(_frame:number,_parameters:number[][],options:{signal?:AbortSignal}){assert.equal(options.signal,c.signal);return {completed:Promise.resolve()};}}});
 await renderer.submitNativeFrame(0,{signal:c.signal});
});
