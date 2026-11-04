import assert from 'node:assert/strict';
import {mkdir,copyFile,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {exportProject} from '../src/compiler/export.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
import {runtimePin} from '../src/compiler/runtime-lock.ts';

const base=resolve('artifacts/main-editing-round1');await mkdir(base,{recursive:true});
const out=join(base,'portable-'+Date.now());await mkdir(out);
const origin=join(out,'origin'),hidden=join(out,'origin-hidden');
for(const target of [origin,hidden])assert.equal(dirname(resolve(target)),out);
await mkdir(origin);
for(const name of ['footage.mp4','badge.png'])await copyFile(join('modules/editing/examples',name),join(origin,name));
const entry=join(origin,'project.tsx');await copyFile('modules/editing/examples/cuts.tsx',entry);
const rows:any[]=[],result={ok:false,runtimePin,out,rows};
async function frame(file:string){const build=await buildProject(file),renderer=await Renderer.create(build,{nativeGpu:{executable:process.env.FRAMEWEAVE_NATIVE_GPU!,readback:'final-surface',slots:1}});try{const pixels=pixelsFromSurface(await renderer.renderNativeSurface(12));return createHash('sha256').update(Buffer.from(pixels.buffer,pixels.byteOffset,pixels.byteLength)).digest('hex');}finally{await renderer.close()}}
const hash=await frame(entry),targets=[];
try{
 for(const mode of ['directory','capsule','flat'] as const){
  const output=join(out,mode==='directory'?'carried':mode+'.tsx');
  const report=await exportProject(entry,{output,...mode==='directory'?{}:{singleFile:true,...mode==='capsule'?{layout:'capsule' as const}:{}}});
  targets.push({mode,file:report.entry,report});
 }
 await rename(origin,hidden);
 for(const target of targets){const actual=await frame(target.file);assert.equal(actual,hash,target.mode+' frame differs');rows.push({mode:target.mode,entry:target.file,sha256:actual,originalUnavailable:true});console.log('PASS',target.mode);}
 result.ok=true;
}finally{
 try{await rename(hidden,origin)}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await writeFile(join(base,'portable.json'),JSON.stringify(result,null,2)+'\n');
}
