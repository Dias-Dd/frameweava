import test from'node:test';import assert from'node:assert/strict';import{restoreNativeDataSeeds}from'../modules/native-gpu/data-seeds.ts';import type{NativeProgram}from'../modules/native-gpu/client.ts';
type Data=NonNullable<NativeProgram['data']>[number];const seed=(n:number):Data=>({length:n,type:'u32',initial:[],immutable:true});const omit=(d:Data)=>({...d,initial:[],seedOmitted:true});
test('initial/persistent seeds remain fixed, while identical indices may name new frame-local immutable seeds',()=>{
 const initial=new Map<number,Data>(),s={...seed(1),initial:[77]},p:Data={length:1,type:'f32',initial:[0],immutable:false,persistent:{version:1,id:'memory'}};
 let frame=new Map<number,Data>();const first=restoreNativeDataSeeds([s,p,seed(8)],2,initial,frame);assert.equal(initial.size,2);assert.equal(frame.size,1);const next=restoreNativeDataSeeds([omit(s),omit(p),omit(seed(8))],2,initial,frame);assert.equal(next[0],first[0]);assert.equal(next[1],first[1]);assert.equal(next[2],first[2]);
 frame=new Map();const changed=restoreNativeDataSeeds([omit(s),omit(p),seed(16)],2,initial,frame);assert.equal(changed[2].length,16);assert.equal(initial.size,2);assert.equal(frame.size,1);assert.throws(()=>restoreNativeDataSeeds([omit(s),omit(p),omit(seed(8))],2,initial,new Map()),{code:'E_NATIVE_PROTOCOL'});
});
test('seed omission cannot smuggle replacement data, shape, type, lifetime, state identity or private file permissions',()=>{
 const initial=new Map<number,Data>(),frame=new Map<number,Data>(),value={...seed(1),initial:[3]};restoreNativeDataSeeds([value,seed(2)],1,initial,frame);
 for(const corrupt of[{...omit(value),length:2},{...omit(value),type:'f32' as const},{...omit(value),initial:[99]},{...omit(value),immutable:false},{...omit(value),persistent:{version:1 as const,id:'foreign'}}])assert.throws(()=>restoreNativeDataSeeds([corrupt,omit(seed(2))],1,initial,frame),{code:'E_NATIVE_PROTOCOL'});
 assert.throws(()=>restoreNativeDataSeeds([{...value,initial:[9]}],1,initial,new Map()),{code:'E_NATIVE_PROTOCOL'});assert.throws(()=>restoreNativeDataSeeds([value],2,new Map(),new Map()),{code:'E_NATIVE_PROTOCOL'});assert.throws(()=>restoreNativeDataSeeds([{length:1,type:'f32',initial:[],persistent:{version:1,id:'late'}}],0,new Map(),new Map()),{code:'E_NATIVE_PROTOCOL'});
 assert.throws(()=>restoreNativeDataSeeds([{...seed(1),sourceResource:{version:1,profile:'raw-bytes-v1',file:'unowned.bytes',bytes:4,byteOffset:0,byteLength:4}}],0,new Map(),new Map()),{code:'E_NATIVE_BINARY_PERMISSION'});
});
test('legacy initialization-only packets preserve the previous immutable seed contract',()=>{
 const cache=new Map<number,Data>(),value=seed(2);restoreNativeDataSeeds([value],undefined,cache,new Map());assert.equal(restoreNativeDataSeeds([omit(value)],undefined,cache,new Map())[0],cache.get(0));assert.throws(()=>restoreNativeDataSeeds([seed(3)],undefined,cache,new Map()),{code:'E_NATIVE_PROTOCOL'});
});
