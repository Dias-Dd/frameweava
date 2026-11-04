import assert from 'node:assert/strict';
import {cp,mkdir,mkdtemp,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer,VideoEncoder,probeVideo} from '../src/node.ts';
await mkdir(join(engineRoot,'artifacts/integration-agent-1-2'),{recursive:true});
const directory=await mkdtemp(join(engineRoot,'artifacts/integration-agent-1-2/wasm-export-'));
const source=join(directory,'source'),hidden=join(directory,'source-unavailable');
await cp(join(engineRoot,'examples/wasm-grayscale'),source,{recursive:true});
const flat=await exportProject(join(source,'project.tsx'),{singleFile:true,output:join(directory,'Standalone.tsx')});
const carried=await exportProject(join(source,'project.tsx'),{output:join(directory,'carried')});
const capsule=await exportProject(join(source,'project.tsx'),{singleFile:true,layout:'capsule',output:join(directory,'Capsule.tsx')});
const repeated=await exportProject(flat.entry,{singleFile:true,output:join(directory,'Repeated.tsx')});
assert.deepEqual(await readFile(flat.entry),await readFile(repeated.entry));
const hashes=new Map(),mp4=join(directory,'WASM.mp4');
let encoder=await VideoEncoder.create(mp4,{num:12,den:1},128,64);
const digest=data=>createHash('sha256').update(data).digest('hex');
async function render(entry,label,original=false){
 const renderer=await Renderer.create(await buildProject(entry),{allowWasm:true,cache:false});
 try {for(const frame of [...Array(24).keys(),12,0,23,12]){
  const result=await renderer.renderFrame(frame);assert.deepEqual(result.diagnostics,[]);
  const rgba=await sharp(result.png).ensureAlpha().raw().toBuffer();
  const hash=digest(rgba);
  if(original){if(!hashes.has(frame)){hashes.set(frame,hash);await encoder.write(result.png);}else assert.equal(hash,hashes.get(frame));}
  else assert.equal(hash,hashes.get(frame),`${label} frame ${frame}`);
  if(frame===12)await writeFile(join(directory,label+'-frame-12.png'),result.png);
 }}finally{await renderer.close();}
}
try{await render(join(source,'project.tsx'),'original',true);await encoder.finish();}catch(error){await encoder.abort();throw error;}finally{encoder=undefined;}
const rel=relative(directory,source);assert.ok(rel&&!isAbsolute(rel)&&!rel.startsWith('..'));
await rename(source,hidden);
try {
 await render(flat.entry,'flat');await render(capsule.entry,'capsule');await render(carried.entry,'carried');
 const denied=await Renderer.create(await buildProject(flat.entry),{cache:false});
 try{await assert.rejects(()=>denied.renderFrame(0),/WebAssembly|WASM/);}finally{await denied.close();}
}finally{await rename(hidden,source);}
const proof={passed:true,framesComparedPerExport:24,outOfOrder:[12,0,23,12],rawRGBAZeroTolerance:true,originalSourceUnavailableDuringExportRenders:true,reexportByteIdentical:true,defaultWasmStillDenied:true,flat:flat.entry,capsule:capsule.entry,carried:carried.entry,mp4,metadata:await probeVideo(mp4)};
await writeFile(join(directory,'verification.json'),JSON.stringify(proof,null,2));
await writeFile(join(engineRoot,'artifacts/integration-agent-1-2/wasm-export-result.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof,null,2));
