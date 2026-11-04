import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,join} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';

test('actual time-effect TSX executes via native GPU/SM, finite HDR and random-order frames',{timeout:120000},async()=>{
 const directory=resolve('.frameweave/pa3-native-time/stage');await mkdir(directory,{recursive:true});
 process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_JS_HOST='spidermonkey';process.env.FRAMEWEAVE_SPIDERMONKEY??=resolve('outputs/main-deliveries/all-frozen-20261101/spidermonkey/frameweave-spidermonkey-host.exe');
 const proof:object[]=[];for(const entry of ['project.tsx','half.tsx']){
  const start=performance.now(),build=await buildProject(resolve('modules/pro-animation/validation/native-time-scene',entry)),buildMs=performance.now()-start;
  const renderer=await Renderer.create(build,{nativeGpu:{executable:resolve(process.env.FRAMEWEAVE_NATIVE_GPU??'outputs/main-deliveries/all-frozen-20261101/native-release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
  try{const frozen=new Map<string,string>();for(const frame of [11,0,23,11]){
   const begin=performance.now(),ticket=await renderer.submitNativeFrame(frame);await ticket.completed;
   for(const stage of ['exact','echo','shutter','wide']){
    const value=await renderer.exportNativeBuffer(ticket,stage+'/pixels');assert.ok(value.values instanceof Float32Array);assert.equal(value.values.length,320*180*4);const p=value.values;
    assert.ok(p.every(Number.isFinite));assert.ok(p.every((v,i)=>i%4!==3||v>=0&&v<=1));
    if(frame===11){assert.ok(p.some((v,i)=>i%4!==3&&v>1),stage+' HDR');assert.ok(p.some((v,i)=>i%4!==3&&v<0),stage+' signed');await writeFile(join(directory,entry+'.'+stage+'.f32'),new Uint8Array(p.buffer,p.byteOffset,p.byteLength));}
    const hash=createHash('sha256').update(new Uint8Array(p.buffer,p.byteOffset,p.byteLength)).digest('hex'),key=stage+':'+frame;if(frozen.has(key))assert.equal(hash,frozen.get(key));frozen.set(key,hash);proof.push({entry,stage,frame,hash,wallMs:performance.now()-begin});
   }
  }
  const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.webBridge.enabled,false);assert.equal(stats.imageReadbacks,0);proof.push({entry,buildMs,stats});
  }finally{await renderer.close();}
 }
 await writeFile(join(directory,'result.json'),JSON.stringify({version:1,proof,scope:'Actual whole source->retime/echo/shutter/wide->Glow->Layer chain; explicit public inspection after GPU completion'},null,2));
});
