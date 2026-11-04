import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import sharp from 'sharp';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {EngineError} from '../src/core/errors.ts';
import type {BuiltProject} from '../src/core/types.ts';

const fixtureRoot=join(engineRoot,'.frameweave','single-file-tests');
const fixtures:string[]=[];
const imports=`import {Composition,Stage,Layer,Text,Rect,ref,type FrameContext} from '@frameweave/engine';
import {defineWebStage,type StageFactory} from '@frameweave/engine/native';`;
async function fixture(files:Record<string,string>):Promise<string> {
  await mkdir(fixtureRoot,{recursive:true});const dir=await mkdtemp(join(fixtureRoot,'fixture-'));fixtures.push(dir);
  for(const [name,text]of Object.entries(files)) {const path=join(dir,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
  return dir;
}
async function build(dir:string,entry='project.ts'):Promise<BuiltProject> {
  return buildProject(join(dir,entry),{outputDir:join(dir,'build')});
}
async function withRenderer<T>(built:BuiltProject,body:(renderer:Renderer)=>Promise<T>):Promise<T> {
  const renderer=await Renderer.create(built,{cache:false,timeoutMs:15000});
  try{return await body(renderer);}finally{await renderer.close();}
}
async function sample(png:Buffer,x:number,y:number):Promise<number[]> {
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const offset=(y*info.width+x)*4;return [...data.subarray(offset,offset+4)];
}
after(async()=> {
  for(const dir of fixtures) {
    // Verify each final absolute target before any recursive removal on Windows.
    assert.equal(dirname(resolve(dir)),resolve(fixtureRoot));await rm(dir,{recursive:true,force:true});
  }
});

test('one standard TS file preserves typed helpers, module constants and several exported native factories', {timeout:120000},async()=> {
  const dir=await fixture({'project.ts':`${imports}
const BIAS:number=7;
function calculate(frame:number,multiplier:number):number{return frame*multiplier+BIAS;}
function block(container:HTMLElement,color:string,x:number,y:number):HTMLElement {
  const element=document.createElement('div');
  element.style.cssText='position:absolute;width:16px;height:16px;left:'+x+'px;top:'+y+'px;background:'+color;
  container.append(element);return element;
}
export function source({container}:Parameters<StageFactory>[0]) {
  const element=block(container,'#204060',0,0);
  return {renderAt(context:FrameContext){element.style.left=context.frame+'px';return {value:calculate(context.frame,2)};}};
};
function makeConsumer(multiplier:number) { return defineWebStage(({container})=>{
  block(container,'#00ff00',32,0);
  return {renderAt(context,inputs){return {received:Number(inputs.value)*multiplier+BIAS,local:calculate(context.frame,1)};}};
}); }
export const consumer=makeConsumer(3);
export default Composition({width:64,height:64,fps:10,durationInFrames:10,background:'#000000',children:[
  Stage({id:'source',factory:source,outputs:{surface:'surface',value:'number'}}),
  Stage({id:'consumer',factory:consumer,inputs:{value:ref('source','value')},inputTypes:{value:'number'},outputs:{surface:'surface',received:'number',local:'number'}})
]});`});
  const built=await build(dir);
  assert.deepEqual(built.manifest.stages.map(stage=>[stage.entry,stage.exportName]),[['./project.ts','source'],['./project.ts','consumer']]);
  const wire=JSON.parse(await readFile(join(built.dir,'tvg.json'),'utf8'));
  for(const stage of wire.stages) {assert.equal('factory'in stage,false);assert.equal(Object.getOwnPropertySymbols(stage).length,0);}
  assert.ok((await readFile(join(built.dir,built.stageBundles.source),'utf8')).includes('calculate'));
  await withRenderer(built,async renderer=>{
    const first=await renderer.renderFrame(0);assert.equal(first.stageOutputs.source.value,7);assert.equal(first.stageOutputs.consumer.received,28);
    assert.deepEqual(await sample(first.png,4,4),[32,64,96,255]);assert.deepEqual(await sample(first.png,36,4),[0,255,0,255]);
    const later=await renderer.renderFrame(4);assert.equal(later.stageOutputs.source.value,15);assert.equal(later.stageOutputs.consumer.received,52);assert.equal(later.stageOutputs.consumer.local,11);
    assert.notDeepEqual(later.png,first.png);assert.deepEqual((await renderer.renderFrame(0)).png,first.png);
  });
});

test('single custom-runtime TSX file combines native React createElement with genuine declarative TVG pixels', {timeout:120000},async()=> {
  const dir=await fixture({'project.tsx':`${imports}
import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
const NATIVE_COLOR='#00ff00';
export const reactPanel=defineWebStage(({container})=>{
  const root=createRoot(container);
  return {renderAt(context){flushSync(()=>root.render(createElement('div',{style:{position:'absolute',left:0,top:0,width:32,height:32,backgroundColor:NATIVE_COLOR},'data-frame':context.frame})));return {frame:context.frame};},dispose(){root.unmount();}};
});
export default <Composition width={64} height={64} fps={10} durationInFrames={10} background="#000000">
  <Stage id="react" factory={reactPanel} outputs={{surface:'surface',frame:'number'}} />
  <Stage id="tsx"><Rect x={32} y={0} width={32} height={32} fill="#0000ff" /></Stage>
</Composition>;`});
  const built=await build(dir,'project.tsx');assert.equal(built.manifest.stages[0].exportName,'reactPanel');
  assert.equal(built.manifest.stages[1].nodes?.[0].kind,'rect');
  await withRenderer(built,async renderer=>{
    const frame=await renderer.renderFrame(3);assert.equal(frame.stageOutputs.react.frame,3);
    assert.deepEqual(await sample(frame.png,8,8),[0,255,0,255]);assert.deepEqual(await sample(frame.png,48,8),[0,0,255,255]);
    const native=await renderer.renderFrame(3,'react');assert.deepEqual(await sample(native.png,48,8),[0,0,0,0]);
  });
});

test('React JSX pragma selects one runtime per file while graph authoring remains standard function calls', {timeout:120000},async()=> {
  const dir=await fixture({'project.tsx':`/** @jsxImportSource react */
${imports}
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
const color='#ff0080';
function Panel({frame}:{frame:number}) {return <div data-frame={frame} style={{position:'absolute',left:4,top:4,width:24,height:20,backgroundColor:color}} />;}
export const reactFactory=defineWebStage(({container})=>{
  const root=createRoot(container);return {renderAt(context){flushSync(()=>root.render(<Panel frame={context.frame} />));return {frame:context.frame};},dispose(){root.unmount();}};
});
export default Composition({width:64,height:64,fps:10,durationInFrames:10,background:'#000000',children:[
  Stage({id:'jsx-react',factory:reactFactory,outputs:{surface:'surface',frame:'number'}}),
  Stage({id:'video-shape',children:Rect({x:40,y:4,width:16,height:20,fill:'#00ffff'})})
]});`});
  const built=await build(dir,'project.tsx');
  await withRenderer(built,async renderer=>{
    const frame=await renderer.renderFrame(2);assert.equal(frame.stageOutputs['jsx-react'].frame,2);
    assert.deepEqual(await sample(frame.png,8,8),[255,0,128,255]);assert.deepEqual(await sample(frame.png,44,8),[0,255,255,255]);
  });
});

test('entry plus a named export retains the original multi-file native-module API', {timeout:120000},async()=> {
  const dir=await fixture({
    'project.ts':`${imports}
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'named',entry:'./native.ts',exportName:'namedFactory',outputs:{surface:'surface',value:'number'}})});`,
    'native.ts':`import {defineWebStage} from '@frameweave/engine/native';
const offset=41;export const namedFactory=defineWebStage(({container})=>({renderAt(context){container.style.background='#123456';return {value:offset+context.frame};}}));
export default ()=>{throw new Error('Wrong default export was selected');};`
  });
  const built=await build(dir);assert.equal(built.manifest.stages[0].entry,'./native.ts');assert.equal(built.manifest.stages[0].exportName,'namedFactory');
  await withRenderer(built,async renderer=>{const frame=await renderer.renderFrame(1);assert.equal(frame.stageOutputs.named.value,42);assert.deepEqual(await sample(frame.png,4,4),[18,52,86,255]);});
});

test('local export aliases and root re-export aliases are resolved by exact function identity', {timeout:120000},async()=> {
  const dir=await fixture({
    'project.ts':`${imports}
import {original} from './library.ts';export {original as reexported};
const privateName=defineWebStage(()=>({renderAt(context){return {value:10+context.frame};}}));
export {privateName as 本地工厂};
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:[
Stage({id:'local-alias',factory:privateName,outputs:{value:'number'}}),
Stage({id:'root-reexport',factory:original,outputs:{value:'number'}})
]});`,
    'library.ts':`import {defineWebStage} from '@frameweave/engine/native';const hidden=20;export const original=defineWebStage(()=>({renderAt(context){return {value:hidden+context.frame};}}));`
  });
  const built=await build(dir);assert.deepEqual(built.manifest.stages.map(stage=>stage.exportName),['本地工厂','reexported']);
  await withRenderer(built,async renderer=>{const frame=await renderer.renderFrame(2);assert.equal(frame.stageOutputs['local-alias'].value,12);assert.equal(frame.stageOutputs['root-reexport'].value,22);});
});

test('single-file source reuse creates separate runtime realms; data crosses only explicit Stage ports', {timeout:120000},async()=> {
  const dir=await fixture({'project.ts':`${imports}
let moduleLocalCounter=0;
export const isolated=defineWebStage(({container})=>{
  const box=document.createElement('div');box.style.cssText='width:8px;height:8px;background:#ffffff';container.append(box);
  return {renderAt(context,inputs){moduleLocalCounter++;return {own:moduleLocalCounter,received:Number(inputs.upstream??0),globalFrame:context.globalFrame};}};
});
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:[
Stage({id:'producer',factory:isolated,outputs:{surface:'surface',own:'number',received:'number',globalFrame:'number'}}),
Stage({id:'consumer',factory:isolated,inputs:{upstream:ref('producer','own')},inputTypes:{upstream:'number'},outputs:{surface:'surface',own:'number',received:'number',globalFrame:'number'}})
]});`});
  const built=await build(dir);assert.equal(built.manifest.stages[0].entry,built.manifest.stages[1].entry);
  await withRenderer(built,async renderer=>{
    const first=await renderer.renderFrame(0);
    assert.equal(first.stageOutputs.producer.own,1);assert.equal(first.stageOutputs.consumer.own,1,'Shared module state would instead be 2.');
    assert.equal(first.stageOutputs.producer.received,0);assert.equal(first.stageOutputs.consumer.received,1);
    const next=await renderer.renderFrame(1);assert.equal(next.stageOutputs.producer.own,2);assert.equal(next.stageOutputs.consumer.own,2);
    assert.equal(next.stageOutputs.consumer.received,2);assert.equal(next.stageOutputs.consumer.globalFrame,1);
  });
});

test('factory without a root named export receives a clear Stage-specific build diagnostic',async()=> {
  const dir=await fixture({'project.ts':`${imports}
const hidden=defineWebStage(()=>({renderAt(){return {};}}));
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'private-factory',factory:hidden})});`});
  await assert.rejects(()=>build(dir),(error:unknown)=>{
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_STAGE_FACTORY_EXPORT');assert.equal(error.stageId,'private-factory');
    assert.match(error.message,/named export|re-export/i);return true;
  });
});

test('project stderr logging preserves the structured factory export diagnostic',async()=> {
  const dir=await fixture({'project.ts':`${imports}
console.error('ordinary build log before factory validation');
const hidden=defineWebStage(()=>({renderAt(){return {};}}));
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'logged',factory:hidden})});`});
  await assert.rejects(()=>build(dir),(error:unknown)=>error instanceof EngineError&&error.code==='E_STAGE_FACTORY_EXPORT'&&error.stageId==='logged');
});

test('factory authoring rejects invalid values and conflicting sources without weakening validation',async()=> {
  const cases:[string,string][]=[
    [`factory:23 as any`,'E_STAGE_FACTORY'],
    [`factory:native,entry:'./other.ts'`,'E_STAGE_ENTRY'],
    [`factory:native,children:Rect({width:1,height:1})`,'E_STAGE_ENTRY'],
    [`factory:native,engine:'mock'`,'E_STAGE_FACTORY'],
    [`factory:native,exportName:'native'`,'E_STAGE_EXPORT'],
  ];
  for(const [properties,code]of cases) {
    const dir=await fixture({'project.ts':`${imports}
export const native=defineWebStage(()=>({renderAt(){return {};}}));
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'invalid',${properties}})});`});
    await assert.rejects(()=>build(dir),{code},`Invalid source properties: ${properties}`);
  }
});

test('missing named native export fails compilation with its Stage and source context',async()=> {
  const dir=await fixture({
    'project.ts':`${imports}
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'missing-export',entry:'./native.ts',exportName:'notHere'})});`,
    'native.ts':'export default ()=>({renderAt(){return {};}});'
  });
  await assert.rejects(()=>build(dir),(error:unknown)=>{
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_COMPILE');assert.equal(error.stageId,'missing-export');assert.match(error.message,/notHere|matching export/);return true;
  });
});
