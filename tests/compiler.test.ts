import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {typecheckProject} from '../src/compiler/typecheck.ts';
import {Renderer} from '../src/render/renderer.ts';
import {Composition,Stage,Text} from '../src/index.ts';
import {EngineError} from '../src/core/errors.ts';

const fixtureRoot=join(engineRoot,'.frameweave','compiler-tests');
const externalFixtureRoot=resolve(engineRoot,'../../work/compiler-external-tests');
const fixtures:string[]=[];
const exec=promisify(execFile);
const imports=`import { Composition,Stage,Layer,Text,Rect,Group,Resource,ref,keyframes } from ${JSON.stringify(join(engineRoot,'src/index.ts'))};`;
async function fixture(files:Record<string,string>,external=false):Promise<string> {
  const parent=external?externalFixtureRoot:fixtureRoot;
  await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'fixture-'));fixtures.push(dir);
  for (const [name,text] of Object.entries(files)) {const path=join(dir,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
  return dir;
}
after(async()=> {
  for (const dir of fixtures) {
    // Explicitly verify every final absolute target before recursive removal on Windows.
    assert.ok([resolve(fixtureRoot),resolve(externalFixtureRoot)].includes(dirname(resolve(dir))));
    await rm(dir,{recursive:true,force:true});
  }
});
test('compiler builds real TSX, normal TS helpers, custom JSX and a serializable TVG',async()=> {
  const dir=await fixture({
    'math.ts':'export function spacing(index:number):number { return index*42; }',
    'project.tsx':`${imports}\nimport {spacing} from './math.ts';\nexport default <Composition id="compile-test" width={320} height={180} fps={30} duration={1}><Stage id="text"><Group>{[0,1,2].map(index=><Text key={index} content={String(index)} x={spacing(index)} />)}</Group></Stage></Composition>;`
  });
  const built=await buildProject(join(dir,'project.tsx'),{outputDir:join(dir,'build')});
  assert.equal(built.manifest.composition.durationInFrames,30);
  assert.equal(built.manifest.stages[0].nodes?.[0].children?.[2].x,84);
  const wire=JSON.parse(await readFile(join(built.dir,'tvg.json'),'utf8'));
  assert.deepEqual(wire,built.manifest);assert.equal(built.hash.length,64);
  assert.ok((await readFile(join(built.dir,built.stageBundles.text),'utf8')).includes('installStage'));
});
test('plain JSON TVG is a buildable project entry without React or authoring execution',async()=> {
  const graph=Composition({width:320,height:180,fps:30,duration:1,children:Stage({id:'plain',children:Text({content:'JSON'})})});
  const dir=await fixture({'project.json':JSON.stringify(graph)});
  const built=await buildProject(join(dir,'project.json'),{outputDir:join(dir,'build')});
  assert.equal(built.manifest.stages[0].nodes?.[0].content,'JSON');assert.ok(built.stageBundles.plain);
});
test('compiler bundles an actual native TS entry while TVG only stores its Stage boundary',async()=> {
  const dir=await fixture({
    'project.ts':`${imports}\nexport default Composition({width:320,height:180,fps:30,duration:1,children:Stage({id:'native',entry:'./native.ts',outputs:{surface:'surface',value:'number'}})});`,
    'native.ts':'export default ({container}:{container:HTMLElement})=>({renderAt(context:{frame:number}) {container.textContent="frame="+context.frame;return {value:context.frame};}});'
  });
  const built=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});
  assert.equal(built.manifest.stages[0].entry,'./native.ts');assert.equal(built.manifest.stages[0].nodes,undefined);
  const bundle=await readFile(join(built.dir,built.stageBundles.native),'utf8');
  assert.ok(bundle.includes('frame='));assert.ok(bundle.includes('renderAt'));assert.ok(!bundle.includes('node:fs'));
});
test('compiler reports source locations for invalid TSX syntax',async()=> {
  const dir=await fixture({'project.tsx':`${imports}\nexport default <Composition width={320} height={180} fps={30} duration={1}><Stage id="broken"></Composition>;`});
  await assert.rejects(()=>buildProject(join(dir,'project.tsx'),{outputDir:join(dir,'build')}),(error:unknown)=> {
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_COMPILE');
    const details=error.details as {location?:{line:number}}[];assert.ok(details.some(item=>item.location&&item.location.line>=2));return true;
  });
});
test('compiler diagnoses missing declared resources before rendering',async()=> {
  const dir=await fixture({'project.ts':`${imports}\nexport default Composition({width:320,height:180,fps:30,duration:1,children:[Stage({id:'text',children:Text({content:'Missing'})}),Resource({id:'missing',kind:'image',src:'./does-not-exist.png'})]});`});
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),{code:'E_RESOURCE_MISSING'});
});
test('compiler preserves structured Stage-reference diagnostics from TVG validation',async()=> {
  const dir=await fixture({'project.ts':`${imports}\nexport default Composition({width:320,height:180,fps:30,duration:1,children:[Stage({id:'text',children:Text({content:'Bad ref'})}),Layer({id:'bad',source:ref('missing')})]});`});
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),(error:unknown)=> {
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_TVG');
    const details=error.details as {diagnostics:{code:string}[]};assert.ok(details.diagnostics.some(d=>d.code==='E_STAGE_REF'));return true;
  });
});
test('compiler refuses to pretend build-time closures can be serialized',async()=> {
  const dir=await fixture({'project.ts':`${imports}\nexport default Composition({width:320,height:180,fps:30,duration:1,children:Stage({id:'native',entry:'./native.ts',props:{x:()=>Math.random()}})});`});
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),(error:unknown)=>error instanceof EngineError&&error.code==='E_PROJECT'&&/Non-serializable|E_SERIALIZE|function/.test(error.message));
});

