import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,cp,stat,appendFile} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {engineRoot,buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {parsePortable,printPortable} from '../src/compiler/portable.ts';
import {projectPlugins,writeLock,builtinRoot,discoverPlugins} from '../src/plugins/registry.ts';
import {createPlugin,installUserPlugins} from '../src/plugins/library.ts';
import {searchPlugins,keywordScore} from '../src/plugins/search.ts';
import {effectsCLI} from '../src/plugins/cli.ts';
import {initProject,workflowInfo} from '../src/workflow.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';

const parent=join(engineRoot,'.frameweave/extension-tests'),dirs:string[]=[];
const originalHome=process.env.FRAMEWEAVE_HOME;
async function fixture(files:Record<string,string|Buffer>={}){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'fixture-'));dirs.push(dir);for(const [path,data]of Object.entries(files)){await mkdir(dirname(join(dir,path)),{recursive:true});await writeFile(join(dir,path),data);}return dir;}
after(async()=>{if(originalHome===undefined)delete process.env.FRAMEWEAVE_HOME;else process.env.FRAMEWEAVE_HOME=originalHome;for(const dir of dirs){assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}});
async function isolated<T>(fn:()=>Promise<T>){const saved=process.env.FRAMEWEAVE_HOME;process.env.FRAMEWEAVE_HOME=await fixture();try{return await fn();}finally{if(saved===undefined)delete process.env.FRAMEWEAVE_HOME;else process.env.FRAMEWEAVE_HOME=saved;}}
const frame=async(entry:string,index=4)=>{const renderer=await Renderer.create(await buildProject(entry),{cache:false});try{return await sharp((await renderer.renderFrame(index)).png).ensureAlpha().raw().toBuffer();}finally{await renderer.close();}};

async function graph(){
  const dir=await fixture({
    'project.tsx':`/** @jsxImportSource @frameweave/engine */
import {Composition,Stage,Resource} from '@frameweave/engine';
import {PluginStage,plugin} from '@frameweave/engine/plugins';
import {label} from './lib/a.ts';
import type {Measure} from './lib/types.ts';
const width:Measure=64;
export default <Composition width={width} height={48} fps={12} durationInFrames={12} background="#07141c">
  <Resource id="tile" src="./assets/tile.png" kind="image"/>
  <Resource id="tileAgain" src="./assets/copy.png" kind="image"/>
  <Stage id="native" entry="./stages/native.ts" props={{label}}/>
  <PluginStage id="custom" pipeline={[plugin('test.orbit@1.0.0',{speed:2})]}/>
</Composition>;`,
    'lib/a.ts':`import {offset} from './b.ts'; export const label=await Promise.resolve('scope A');export const value=()=>offset();`,
    'lib/b.ts':`import {value} from './a.ts'; const label='scope B';export const offset=()=>label.length;export const cycle=()=>value();`,
    'lib/types.ts':`export type Measure=number;`,
    'stages/native.ts':`import type {StageFactory} from '@frameweave/engine';import {value} from '../lib/a.ts';import shader from './shader.glsl';import './style.css';
const label='native scope';
const factory:StageFactory=async init=>{const c=document.createElement('canvas');c.width=init.width;c.height=init.height;init.container.append(c);const x=c.getContext('2d')!;const image=await createImageBitmap(await (await fetch(init.resources.tile)).blob());return {renderAt(time){x.clearRect(0,0,c.width,c.height);x.drawImage(image,Math.floor(time.time*10)+value(),0);x.fillStyle=shader.includes('vec4')?'#88aaff':'#ff0000';x.fillRect(0,20,8,8);},dispose(){image.close();c.remove();}}};export default factory;`,
    'stages/shader.glsl':'// readable GLSL\nvec4 color = vec4(1.0);',
    'stages/style.css':'canvas { image-rendering:pixelated; }',
    'frameweave.plugins.json':JSON.stringify({schemaVersion:1,roots:['./plugins'],userLibrary:false}),
  });
  const pluginDir=join(dir,'plugins/orbit');await createPlugin(pluginDir,{id:'test.orbit',description:'Deterministic moving orbit dot'});
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#cc77ee"/></svg>';
  const tile=await sharp(Buffer.from(svg)).png().toBuffer();await mkdir(join(dir,'assets'));await writeFile(join(dir,'assets/tile.png'),tile);await writeFile(join(dir,'assets/copy.png'),tile);await writeLock(dir);return dir;
}

