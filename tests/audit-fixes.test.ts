import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,rm,cp,rename,stat,appendFile} from 'node:fs/promises';
import {join,dirname,resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
import {embedSvg} from '../src/compiler/svg.ts';
import {createRuntimeRequirement,assertRuntimeRequirement,runtimePin,checkRuntimeFile} from '../src/compiler/runtime-lock.ts';
const exec=promisify(execFile),parent=join(engineRoot,'.frameweave/audit-fix-tests'),directories:string[]=[];
async function fixture(files:Record<string,string|Buffer>={}){await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'fixture-'));directories.push(directory);for(const [path,data]of Object.entries(files)){await mkdir(dirname(join(directory,path)),{recursive:true});await writeFile(join(directory,path),data);}return directory;}
after(async()=>{for(const directory of directories){assert.equal(dirname(resolve(directory)),resolve(parent));await rm(directory,{recursive:true,force:true});}});
const scene=`import {Composition,Stage,Rect} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:Stage({id:'ui',children:Rect({x:8,y:8,width:24,height:24,fill:'#ff7700'})})});`;
const svg=(href:string,extra='')=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32"><rect width="32" height="32" fill="#0044aa"/><image xlink:href="${href}" x="8" y="8" width="12" height="12"/>${extra}</svg>`;
const tile=()=>sharp({create:{width:12,height:12,channels:4,background:'#ff7700'}}).png().toBuffer();
async function pixels(entry:string){const renderer=await Renderer.create(await buildProject(entry),{cache:false});try{return sharp((await renderer.renderFrame(0)).png).ensureAlpha().raw().toBuffer();}finally{await renderer.close();}}
async function sdkCopy(){const dir=await fixture();for(const folder of ['src','plugins/builtin','modules'])await cp(join(engineRoot,folder),join(dir,folder),{recursive:true});for(const name of ['package.json','package-lock.json','tsconfig.json'])await cp(join(engineRoot,name),join(dir,name));return dir;}
async function child(code:string){const result=await exec(process.execPath,['--import','tsx','--input-type=module','-e',code],{cwd:engineRoot,windowsHide:true,timeout:60000,maxBuffer:1024*1024});return JSON.parse(result.stdout.trim());}
test('F01 exports readable executable SDK/dependency constraints; editable/re-exported TSX remains valid',{timeout:120000},async()=>{
  const dir=await fixture({'project.ts':scene}),destination=await fixture(),entry=join(dir,'project.ts');
  const flat=await exportProject(entry,{output:join(destination,'Portable.tsx'),singleFile:true});
  const text=await readFile(flat.entry,'utf8');assert.match(text,/export const frameweaveRuntime/);assert.doesNotMatch(text,/export const frameweavePortable/);assert.deepEqual(flat.runtime.runtime,runtimePin);assert.deepEqual(await pixels(flat.entry),await pixels(entry));
  await writeFile(flat.entry,text.replace("#ff7700","#00ff00"));assert.notDeepEqual(await pixels(flat.entry),await pixels(entry));
  const second=await exportProject(flat.entry,{output:join(destination,'Again.tsx'),singleFile:true});assert.equal((await readFile(second.entry,'utf8')).match(/export const frameweaveRuntime/g)?.length,1);await buildProject(second.entry);
});
test('F01 mismatched, malformed, and executable metadata fail before project code; normal TS stays optional',{timeout:60000},async()=>{
  const dir=await fixture({'plain.ts':scene}),requirement=createRuntimeRequirement();checkRuntimeFile(join(dir,'plain.ts'));
  const wrong=structuredClone(requirement);wrong.runtime.engineVersion='9.0.0';
  await writeFile(join(dir,'bad.ts'),`export const frameweaveRuntime=${JSON.stringify(wrong)};throw Error('SHOULD_NOT_RUN');`);await assert.rejects(()=>buildProject(join(dir,'bad.ts')),{code:'E_RUNTIME_LOCK'});
  await writeFile(join(dir,'bad.ts'),`export const frameweaveRuntime=(()=>{throw Error('SHOULD_NOT_RUN')})();`);await assert.rejects(()=>buildProject(join(dir,'bad.ts')),{code:'E_RUNTIME_LOCK'});
  assert.throws(()=>assertRuntimeRequirement({...requirement,packages:{three:'0.0.1'}}),{code:'E_RUNTIME_LOCK'});
  assert.throws(()=>createRuntimeRequirement({three:'0.0.1'}),{code:'E_RUNTIME_DEPENDENCY'});
});
test('F01 wrong constraints are also checked in imported modules and native Stage modules',{timeout:90000},async()=>{
  const wrong=createRuntimeRequirement();wrong.runtime.engineVersion='9.0.0';
  const dir=await fixture({'locked.ts':`export const frameweaveRuntime=${JSON.stringify(wrong)};export const width=64;export default ()=>({renderAt(){}});`,'project.ts':`import {width} from './locked.ts';${scene.replace('width:64','width')}`});
  await assert.rejects(()=>buildProject(join(dir,'project.ts')),{code:'E_RUNTIME_LOCK'});
  await writeFile(join(dir,'project.ts'),`import {Composition,Stage} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:Stage({id:'native',entry:'./locked.ts'})});`);
  await assert.rejects(()=>buildProject(join(dir,'project.ts')),{code:'E_RUNTIME_LOCK'});
});
test('F01 altered real SDK content and package version are rejected in a fresh process',{timeout:120000},async()=>{
  const source=await fixture({'project.ts':scene}),destination=await fixture(),flat=await exportProject(join(source,'project.ts'),{output:join(destination,'Portable.tsx'),singleFile:true}),copy=await sdkCopy();
  const sdk=join(copy,'src/plugins/sdk.ts');await writeFile(sdk,(await readFile(sdk,'utf8')).replace('context.reset();','context.reset();context.scale(0.5,0.5);'));
  const probe=`const {buildProject}=await import(${JSON.stringify(pathToFileURL(join(copy,'src/compiler/build.ts')).href)});try{await buildProject(${JSON.stringify(flat.entry)});console.log(JSON.stringify({accepted:true}));}catch(e){console.log(JSON.stringify({code:e.code,message:e.message}));}`;
  assert.equal((await child(probe)).code,'E_RUNTIME_LOCK');
  // Public module bytes now belong to the real SDK identity as well.
  await cp(join(engineRoot,'src/plugins/sdk.ts'),sdk);
  const module=join(copy,'modules/render-session/index.ts');await appendFile(module,'\n// changed public module bytes');
  assert.equal((await child(probe)).code,'E_RUNTIME_LOCK');
  const packageFile=join(copy,'package.json'),pkg=JSON.parse(await readFile(packageFile,'utf8'));pkg.version='9.0.0';await writeFile(packageFile,JSON.stringify(pkg));
  assert.equal((await child(probe)).code,'E_RUNTIME_LOCK');
  const manifest={schemaVersion:1,apiVersion:1,id:'test.version',version:'1.0.0',name:'Version',description:'Version probe',kind:'generator',engine:'web',compatible:'^0.1.0',entry:'./inline.ts',parameters:{},inputs:{},outputs:{image:'image'}};
  const versionProbe=`const {preparePluginStages}=await import(${JSON.stringify(pathToFileURL(join(copy,'src/plugins/compiler.ts')).href)});const {engineVersion}=await import(${JSON.stringify(pathToFileURL(join(copy,'src/compiler/runtime-lock.ts')).href)});const m=${JSON.stringify(manifest)};async function check(compatible){m.compatible=compatible;const stage={id:'fx',engine:'web',entry:'@frameweave/plugin-stage',inputs:{},outputs:{surface:'surface'},props:{pluginPipeline:[{plugin:'test.version@1.0.0'}],$inlineEffects:{'test.version@1.0.0':{manifest:m,entry:'inline.ts',exportName:'Effect'}}}};try{await preparePluginStages({stages:[stage]},${JSON.stringify(copy)},${JSON.stringify(join(copy,'out'))},${JSON.stringify(copy)});return 'accepted';}catch(e){return e.code;}}console.log(JSON.stringify({version:engineVersion,old:await check('^0.1.0'),current:await check('^9.0.0')}));`;
  assert.deepEqual(await child(versionProbe),{version:'9.0.0',old:'E_PLUGIN_ENGINE',current:'accepted'});
});
test('F01 capsules and carried directories include runtime pins even without registry plugins',{timeout:90000},async()=>{
  const source=await fixture({'project.ts':scene}),dest=await fixture();
  const capsule=await exportProject(join(source,'project.ts'),{output:join(dest,'Capsule.tsx'),singleFile:true,layout:'capsule'});assert.match(await readFile(capsule.entry,'utf8'),/export const frameweaveRuntime/);await buildProject(capsule.entry);
  const carried=await exportProject(join(source,'project.ts'),{output:join(dest,'Carried')});const metadata=join(dirname(carried.entry),'frameweave.runtime.json');const pin=JSON.parse(await readFile(metadata,'utf8'));pin.runtime.integrity='0'.repeat(64);await writeFile(metadata,JSON.stringify(pin));await assert.rejects(()=>buildProject(carried.entry),{code:'E_RUNTIME_LOCK'});
});
test('F02 recursively embeds local PNG and SVG references, xlink, and encoded filenames',{timeout:30000},async()=>{
  const directory=await fixture({'tile space.png':await tile(),'inner.svg':svg('tile%20space.png'),'outer.svg':svg('inner.svg')}),file=join(directory,'outer.svg');
  const result=await embedSvg(await readFile(file),{file,owner:directory});assert.equal(result.dependencies.length,2);assert.match(result.bytes.toString(),/data:image\/svg\+xml;base64,/);assert.doesNotMatch(result.bytes.toString(),/href="inner.svg"/);
  const simple=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#color)"/></svg>');assert.deepEqual((await embedSvg(simple)).bytes,simple);
});
test('F02 missing, network, escaping, cyclic, and unsupported SVG dependencies fail explicitly',{timeout:30000},async()=>{
  const dir=await fixture({'a.svg':svg('b.svg'),'b.svg':svg('a.svg')}),outside=await fixture({'tile.png':await tile()});
  for(const reference of ['absent.png','https://example.invalid/tile.png','//example.invalid/tile.png',relative(dir,join(outside,'tile.png')).replaceAll('\\','/')])await assert.rejects(()=>embedSvg(Buffer.from(svg(reference)),{file:join(dir,'a.svg'),owner:dir}),{code:'E_SVG_RESOURCE'});
  await assert.rejects(()=>embedSvg(awaitReadSvg(),{}),{code:'E_SVG_RESOURCE'});
  await assert.rejects(()=>embedSvg(Buffer.from(svg('b.svg')),{file:join(dir,'a.svg'),owner:dir}),{code:'E_SVG_RESOURCE'});
  function awaitReadSvg(){return Buffer.from(svg('relative.png'));}
  for(const body of ['<use href="other.svg#shape"/>','<style>@import "other.css";</style>','<rect style="fill:url(tile.png)"/>','<script/>','<foreignObject/>','<animate attributeName="href" to="tile.png"/>'])await assert.rejects(()=>embedSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`)),{code:'E_SVG_RESOURCE'});
  await assert.rejects(()=>embedSvg(Buffer.from('<!DOCTYPE svg [<!ENTITY x "text">]><svg xmlns="http://www.w3.org/2000/svg"/>')),{code:'E_SVG_RESOURCE'});
  await assert.rejects(()=>embedSvg(Buffer.from('<svg>')),{code:'E_SVG_RESOURCE'});
  await assert.rejects(()=>embedSvg(Buffer.from(svg('#local')),{maxBytes:8}),{code:'E_SVG_RESOURCE'});
});
test('F02 original, flat, capsule and carried exports show the actual linked image after originals disappear',{timeout:180000},async()=>{
  const directory=await fixture({'assets/linked.svg':svg('tile.png'),'assets/tile.png':await tile(),'native.ts':`import {defineWebStage} from '@frameweave/engine/native';export default defineWebStage(async init=>{const image=new Image();image.src=init.resources.svg;await image.decode();image.width=image.height=32;init.container.append(image);return {renderAt(){}};});`,'project.tsx':`import {Composition,Stage,Resource} from '@frameweave/engine';export default <Composition width={64} height={48} fps={12} durationInFrames={12}><Resource id="svg" src="./assets/linked.svg" kind="image"/><Stage id="native" entry="./native.ts"/></Composition>;`}),dest=await fixture(),entry=join(directory,'project.tsx');
  const original=await pixels(entry),offset=(12*64+12)*4;assert.deepEqual([...original.subarray(offset,offset+4)],[255,119,0,255]);
  const built=await buildProject(entry),graph=JSON.parse(await readFile(join(built.dir,'sources.json'),'utf8'));assert.ok(graph.files.includes(join(directory,'assets/tile.png')));
  const flat=await exportProject(entry,{output:join(dest,'Portable.tsx'),singleFile:true}),capsule=await exportProject(entry,{output:join(dest,'Capsule.tsx'),singleFile:true,layout:'capsule'}),carried=await exportProject(entry,{output:join(dest,'Carried')});
  assert.equal(flat.selfContained,true);assert.deepEqual(flat.externalFiles,[]);
  const removed=directory+'-removed';assert.equal(dirname(removed),parent);await rename(directory,removed);directories[directories.indexOf(directory)]=removed;
  for(const exported of [flat,capsule,carried])assert.deepEqual(await pixels(exported.entry),original);
});
test('F02 native static SVG imports are rewritten and their transitive image is tracked',{timeout:60000},async()=>{
  const directory=await fixture({'assets/linked.svg':svg('tile.png'),'assets/tile.png':await tile(),'native.ts':`import svg from './assets/linked.svg';import {defineWebStage} from '@frameweave/engine/native';export default defineWebStage(init=>{init.container.dataset.svg=svg;return {renderAt(){return {};}};});`,'project.ts':`import {Composition,Stage} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:Stage({id:'native',entry:'./native.ts'})});`});
  const built=await buildProject(join(directory,'project.ts')),assets=Object.values(built.assets).filter(path=>path.endsWith('.svg'));assert.equal(assets.length,1);assert.match(await readFile(assets[0],'utf8'),/data:image\/png;base64,/);const graph=JSON.parse(await readFile(join(built.dir,'sources.json'),'utf8'));assert.ok(graph.files.includes(join(directory,'assets/tile.png')));
});
test('F02 failed strict export emits no success file; embedded SVG cannot hide unresolved images',{timeout:60000},async()=>{
  const source=await fixture({'bad.svg':svg('missing.png'),'project.ts':`import {Composition,Stage,Rect,Resource} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:[Resource({id:'bad',src:'./bad.svg',kind:'image'}),Stage({id:'ui',children:Rect({width:8,height:8})})]});`}),dest=await fixture(),output=join(dest,'Broken.tsx');
  await assert.rejects(()=>exportProject(join(source,'project.ts'),{singleFile:true,output}),{code:'E_SVG_RESOURCE'});await assert.rejects(()=>stat(output),{code:'ENOENT'});
  const data='data:image/svg+xml;base64,'+Buffer.from(svg('relative.png')).toString('base64');await writeFile(join(source,'project.ts'),(await readFile(join(source,'project.ts'),'utf8')).replace('./bad.svg',data));await assert.rejects(()=>buildProject(join(source,'project.ts')),{code:'E_SVG_RESOURCE'});
});