test('live Date/toJSON objects and undefined fields cannot bypass TVG serialization checks',async()=> {
  for (const expression of ['new Date(0)', '{toJSON(){return 1}}', 'undefined']) {
    const dir=await fixture({'project.ts':`${imports}\nexport default Composition({width:320,height:180,fps:30,duration:1,children:Stage({id:'native',entry:'./native.ts',props:{bad:${expression}}})});`});
    await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),{code:'E_PROJECT'});
  }
});
test('infinite build-time code is terminated in the separate build process',async()=> {
  const dir=await fixture({'project.ts':'while(true) {}\nexport default {};'});
  const start=Date.now();
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build'),timeoutMs:300}),{code:'E_BUILD_TIMEOUT'});
  assert.ok(Date.now()-start<10000,'Build timeout must terminate the process promptly.');
});
test('resource bytes and native entry changes invalidate the build fingerprint',async()=> {
  const dir=await fixture({
    'project.ts':`${imports}\nexport default Composition({width:320,height:180,fps:30,duration:1,children:[Stage({id:'native',entry:'./native.ts'}),Resource({id:'data',kind:'file',src:'./data.txt'})]});`,
    'native.ts':'export default ()=>({renderAt(){return {};}});','data.txt':'version one'
  });
  const first=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});
  await writeFile(join(dir,'data.txt'),'version two');
  const second=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});assert.notEqual(first.hash,second.hash);
  await writeFile(join(dir,'native.ts'),'export default ()=>({renderAt(){document.body.dataset.test="changed";return {};}});');
  const third=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});assert.notEqual(second.hash,third.hash);
  assert.equal(third.manifest.resources[0].src,'assets/data.txt');
});

function typeError(expectedFile:string,stageId?:string) {
  return (error:unknown):boolean=> {
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_TYPECHECK');
    const details=error.details as {diagnostics:{code:string;tsCode:number;file?:string;line?:number;column?:number;stageId?:string}[]};
    const issue=details.diagnostics.find(item=>item.file===resolve(expectedFile));assert.ok(issue,JSON.stringify(details));
    assert.equal(issue.code,'E_TYPECHECK');assert.equal(typeof issue.tsCode,'number');assert.ok(issue.line!>0);assert.ok(issue.column!>0);
    if(stageId!==undefined) {assert.equal(issue.stageId,stageId);assert.equal(error.stageId,stageId);}
    return true;
  };
}

