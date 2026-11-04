import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,cp,rename,copyFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {buildProAnimation} from '../modules/pro-animation/scripts/build-package.ts';
import {buildGraphicsPackage} from '../modules/graphics-contracts/scripts/build-package.ts';
import {packagesCLI} from '../src/packages/cli.ts';
import {installPackages} from '../src/packages/manager.ts';
import {writeLock} from '../src/plugins/registry.ts';
import {buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
const paVersion=JSON.parse(await readFile(new URL('../modules/pro-animation/frameweave.package.json',import.meta.url),'utf8')).version as string;
const root=resolve('.'),base=join(root,'.frameweave/pa0');let catalog:string;
const native=`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';import {wiggle as jitter,revealText} from 'pro-animation';
export const visual=defineWebStage(({container,width,height})=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;container.append(canvas);const c=canvas.getContext('2d',{willReadFrequently:true})!;return {renderAt(ctx){c.reset();const w=jitter({frequency:2,amplitude:5,seed:51},ctx);c.fillStyle='#00ffaa';c.fillRect(12+Math.round(w[0]),8,24,24);return {text:revealText('A👩‍🚀中',{progress:2/3},ctx)};}};});export default <Composition width={96} height={64} fps={12} durationInFrames={3} background="transparent"><Stage id="visual" factory={visual} outputs={{surface:'surface',text:'string'}}/><Layer source={ref('visual')}/></Composition>;`;
const pipeline=`import {Composition,Layer,ref,keyframes} from '@frameweave/engine';import {PluginStage,plugin} from '@frameweave/engine/plugins';export default <Composition width={160} height={96} fps={12} durationInFrames={3} background="transparent"><PluginStage id="pa" pipeline={[plugin('pro-animation@${paVersion}',{progress:keyframes([{frame:0,value:0},{frame:2,value:1}]),glow:.8,displacement:3})]}/><Layer source={ref('pa')}/></Composition>;`;
before(async()=>{await mkdir(base,{recursive:true});catalog=await mkdtemp(join(base,'flat-catalog-'));await buildProAnimation(join(catalog,'pa'));const parent=join(root,'.frameweave/graphics-distribution-tests');await mkdir(parent,{recursive:true});const temp=await mkdtemp(join(parent,'flat-'));await buildGraphicsPackage(join(temp,'graphics'));await cp(join(temp,'graphics'),join(catalog,'graphics'),{recursive:true});});
for(const [name,source]of [['native',native],['pipeline',pipeline]])test('managed Flat survives original project and Store removal: '+name,{timeout:240000},async()=>{
 const dir=await mkdtemp(join(base,'flat-'+name+'-')),original=join(dir,'author'),clean=join(dir,'clean');await mkdir(original);await mkdir(clean);const entry=join(original,'project.tsx');await writeFile(entry,source);await packagesCLI(['install',catalog,'--project',original,'--add',`pro-animation@${paVersion}`,'--trust','local:frameweave.pro','--trust','local:frameweave.foundation']);await writeLock(original);
 const expected=new Map<number,Buffer>(),r=await Renderer.create(await buildProject(entry),{cache:false});try{for(const f of [1,0,2])expected.set(f,await sharp((await r.renderFrame(f)).png).ensureAlpha().raw().toBuffer());}finally{await r.close();}
 const output=join(clean,'editable.tsx');await exportProject(entry,{output,singleFile:true}).catch(e=>{console.error(JSON.stringify(e.details));throw e;});const code=await readFile(output,'utf8');assert.ok(code.includes('function fw_loadPackageGraph'));assert.ok(code.includes('wiggleReference'));assert.ok(code.includes('Permission is hereby granted, free of charge'));assert.ok(code.includes('ArtCraft'));assert.ok(!code.includes('frameweave.portable'));assert.ok(!code.includes(original.replaceAll('\\','/')));
 await rename(original,original+'-offline');
 try{const renderer=await Renderer.create(await buildProject(output),{cache:false});try{for(const f of [1,1,0,2,1]){const image=(await renderer.renderFrame(f)).png;assert.deepEqual(await sharp(image).ensureAlpha().raw().toBuffer(),expected.get(f));await writeFile(join(clean,'frame-'+f+'.png'),image);}}finally{await renderer.close();}
 const tamper=code.replace('BigInt.asUintN(64,','BigInt.asUintN(63,');assert.notEqual(tamper,code);const bad=join(clean,'tampered.tsx');await writeFile(bad,tamper);await assert.rejects(buildProject(bad),{code:'E_FLAT_INTEGRITY'});
 const checked=await packagesCLI(['verify','--project',output]) as {valid:boolean;kind:string;packages:unknown[]};assert.equal(checked.valid,true);assert.equal(checked.kind,'embedded-flat');assert.equal(checked.packages.length,2);await assert.rejects(packagesCLI(['verify','--project',bad]),{code:'E_FLAT_INTEGRITY'});await assert.rejects(packagesCLI(['uninstall','pro-animation','--project',output]),{code:'E_PORTABLE_EDIT'});
 const untrusted=join(clean,'untrusted.tsx');await writeFile(untrusted,code.replace(/"trustedSources": \[[\s\S]*?\]/,'"trustedSources": []'));await assert.rejects(buildProject(untrusted),{code:'E_PACKAGE_TRUST'});
 const again=join(clean,'again.tsx');await exportProject(output,{output:again,singleFile:true});assert.equal(await readFile(again,'utf8'),code,'a compliant Flat re-export preserves source bytes');
 await writeFile(join(base,'flat-'+name+'-proof.json'),JSON.stringify({output,originalUnavailable:true,frames:[1,1,0,2,1],tolerance:0,integrityRejected:true},null,2));
 }finally{await rename(original+'-offline',original);}
});

test('ordinary-import example separates input/display and preserves cold/random/repeated frames',{timeout:90000},async()=>{
 const dir=await mkdtemp(join(base,'import-example-')),entry=join(dir,'project.tsx');await copyFile(join(root,'examples/pro-animation/imports.tsx'),entry);await packagesCLI(['install','pro-animation','--catalog',catalog,'--project',dir,'--trust','local:frameweave.pro','--trust','local:frameweave.foundation']);
 const expected=new Map<number,Buffer>(),r=await Renderer.create(await buildProject(entry),{cache:false});try{for(const f of [6,0,12,6,6]){const image=(await r.renderFrame(f)).png,rgba=await sharp(image).ensureAlpha().raw().toBuffer();if(expected.has(f))assert.deepEqual(rgba,expected.get(f));else expected.set(f,rgba);await writeFile(join(dir,'frame-'+f+'.png'),image);}}finally{await r.close();}
 const cold=await Renderer.create(await buildProject(entry),{cache:false});try{assert.deepEqual(await sharp((await cold.renderFrame(6)).png).ensureAlpha().raw().toBuffer(),expected.get(6));}finally{await cold.close();}
 const exported=await exportProject(entry,{output:join(dir,'example-flat.tsx'),singleFile:true});const flat=await Renderer.create(await buildProject(exported.entry),{cache:false});try{for(const f of [6,0,12,6])assert.deepEqual(await sharp((await flat.renderFrame(f)).png).ensureAlpha().raw().toBuffer(),expected.get(f));}finally{await flat.close();}
});

test('sealed Flat owns its R1 context in the author directory and descendants after Store removal',{timeout:120000},async()=>{
 const author=await mkdtemp(join(base,'flat-boundary-')),entry=join(author,'project.tsx'),child=join(author,'exports');await mkdir(child);await writeFile(entry,native);
 await packagesCLI(['install','pro-animation','--catalog',catalog,'--project',author,'--trust','local:frameweave.pro','--trust','local:frameweave.foundation']);
 const same=join(author,'standalone.tsx'),nested=join(child,'standalone.tsx');await exportProject(entry,{output:same,singleFile:true});await copyFile(same,nested);
 const original=await Renderer.create(await buildProject(entry));let expected:Buffer;try{expected=await sharp((await original.renderFrame(1)).png).ensureAlpha().raw().toBuffer();}finally{await original.close();}
 // Include an unrelated child project config as well as the real parent config.
 await copyFile(join(author,'frameweave.packages.json'),join(child,'frameweave.packages.json'));await copyFile(join(author,'frameweave.packages.lock.json'),join(child,'frameweave.packages.lock.json'));
 const store=join(author,'.frameweave/packages');await rename(store,store+'-offline');
 try{
  await assert.rejects(buildProject(entry),{code:'E_PACKAGE_MISSING'});
  for(const file of [same,nested]){const r=await Renderer.create(await buildProject(file),{cache:false});try{for(const f of [1,0,1]){const out=await r.renderFrame(f);if(f===1)assert.deepEqual(await sharp(out.png).ensureAlpha().raw().toBuffer(),expected!);}}finally{await r.close();}}
  const again=join(child,'again.tsx');await exportProject(nested,{output:again,singleFile:true});assert.deepEqual(await readFile(again),await readFile(nested));
  const code=await readFile(same,'utf8'),bad=join(author,'bad.tsx');
  await writeFile(bad,code.replace('BigInt.asUintN(64,','BigInt.asUintN(63,'));await assert.rejects(buildProject(bad),{code:'E_FLAT_INTEGRITY'});
  await writeFile(bad,code.replace(/"trustedSources": \[[\s\S]*?\]/,'"trustedSources": []'));await assert.rejects(buildProject(bad),{code:'E_PACKAGE_TRUST'});
  await writeFile(bad,code+"\nimport {wiggle as externalAgain} from 'pro-animation';\n");await assert.rejects(buildProject(bad),{code:'E_PACKAGE_MISSING'});
  await writeFile(bad,code.replace(/("integrity": ")[a-f0-9]{64}("\s*\n\s*},\s*\n\s*"packages")/,'$1'+'0'.repeat(64)+'$2'));await assert.rejects(buildProject(bad),{code:'E_RUNTIME_LOCK'});
 }finally{await rename(store+'-offline',store);}
});

