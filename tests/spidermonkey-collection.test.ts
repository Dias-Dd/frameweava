import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HostCollectionPressure} from '../modules/spidermonkey-host/collection.ts';

test('large source schedules collection even when the graph template reply is small',()=>{
 const pressure=new HostCollectionPressure(64*1024**2,2*1024**2);
 assert.equal(pressure.due('native.init',{},12),true);pressure.collected();
 assert.equal(pressure.due('native.render',{graphTemplate:{version:1,id:1}},48),true);
});
test('small calls amortize collection without a fixed frame count',()=>{
 const pressure=new HostCollectionPressure(64*1024,128);
 for(let i=0;i<7;i++)assert.equal(pressure.due('native.render',{},16),false);
 assert.equal(pressure.due('native.render',{},16),true);pressure.collected();
 assert.equal(pressure.due('native.render',{},1024),true);
});
test('suspended temporal, state and nested Stage exchanges cannot be interrupted by diagnostics',()=>{
 const pressure=new HostCollectionPressure(1024,1024);
 for(const kind of ['native-temporal-request','native-state-segment','native-stage-call']){
  assert.equal(pressure.due('native.render',{kind},4096),false);
  assert.equal(pressure.due('native.temporal.resume',{kind},4096),false);
 }
 assert.equal(pressure.due('native.temporal.resume',{images:[]},1),true);
});
test('maintenance, failure and disposal protocols are never recursively collected',()=>{
 const pressure=new HostCollectionPressure(1024,1024);
 for(const method of ['native.diagnostics','manifest.evaluate','dispose','native.temporal.cancel','native.reset'])assert.equal(pressure.due(method,{},4096),false);
});
for(const kind of ['native-temporal-request','native-state-segment','native-stage-call'])test('suspended pressure carries into the completed resume: '+kind,()=>{
 const pressure=new HostCollectionPressure(1024**3,1024**2);
 assert.equal(pressure.due('native.render',{kind},32*1024**2),false);
 assert.equal(pressure.due('native.temporal.resume',{images:[]},32),true);
 assert.equal(pressure.due('native.temporal.resume',{images:[]},32),true,'A due decision alone must not clear the pending pressure');
 pressure.collected();assert.equal(pressure.due('native.render',{images:[]},32),false);
});