test('formal build checks the requested TS entry outside the engine directory and tsconfig include',async()=> {
  const dir=await fixture({'project.ts':`import {Composition,Stage,Text} from '@frameweave/engine';
const wrong:number='not a number';
export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'t',children:Text({content:String(wrong)})})});`},true);
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),typeError(join(dir,'project.ts')));
});

test('requested external TSX uses the video JSX types and rejects unknown component properties',async()=> {
  const dir=await fixture({'project.tsx':`import {Composition,Stage,Rect} from '@frameweave/engine';
export default <Composition width={64} height={64} fps={10} durationInFrames={10}><Stage id="t"><Rect width={10} height={10} imaginaryVideoProperty="bad" /></Stage></Composition>;`},true);
  await assert.rejects(()=>buildProject(join(dir,'project.tsx'),{outputDir:join(dir,'build')}),typeError(join(dir,'project.tsx')));
});

test('transitively imported TS helpers are checked, while unrelated files are not program roots',async()=> {
  const dir=await fixture({
    'project.ts':`import {Composition,Stage,Text} from '@frameweave/engine';import {label} from './helper.ts';export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'t',children:Text({content:String(label())})})});`,
    'helper.ts':`export function label():number {return 'wrong helper type';}`,
    'unrelated.ts':`const unrelated:number='this file is deliberately outside the requested dependency graph';export {};`,
  });
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),typeError(join(dir,'helper.ts')));
  await writeFile(join(dir,'helper.ts'),'export function label():number {return 7;}');
  assert.equal((await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')})).manifest.stages.length,1);
});

test('native string entry modules and their imported helpers are checked with Stage attribution',async()=> {
  for(const helperError of [false,true]) {
    const dir=await fixture({
      'project.ts':`${imports}\nexport default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'native-types',entry:'./native.ts',outputs:{surface:'surface',value:'number'}})});`,
      'native.ts':`import {defineWebStage} from '@frameweave/engine/native';
${helperError?`import {value} from './native-helper.ts';`:`const value:number='wrong native entry type';`}
export default defineWebStage(()=>({renderAt(){return {value};}}));`,
      'native-helper.ts':`export const value:number='wrong imported native helper type';`,
    });
    const badFile=helperError?'native-helper.ts':'native.ts';
    await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),typeError(join(dir,badFile),'native-types'));
  }
});

test('valid external single-file named native factories pass real TS checks and resolve public engine imports',async()=> {
  const dir=await fixture({'project.tsx':`import {Composition,Stage,Rect} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';
const hidden:number=4;function helper(frame:number):number{return frame+hidden;}
export const native=defineWebStage(({container})=>({renderAt(context){container.textContent=String(helper(context.frame));return {value:helper(context.frame)};}}));
export default <Composition width={64} height={64} fps={10} durationInFrames={10}><Stage id="native" factory={native} outputs={{surface:'surface',value:'number'}} /><Stage id="rect"><Rect width={10} height={10} /></Stage></Composition>;`},true);
  const built=await buildProject(join(dir,'project.tsx'),{outputDir:join(dir,'build')});
  assert.equal(built.manifest.stages[0].exportName,'native');assert.equal(built.manifest.stages[0].entry,'./project.tsx');
});

test('checker supplies installed React and Node types for external native React TSX and per-file JSX pragmas',async()=> {
  const dir=await fixture({'native.tsx':`/** @jsxImportSource react */
import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {defineWebStage} from '@frameweave/engine/native';
const version:string=process.version;
export default defineWebStage(({container})=>{const root=createRoot(container);return {renderAt(context){flushSync(()=>root.render(<div data-frame={context.frame}>{version}</div>));return {};},dispose(){root.unmount();}};});`},true);
  await typecheckProject([{file:join(dir,'native.tsx'),stageId:'external-react'}]);
});