test('managed Flat retains inferred typed input contracts and real DAG values',{timeout:90000},async()=>{
 const dir=await mkdtemp(join(base,'flat-contract-')),pack=join(dir,'package'),author=join(dir,'author');await mkdir(pack);await mkdir(author);
 await writeFile(join(pack,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id:'test.io',version:'1.0.0',name:'IO contract',description:'Typed native input inference',source:{kind:'local',authority:'test.io'},compatible:'0.1.0',platforms:['web'],capabilities:[],permissions:{filesystem:false,network:false,process:false},modules:{main:{format:'javascript',path:'./main.ts'}},bindings:{schemaVersion:1,module:'main',types:'./api.d.ts',engine:'web'}}));await writeFile(join(pack,'main.ts'),'export function value(){return 2;}');await writeFile(join(pack,'api.d.ts'),'export declare function value():number;');await installPackages(author,[pack],{trust:['local:test.io']});
 const entry=join(author,'project.tsx');await writeFile(entry,`import {Composition,Stage,ref} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';import {value} from 'test.io';export const from=defineWebStage(()=>({renderAt(){return {n:5};}}));export const to=defineWebStage<{n:number},Record<string,never>,{result:number}>(()=>({renderAt(_c,i){return {result:i.n+value()};}}));export default <Composition width={8} height={8} fps={1} durationInFrames={1}><Stage id="from" factory={from} outputs={{n:'number'}}/><Stage id="to" factory={to} inputs={{n:ref('from','n')}} outputs={{result:'number'}}/></Composition>;`);
 const original=await buildProject(entry),flat=await exportProject(entry,{output:join(dir,'typed.tsx'),singleFile:true});await rename(author,author+'-offline');try{const built=await buildProject(flat.entry);assert.deepEqual(built.manifest.stages.find(s=>s.id==='to')!.inputTypes,original.manifest.stages.find(s=>s.id==='to')!.inputTypes);assert.equal(built.manifest.stages.find(s=>s.id==='to')!.inputTypes!.n,'number');const r=await Renderer.create(built);try{assert.equal((await r.renderFrame(0)).stageOutputs.to.result,7);}finally{await r.close();}}finally{await rename(author+'-offline',author);}
});

