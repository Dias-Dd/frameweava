import {test,before} from 'node:test';import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,copyFile,readFile,cp,rename} from 'node:fs/promises';import {join,resolve} from 'node:path';import {performance} from 'node:perf_hooks';
import {buildProAnimation} from '../modules/pro-animation/scripts/build-package.ts';import {buildGraphicsPackage} from '../modules/graphics-contracts/scripts/build-package.ts';import {packagesCLI} from '../src/packages/cli.ts';import {verifyPackages,installedPackages} from '../src/packages/manager.ts';import {writeLock} from '../src/plugins/registry.ts';
import {buildProject} from '../src/compiler/build.ts';import {Renderer} from '../src/render/renderer.ts';import {exportProject,type ExportOptions} from '../src/compiler/export.ts';import {pixelsFromSurface,acescg,srgb,type ProfessionalSurface} from '../src/media/surface.ts';import {mediaPreview} from '../src/media/node.ts';
const root=resolve('.'),base=join(root,'.frameweave/pa1'),policy={workingColor:acescg,transport:'buffer-v1' as const,preview:{color:srgb,clip:true}};let dir:string,entry:string,catalog:string;
before(async()=>{await mkdir(base,{recursive:true});dir=await mkdtemp(join(base,'professional-'));entry=join(dir,'project.tsx');await copyFile(join(root,'examples/pro-animation/professional.tsx'),entry);await cp(join(root,'examples/pro-animation/professional'),join(dir,'professional'),{recursive:true});catalog=await mkdtemp(join(root,'.frameweave/pa0/catalog-pa1-'));await buildProAnimation(join(catalog,'pro-animation'));const gp=join(root,'.frameweave/graphics-distribution-tests');await mkdir(gp,{recursive:true});const g=await mkdtemp(join(gp,'pa1-'));await buildGraphicsPackage(join(g,'graphics'));await cp(join(g,'graphics'),join(catalog,'graphics'),{recursive:true});
 await packagesCLI(['install','pro-animation','--catalog',catalog,'--project',dir,'--trust','local:frameweave.pro','--trust','local:frameweave.foundation']);await writeLock(dir);
});
test('installed named float functions: real Web Stage, signed HDR, text/path coverage, Signal, random time and cross-Stage ports',{timeout:120000},async()=>{
 assert.equal((await verifyPackages(dir)).valid,true);const t=performance.now(),built=await buildProject(entry),buildMs=performance.now()-t;assert.ok(built.manifest.stages.every(s=>s.engine==='web'));const r=await Renderer.create(built,{cache:false,media:policy}),seen=new Map<number,Float32Array>(),timings=[];
 try{for(const frame of [4,4,0,8,2,8,0]){const t=performance.now(),out=await r.renderMediaFrame(frame),p=pixelsFromSurface(out.surface);timings.push({frame,ms:performance.now()-t});if(seen.has(frame))assert.deepEqual(p,seen.get(frame));seen.set(frame,p);assert.ok(p.some(v=>v>1));const original=out.stageOutputs.art.surface as ProfessionalSurface,carried=out.stageOutputs.carried.surface as ProfessionalSurface;assert.deepEqual(pixelsFromSurface(original),pixelsFromSurface(carried));assert.equal(original.format,'rgba32float');assert.deepEqual(original.color,acescg);
   const title=out.stageOutputs.typography.surface as ProfessionalSurface,path=out.stageOutputs.vector.surface as ProfessionalSurface;assert.equal(path.format,'rgba16float');if(frame===8){assert.ok(pixelsFromSurface(title).some(v=>v>1));assert.ok(pixelsFromSurface(path).some(v=>v<0));}
   await writeFile(join(dir,`frame-${frame}.png`),await mediaPreview(out.surface,policy));if(frame===4)await writeFile(join(dir,'float-frame.json'),JSON.stringify(out.surface));
  }assert.notDeepEqual(seen.get(0),seen.get(8));
 }finally{await r.close();await r.close();}
 const packages=(await installedPackages(dir)).records.map(r=>({id:r.manifest.id,version:r.manifest.version,integrity:r.integrity}));await writeFile(join(base,'professional-proof.json'),JSON.stringify({dir,entry,catalog,packages,buildMs,timings,order:[4,4,0,8,2,8,0],floatTolerance:0,gpu:'not implemented: no authorized professional pixel pass',coverage:'A8 at 2x2 supersampling; linear HDR ink, not float geometry rasterization'},null,2));
});
test('typed float calls and Legacy overload remain distinct; encoded working spaces and invalid types are diagnosed',{timeout:60000},async()=>{
 const source=await readFile(join(dir,'professional/art.ts'),'utf8'),bad=join(dir,'professional/bad.ts');await writeFile(bad,source.replace('intensity:.7','intensity:"wrong"'));const badEntry=join(dir,'bad.tsx');await writeFile(badEntry,(await readFile(entry,'utf8')).replace('./professional/art.ts','./professional/bad.ts'));await assert.rejects(buildProject(badEntry),{code:'E_TYPECHECK'});
 const declaration=await readFile(join(catalog,'pro-animation/dist/bindings.d.ts'),'utf8');assert.match(declaration,/ProfessionalSurface/);assert.match(declaration,/Legacy/);
});