test('native asset imports receive loader declarations without suppressing ordinary TS errors',async()=> {
  const dir=await fixture({
    'project.ts':`${imports}\nexport default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'assets',entry:'./native.ts'})});`,
    'native.ts':`import {defineWebStage} from '@frameweave/engine/native';import image from './dot.png';import source from './pulse.glsl';import './style.css';
const imageUrl:string=image;const shaderSource:string=source;
export default defineWebStage(({container})=>({renderAt(){container.dataset.image=imageUrl;container.dataset.shader=shaderSource;return {};}}));`,
    'pulse.glsl':'void main() { gl_FragColor = vec4(1.0); }','style.css':'.native { color: red; }',
  });
  await writeFile(join(dir,'dot.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPlsAAAAASUVORK5CYII=','base64'));
  assert.ok((await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')})).stageBundles.assets);
});

test('JS remains unchecked by default, while JS/JSON graph schemas and imported TS helpers remain validated',async()=> {
  const graph=Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'text',children:Text({content:'JS'})})});
  const dir=await fixture({'project.js':`/** @type {number} */ const unchecked='still valid ordinary JS';export default ${JSON.stringify(graph)};`});
  assert.equal((await buildProject(join(dir,'project.js'),{outputDir:join(dir,'build')})).manifest.stages[0].id,'text');
  await writeFile(join(dir,'project.js'),'export default {invalid:true};');
  await assert.rejects(()=>buildProject(join(dir,'project.js'),{outputDir:join(dir,'build')}),{code:'E_TVG'});
  await writeFile(join(dir,'project.json'),JSON.stringify({invalid:true}));
  await assert.rejects(()=>buildProject(join(dir,'project.json'),{outputDir:join(dir,'build')}),{code:'E_TVG'});
  await writeFile(join(dir,'helper.ts'),`export const value:number='bad TS even when its importer is JS';`);
  await writeFile(join(dir,'project.js'),`import {value} from './helper.ts';const p=${JSON.stringify(graph)};p.composition.seed=value;export default p;`);
  await assert.rejects(()=>buildProject(join(dir,'project.js'),{outputDir:join(dir,'build')}),typeError(join(dir,'helper.ts')));
});

test('CLI build, frame and render all enforce the same mandatory TypeScript gate',async()=> {
  const dir=await fixture({'project.ts':`${imports}\nconst invalid:number='wrong';export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'text',children:Text({content:String(invalid)})})});`});
  for(const command of ['build','frame','render']) {
    await assert.rejects(()=>exec(process.execPath,['--import','tsx',join(engineRoot,'src/cli.ts'),command,join(dir,'project.ts'),'--json'],{cwd:engineRoot,timeout:30000,maxBuffer:1024*1024,windowsHide:true}),(error:unknown)=>{
      const result=error as {code?:number;stderr?:string};assert.equal(result.code,1);const body=JSON.parse(result.stderr!);
      assert.equal(body.ok,false);assert.equal(body.diagnostics[0].code,'E_TYPECHECK');
      assert.equal(body.diagnostics[0].details.diagnostics[0].file,join(dir,'project.ts'));return true;
    });
  }
});

test('the isolated TypeScript worker has a bounded timeout rather than an option to skip checking',async()=> {
  const dir=await fixture({'project.ts':'export const value:number=1;'});
  await assert.rejects(()=>typecheckProject([{file:join(dir,'project.ts')}],{timeoutMs:1}),{code:'E_TYPECHECK_TIMEOUT'});
});

test('native checker infers concrete generic input contracts including optional fields and transferable surfaces',async()=> {
  const dir=await fixture({'native.ts':`import {defineWebStage,type Surface} from '@frameweave/engine/native';
interface Inputs {value:number;title?:string;enabled:boolean;payload:{weights:number[]};image:Surface}
export const native=defineWebStage<Inputs>(async()=>({renderAt(context,inputs){return {value:inputs.value+context.frame};}}));`});
  const result=await typecheckProject([{file:join(dir,'native.ts'),stageId:'generic',exportName:'native'}]);
  assert.deepEqual(result.contracts.generic,{value:'number',title:{type:'string',optional:true},enabled:'boolean',payload:'json',image:'surface'});
  assert.equal(result.unresolvedContracts.generic,undefined);
});

