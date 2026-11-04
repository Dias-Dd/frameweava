import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,cp,appendFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {buildProAnimation} from '../modules/pro-animation/scripts/build-package.ts';
import {buildGraphicsPackage} from '../modules/graphics-contracts/scripts/build-package.ts';
import {packagesCLI} from '../src/packages/cli.ts';
import {writeLock} from '../src/plugins/registry.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {installedPackages} from '../src/packages/manager.ts';
import {createManagedStage} from '../src/packages/stage-bindings.ts';
import {managedContext} from '../src/compiler/managed.ts';
import {alias} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
const paVersion=JSON.parse(await readFile(new URL('../modules/pro-animation/frameweave.package.json',import.meta.url),'utf8')).version as string;
const root=resolve('.'),base=join(root,'.frameweave/pa0');let catalog:string,dir:string,entry:string;
const source=`import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineWebStage} from '@frameweave/engine/native';
import {wiggle as jitter,revealText,glow,displacement,trimPaths,morphPath} from 'pro-animation';
import type {PathData} from 'pro-animation';
export const visual=defineWebStage(({container,width,height})=>{
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;container.append(canvas);const c=canvas.getContext('2d',{willReadFrequently:true})!;
 const path:PathData={schema:'frameweave.path',version:1,id:'p',coordinates:{spaceId:'p',unit:'px',origin:'top-left',x:'right',y:'down',width,height},fillRule:'nonzero',commands:[{op:'M',point:{id:'a',x:0,y:10}},{op:'L',point:{id:'b',x:60,y:10}}]};
 return {async renderAt(ctx){
 const offset=jitter({frequency:2,amplitude:3,seed:51},ctx),trim=trimPaths(path,{start:.25,end:.75,step:1},ctx),m=morphPath(path,path,.5,ctx);
 if(trim.commands[0].op!=='M'||trim.commands[0].point.x!==15||m.commands.length!==2)throw Error('VECTOR_REFERENCE');
 c.reset();c.fillStyle='#00ff88';c.fillRect(12+Math.round(offset[0]),12,20,20);const fx=await glow(canvas,{intensity:0,radius:2},ctx);const out=await displacement(fx,{amount:0,seed:3},ctx);if(out!==canvas){c.reset();c.drawImage(out,0,0);}
 return {text:revealText('A👩‍🚀中',{progress:2/3},ctx)};},dispose(){canvas.width=canvas.height=0;}};
});
export default <Composition width={96} height={64} fps={12} durationInFrames={3} background="transparent"><Stage id="visual" factory={visual} outputs={{surface:'surface',text:'string'}}/><Layer source={ref('visual')}/></Composition>;`;
async function install(target:string){await packagesCLI(['install',catalog,'--project',target,'--add',`pro-animation@${paVersion}`,'--trust','local:frameweave.pro','--trust','local:frameweave.foundation']);await writeLock(target);}
before(async()=>{await mkdir(base,{recursive:true});catalog=await mkdtemp(join(base,'managed-catalog-'));await buildProAnimation(join(catalog,'pro-animation'));const parent=join(root,'.frameweave/graphics-distribution-tests');await mkdir(parent,{recursive:true});const temp=await mkdtemp(join(parent,'managed-'));await buildGraphicsPackage(join(temp,'graphics'));await cp(join(temp,'graphics'),join(catalog,'graphics'),{recursive:true});dir=await mkdtemp(join(base,'managed-'));entry=join(dir,'project.tsx');await writeFile(entry,source);await install(dir);});
test('ordinary named/aliased/typed imports execute six real functions inside a Web Stage',{timeout:120000},async()=>{
 const built=await buildProject(entry);assert.equal(built.manifest.stages[0].engine,'web');const r=await Renderer.create(built,{cache:false});const frames=new Map<number,Buffer>();
 try{for(const frame of [1,1,0,2,1]){const output=await r.renderFrame(frame);assert.equal(output.stageOutputs.visual.text,'A👩‍🚀');const rgba=await sharp(output.png).ensureAlpha().raw().toBuffer();assert.ok(rgba.some((v,i)=>i%4===3&&v>0));if(frames.has(frame))assert.deepEqual(rgba,frames.get(frame));frames.set(frame,rgba);await writeFile(join(dir,'frame-'+frame+'.png'),output.png);}}finally{await r.close();}
 await writeFile(join(base,'managed-import-proof.json'),JSON.stringify({entry,frames:[1,1,0,2,1],sixOperations:true,tolerance:0}));
});
test('managed imports retain types and reject unsupported evaluation/forms and undeclared packages',{timeout:120000},async()=>{
 const cases=[['types',source.replace('amplitude:3','amplitude:"wrong"'),'E_TYPECHECK'],['top',source.replace('export const visual=',"const wrong=jitter({frequency:1,amplitude:1},{} as any);export const visual="),'E_MANAGED_SCOPE'],['namespace',source.replace('import {wiggle as jitter,revealText,glow,displacement,trimPaths,morphPath}', 'import * as functions'),'E_PACKAGE_IMPORT_FORM']];
 for(const [name,text,code]of cases){const file=join(dir,name+'.tsx');await writeFile(file,text);await assert.rejects(buildProject(file),{code});}
 const missing=await mkdtemp(join(base,'uninstalled-')),file=join(missing,'project.tsx');await writeFile(file,source);await assert.rejects(buildProject(file));
 const config=JSON.parse(await readFile(join(dir,'frameweave.packages.json'),'utf8'));const backup=JSON.stringify(config);config.requirements={};await writeFile(join(dir,'frameweave.packages.json'),JSON.stringify(config));try{await assert.rejects(buildProject(entry),(e:any)=>/^E_PACKAGE_/.test(e.code));}finally{await writeFile(join(dir,'frameweave.packages.json'),backup);}
});
test('tampered managed bytes do not fall through to npm or execute',{timeout:60000},async()=>{
 const target=await mkdtemp(join(base,'binding-tamper-'));await writeFile(join(target,'project.tsx'),source);await install(target);const state=await installedPackages(target),record=state.records.find(r=>r.manifest.id==='pro-animation')!;await appendFile(join(record.directory,'dist/bindings.js'),'\n// changed after lock');await assert.rejects(buildProject(join(target,'project.tsx')),{code:'E_PACKAGE_INTEGRITY'});
});

