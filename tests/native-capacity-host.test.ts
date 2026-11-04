import{moduleResourceBudget}from'../modules/spidermonkey-host/module-resources.ts';
import test from'node:test';import assert from'node:assert/strict';import{mkdir,mkdtemp,writeFile}from'node:fs/promises';import{join,resolve}from'node:path';
import{encodeHostValue,decodeHostValue}from'../modules/spidermonkey-host/codec.ts';import{spiderMonkeyTransport,hostByteBudgets}from'../modules/spidermonkey-host/transport.ts';
test('host codec handles deep containers and >64MiB typed data within an explicit byte budget',()=>{
 assert.equal(moduleResourceBudget({maxBytes:128*1024**2,maxResources:1000}).bytes,128*1024**2);let value:any='end';for(let n=0;n<5000;n++)value={child:value};let round:any=decodeHostValue(encodeHostValue(value,1024**2),1024**2);for(let n=0;n<5000;n++)round=round.child;assert.equal(round,'end');
 const data=new Uint8Array(65*1024**2).fill(17),encoded=encodeHostValue(data,70*1024**2),out=decodeHostValue(encoded,70*1024**2)as Uint8Array;assert.equal(out.length,data.length);assert.equal(out[0],17);assert.equal(out.at(-1),17);
 assert.throws(()=>encodeHostValue(data,64*1024**2),/budget/);assert.throws(()=>decodeHostValue(encoded,64*1024**2),/budget/);assert.throws(()=>hostByteBudgets({maxMessageBytes:0x100000000}),{code:'E_SPIDERMONKEY_BUDGET'});
});
test('actual isolated host accepts >64MiB input/output, long microtasks and logical timers without relaxed permissions',{timeout:45000},async()=>{
 const root=resolve('.frameweave/native-capacity/host');await mkdir(root,{recursive:true});const dir=await mkdtemp(join(root,'case-')),entry=join(dir,'stage.mjs');
 await writeFile(entry,`let fired=0;globalThis.__frameweaveNativeHost.register(async(method,payload)=>{
 if(method==='echo')return payload.bytes;
 if(method==='microtasks'){for(let n=0;n<110000;n++)await Promise.resolve();return 110000;}
 if(method==='timers'){for(let n=0;n<12001;n++)setTimeout(()=>fired++,0);return true;}
 return {fired,process:typeof process,fetch:typeof fetch,wasm:typeof WebAssembly};});`);
 const host=await spiderMonkeyTransport({bundleFile:entry,stageId:'capacity',timeoutMs:30000,maxMessageBytes:80*1024**2,maxMemoryBytes:2*1024**3});
 try{const bytes=new Uint8Array(65*1024**2).fill(29),result=await host.call('echo',{bytes})as Uint8Array;assert.equal(result.length,bytes.length);assert.equal(result[0],29);assert.equal(result.at(-1),29);
  assert.equal(await host.call('microtasks',{}),110000);await host.call('timers',{});assert.deepEqual(await host.call('native.render',{context:{time:1}}),{fired:12001,process:'undefined',fetch:'undefined',wasm:'undefined'});
  await writeFile(join(root,'result.json'),JSON.stringify({bytes:result.length,microtasks:110000,timers:12001,configured:{maxMessageBytes:80*1024**2,maxMemoryBytes:2*1024**3},permissionsUnchanged:true},null,2));
 }finally{await host.close();await host.close();}
});
