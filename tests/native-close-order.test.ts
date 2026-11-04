import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Renderer} from '../src/render/renderer.ts';
import {NativeLogicHost} from '../modules/native-gpu/logic-host.ts';
const tick=()=>new Promise<void>(r=>setImmediate(r));
test('Renderer drains Stage disposal and GPU/ORT exit before deleting resource leases',async()=>{
  const renderer=new (Renderer as any)({}, {},1,1),host=new NativeLogicHost({} as any,1,1) as any,events:string[]=[];
  let ownerAlive=true,unlock!:()=>void;const released=new Promise<void>(r=>unlock=r);
  host.entries.set('x',{async call(method:string){assert.equal(method,'dispose');assert.equal(ownerAlive,true);await tick();events.push('stage');},async close(){events.push('logic');}});
  host.resourceImages={async close(){assert.equal(ownerAlive,false,'Resource files are still held by ORT');events.push('files');}};
  renderer.nativeLogic=host;renderer.nativeClient={async close(){events.push('owner-closing');await released;ownerAlive=false;events.push('owner-exited');}};
  const first=renderer.close(),again=renderer.close();assert.equal(first,again);await tick();await tick();assert.equal(events.includes('files'),false);unlock();await first;
  assert.deepEqual(events,['stage','logic','owner-closing','owner-exited','files']);await renderer.close();assert.equal(events.filter(e=>e==='files').length,1);
});
test('Stage failures do not skip GPU exit or resource cleanup, and genuine lease failures are reported',async()=>{
  const renderer=new (Renderer as any)({}, {},1,1),host=new NativeLogicHost({} as any,1,1) as any,events:string[]=[];
  host.entries.set('x',{async call(){throw Error('stage disposal');},async close(){events.push('logic');}});
  host.resourceImages={async close(){events.push('files');throw Object.assign(Error('lease deletion'),{code:'EBUSY'});}};
  renderer.nativeLogic=host;renderer.nativeClient={async close(){events.push('owner');}};
  await assert.rejects(renderer.close(),/stage disposal/);assert.deepEqual(events,['logic','owner','files']);
  const independent=new NativeLogicHost({} as any,1,1) as any;independent.resourceImages={async close(){throw Object.assign(Error('lease deletion'),{code:'EBUSY'});}};await assert.rejects(independent.close(),{code:'EBUSY'});
});
