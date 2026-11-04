import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {parameters,validateManifest,assertParameterProtocol} from '../src/plugins/schema.ts';
import {v2Parameters,PARAMETER_LIMITS} from '../src/plugins/parameters-v2.ts';
import type {ParameterV2,PluginManifestV1,PluginManifestV2} from '../src/plugins/sdk.ts';
import {evaluate,keyframes,expr,spring} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {typecheckProject} from '../src/compiler/typecheck.ts';
import {Renderer} from '../src/render/renderer.ts';
import {VideoEncoder,probeVideo} from '../src/encoding/ffmpeg.ts';

const parent=join(engineRoot,'.frameweave/parameter-v2-tests'),fixtures:string[]=[],proof=join(engineRoot,'artifacts/parameter-v2/tests');
const example=join(engineRoot,'examples/structured-parameters/project.tsx'),run=promisify(execFile);
const pins:ParameterV2={type:'array',default:[{id:'hand',position:{x:20}}],minItems:1,maxItems:4,items:{type:'object',required:['id','position'],properties:{id:{type:'string',minLength:1,maxLength:8},position:{type:'object',required:['x'],properties:{x:{type:'number',minimum:0,maximum:160},y:{type:'number',default:40}}},color:{type:'string',default:'#67ead5'}}}};
function manifest(patch:Partial<PluginManifestV2>={}):PluginManifestV2{return {schemaVersion:1,apiVersion:1,parameterSchemaVersion:2,id:'test.structured',version:'1.0.0',name:'Structured test',description:'C2 schema test',kind:'generator',engine:'web',compatible:'0.1.0',entry:'./effect.ts',parameters:{pins,style:{type:'object',default:{},properties:{radius:{type:'number',default:3,minimum:1,maximum:8},visible:{type:'boolean',default:true}}}},inputs:{},outputs:{image:'image'},...patch};}
const context=(frame:number):FrameContext=>({frame,globalFrame:frame,time:frame/12,globalTime:frame/12,fps:{num:12,den:1},dt:1/12,progress:frame/12,durationInFrames:13,seed:1});
async function fixture(files:Record<string,string>){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'project-'));fixtures.push(dir);for(const [name,source]of Object.entries(files)){await mkdir(dirname(join(dir,name)),{recursive:true});await writeFile(join(dir,name),source);}return dir;}
const raw=async(png:Buffer)=>sharp(png).ensureAlpha().raw().toBuffer();
after(async()=>{for(const dir of fixtures){assert.equal(dirname(resolve(dir)),resolve(parent));await rm(dir,{recursive:true,force:true});}});
const importPins=`import {Pins} from ${JSON.stringify(example)};export {Pins};`;
const scene=(pipeline:string)=>`import {Composition} from '@frameweave/engine';import {PluginStage,plugin,defineEffect} from '@frameweave/engine/plugins';import {keyframes,expr} from '@frameweave/engine';${importPins}export default <Composition width={160} height={90} fps={12} durationInFrames={13}><PluginStage id="visual" pipeline={${pipeline}}/></Composition>;`;
const usePins=`Pins.use({pins:[{id:'hand',position:{x:keyframes([{frame:0,value:20},{frame:12,value:140}])}},{id:'anchor',position:{x:80,y:70}}]})`;

test('C2 v1 remains scalar-only with identical defaults, unknown-field and range behavior',()=>{
  const v1:PluginManifestV1={...manifest(),parameterSchemaVersion:undefined,parameters:{n:{type:'number',default:2,minimum:0,maximum:3,integer:true},s:{type:'string',default:'ok',enum:['ok']},b:{type:'boolean',default:true}}};
  validateManifest(v1);assert.deepEqual(parameters(v1),{n:2,s:'ok',b:true});
  for(const values of [{n:4},{n:1.5},{n:'2'},{n:null},{n:NaN},{s:'no'},{extra:1}])assert.throws(()=>parameters(v1,values),{code:'E_PLUGIN_PARAM'});
  assert.throws(()=>validateManifest({...v1,parameters:{object:{type:'object',default:{},properties:{}}}}),{code:'E_PLUGIN_SCHEMA'});
  assert.throws(()=>validateManifest({...v1,parameters:{n:{type:'number'}}}),{code:'E_PLUGIN_SCHEMA'});
});

