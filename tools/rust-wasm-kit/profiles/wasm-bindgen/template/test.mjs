// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createBinding} from './dist/binding.mjs';
import {createSession} from './runtime/session.mjs';
const bytes=await readFile(new URL('./dist/generated/module_bg.wasm',import.meta.url)),profile=JSON.parse(await readFile(new URL('./dist/import-profile.json',import.meta.url),'utf8'));
const vectors=JSON.parse(await readFile(new URL('./tests/vectors.json',import.meta.url),'utf8'));
const decode=value=>value&&typeof value==='object'&&!Array.isArray(value)?new globalThis[value.type](value.values):value;
test('real wasm-bindgen methods, JS imports, independent instances, Result errors and generated free',async()=>{
  const a=await createSession(bytes,profile,createBinding),b=await createSession(bytes,profile,createBinding);
  for(const vector of vectors){const args=vector.args.map(decode);
    if(vector.error){assert.throws(()=>a.invoke(vector.method,args),error=>error.code==='E_BINDGEN_CALL'&&error.message.includes(vector.error));continue;}
    const result=a.invoke(vector.method,args);
    if(vector.area!==undefined){let area=0;for(let i=0;i<result.length;i+=6)area+=Math.abs((result[i+2]-result[i])*(result[i+5]-result[i+1])-(result[i+4]-result[i])*(result[i+3]-result[i+1]))/2;assert.ok(Math.abs(area-vector.area)<1e-6);assert.equal(result.length,vector.triangleCount*6);}
    else assert.deepEqual(ArrayBuffer.isView(result)?[...result]:result,vector.expected);
  }
  assert.ok(a.invoke('calls',[])>0);assert.ok(a.invoke('host_calls',[])>0);assert.equal(b.invoke('calls',[]),0);assert.equal(b.invoke('host_calls',[]),0);
  assert.equal(a.diagnostics().liveSessions,1);assert.deepEqual(a.dispose(),{remainingSessions:0});assert.deepEqual(a.dispose(),{remainingSessions:0});
  assert.throws(()=>a.invoke('calls',[]),{code:'E_BINDGEN_DISPOSED'});assert.equal(b.diagnostics().liveSessions,1);assert.deepEqual(b.dispose(),{remainingSessions:0});
});
