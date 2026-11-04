import test from 'node:test';import assert from 'node:assert/strict';import {resolve,join} from 'node:path';import {randomBytes,createHash} from 'node:crypto';import {readFile,writeFile,mkdir,mkdtemp,rm,readdir,copyFile} from 'node:fs/promises';
import {NativeGpuClient,type NativeProgram} from '../modules/native-gpu/client.ts';import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';import {NativeResourceImages} from '../modules/native-gpu/resource-images.ts';import {inferenceFixture} from '../modules/inference/validation/fixture.ts';const {createSuperResolution,superResolution}=await inferenceFixture();import {buildProject} from '../src/compiler/build.ts';
const requireSeparator=()=>process.platform==='win32'?'\\':'/';
const root=resolve('.frameweave/inference'),native=resolve('.frameweave/native-target/debug/frameweave-native-gpu.exe');
async function recording(){const scope=new NativeRecordingScope(),effect=await createSuperResolution(scope.api);scope.sealInitialization();scope.beginFrame();scope.publish(await effect.render(0));const {parameters,external:_e,output:_o,kernelOffset:_k,moduleOffset:_m,resourceImages:_r,...packet}=scope.packet();return{scope,effect,parameters,program:{...packet,version:2 as const,session:randomBytes(32).toString('hex'),slots:1,maxBytes:128*1024**2,display:null} as NativeProgram};}
function environment(){process.env.FRAMEWEAVE_HOME=resolve('.frameweave/user-home');process.env.FRAMEWEAVE_INFERENCE_RUNTIME=join(root,'runtime');}
test('sealed resources: missing declarations, identity changes, cancellation and model budget fail before native initialization',async()=>{
 environment();const build=await buildProject(resolve('examples/native-inference/project.tsx')),lease=await NativeResourceImages.create(build);try{
  await assert.rejects(lease.model({...superResolution,model:{...superResolution.model,resource:'missing'}},1024**2),{code:'E_INFERENCE_MODEL_UNDECLARED'});
  await assert.rejects(lease.model({...superResolution,model:{...superResolution.model,sha256:'0'.repeat(64)}},1024**2),{code:'E_INFERENCE_MODEL_INTEGRITY'});
  await assert.rejects(lease.model(superResolution,1),{code:'E_INFERENCE_MODEL_BUDGET'});const cancel=new AbortController();cancel.abort();await assert.rejects(lease.model(superResolution,1024**2,cancel.signal),{code:'E_INFERENCE_CANCELLED'});
 }finally{await lease.close();}
});
test('private native admission rejects Unicode lease names, tensor mismatches and unsupported ABI without process panics',async()=>{
 environment();const p=await recording();try{for(const mutate of [(v:NativeProgram)=>{v.inferences![0].version=2 as 1;},(v:NativeProgram)=>{v.inferences![0].file='中'.repeat(16)+'.onnx';},(v:NativeProgram)=>{v.data![1].length=2;}]){const program=structuredClone(p.program);program.resourceLease={version:1,directory:root};program.inferences=[{...superResolution,file:'0'.repeat(48)+'.onnx'}];mutate(program);await assert.rejects(NativeGpuClient.create(program,{executable:native,timeoutMs:5000}),e=>!!(e as any).code&&!/panic/.test(String(e)));}}finally{await p.effect.dispose();await p.scope.api.dispose();}
});
test('real native failures: malformed/missing/changed model, unavailable explicit provider and runtime tampering release the owner',async()=>{
 environment();const p=await recording(),dir=await mkdtemp(join(root,'bad-')),name='0'.repeat(48)+'.onnx',bytes=Buffer.from('invalid ONNX'),hash=createHash('sha256').update(bytes).digest('hex');await writeFile(join(dir,name),bytes);
 try{for(const [label,model,execution,file,code]of [
  ['invalid',{...superResolution.model,sha256:hash,bytes:bytes.length},superResolution.execution,name,'E_INFERENCE_EXECUTION'],
  ['missing',superResolution.model,superResolution.execution,'1'.repeat(48)+'.onnx','E_INFERENCE_MODEL_IO'],
  ['changed',{...superResolution.model,bytes:bytes.length},superResolution.execution,name,'E_INFERENCE_MODEL_INTEGRITY'],
  ['provider',superResolution.model,{...superResolution.execution,provider:'cuda' as const},name,'E_INFERENCE_PROVIDER_UNAVAILABLE']
 ] as const){const program:NativeProgram={...p.program,inferences:[{...superResolution,model,execution,file}],resourceLease:{version:1,directory:dir}},client=await NativeGpuClient.create(program,{executable:native,timeoutMs:5000});try{await assert.rejects(client.submit(0,p.parameters),{code});}finally{await client.close();await client.close();}console.log(JSON.stringify({case:'inference-negative',label,code}));}
  assert.deepEqual((await readdir(dir)).filter(f=>f.endsWith('.json')),[]);
  const corrupt=await mkdtemp(join(root,'runtime-bad-')),receipt=JSON.parse(await readFile(join(root,'runtime/inference-runtime.json'),'utf8'));const dll=await readFile(join(root,'runtime/DirectML.dll'));dll[0]^=1;await writeFile(join(corrupt,'DirectML.dll'),dll);await writeFile(join(corrupt,'inference-runtime.json'),JSON.stringify(receipt));process.env.FRAMEWEAVE_INFERENCE_RUNTIME=corrupt;const plain={...p.program,inferences:[],passes:p.program.passes.filter(pass=>pass.inference===undefined)},client=await NativeGpuClient.create(plain,{executable:native,timeoutMs:5000});try{await assert.rejects(client.inferenceCapabilities(),{code:'E_INFERENCE_RUNTIME_INTEGRITY'});assert.equal((await client.stats()).inference.status,'not-probed');}finally{await client.close();process.env.FRAMEWEAVE_INFERENCE_RUNTIME=join(root,'runtime');}
 }finally{await p.effect.dispose();await p.scope.api.dispose();assert.ok(resolve(dir).startsWith(root+requireSeparator()));await rm(dir,{recursive:true});}
});