test('C2 protocol versions are explicit; omitted/1 retain v1 and old protocol loaders reject v2',()=>{
  assertParameterProtocol({});assertParameterProtocol({parameterSchemaVersion:1},1);assertParameterProtocol(manifest(),2);
  assert.throws(()=>assertParameterProtocol(manifest(),1),{code:'E_PLUGIN_PARAMETER_SCHEMA'});
  for(const version of [0,3,'2',null])assert.throws(()=>validateManifest({...manifest(),parameterSchemaVersion:version}),{code:'E_PLUGIN_PARAMETER_SCHEMA'});
});

test('C2 recursive object/array defaults materialize fresh values without mutating manifests or callers',()=>{
  const m=manifest();validateManifest(m);
  const expected={pins:[{id:'hand',position:{x:20,y:40},color:'#67ead5'}],style:{radius:3,visible:true}};
  assert.deepEqual(parameters(m),expected);const first=parameters(m);first.pins[0].position.y=99;assert.deepEqual(parameters(m),expected);
  const values={pins:[{id:'other',position:{x:70}}]};assert.deepEqual(parameters(m,values).pins[0],{id:'other',position:{x:70,y:40},color:'#67ead5'});assert.deepEqual(values,{pins:[{id:'other',position:{x:70}}]});
  assert.throws(()=>parameters(m,{pins:undefined}),{code:'E_PLUGIN_PARAM'});
});

test('C2 missing required fields, optional omissions and required/default flag semantics are enforced',()=>{
  const m=manifest({parameters:{config:{type:'object',required:['id'],properties:{id:{type:'string'},optional:{type:'array',items:{type:'number'}},count:{type:'number',required:true},withDefault:{type:'boolean',default:false}}}}});validateManifest(m);
  assert.throws(()=>parameters(m),/config.*required/);assert.throws(()=>parameters(m,{config:{count:2}}),/config.id.*required/);assert.throws(()=>parameters(m,{config:{id:'x'}}),/config.count.*required/);
  assert.deepEqual(parameters(m,{config:{id:'x',count:2}}),{config:{id:'x',count:2,withDefault:false}});
  assert.throws(()=>validateManifest(manifest({parameters:{n:{type:'number',required:true,default:3}}})),{code:'E_PLUGIN_SCHEMA'});
  assert.deepEqual(parameters(manifest({parameters:{n:{type:'number',required:false}}})),{});
});

test('C2 unknown schema/data fields, primitive type errors and invalid nesting fail at precise paths',()=>{
  const m=manifest();
  for(const values of [{other:3},{pins:'bad'},{pins:[null]},{pins:[{id:'x',position:{x:'no'}}]},{pins:[{id:'x',position:{x:10,other:1}}]},{style:{visible:1}},{style:{extra:1}}])assert.throws(()=>parameters(m,values),{code:'E_PLUGIN_PARAM'});
  assert.throws(()=>parameters(m,{pins:[{id:'x',position:{x:999}}]}),/test.structured.pins\[0\].position.x/);
  for(const schema of [{type:'json'},{type:'object',properties:{},additionalProperties:true},{type:'object',properties:{},required:['missing']},{type:'array',items:{type:'number'},minItems:3,maxItems:2},{type:'number',minimum:3,maximum:1},{type:'boolean',minimum:1},{type:'string',minLength:3,maxLength:2},{type:'number',enum:[Infinity]},{type:'object',properties:{$expr:{type:'number'}}}])assert.throws(()=>validateManifest({...m,parameters:{bad:schema}}));
});