test('managed initializer runs before factory, cleans up in reverse order and on partial failure',async()=>{
 const events:string[]=[],binding={ref:'test.lifecycle@1.0.0',module:'main',initialize:'initialize',resources:{},dependencies:{},bind(v:Record<string,unknown>){assert.equal(typeof v.call,'function');events.push('bind');}},packages={'test.lifecycle@1.0.0':{integrity:'sha256-test',source:{kind:'local' as const,authority:'test'},capabilities:[],dependencies:{},modules:{main:{format:'javascript' as const,integrity:'sha256-test'}}}};
 const loaders={'test.lifecycle@1.0.0/main':async()=>({initialize:async()=>{events.push('init');return {exports:{call:()=>1},dispose:()=>{events.push('package-dispose');}};}})};
 const factory=createManagedStage(async()=>{events.push('load-factory');return ()=>{events.push('factory');return {renderAt:()=>({value:1}),dispose:()=>{events.push('stage-dispose');}};};},[binding],packages,loaders,{});
 const stage=await factory({width:8,height:8,pixelRatio:1,resources:{}} as any);await stage.dispose?.();await stage.dispose?.();assert.deepEqual(events,['init','bind','load-factory','factory','stage-dispose','package-dispose']);
 events.length=0;const broken=createManagedStage(async()=>{throw Error('factory failed');},[binding],packages,loaders,{});await assert.rejects(async()=>broken({width:8,height:8,resources:{}} as any),/factory failed/);assert.deepEqual(events,['init','bind','package-dispose']);
});

test('actual managed use rejects an incompatible Engine before loading Web code',async()=>{
 const c=await managedContext(dir,root,alias),built=await buildProject(entry),stage={...built.manifest.stages[0],engine:'audio' as const};
 await assert.rejects(c.prepare(stage,built.manifest,join(dir,'wrong-engine'),[{ref:`pro-animation@${paVersion}`,names:['wiggle']}]),{code:'E_ENGINE_INCOMPATIBLE'});
});

