import assert from 'node:assert/strict';
import {register} from 'node:module';
import {dirname,join,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFile,readFile} from 'node:fs/promises';
const consumerRoot=dirname(fileURLToPath(import.meta.url)),resolutionLog=join(consumerRoot,'runtime-resolution.jsonl');
register('./isolation-loader.mjs',import.meta.url,{data:{consumerRoot,resolutionLog}});
const guarded=['document','navigator','window','HTMLCanvasElement','OffscreenCanvas','ImageBitmap','GPU','GPUDevice','GPUBuffer','GPUBufferUsage','GPUMapMode','GPUShaderStage'];
const prior=new Map(),touches=[];let result={ok:false,consumerRoot,guarded};
try{
  for(const name of guarded){prior.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,get(){touches.push(name);throw new Error('UNEXPECTED_DOM_OR_GPU_ACCESS: '+name);}});}
  const entry=import.meta.resolve('@frameweave/engine/native'),api=await import('@frameweave/engine/native');
  const actual=fileURLToPath(entry),r=relative(join(consumerRoot,'node_modules'),actual);
  assert.ok(r!=='..'&&!r.startsWith('..\\')&&!r.startsWith('../')&&!isAbsolute(r));
  assert.equal(typeof api.createGpuEffectChain,'function');assert.equal(typeof api.surfaceFromPixels,'function');assert.equal(touches.length,0);
  result={...result,ok:true,node:process.version,entry,createGpuEffectChainType:typeof api.createGpuEffectChain,noDomOrGpuAccess:true,touches,resolutions:(await readFile(resolutionLog,'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line))};
}catch(error){result={...result,error:{message:String(error?.message??error),stack:String(error?.stack??'')},touches};process.exitCode=1;}
finally{for(const [name,descriptor]of prior){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}await writeFile(join(consumerRoot,'node-import-results.json'),JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify({ok:result.ok,entry:result.entry,noDomOrGpuAccess:result.noDomOrGpuAccess??false,error:result.error?.message??null}));