test('C2 strings, arrays, integer ranges and enums validate both supplied values and defaults',()=>{
  const m=manifest({parameters:{label:{type:'string',default:'ok',minLength:2,maxLength:4,enum:['ok','pass']},items:{type:'array',default:[1],items:{type:'number',integer:true,minimum:0,maximum:3},minItems:1,maxItems:2}}});validateManifest(m);
  assert.deepEqual(parameters(m),{label:'ok',items:[1]});
  for(const value of [{label:'x'},{label:'wrong'},{items:[]},{items:[1,2,3]},{items:[1.2]},{items:[4]}])assert.throws(()=>parameters(m,value),{code:'E_PLUGIN_PARAM'});
  for(const schema of [{type:'number',default:9,maximum:1},{type:'array',default:[],items:{type:'number'},minItems:1},{type:'object',default:{},properties:{x:{type:'number'}},required:['x']},{type:'number',default:{$expr:'frame',args:[]}}])assert.throws(()=>validateManifest({...m,parameters:{bad:schema}}),{code:'E_PLUGIN_PARAM'});
});

test('C2 recursion, arrays, total node budgets, sparse arrays and cycles remain bounded',()=>{
  function nested(depth:number){let schema:ParameterV2={type:'number'},value:unknown=1;for(let i=0;i<depth;i++){schema={type:'object',properties:{child:schema},required:['child']};value={child:value};}return {schema,value};}
  const edge=nested(PARAMETER_LIMITS.depth),m=manifest({parameters:{value:edge.schema}});validateManifest(m);assert.deepEqual(parameters(m,{value:edge.value}),{value:edge.value});
  assert.throws(()=>validateManifest(manifest({parameters:{value:nested(PARAMETER_LIMITS.depth+1).schema}})),{code:'E_PLUGIN_PARAM_BUDGET'});
  const list=manifest({parameters:{values:{type:'array',items:{type:'number'}}}});assert.equal(parameters(list,{values:Array(1024).fill(1)}).values.length,1024);assert.throws(()=>parameters(list,{values:Array(1025).fill(1)}),{code:'E_PLUGIN_PARAM_BUDGET'});assert.throws(()=>parameters(list,{values:Array(2)}),{code:'E_PLUGIN_PARAM'});
  const cycle:Record<string,unknown>={};cycle.self=cycle;assert.throws(()=>v2Parameters(m,{value:cycle},'static'),{code:'E_PLUGIN_PARAM_BUDGET'});
  const nodeBudget=manifest({parameters:{values:{type:'array',items:{type:'array',items:{type:'number'}}}}});assert.throws(()=>parameters(nodeBudget,{values:Array.from({length:1024},()=>Array(8).fill(1))}),{code:'E_PLUGIN_PARAM_BUDGET'});
});

test('C2 numeric/string leaf keyframes, expressions and springs use the existing evaluator in any order',()=>{
  const m=manifest(),authored={pins:[{id:'hand',position:{x:keyframes([{frame:0,value:20},{frame:12,value:140}]),y:expr.add(20,expr.frame)},color:keyframes([{frame:0,value:'#000000'},{frame:12,value:'#ffffff'}])}]};
  const checked=v2Parameters(m,authored,'static');
  for(const f of [0,6,12,3,6,0]){const result=parameters(m,evaluate(checked,context(f)));assert.equal(result.pins[0].position.x,20+10*f);assert.equal(result.pins[0].position.y,20+f);}
  const sprung=v2Parameters(m,{...authored,pins:[{id:'hand',position:{x:spring({from:20,to:100})}}]},'static');assert.equal(parameters(m,evaluate(sprung,context(0))).pins[0].position.x,20);
});

test('C2 whole-object/array/boolean animation and signals in defaults are rejected',()=>{
  const m=manifest();
  for(const values of [{pins:{$keyframes:[{frame:0,value:[]}] }},{style:expr.frame},{style:{visible:{$keyframes:[{frame:0,value:true}]}}},{pins:[{id:'hand',position:{$keyframes:[{frame:0,value:{x:20}}]}}]},{pins:[{id:expr.frame,position:{x:20}}]}])assert.throws(()=>v2Parameters(m,values,'static'),{code:'E_PLUGIN_PARAM'});
  assert.throws(()=>v2Parameters(m,{pins:[{id:'h',position:{x:{$keyframes:[{frame:0,value:20},{frame:0,value:30}]}}}]},'static'),{code:'E_KEYFRAMES'});
  assert.throws(()=>v2Parameters(m,{pins:[{id:'h',position:{x:{$expr:'unknown',args:[]}}}]},'static'),{code:'E_EXPRESSION'});
  assert.throws(()=>validateManifest({...m,parameters:{n:{type:'number',default:expr.frame}}}),{code:'E_PLUGIN_PARAM'});
});