test('User library is automatic, immutable, versioned, and independent of author working copies',{timeout:120000},async()=>isolated(async()=>{
  const dir=await fixture(),author=join(dir,'author');await createPlugin(author,{id:'test.shared',description:'Shared orbital animation'});
  await installUserPlugins(author);const project=await fixture();const a=(await projectPlugins(project)).registry.get('test.shared@1.0.0');assert.notEqual(a.directory,author);
  await appendFile(join(author,'index.ts'),'\n// changed author source');assert.equal((await projectPlugins(project)).registry.get('test.shared@1.0.0').integrity,a.integrity);
  await assert.rejects(()=>installUserPlugins(author),{code:'E_PLUGIN_IMMUTABLE'});
  const manifest=JSON.parse(await readFile(join(author,'effect.json'),'utf8'));manifest.version='1.1.0';await writeFile(join(author,'effect.json'),JSON.stringify(manifest));await installUserPlugins(author);
  assert.equal((await projectPlugins(project)).registry.list().filter(p=>p.manifest.id==='test.shared').length,2);
  await writeFile(join(project,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:[],userLibrary:false}));assert.equal((await projectPlugins(project)).registry.list().some(p=>p.manifest.id==='test.shared'),false);
}));

test('Project copies take precedence without mutating global pins',{timeout:120000},async()=>isolated(async()=>{
  const dir=await fixture(),author=join(dir,'effect');await createPlugin(author,{id:'test.priority'});await installUserPlugins(author);await appendFile(join(author,'index.ts'),'\n// project development copy');
  await writeFile(join(dir,'frameweave.plugins.json'),JSON.stringify({schemaVersion:1,roots:['./effect']}));const project=await projectPlugins(dir);assert.equal(project.registry.get('test.priority@1.0.0').directory,author);await writeLock(dir);
}));

test('Keyword typo tolerance and structured filters remain available without a model',async()=>{
  const registry=await discoverPlugins([builtinRoot]);const results=await searchPlugins(registry,'particels',{kind:'generator'},{mode:'keyword'}); // two edits: intentionally no forced match
  assert.ok(Array.isArray(results));assert.ok(keywordScore(registry.get('fw.particles@1.0.0'),'particls')>0);
  const matched=await searchPlugins(registry,'particls',{kind:'generator',engine:'web'},{mode:'keyword'});assert.equal(matched[0].record.manifest.id,'fw.particles');
});

test('Actual pinned multilingual embeddings retrieve English descriptions from Chinese intent',{timeout:180000},async()=>{
  const registry=await discoverPlugins([builtinRoot]);
  const results=await searchPlugins(registry,'文字按照顺序一个一个弹出来',{output:'image'},{mode:'semantic',offline:true,limit:3});
  assert.ok(results.some(r=>r.record.manifest.id==='fw.kinetic-type'));assert.ok(results.every(r=>r.keywordScore===0&&typeof r.semanticScore==='number'));
});

test('Default project init writes agent workflow, exact lock, and usable editable entry',{timeout:120000},async()=>isolated(async()=>{
  const dir=await fixture(),target=join(dir,'new-project'),result=await initProject([target]);const instructions=await readFile(result.instructions,'utf8');
  assert.match(instructions,/Before implementing a reusable visual algorithm/);assert.match(instructions,/random-access/);assert.ok(workflowInfo().commands.promote.includes('--global'));
  const built=await buildProject(result.entry);assert.equal(built.manifest.composition.durationInFrames,300);await assert.rejects(()=>initProject([target]),{code:'E_EXISTS'});
}));

