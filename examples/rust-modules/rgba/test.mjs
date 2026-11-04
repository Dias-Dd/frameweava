// SPDX-License-Identifier: Apache-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instantiateModule} from './runtime/session.mjs';
const bytes=await readFile(new URL('./dist/module.wasm',import.meta.url));
const vectors=JSON.parse(await readFile(new URL('./tests/vectors.json',import.meta.url),'utf8'));
test('real Rust calls agree with independent expected bytes; errors free all allocations',async()=>{
  const session=await instantiateModule(bytes);
  for(const vector of vectors){const input=Uint8Array.from(vector.input);const result=session.call(vector.operation,input,vector.capacity);
    assert.deepEqual([...result],vector.expected);assert.equal(session.diagnostics().buffers,0);}
  assert.throws(()=>session.call(0xffffffff,new Uint8Array([1,2,3,4]),32),{code:'E_WASM_CALL'});
  assert.equal(session.diagnostics().buffers,0);
  assert.deepEqual(session.dispose(),{remainingBuffers:0});assert.deepEqual(session.dispose(),{remainingBuffers:0});
  assert.throws(()=>session.call(1,new Uint8Array(),4),{code:'E_WASM_DISPOSED'});
});
