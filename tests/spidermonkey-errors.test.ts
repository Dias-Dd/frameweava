import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {encodeHostException} from '../modules/spidermonkey-host/error-wire.ts';
import {decodeHostValue} from '../modules/spidermonkey-host/codec.ts';
import {SpiderMonkeyTransport} from '../modules/spidermonkey-host/transport.ts';
import {EngineError} from '../src/core/errors.ts';

test('exception envelopes preserve falsy data and safely reject cyclic/accessor/opaque diagnostics',()=>{
 for(const details of [null,false,0,'',[],[0,-0,false,null,''],{cause:{code:'E_CAUSE'},nested:[1,2]},Uint8Array.of(0,255)]){
  const error=new EngineError('E_TYPED','typed',{details,frame:0,hint:''}),wire=decodeHostValue(encodeHostException(1,error,65536)) as any;
  assert.deepEqual(wire.error.details,details);assert.equal(wire.error.frame,0);assert.equal(wire.error.hint,'');assert.equal(wire.error.code,'E_TYPED');
 }
 const legacy=new Error('legacy ordinary');assert.equal((decodeHostValue(encodeHostException(1,legacy,65536)) as any).error.details,legacy.stack);
 let called=0;const getter={get secret(){called++;throw Error('must not call');}},array:unknown[]=[];
 Object.defineProperty(array,'0',{enumerable:true,get(){called++;throw Error('must not call');}});
 const cycle:any={};cycle.self=cycle;
 for(const details of [getter,array,cycle,new Date(),()=>{},NaN,1n,'x'.repeat(100000)]){
  const error=new EngineError('E_TYPED','typed',{details}),wire=decodeHostValue(encodeHostException(1,error,65536)) as any;
  assert.equal(wire.error.code,'E_TYPED');assert.equal(wire.error.message,'typed');assert.equal(typeof wire.error.details,'string');
 }
 assert.equal(called,0);
 const bad=new Proxy({},{getOwnPropertyDescriptor(){throw Error('inspect failure');}});
 assert.equal((decodeHostValue(encodeHostException(1,bad,65536)) as any).error.code,'E_NATIVE_LOGIC');
});

test('real SpiderMonkey errors round-trip through transport with authorized identity and legacy fallback',{
 skip:process.env.FRAMEWEAVE_SPIDERMONKEY?false:'Reviewed SpiderMonkey executable required',
},async()=>{
 const parent=resolve('.frameweave/sm-error-tests');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'roundtrip-')),bundleFile=join(directory,'stage.ts');
 await writeFile(bundleFile,`
let accessed=0;
(globalThis as any).__frameweaveNativeHost.register(async(_method:string,p:any)=>{
 if(p.kind==='ok')return {ok:true,accessed};
 if(p.kind==='ordinary')throw Error('legacy ordinary');
 if(p.kind==='node-global')return (globalThis as any).process.env;
 let details=p.value;
 if(p.kind==='cycle'){details={};details.self=details;}
 if(p.kind==='getter')details={get secret(){accessed++;throw Error('getter invoked');}};
 if(p.kind==='array-getter'){details=[];Object.defineProperty(details,'0',{get(){accessed++;throw Error('array getter invoked');},enumerable:true});}
 if(p.kind==='opaque')details=new Date();
 if(p.kind==='oversized')details='x'.repeat(200000);
 if(p.kind==='bad-fields')throw Object.defineProperties({},{code:{get(){accessed++;throw Error('code getter');}},message:{get(){accessed++;throw Error('message getter');}},details:{get(){accessed++;throw Error('details getter');}}});
 throw Object.assign(Error('typed transport failure'),{code:p.code??'E_TYPED',details,frame:0,hint:'',stageId:'spoofed'});
});`);
 const transport=await SpiderMonkeyTransport.create({bundleFile,timeoutMs:10000,stageId:'authorized-stage',maxMessageBytes:65536,maxMemoryBytes:128*1024**2});
 try{
  for(const value of [null,false,0,'',[],[0,-0,false,null,''],{cause:{code:'E_SOURCE',message:'upstream'},values:[1,2]},Uint8Array.of(0,255)]){
   await assert.rejects(transport.call('probe',{kind:'value',value}),error=>{
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_TYPED');assert.deepEqual(error.details,value);assert.equal(error.frame,0);assert.equal(error.hint,'');assert.equal(error.stageId,'authorized-stage');return true;
   });
  }
  for(const code of ['E_RENDER_CANCELLED','E_NATIVE_RAY_PERMISSION','E_NATIVE_BUDGET'])await assert.rejects(transport.call('probe',{kind:'value',code,value:{cause:{code:'E_INPUT'},required:12}}),error=>{
   assert.ok(error instanceof EngineError);assert.equal(error.code,code);assert.deepEqual(error.details,{cause:{code:'E_INPUT'},required:12});return true;
  });
  for(const kind of ['ordinary','value'])await assert.rejects(transport.call('probe',{kind}),error=>{assert.ok(error instanceof EngineError);assert.ok(typeof error.details==='string');assert.ok(error.details.length>0,'Missing/undefined details retain native stack fallback');return true;});
  for(const kind of ['cycle','getter','array-getter','opaque','oversized','bad-fields']){
   await assert.rejects(transport.call('probe',{kind}),error=>{assert.ok(error instanceof EngineError);assert.equal(error.code,kind==='bad-fields'?'E_NATIVE_LOGIC':'E_TYPED');assert.equal(typeof error.details,'string');return true;});
   assert.deepEqual(await transport.call('probe',{kind:'ok'}),{ok:true,accessed:0});
  }
 }finally{await transport.close();await transport.close();}
});