test('C2 signal endpoints are checked statically; intermediate ranges and overshoot are checked after evaluation',()=>{
  const m=manifest({parameters:{n:{type:'number',minimum:0,maximum:1}}});
  assert.throws(()=>v2Parameters(m,{n:keyframes([{frame:0,value:0},{frame:12,value:2}])},'static'),{code:'E_PLUGIN_PARAM'});
  const input={n:keyframes([{frame:0,value:0},{frame:12,value:1,easing:{bezier:[0.25,3,0.75,3]}}])};v2Parameters(m,input,'static');assert.throws(()=>parameters(m,evaluate(input,context(6))),{code:'E_PLUGIN_PARAM'});
  v2Parameters(m,{n:expr.frame},'static');assert.throws(()=>parameters(m,evaluate({n:expr.frame},context(6))),{code:'E_PLUGIN_PARAM'});
});

test('C2 typed companions and inferred effects check nested signals, defaults, unknown fields and required arguments',{timeout:120000},async()=>{
  const prelude=`import {typedPlugin,defineEffect} from '@frameweave/engine/plugins';import {keyframes,expr} from '@frameweave/engine';${importPins}const use=typedPlugin<{pins:{id:string;position:{x:number;y?:number}}[]},'pins'>('example.structured-pins@1.0.0');`;
  const optionalManifest=JSON.stringify(manifest({kind:'function',parameters:{n:{type:'number',required:false}},outputs:{value:'number'}}));
  const good=await fixture({'types.ts':`${prelude}use({pins:[{id:'hand',position:{x:keyframes([{frame:0,value:20}])}}]});Pins.use({pins:[{id:'hand',position:{x:expr.frame}}]});const Optional=defineEffect(${optionalManifest},{kind:'function',evaluate(_t,_i,p){return {value:p.n??0};}});Optional.use();`});await typecheckProject([{file:join(good,'types.ts')}]);
  const bad=[`use();`,`use({pins:[{id:'h',position:{x:'wrong'}}]});`,`use({pins:{$keyframes:[]}});`,`Pins.use();`,`Pins.use({pins:[{id:'h',position:{}}]});`,`Pins.use({pins:[{id:'h',position:{x:1},unknown:2}]});`,`Pins.use({pins:[{id:'h',position:{x:1}}],style:{visible:expr.frame}});`,`defineEffect(${optionalManifest},{kind:'function',evaluate(_t,_i,p){return {value:p.n.toFixed(2)};}});`,`defineEffect(${optionalManifest},{kind:'function',evaluate(_t,_i,p:{n:string}){return {value:p.n};}});`];
  for(const call of bad){const dir=await fixture({'types.ts':prelude+call});await assert.rejects(()=>typecheckProject([{file:join(dir,'types.ts')}]),{code:'E_TYPECHECK'});}
});

test('C2 static validation runs on untyped plugin calls before building the runtime',{timeout:120000},async()=>{
  for(const params of ['{}',`{pins:[{id:'h',position:{x:'bad'}}]}`,`{pins:[{id:'h',position:{x:999}}]}`,`{pins:[{id:'h',position:{x:1},extra:4}]}`]){const dir=await fixture({'project.tsx':scene(`[{plugin:'example.structured-pins@1.0.0',params:${params}}]`)});await assert.rejects(()=>buildProject(join(dir,'project.tsx')),{code:'E_PLUGIN_PARAM'});}
});