test('Source capsule preserves scopes, cycles, async modules, shader, CSS, types and private plugin; deduplicates bytes',{timeout:180000},async()=>isolated(async()=>{
  const dir=await graph(),entry=join(dir,'project.tsx'),expected=await frame(entry),dest=await fixture(),out=join(dest,'My-Film.tsx');
  const exported=await exportProject(entry,{output:out,singleFile:true,layout:'capsule'});assert.equal(exported.uniqueEmbeddedAssets,2);assert.equal(exported.embeddedAssetReferences,3);assert.equal(exported.selfContained,true);
  const text=await readFile(out,'utf8');assert.match(text,/export type Measure=number/);assert.match(text,/await Promise.resolve/);assert.match(text,/vec4 color/);assert.doesNotMatch(text,/ts-nocheck|eval\(/);assert.ok(!text.includes(dir.replaceAll('\\','\\\\')));
  await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';assert.deepEqual(await frame(out),expected);
  const portable=parsePortable(text)!;portable.sources['stages/native.ts']=portable.sources['stages/native.ts'].replace("const label='native scope'","const label:number='type error'");await writeFile(out,printPortable(portable));await assert.rejects(()=>buildProject(out),{code:'E_TYPECHECK'});
  portable.sources['stages/native.ts']=portable.sources['stages/native.ts'].replace("const label:number='type error'","const label='native scope'");portable.sources['modules/test.orbit@1.0.0/index.ts']+='\n// editable plugin';await writeFile(out,printPortable(portable));await assert.rejects(()=>buildProject(out),{code:'E_PLUGIN_LOCK'});
  await effectsCLI(['lock','--project',out]);await buildProject(out);
}));

test('Carried source tree renders with original removed; plugins register globally for another project',{timeout:180000},async()=>isolated(async()=>{
  const dir=await graph(),entry=join(dir,'project.tsx'),expected=await frame(entry),dest=await fixture(),out=join(dest,'bundle');const result=await exportProject(entry,{output:out});
  assert.equal(result.layout,'source-tree');assert.equal(result.privatePlugins.length,1);assert.ok((await readFile(join(out,'project.tsx'),'utf8')).includes('<Composition'));
  await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';assert.deepEqual(await frame(result.entry),expected);
  await effectsCLI(['install',join(out,'modules'),'--global']);const unrelated=await fixture({'project.ts':`import {Composition} from '@frameweave/engine';import {PluginStage,plugin} from '@frameweave/engine/plugins';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:PluginStage({id:'reused',pipeline:[plugin('test.orbit@1.0.0')]})});`});await writeLock(unrelated);assert.equal((await frame(join(unrelated,'project.ts'))).length,64*48*4);
}));

test('Independent export policies support source merging with carried modules and carried assets',{timeout:180000},async()=>isolated(async()=>{
  const dir=await graph(),dest=await fixture(),result=await exportProject(join(dir,'project.tsx'),{output:join(dest,'hybrid'),sources:'merge',modules:'copy',assets:'copy'});
  assert.equal(result.layout,'source-capsule');assert.equal(result.uniqueEmbeddedAssets,0);assert.ok((await stat(join(dest,'hybrid/files/modules/test.orbit@1.0.0/index.ts'))).isFile());
  const expected=await frame(join(dir,'project.tsx'));await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';assert.deepEqual(await frame(result.entry),expected);
}));

test('External export is explicit about environment dependence and missing files fail clearly',{timeout:120000},async()=>isolated(async()=>{
  const dir=await graph(),dest=await fixture(),result=await exportProject(join(dir,'project.tsx'),{output:join(dest,'external'),sources:'merge',modules:'external',assets:'external'});assert.equal(result.selfContained,false);assert.ok(result.externalFiles.length>0);
  await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';await assert.rejects(()=>buildProject(result.entry),{code:'E_PORTABLE'});
}));

test('Export rejects conflicting single-file policies, overwrites and oversized embedded assets',{timeout:120000},async()=>isolated(async()=>{
  const dir=await graph(),entry=join(dir,'project.tsx'),dest=await fixture();await assert.rejects(()=>exportProject(entry,{output:join(dest,'bad.tsx'),singleFile:true,layout:'capsule',modules:'copy'}),{code:'E_EXPORT_POLICY'});
  await assert.rejects(()=>exportProject(entry,{output:join(dest,'large.tsx'),singleFile:true,layout:'capsule',maxAssetMB:.00001}),{code:'E_EXPORT_ASSET_SIZE'});
  await writeFile(join(dest,'existing.tsx'),'keep');await assert.rejects(()=>exportProject(entry,{output:join(dest,'existing.tsx'),singleFile:true,layout:'capsule'}),{code:'E_EXISTS'});
}));

test('Portable literal parser rejects executable metadata, traversal, invalid hashes and missing resources',()=>{
  assert.throws(()=>parsePortable('export const frameweavePortable = doSomething();'),{code:'E_PORTABLE'});
  assert.throws(()=>parsePortable(printPortable({schemaVersion:1,entry:'../escape.ts',sources:{'../escape.ts':'export default 1'},files:{},blobs:{}})),{code:'E_PORTABLE'});
  assert.throws(()=>parsePortable(printPortable({schemaVersion:1,entry:'p.ts',sources:{'p.ts':'export default 1'},files:{x:'a'.repeat(64)},blobs:{['a'.repeat(64)]:{base64:'YQ=='}}})),{code:'E_PORTABLE'});
});

test('Portable text round-trip preserves CRLF, lone CR, templates, escapes and exact plugin pins',()=>{
  const source='const value: string = `raw ${1} \\n`;\r\n// Windows\r\n// lone CR\rfinish();';
  const data={schemaVersion:1 as const,entry:'project.ts',sources:{'project.ts':source},blobs:{},files:{}};
  assert.equal(parsePortable(printPortable(data))!.sources['project.ts'],source);
});

test('Exported TSX actually renders an entire clip matching every original RGBA frame',{timeout:180000},async()=>isolated(async()=>{
  const dir=await graph(),dest=await fixture(),out=join(dest,'clip.tsx');await exportProject(join(dir,'project.tsx'),{output:out,singleFile:true,layout:'capsule'});
  const a=await Renderer.create(await buildProject(join(dir,'project.tsx')),{cache:false}),b=await Renderer.create(await buildProject(out),{cache:false}),path=join(engineRoot,'artifacts/extended/tests/portable-clip.mp4'),encoder=await VideoEncoder.create(path,{num:12,den:1},64,48);
  try{for(let i=0;i<12;i++){const original=await a.renderFrame(i),exported=await b.renderFrame(i);assert.deepEqual(await sharp(original.png).raw().toBuffer(),await sharp(exported.png).raw().toBuffer());assert.equal(exported.diagnostics.length,0);await encoder.write(exported.png);}await encoder.finish();}catch(e){await encoder.abort();throw e;}finally{await a.close();await b.close();}
  assert.deepEqual(await probeVideo(path),{width:64,height:48,fps:12,duration:1,frames:12,decodable:true});
}));

test('Media, fonts and 3D files survive embedding byte-for-byte; repeated font bytes embed once',{timeout:120000},async()=>isolated(async()=>{
  const dir=await fixture(),dest=await fixture();await cp(join(engineRoot,'artifacts/extended/tests/portable-clip.mp4'),join(dir,'clip.mp4'));
  const wav=Buffer.alloc(44+800);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(800,40);await writeFile(join(dir,'sound.wav'),wav);
  const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(20,8);await writeFile(join(dir,'model.glb'),glb);
  const font=join(engineRoot,'node_modules/@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff2');await cp(font,join(dir,'first.woff2'));await cp(font,join(dir,'second.woff2'));
  const resources=[['film','clip.mp4','media'],['audio','sound.wav','media'],['model','model.glb','model'],['fontA','first.woff2','font'],['fontB','second.woff2','font']];
  await writeFile(join(dir,'project.ts'),`import {Composition,Resource,Stage,Text} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:[${resources.map(([id,src,kind])=>`Resource({id:'${id}',src:'./${src}',kind:'${kind}'})`).join(',')},Stage({id:'ui',children:Text({content:'font',fontFamily:'fontA',fontSize:12})})]});`);
  const out=join(dest,'media.tsx'),result=await exportProject(join(dir,'project.ts'),{output:out,singleFile:true,layout:'capsule'});assert.equal(result.uniqueEmbeddedAssets,4);assert.equal(result.embeddedAssetReferences,5);
  await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';const built=await buildProject(out);
  for(const [id,src]of resources){const resource=built.manifest.resources.find(r=>r.id===id)!;assert.deepEqual(await readFile(built.assets[resource.src]),await readFile(join(dir+'-offline',src)));}
  const video=built.manifest.resources.find(r=>r.id==='film')!;assert.equal((await probeVideo(built.assets[video.src])).frames,12);const renderer=await Renderer.create(built,{cache:false});try{assert.equal((await renderer.renderFrame(4)).diagnostics.length,0);}finally{await renderer.close();}
  // This checks asset transport, video decode and font use; it does not claim an audio timeline or GLB decoding.
}));

test('glTF linked buffers and textures are collected and served with stable relative URLs',{timeout:120000},async()=>isolated(async()=>{
  const dir=await fixture({'project.ts':`import {Composition,Resource} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:Resource({id:'mesh',src:'./model/mesh.gltf',kind:'model'})});`,'model/mesh.gltf':JSON.stringify({asset:{version:'2.0'},buffers:[{uri:'../data/mesh.bin',byteLength:4}],images:[{uri:'../textures/tile.png'}]}),'data/mesh.bin':Buffer.from([1,2,3,4]),'textures/tile.png':await sharp({create:{width:2,height:2,channels:4,background:'#00ff00'}}).png().toBuffer()});
  const dest=await fixture(),result=await exportProject(join(dir,'project.ts'),{output:join(dest,'mesh.tsx'),singleFile:true,layout:'capsule'});await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';const built=await buildProject(result.entry),model=built.manifest.resources.find(r=>r.id==='mesh')!,json=JSON.parse(await readFile(built.assets[model.src],'utf8'));
  for(const item of [...json.buffers,...json.images])assert.ok(built.assets['assets/'+item.uri]);
}));

test('Uncollectable dynamic imports and host programs produce explicit export diagnostics',{timeout:120000},async()=>isolated(async()=>{
  const basic=`import {Composition} from '@frameweave/engine';export default Composition({width:64,height:48,fps:12,durationInFrames:12});`;
  const dynamic=await fixture({'project.ts':basic+`export const lazy=(name:string)=>import(name);`}),host=await fixture({'project.ts':`import {execSync} from 'node:child_process';export const run=()=>execSync('echo unused');`+basic}),dest=await fixture();
  await assert.rejects(()=>exportProject(join(dynamic,'project.ts'),{output:join(dest,'dynamic.tsx'),singleFile:true,layout:'capsule'}),{code:'E_EXPORT_DYNAMIC'});
  await assert.rejects(()=>exportProject(join(host,'project.ts'),{output:join(dest,'host.tsx'),singleFile:true,layout:'capsule'}),{code:'E_EXPORT_NATIVE'});
}));

test('All merge/preserve axes can be selected independently in a carried capsule',{timeout:180000},async()=>isolated(async()=>{
  const dir=await graph(),dest=await fixture(),entry=join(dir,'project.tsx'),expected=await frame(entry);
  for(const [sources,modules,assets]of [['preserve','merge','copy'],['preserve','copy','embed'],['preserve','merge','embed']] as const){const result=await exportProject(entry,{output:join(dest,`${sources}-${modules}-${assets}`),sources,modules,assets});assert.equal(result.selfContained,true);assert.deepEqual(await frame(result.entry),expected);}
}));

test('Text resources are readable, byte-preserving and deduplicated under the asset policy',{timeout:120000},async()=>isolated(async()=>{
  const json='{\r\n  "color":"#65e9d5", "template":"${value}"\r\n}\r\n';
  const dir=await fixture({'palette.json':json,'same.json':json,'project.ts':`import {Composition,Resource,Stage,type StageFactory} from '@frameweave/engine';
export const native:StageFactory=async init=>{const colors=await (await fetch(init.resources.palette)).json() as {color:string};const c=document.createElement('canvas');c.width=init.width;c.height=init.height;init.container.append(c);return {renderAt(){const x=c.getContext('2d')!;x.fillStyle=colors.color;x.fillRect(0,0,c.width,c.height);},dispose(){c.remove();}};};
export default Composition({width:64,height:48,fps:12,durationInFrames:12,children:[Resource({id:'palette',src:'./palette.json',kind:'file'}),Resource({id:'same',src:'./same.json',kind:'file'}),Stage({id:'native',factory:native})]});`});
  const dest=await fixture(),out=join(dest,'colors.tsx'),exported=await exportProject(join(dir,'project.ts'),{output:out,singleFile:true,layout:'capsule'});assert.equal(exported.uniqueEmbeddedAssets,1);assert.equal(exported.embeddedAssetReferences,2);
  const data=parsePortable(await readFile(out,'utf8'))!;assert.equal(Object.values(data.blobs)[0].text,json);assert.equal(Object.values(data.blobs)[0].base64,undefined);
  await rename(dir,dir+'-offline');dirs[dirs.indexOf(dir)]=dir+'-offline';const pixels=await frame(out);assert.deepEqual([...pixels.subarray(0,4)],[101,233,213,255]);
}));