test('dynamic input records remain unresolved, and partial closed types require explicit contracts',async()=> {
  const dir=await fixture({'native.ts':`import {defineWebStage} from '@frameweave/engine/native';
export const dynamic=defineWebStage(()=>({renderAt(context,inputs){return {};}}));
interface Mixed {count:number;data:unknown;optional?:boolean}
export const partial=defineWebStage<Mixed>(()=>({renderAt(){return {};}}));`});
  const result=await typecheckProject([{file:join(dir,'native.ts'),stageId:'dynamic',exportName:'dynamic'},{file:join(dir,'native.ts'),stageId:'partial',exportName:'partial'}]);
  assert.equal(result.contracts.dynamic,undefined);assert.deepEqual(result.unresolvedContracts.dynamic,['*']);
  assert.deepEqual(result.contracts.partial,{count:'number',optional:{type:'boolean',optional:true}});assert.deepEqual(result.unresolvedContracts.partial,['data']);
});

test('contract inference follows named re-exports to the selected callable without executing native modules',async()=> {
  const dir=await fixture({
    'native.ts':`export {original as selected} from './implementation.ts';throw new Error('The checker must not execute this module');`,
    'implementation.ts':`import {defineWebStage} from '@frameweave/engine/native';export const original=defineWebStage<{v:number}>(()=>({renderAt(context,inputs){return {v:inputs.v};}}));`
  });
  const result=await typecheckProject([{file:join(dir,'native.ts'),stageId:'selected',exportName:'selected'}]);
  assert.deepEqual(result.contracts.selected,{v:'number'});
});

test('a typed generic native consumer rejects a declared string producer without changing the audit-shaped source',async()=> {
  const dir=await fixture({
    'project.ts':`${imports}\nexport default Composition({width:64,height:64,fps:10,durationInFrames:10,children:[
Stage({id:'producer',entry:'./producer.ts',outputs:{value:'string'}}),
Stage({id:'consumer',entry:'./consumer.ts',inputs:{v:ref('producer','value')},outputs:{value:'number'}})
]});`,
    'producer.ts':`import {defineWebStage} from '@frameweave/engine/native';export default defineWebStage(()=>({renderAt(){return {value:'not a number'};}}));`,
    'consumer.ts':`import {defineWebStage} from '@frameweave/engine/native';interface Inputs {v:number}export default defineWebStage<Inputs>(()=>({renderAt(context,inputs){return {value:inputs.v+1};}}));`
  });
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),(error:unknown)=>{
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_TVG');
    const details=error.details as {diagnostics:{code:string;stageId?:string}[]};
    assert.ok(details.diagnostics.some(issue=>issue.code==='E_INPUT_TYPE'&&issue.stageId==='consumer'));return true;
  });
  const project=await readFile(join(dir,'project.ts'),'utf8');
  await writeFile(join(dir,'project.ts'),project.replace(`inputs:{v:ref('producer','value')}`,`inputs:{v:ref('producer','value')},inputTypes:{v:'string'}`));
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),{code:'E_INPUT_TYPE',stageId:'consumer'});
});

test('native input inference preserves required versus optional properties and verifies explicit schemas',async()=> {
  const native=`import {defineWebStage} from '@frameweave/engine/native';interface Inputs {v:number;caption?:string}export default defineWebStage<Inputs>(()=>({renderAt(context,inputs){return {value:inputs.v};}}));`;
  const source=(contract='')=>`${imports}\nexport default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'consumer',entry:'./consumer.ts',inputs:{v:3},${contract}outputs:{value:'number'}})});`;
  const dir=await fixture({'project.ts':source(),'consumer.ts':native});
  const built=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});
  assert.deepEqual(built.manifest.stages[0].inputTypes,{v:'number',caption:{type:'string',optional:true}});
  await writeFile(join(dir,'project.ts'),source(`inputTypes:{v:'string'},`));
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),(error:unknown)=>error instanceof EngineError&&(error.code==='E_INPUT_TYPE'||error.code==='E_TVG'));
  await writeFile(join(dir,'project.ts'),source(`inputTypes:{v:{type:'number',optional:true}},`));
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),{code:'E_INPUT_TYPE',stageId:'consumer'});
  await writeFile(join(dir,'project.ts'),source(`inputTypes:{v:'number',caption:'string'},`));
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),(error:unknown)=>{
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_TVG');return error.message.includes('caption');
  });
  await writeFile(join(dir,'project.ts'),source().replace('inputs:{v:3}','inputs:{}'));
  await assert.rejects(()=>buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')}),(error:unknown)=>{
    assert.ok(error instanceof EngineError);assert.equal(error.code,'E_TVG');return error.message.includes('E_INPUT_MISSING');
  });
});