test('two factories share managed static imports while binding only their own functions',{timeout:90000},async()=>{
 const file=join(dir,'shared-imports.tsx');
 await writeFile(file,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';
 import {defineMediaStage,surfaceFromPixels,acescg} from '@frameweave/engine/native';
 import {blur,glow} from 'pro-animation';
 import type {ProfessionalSurface} from '@frameweave/engine/native';
 export const first=defineMediaStage(({width,height})=>({renderAt(ctx){const p=new Float32Array(width*height*4);for(let i=0;i<p.length;i+=4){p[i]=-0.25;p[i+1]=4;p[i+3]=1;}return {surface:blur(surfaceFromPixels(width,height,p,{format:'rgba32float',color:acescg,alpha:'straight'}),{radius:0},ctx)};},dispose(){}}));
 export const second=defineMediaStage<{source:ProfessionalSurface}>(()=>({renderAt(ctx,input){return {surface:glow(input.source,{radius:1,intensity:.5,threshold:1},ctx)};},dispose(){}}));
 export default <Composition width={16} height={8} fps={2} durationInFrames={2} background="transparent"><Stage id="first" factory={first}/><Stage id="second" factory={second} inputs={{source:ref('first')}}/><Layer source={ref('second')}/></Composition>;`);
 const built=await buildProject(file);
 const firstShim=await readFile(join(built.dir,'plugins/managed_first',encodeURIComponent('pro-animation@'+JSON.parse(await readFile(new URL('../modules/pro-animation/frameweave.package.json',import.meta.url),'utf8')).version)+'.ts'),'utf8');
 assert.match(firstShim,/export let glow/);assert.doesNotMatch(firstShim,/glow=ns\[/);
 const secondShim=await readFile(join(built.dir,'plugins/managed_second',encodeURIComponent('pro-animation@'+JSON.parse(await readFile(new URL('../modules/pro-animation/frameweave.package.json',import.meta.url),'utf8')).version)+'.ts'),'utf8');
 assert.match(secondShim,/export let blur/);assert.doesNotMatch(secondShim,/blur=ns\[/);
 for(let session=0;session<2;session++){const r=await Renderer.create(built,{cache:false,media:policy});try{for(const f of [1,0,1]){const out=await r.renderMediaFrame(f),a=pixelsFromSurface(out.stageOutputs.first.surface as ProfessionalSurface),b=pixelsFromSurface(out.surface);assert.equal(a[0],-.25);assert.equal(a[1],4);assert.ok(b[1]>a[1]);}}finally{await r.close();await r.close();}}
});
test('managed Flat, Capsule and three source policies retain exact float data with original Store unavailable',{timeout:240000},async()=>{
 const modes:Omit<ExportOptions,'output'>[]=[{singleFile:true,layout:'flat'},{singleFile:true,layout:'capsule'},{sources:'preserve',modules:'copy',assets:'copy'},{sources:'merge',modules:'copy',assets:'copy'},{sources:'preserve',modules:'merge',assets:'embed'}],exports=[];const dest=await mkdtemp(join(base,'portable-'));
 const reference=await Renderer.create(await buildProject(entry),{cache:false,media:policy});let pixels:Float32Array;try{pixels=pixelsFromSurface((await reference.renderMediaFrame(4)).surface);}finally{await reference.close();}
 for(let i=0;i<modes.length;i++)exports.push(await exportProject(entry,{...modes[i],output:join(dest,'portable-'+i+(modes[i].singleFile?'.tsx':''))}));
 await assert.rejects(exportProject(entry,{output:join(dir,'external'),sources:'merge',modules:'external',assets:'external'}),{code:'E_EXPORT_POLICY'});
 const store=join(dir,'.frameweave/packages'),hidden=store+'-offline';await rename(store,hidden);
 try{for(const result of exports){const r=await Renderer.create(await buildProject(result.entry),{cache:false,media:policy});try{assert.deepEqual(pixelsFromSurface((await r.renderMediaFrame(4)).surface),pixels!);}finally{await r.close();}}}finally{await rename(hidden,store);}
 const flat=await readFile(exports[0].entry,'utf8');assert.match(flat,/Copyright \(c\) 2026 ArtCraft/);assert.match(flat,/Permission is hereby granted/);await writeFile(join(base,'portable-proof.json'),JSON.stringify({modes,exports,originalStoreUnavailable:true,floatTolerance:0,externalRejected:'E_EXPORT_POLICY'},null,2));
});
