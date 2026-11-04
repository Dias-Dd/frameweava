import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {hostTextDecoder} from '../modules/spidermonkey-host/text-decoder.ts';
import {spiderMonkeyTransport} from '../modules/spidermonkey-host/transport.ts';
import {encodeHostValue,decodeHostValue} from '../modules/spidermonkey-host/codec.ts';
const Decoder=hostTextDecoder((bytes,fatal)=>new TextDecoder('utf-8',{fatal,ignoreBOM:true}).decode(bytes));

test('transport string payload preserves a leading BOM as data',()=>{
 assert.equal(decodeHostValue(encodeHostValue('\ufeffkeep')),'\ufeffkeep');
});

test('optional empty decode, buffer-source byte windows and decoder options',()=>{
 const d=new Decoder();assert.equal(d.decode(),'');assert.equal(d.decode(undefined),'');
 const data=Uint8Array.of(0,65,66,0);for(const view of [data.subarray(1,3),new DataView(data.buffer,1,2),new Uint16Array(data.buffer,0,2)])assert.equal(d.decode(view),new TextDecoder().decode(view));
 assert.equal(d.decode(data.buffer),'\0AB\0');assert.equal(d.encoding,'utf-8');assert.equal(d.fatal,false);assert.equal(d.ignoreBOM,false);
 for(const value of [null,1,'abc',{},[],()=>{}])assert.throws(()=>d.decode(value),TypeError);
 assert.throws(()=>new Decoder('windows-1252'),RangeError);assert.throws(()=>new Decoder(Symbol()),TypeError);
 assert.throws(()=>d.decode(undefined,1),TypeError);assert.equal(d.decode(undefined,null),'');
});
test('UTF-8 scalar and malformed sequences match platform replacement and fatal behavior',()=>{
 const values=[...Array.from({length:256},(_,i)=>Uint8Array.of(i)),new TextEncoder().encode('帧\0🕷️'),Uint8Array.of(0xe0,0x80,0x80),Uint8Array.of(0xed,0xa0,0x80),Uint8Array.of(0xf4,0x90,0x80,0x80),Uint8Array.of(0xf0,0x90,0x41),Uint8Array.of(0xc2,0x41),Uint8Array.of(0xef,0xbb,0xbf,65)];
 for(const bytes of values)for(const fatal of [false,true]){
  const expected=new TextDecoder('utf-8',{fatal});let result:string|undefined;
  try{result=expected.decode(bytes);}catch{assert.throws(()=>new Decoder('utf-8',{fatal}).decode(bytes),TypeError);continue;}
  assert.equal(new Decoder('utf-8',{fatal}).decode(bytes),result);
 }
});
test('streamed split scalars, BOM, invalid bytes and empty flush match platform decoder',()=>{
 const values=[new TextEncoder().encode('\ufeff帧🕷️'),Uint8Array.of(0xe0,0x80,65,0xf0,0x9f),Uint8Array.of(0xf0,0x9f,0x98,0x80,0xef,0xbb,0xbf),Uint8Array.of(0xed,0xa0,0x80,65)];
 for(const bytes of values)for(let split=0;split<=bytes.length;split++)for(const ignoreBOM of [false,true]){
  const actual=new Decoder('utf-8',{ignoreBOM}),expected=new TextDecoder('utf-8',{ignoreBOM});
  assert.equal(actual.decode(bytes.subarray(0,split),{stream:true}),expected.decode(bytes.subarray(0,split),{stream:true}));
  assert.equal(actual.decode(bytes.subarray(split),{stream:true}),expected.decode(bytes.subarray(split),{stream:true}));
  assert.equal(actual.decode(),expected.decode());
  assert.equal(actual.decode(Uint8Array.of(0xef,0xbb,0xbf,66)),expected.decode(Uint8Array.of(0xef,0xbb,0xbf,66)));
 }
});
test('fatal streaming flush is catchable and a later independent decode recovers',()=>{
 const d=new Decoder('utf-8',{fatal:true});assert.equal(d.decode(Uint8Array.of(0xf0,0x9f),{stream:true}),'');
 assert.throws(()=>d.decode(),TypeError);assert.equal(d.decode(Uint8Array.of(65)),'A');
 assert.throws(()=>d.decode(Uint8Array.of(255)),TypeError);assert.equal(d.decode(),'');
});
test('each UTF-8 label supports bindgen empty priming and retains explicitly ignored BOM',()=>{
 for(const label of ['utf-8','utf8','unicode-1-1-utf-8','unicode11utf8','unicode20utf8','x-unicode20utf8',' UTF-8\t']){
  const d=new Decoder(label,{fatal:true,ignoreBOM:true});assert.equal(d.decode(),'');assert.equal(d.decode(Uint8Array.of(0xef,0xbb,0xbf,65)),'\ufeffA');
 }
});
test('real isolated SpiderMonkey returns empty decode and catchable errors with unchanged WASM permissions',{skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'frameweave-decode-')),entry=join(dir,'stage.mjs');
 await writeFile(entry,`globalThis.__frameweaveNativeHost.register(async(method)=>{
  if(method==='bad')return new TextDecoder().decode(123);
  if(method==='probe'){
   const d=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true});const empty=d.decode();let fatal='',bad='';
   try{d.decode(Uint8Array.of(255));}catch(e){fatal=e.name;}
   try{d.decode({});}catch(e){bad=e.name;}
   const bytes=Uint8Array.of(0,65,66,0),stream=new TextDecoder();
   const first=stream.decode(Uint8Array.of(0xf0,0x9f),{stream:true}),second=stream.decode(Uint8Array.of(0x98,0x80));
   let wasm=null;if(typeof WebAssembly!=='undefined')wasm=new WebAssembly.Instance(new WebAssembly.Module(Uint8Array.of(0,97,115,109,1,0,0,0,1,5,1,96,0,1,127,3,2,1,0,7,10,1,6,97,110,115,119,101,114,0,0,10,6,1,4,0,65,42,11))).exports.answer();
   return {empty,fatal,bad,replacement:new TextDecoder().decode(Uint8Array.of(255)),window:d.decode(new DataView(bytes.buffer,1,2)),first,second,bomText:'\ufeffkeep',wasm,process:typeof process,fetch:typeof fetch};
  }return 'alive';
 });`);
 try{for(const allowWasm of [false,true]){
  const host=await spiderMonkeyTransport({bundleFile:entry,timeoutMs:15000,stageId:'decoder',allowWasm});
  try{
   assert.deepEqual(await host.call('probe',{}),{empty:'',fatal:'TypeError',bad:'TypeError',replacement:'\ufffd',window:'AB',first:'',second:'😀',bomText:'\ufeffkeep',wasm:allowWasm?42:null,process:'undefined',fetch:'undefined'});
   await assert.rejects(host.call('bad',{}),/ArrayBuffer/);assert.equal(await host.call('alive',{}),'alive');
  }finally{await host.close();}
 }}finally{await rm(dir,{recursive:true,force:true});}
});