test('generic catalog name installation creates an initial lock, exposes declarations and retains existing locks',{timeout:90000},async()=>{
 const target=await mkdtemp(join(base,'named-'));await writeFile(join(target,'project.tsx'),source);
 await assert.rejects(packagesCLI(['install','pro-animation','--catalog',catalog,'--project',target]),{code:'E_PACKAGE_TRUST'});
 await packagesCLI(['install','pro-animation','--catalog',catalog,'--project',target,'--trust','local:frameweave.pro','--trust','local:frameweave.foundation']);
 const lock=await readFile(join(target,'frameweave.plugins.lock.json'));await buildProject(join(target,'project.tsx'));await packagesCLI(['install','pro-animation','--catalog',catalog,'--project',target]);assert.deepEqual(await readFile(join(target,'frameweave.plugins.lock.json')),lock);
 const types=await packagesCLI(['types','--project',target]) as {file:string};assert.ok((await readFile(types.file,'utf8')).includes('dist/bindings.d.ts'));
});

test('non-effect packages support transitive named imports and Flat; Node imports remain denied',{timeout:150000},async()=>{
 const owner=await mkdtemp(join(base,'generic-')),catalog=join(owner,'catalog'),author=join(owner,'author'),clean=join(owner,'clean');await mkdir(catalog);await mkdir(author);await mkdir(clean);
 async function pack(id:string,code:string,dependencies:Record<string,string>={}){const p=join(catalog,id);await mkdir(p);await writeFile(join(p,'frameweave.package.json'),JSON.stringify({schemaVersion:1,apiVersion:1,id,version:'1.0.0',name:id,description:'Generic static binding fixture',compatible:'0.1.0',source:{kind:'local',authority:'test.named'},platforms:['web'],capabilities:[],permissions:{filesystem:false,network:false,process:false},dependencies,modules:{main:{format:'javascript',path:'./index.ts'}},bindings:{schemaVersion:1,module:'main',types:'./api.d.ts',engine:'web'}}));await writeFile(join(p,'index.ts'),code);await writeFile(join(p,'api.d.ts'),'export declare function value():number;');}
 await pack('test.dep','export function value(){return 7;}');await pack('test.root',"import {value as dependency} from 'test.dep';export function value(){return dependency()+1;}",{'test.dep':'1.0.0'});
 const code=`import {Composition,Stage} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';import {value} from 'test.root';export const scene=defineWebStage(({container})=>({renderAt(){container.textContent=String(value());return {value:value()};}}));export default <Composition width={16} height={16} fps={1} durationInFrames={1}><Stage id="test" factory={scene} outputs={{surface:'surface',value:'number'}}/></Composition>;`;
 const entry=join(author,'project.tsx');await writeFile(entry,code);await packagesCLI(['install',catalog,'--project',author,'--add','test.root@1.0.0','--trust','local:test.named']);
 const r=await Renderer.create(await buildProject(entry));try{assert.equal((await r.renderFrame(0)).stageOutputs.test.value,8);}finally{await r.close();}
 const output=join(clean,'functions.tsx');await exportProject(entry,{output,singleFile:true});await rename(author,author+'-offline');try{const flat=await Renderer.create(await buildProject(output));try{assert.equal((await flat.renderFrame(0)).stageOutputs.test.value,8);}finally{await flat.close();}}finally{await rename(author+'-offline',author);}
 await pack('test.node-denied',"import {readFileSync} from 'node:fs';export function value(){return readFileSync('private').length;}");const bad=join(owner,'bad');await mkdir(bad);await writeFile(join(bad,'project.tsx'),code.replaceAll('test.root','test.node-denied'));await packagesCLI(['install',catalog,'--project',bad,'--add','test.node-denied@1.0.0','--trust','local:test.named']);await assert.rejects(buildProject(join(bad,'project.tsx')),{code:'E_PACKAGE_PERMISSION'});
});