test('generic non-effect package Flat embeds WASM bytes and retains default deny / explicit allow',{timeout:180000},async()=>{
 const dir=await mkdtemp(join(base,'flat-wasm-')),pack=join(dir,'package'),author=join(dir,'author'),clean=join(dir,'clean');await mkdir(pack);await mkdir(author);await mkdir(clean);
 const manifest={schemaVersion:1,apiVersion:1,id:'test.flat-wasm',version:'1.0.0',name:'WASM binding',description:'Permission lifecycle fixture',source:{kind:'local',authority:'test.flat'},compatible:'0.1.0',platforms:['web'],capabilities:['wasm'],permissions:{filesystem:false,network:false,process:false},modules:{main:{format:'javascript',path:'./main.ts'},binary:{format:'wasm',path:'./empty.wasm',abi:'core-v1'}},bindings:{schemaVersion:1,module:'main',types:'./main.d.ts',engine:'web',initialize:'initialize'}};
 await writeFile(join(pack,'frameweave.package.json'),JSON.stringify(manifest));await writeFile(join(pack,'empty.wasm'),Buffer.from('0061736d01000000','hex'));await writeFile(join(pack,'main.d.ts'),'export declare function answer():number;');await writeFile(join(pack,'main.ts'),`import type {PluginInit} from '@frameweave/engine/plugins';export async function initialize(init:PluginInit){const instance=await init.loadModule({module:'binary',format:'wasm'});return {exports:{answer:()=>Object.keys(instance.exports).length+42}};}`);
 const entry=join(author,'project.tsx');await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';import {answer} from 'test.flat-wasm';export const visual=defineWebStage(({container,width,height})=>{const c=document.createElement('canvas');c.width=width;c.height=height;container.append(c);return {renderAt(){if(answer()!==42)throw Error('BAD_WASM');c.getContext('2d')!.fillRect(0,0,8,8);return {};}};});export default <Composition width={16} height={16} fps={1} durationInFrames={1}><Stage id="visual" factory={visual}/><Layer source={ref('visual')}/></Composition>;`);
 await installPackages(author,[pack],{trust:['local:test.flat']});const out=join(clean,'wasm.tsx');await exportProject(entry,{output:out,singleFile:true});await rename(author,author+'-offline');
 try{assert.equal((await readFile(out,'utf8')).split('AGFzbQEAAAA=').length-1,1,'binary resource is embedded once');const built=await buildProject(out);assert.ok(built.manifest.stages[0].props.$packages);await assert.rejects(async()=>{const r=await Renderer.create(built);try{await r.renderFrame(0);}finally{await r.close();}},(e:any)=>/wasm|WebAssembly/i.test(e.message));const r=await Renderer.create(built,{allowWasm:true});try{const frame=await r.renderFrame(0);assert.equal(frame.diagnostics.filter(d=>d.severity==='error').length,0);await writeFile(join(clean,'wasm.png'),frame.png);}finally{await r.close();}
 await writeFile(join(base,'flat-wasm-proof.json'),JSON.stringify({out,originalUnavailable:true,defaultDeny:true,explicitAllow:true,bytes:'0061736d01000000'}));
 }finally{await rename(author+'-offline',author);}
});
