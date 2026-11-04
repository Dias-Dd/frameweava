import test from 'node:test';
import assert from 'node:assert/strict';
import {residentLayout} from '../modules/native-gpu/memory.ts';
import type {NativeProgram} from '../modules/native-gpu/client.ts';
import {linear709} from '../src/media/surface.ts';
const image={width:8,height:4,format:'rgba32float',alpha:'opaque',color:linear709};
test('imported images cannot alias a pass0 output even when imported bytes are never sampled',()=>{
 const program:NativeProgram={version:2,session:'0'.repeat(64),slots:1,maxBytes:1048576,images:[image,image,image],imports:[{image:0,file:'first.f32',source:'declared-resource'},{image:1,file:'second.f32',source:'declared-resource'}],passes:[{kernel:0,inputs:[1],output:2,header:[]}],kernels:[],display:null};
 const mapping=residentLayout(program).mapping;assert.equal(new Set(mapping).size,3);
});
test('unused descriptors cannot shorten a retained allocation lifetime',()=>{
 const program:NativeProgram={version:2,session:'0'.repeat(64),slots:1,maxBytes:1048576,images:[image,image,image],passes:[{kernel:0,inputs:[],output:0,header:[]},{kernel:0,inputs:[0],output:2,header:[]}],kernels:[],display:null};
 const mapping=residentLayout(program).mapping;assert.notEqual(mapping[0],mapping[2]);
});
