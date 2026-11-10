import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {SpiderMonkeyTransport} from '../modules/spidermonkey-host/transport.ts';

const hostPath=process.env.FRAMEWEAVE_SPIDERMONKEY;
test('Linux authored JS requires OS isolation and cannot read a host file or open a host connection',{
 skip:process.platform!=='linux'?'Linux sandbox test':!hostPath?'Set FRAMEWEAVE_SPIDERMONKEY to the reviewed Linux build':false,
},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'frameweave-linux-test-'));
 const server=createServer(socket=>socket.destroy());
 try{
  await new Promise<void>((ready,reject)=>server.once('error',reject).listen(0,'127.0.0.1',ready));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  const file=join(directory,'canary'),bundleFile=join(directory,'stage.js'),executable=resolve(hostPath!);
  await writeFile(file,'controller-only content');
  const run=promisify(execFile);
  const {stdout}=await run(executable,['--probe',file,String(address.port)],{timeout:5000});
  const probe=JSON.parse(stdout);
  assert.equal(probe.osIsolation,'linux-bwrap-seccomp-v1');
  assert.equal(probe.fileDenied,true);
  assert.equal(probe.networkDenied,true);
  assert.equal(probe.networkConnected,false);
  await assert.rejects(run(executable,['--worker'],{timeout:5000}),{stderr:/outside the qualified Linux OS sandbox/});

  await writeFile(bundleFile,`
   let calls=0;
   globalThis.__frameweaveNativeHost.register(async()=>{
    await Promise.resolve();
    return {calls:++calls,process:typeof process,require:typeof Reflect.get(globalThis,'require'),fetch:typeof fetch,
     wasm:typeof WebAssembly==='object'&&WebAssembly.validate(Uint8Array.of(0,97,115,109,1,0,0,0)),
     bytes:Uint8Array.of(1,127,255)};
   });
  `);
  const init={bundleFile,executable,timeoutMs:5000,stageId:'linux-sandbox-test'};
  for(const allowWasm of [false,true]){
   const host=await SpiderMonkeyTransport.create({...init,allowWasm});
   try{
    for(const calls of [1,2])assert.deepEqual(await host.call('inspect',null),{
     calls,process:'undefined',require:'undefined',fetch:'undefined',wasm:allowWasm,bytes:Uint8Array.of(1,127,255),
    });
   }finally{await host.close();}
  }
 }finally{
  await new Promise<void>(ready=>server.close(()=>ready()));
  await rm(directory,{recursive:true,force:true});
 }
});