test('C2 real TSX → TVG → P4 Stage renders initial/middle/final/random frames and a decodable clip',{timeout:180000},async()=>{
  const build=await buildProject(example);assert.equal(build.manifest.schemaVersion,'0.1');const renderer=await Renderer.create(build,{cache:false}),frames=new Map<number,Buffer>();await mkdir(proof,{recursive:true});
  try{
    for(const f of [0,6,12,3,6,0]){const rendered=await renderer.renderFrame(f);assert.deepEqual(rendered.diagnostics,[]);const bytes=await raw(rendered.png);if(frames.has(f))assert.deepEqual(bytes,frames.get(f));frames.set(f,bytes);const x=20+10*f,y=20+f,index=(y*160+x)*4;assert.ok(bytes[index]>40&&bytes[index+3]===255,'animated hand occupies its expected position');await writeFile(join(proof,`frame-${f}.png`),rendered.png);}
    assert.notDeepEqual(frames.get(0),frames.get(12));const encoder=await VideoEncoder.create(join(proof,'Structured-Pins.mp4'),{num:12,den:1},160,90);try{for(let f=0;f<13;f++)await encoder.write((await renderer.renderFrame(f)).png);await encoder.finish();}catch(e){await encoder.abort();throw e;}
  }finally{await renderer.close();}
  const clip=await probeVideo(join(proof,'Structured-Pins.mp4'));assert.deepEqual({width:clip.width,height:clip.height,fps:clip.fps,frames:clip.frames,decodable:clip.decodable},{width:160,height:90,fps:12,frames:13,decodable:true});assert.equal(clip.duration,1.08); // Existing probe parses FFmpeg's two-decimal duration; exact frame count is checked above.
  const fresh=await Renderer.create(build,{cache:false});try{for(const f of [12,0,6,3])assert.deepEqual(await raw((await fresh.renderFrame(f)).png),frames.get(f));}finally{await fresh.close();}
  await writeFile(join(proof,'render-proof.json'),JSON.stringify({ok:true,frames:[0,6,12,3],seekOrder:[0,6,12,3,6,0],freshContextOrder:[12,0,6,3],uncached:true,freshContext:true,rgbaTolerance:0,rgbaHashes:Object.fromEntries([...frames].map(([frame,bytes])=>[frame,createHash('sha256').update(bytes).digest('hex')])),video:clip,videoFrames:13,parameterSchemaVersion:2,tvgSchemaVersion:'0.1'},null,2)+'\n');
});

test('C2 runtime rejects evaluated nested constraints before calling the effect and preserves Stage/frame/path diagnostics',{timeout:120000},async()=>{
  const dir=await fixture({'project.tsx':scene(`[{plugin:'example.structured-pins@1.0.0',params:{pins:[{id:'h',position:{x:expr.mul(expr.frame,100)}}]}}]`)}),r=await Renderer.create(await buildProject(join(dir,'project.tsx')),{cache:false});
  try{assert.deepEqual((await r.renderFrame(0)).diagnostics,[]);await assert.rejects(()=>r.renderFrame(6),e=>e instanceof Error&&'code' in e&&e.code==='E_PLUGIN_PARAM'&&'stageId' in e&&e.stageId==='visual'&&'frame' in e&&e.frame===6&&e.message.includes('pins[0].position.x')&&e.message.includes('frame 6'));}finally{await r.close();}
});

test('C2 preset forwards structured arrays, nested signals and recursively filled defaults',{timeout:180000},async()=>{
  const preset=`export const Preset=defineEffect({schemaVersion:1,apiVersion:1,parameterSchemaVersion:2,id:'example.pin-preset',version:'1.0.0',name:'Pin preset',description:'Structured forwarding',kind:'preset',engine:'web',compatible:'0.1.0',parameters:{controls:Pins.manifest.parameters.pins},inputs:{},outputs:{image:'image'},dependencies:{'example.structured-pins':'1.0.0'},pipeline:[{plugin:'example.structured-pins@1.0.0',params:{pins:{$param:'controls'}}}]});`;
  const dir=await fixture({'direct.tsx':scene(`[${usePins}]`),'preset.tsx':scene(`[Preset.use({controls:[{id:'hand',position:{x:keyframes([{frame:0,value:20},{frame:12,value:140}])}},{id:'anchor',position:{x:80,y:70}}]})]`).replace('export default',preset+'export default')});
  const a=await Renderer.create(await buildProject(join(dir,'direct.tsx')),{cache:false}),b=await Renderer.create(await buildProject(join(dir,'preset.tsx')),{cache:false});try{for(const f of [12,0,6,3])assert.deepEqual(await raw((await a.renderFrame(f)).png),await raw((await b.renderFrame(f)).png));}finally{await a.close();await b.close();}
});

