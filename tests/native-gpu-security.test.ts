import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Renderer} from '../src/render/renderer.ts';
import {buildProject} from '../src/compiler/build.ts';
test('native JS control host retains default WASM denial, explicit permission, eval/network denial and opaque isolation',async()=>{
 const base=resolve('.frameweave/ns');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'s-'));process.env.FRAMEWEAVE_HOME=join(dir,'home');
 const file=join(dir,'project.tsx');await copyFile(resolve('examples/wasm-grayscale/assets/grayscale.wasm'),join(dir,'rust.wasm'));
 await writeFile(file,`import {Composition,Stage,Layer,Resource,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {linear709} from '@frameweave/engine/native';
 export const scene=defineNativeStage(async init=>{
  let evalDenied=false,parentDenied=false,netDenied=false;
  try{(0,eval)('1+1');}catch{evalDenied=true;}
  try{void parent.document.body;}catch{parentDenied=true;}
  try{await fetch('https://undeclared.invalid/secret');}catch{netDenied=true;}
  if(!evalDenied||!parentDenied||!netDenied)throw Error('ISOLATION_REGRESSION');
  const bytes=await (await fetch(init.resources.wasm)).arrayBuffer(),wasm=await WebAssembly.instantiate(bytes,{}),api=wasm.instance.exports as any;
  if(api.fw_abi_version()!==1)throw Error('ABI');const pointer=api.fw_alloc(4);new Uint8Array(api.memory.buffer,pointer,4).set([255,0,0,255]);
  if(api.fw_grayscale(pointer,4)!==0||new Uint8Array(api.memory.buffer,pointer,4)[0]!==77)throw Error('RUST_RESULT');
  api.fw_release(pointer);if(api.fw_live_allocations()!==0)throw Error('WASM_LEAK');
  const k=await init.gpu.compile({abiVersion:1,id:'test/security',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(0.,1.,0.,1.);}'});
  return {renderAt(){return init.gpu.run(k,[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}});}};
 });export default <Composition width={8} height={4} fps={24} durationInFrames={2}><Resource id="wasm" src="./rust.wasm" kind="file"/><Stage id="logic" factory={scene}/><Layer source={ref('logic')}/></Composition>;`);
 const build=await buildProject(file),nativeGpu={executable:resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe'),dynamic:'interactive' as const};
 await assert.rejects(Renderer.create(build,{nativeGpu}),e=>/wasm|WebAssembly|Content Security Policy/i.test(String(e)));
 const renderer=await Renderer.create(build,{nativeGpu,allowWasm:true});try{const t=await renderer.submitNativeFrame(0);await t.completed;assert.equal((await renderer.nativeStats()).imageReadbacks,0);}finally{await renderer.close();}
});