test('unknown JS authoring properties are rejected rather than silently accepted by unchecked JS',async()=> {
  const dir=await fixture({'project.js':`import {Composition,Stage,Rect} from '@frameweave/engine';export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'r',children:Rect({width:50,height:10,typoWidth:99})})});`});
  await assert.rejects(()=>buildProject(join(dir,'project.js'),{outputDir:join(dir,'build')}),{code:'E_UNKNOWN_PROPERTY'});
});

test('external native Three modules and typed helpers use the same installed dependency fallback as the checker',async()=> {
  const dir=await fixture({
    'project.ts':`import {Composition,Stage} from '@frameweave/engine';export default Composition({width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'three',entry:'./native.ts',outputs:{value:'number'}})});`,
    'native.ts':`import * as THREE from 'three';import {defineWebStage} from '@frameweave/engine/native';import {vector} from './helper.ts';export default defineWebStage(()=>{const scene=new THREE.Scene();scene.position.copy(vector());return {renderAt(){return {value:scene.position.x};}};});`,
    'helper.ts':`import {Vector3} from 'three';export function vector():Vector3{return new Vector3(1,2,3);}`,
  },true);
  const built=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});
  const bundled=await readFile(join(built.dir,built.stageBundles.three),'utf8');
  assert.match(bundled,/\bisScene\b/);assert.match(bundled,/\bVector3\b/);assert.doesNotMatch(bundled,/from ["']three["']/);
  const renderer=await Renderer.create(built,{timeoutMs:15000});
  try {assert.equal((await renderer.renderFrame(1)).stageOutputs.three.value,1);}finally{await renderer.close();}
});

test('external single-file React factory imports resolve in both the Node build evaluator and browser bundle',async()=> {
  const dir=await fixture({'project.tsx':`import {Composition,Stage} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';
import {createElement} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
export const native=defineWebStage(({container})=>{const root=createRoot(container);return {renderAt(context){flushSync(()=>root.render(createElement('div',null,String(context.frame))));return {};},dispose(){root.unmount();}};});
export default <Composition width={64} height={64} fps={10} durationInFrames={10}><Stage id="react" factory={native} /></Composition>;`},true);
  const built=await buildProject(join(dir,'project.tsx'),{outputDir:join(dir,'build')});
  assert.equal(built.manifest.stages[0].exportName,'native');
  const evaluationBundle=await readFile(join(built.dir,'project.mjs'),'utf8');assert.match(evaluationBundle,/file:\/\/\/.*react/);
  assert.ok((await readFile(join(built.dir,built.stageBundles.react),'utf8')).includes('createElement'));
});

test('project-local dependency versions retain priority over the engine dependency fallback',async()=> {
  const dir=await fixture({
    'project.ts':`import {Composition,Stage,Text} from '@frameweave/engine';import {marker} from 'react';export default Composition({id:marker,width:64,height:64,fps:10,durationInFrames:10,children:Stage({id:'text',children:Text({content:marker})})});`,
    'node_modules/react/package.json':JSON.stringify({name:'react',type:'module',exports:{types:'./index.d.ts',import:'./index.js',default:'./index.js'}}),
    'node_modules/react/index.d.ts':`export const marker:'PROJECT_LOCAL';`,
    'node_modules/react/index.js':`export const marker='PROJECT_LOCAL';`,
  },true);
  const built=await buildProject(join(dir,'project.ts'),{outputDir:join(dir,'build')});assert.equal(built.manifest.composition.id,'PROJECT_LOCAL');
});