test('C2 v2 preset scalar forwarding remains compatible with a v1 implementation',{timeout:120000},async()=>{
  const definitions=`export const Legacy=defineEffect<{radius:number}>({schemaVersion:1,apiVersion:1,id:'test.legacy-radius',version:'1.0.0',name:'Legacy radius',description:'v1 scalar implementation',kind:'generator',engine:'web',compatible:'^0.1.0',parameters:{radius:{type:'number',default:3,minimum:1,maximum:10}},inputs:{},outputs:{image:'image'}},{kind:'generator',create(init){const canvas=document.createElement('canvas');canvas.width=init.width;canvas.height=init.height;const c=canvas.getContext('2d')!;return {render(_t,_i,p){c.clearRect(0,0,canvas.width,canvas.height);c.fillStyle='#ffffff';c.beginPath();c.arc(80,45,p.radius,0,Math.PI*2);c.fill();return {image:canvas};},dispose(){canvas.width=canvas.height=0;}};}});
export const Mixed=defineEffect({schemaVersion:1,apiVersion:1,parameterSchemaVersion:2,id:'test.mixed-preset',version:'1.0.0',name:'Mixed preset',description:'v2 caller to v1 child',kind:'preset',engine:'web',compatible:'0.1.0',parameters:{radius:{type:'number',required:true,minimum:1,maximum:10}},inputs:{},outputs:{image:'image'},dependencies:{'test.legacy-radius':'1.0.0'},pipeline:[{plugin:'test.legacy-radius@1.0.0',params:{radius:{$param:'radius'}}}]});`;
  const dir=await fixture({'project.tsx':scene(`[Mixed.use({radius:keyframes([{frame:0,value:2},{frame:12,value:8}])})]`).replace('export default',definitions+'export default')}),r=await Renderer.create(await buildProject(join(dir,'project.tsx')),{cache:false});
  try{const early=await raw((await r.renderFrame(0)).png),late=await raw((await r.renderFrame(12)).png);assert.equal(early[(45*160+85)*4],0);assert.equal(late[(45*160+85)*4],255);}finally{await r.close();}
});

test('C2 the professional module owns Pin identity checks; generic schema does not silently match duplicate IDs',{timeout:120000},async()=>{
  const dir=await fixture({'project.tsx':scene(`[Pins.use({pins:[{id:'same',position:{x:20}},{id:'same',position:{x:80}}]})]`)}),r=await Renderer.create(await buildProject(join(dir,'project.tsx')),{cache:false});
  try{await assert.rejects(()=>r.renderFrame(0),/Pin IDs must be unique/);}finally{await r.close();}
});

test('C2 normal engine compatibility checks still reject unsupported ranges',{timeout:120000},async()=>{
  const text=(await readFile(example,'utf8')).replace("compatible:'0.1.0'","compatible:'^99.0.0'"),dir=await fixture({'project.tsx':text});await assert.rejects(()=>buildProject(join(dir,'project.tsx')),{code:'E_PLUGIN_ENGINE'});
});

test('C2 actual pre-C2 manifest parser rejects parameterSchemaVersion 2 without changing the old engine',{timeout:120000},async()=>{
  const source=await readFile(join(engineRoot,'tests/fixtures/parameter-schema-v1.ts.txt'),'utf8');
  assert.equal(createHash('sha256').update(source).digest('hex'),'86e8259496201f6afb14a7a22b1044e582d3d64a290f4648003462be3b9275b3'); // Exact f98d705 parser snapshot, independent of Git availability.
  const dir=await fixture({'plugins/schema.ts':source,'core/errors.ts':await readFile(join(engineRoot,'src/core/errors.ts'),'utf8')});
  const probe=`const m=await import(${JSON.stringify(pathToFileURL(join(dir,'plugins/schema.ts')).href)});try{m.validateManifest(${JSON.stringify(manifest())});process.exitCode=2;}catch(e){if(e.code!=='E_PLUGIN_SCHEMA'||!e.message.includes('parameterSchemaVersion'))throw e;console.log(e.code);}`;
  const result=await run(process.execPath,['--import','tsx','--input-type=module','-e',probe],{cwd:engineRoot,windowsHide:true});assert.match(result.stdout,/E_PLUGIN_SCHEMA/);
});
