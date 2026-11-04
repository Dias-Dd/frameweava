import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile,appendFile,rename,rm,stat} from 'node:fs/promises';
import {join,dirname,resolve,relative,delimiter} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {buildGraphicsPackage} from '../scripts/build-package.ts';
import {readPackage} from '../../../src/packages/manifest.ts';
import {installPackages,installedPackages,restorePackages,verifyPackages} from '../../../src/packages/manager.ts';
import {buildProject} from '../../../src/compiler/build.ts';
import {exportProject} from '../../../src/compiler/export.ts';
import {Renderer} from '../../../src/render/renderer.ts';
import {queryTrack,validateTrackData} from '../track.ts';
import {makePath} from '../experiments/vector-producer.ts';

const moduleRoot=resolve(fileURLToPath(new URL('..',import.meta.url))),workspace=resolve(moduleRoot,'../..'),parent=join(workspace,'.frameweave/graphics-distribution-tests'),proof=join(workspace,'artifacts/graphics-stabilization');
const execute=promisify(execFile),fixtures:string[]=[],trust='local:frameweave.foundation';
let packageDirectory:string,catalogDirectory:string;
const sampleBytes=await readFile(join(moduleRoot,'examples/track-mvp.json')),sample=validateTrackData(JSON.parse(sampleBytes.toString('utf8')));
async function fixture(){await mkdir(parent,{recursive:true});const dir=await mkdtemp(join(parent,'case-'));fixtures.push(dir);return dir;}
async function node(code:string,cwd:string){return execute(process.execPath,['--input-type=module','-e',code],{cwd,windowsHide:true,maxBuffer:4*1024*1024,timeout:30000});}
async function importProbe(entry:string,cwd:string){
  const track=join(cwd,'track.json');await writeFile(track,sampleBytes);
  return JSON.parse((await node(`import {readFile} from 'node:fs/promises';for(const name of ['document','window','navigator'])Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('IMPORT_ACCESSED_'+name)}});const m=await import(${JSON.stringify(pathToFileURL(entry).href)});const data=m.validateTrackData(JSON.parse(await readFile(${JSON.stringify(track)},'utf8'))),reader=m.createTrackReader(data);const times=[...data.samples.map(s=>s.timestampUs/1e6),.3125,.125,.1875,7.9375,8,-1,0];let failure;try{m.validatePathData(${JSON.stringify({...makePath(),version:2})});}catch(e){failure={code:e.code,path:e.details.path};}console.log(JSON.stringify({exports:Object.keys(m).sort(),queries:times.map(t=>reader.query(t)),failure}));`,cwd)).stdout) as {exports:string[];queries:ReturnType<typeof queryTrack>[];failure:{code:string;path:string}};
}
before(async()=>{await mkdir(proof,{recursive:true});const owner=await fixture();packageDirectory=await buildGraphicsPackage(join(owner,'package'));});
after(async()=>{for(const directory of fixtures){assert.equal(dirname(resolve(directory)),resolve(parent));await rm(directory,{recursive:true,force:true});}});

test('pure library installs with R1 exact identity, runs with no DOM/engine, restores cross-project and rejects changed bytes',async()=>{
  const record=await readPackage(packageDirectory);assert.equal(record.effect,undefined);assert.equal(record.manifest.id,'frameweave.graphics-contracts');assert.equal(record.manifest.version,'1.1.0');assert.deepEqual(record.manifest.capabilities,[]);
  const a=await fixture();await installPackages(a,[packageDirectory],{trust:[trust],integrity:`sha256-${record.integrity}`});const state=await installedPackages(a),locked=state.lock!;
  assert.equal(locked.requirements['frameweave.graphics-contracts'],'1.1.0');assert.equal(locked.roots['frameweave.graphics-contracts'],'frameweave.graphics-contracts@1.1.0');catalogDirectory=state.records[0].directory;
  await rename(packageDirectory,packageDirectory+'.offline');await assert.rejects(()=>stat(packageDirectory),{code:'ENOENT'});
  const actual=await importProbe(join(catalogDirectory,'dist/index.js'),a),times=[...sample.samples.map(s=>s.timestampUs/1e6),.3125,.125,.1875,7.9375,8,-1,0];
  assert.deepEqual(actual.queries,times.map(t=>queryTrack(sample,t)));for(const name of ['validatePathData','validateMaskData','validateMeshData','validateSkeletonData','validateTextLayoutData','validateTrackData','queryTrack','assertTrackData','readJsonResource'])assert.ok(actual.exports.includes(name));
  assert.deepEqual(actual.failure,{code:'E_GRAPHICS_VERSION',path:'$.version'});
  const b=await fixture();for(const file of ['frameweave.packages.json','frameweave.packages.lock.json'])await copyFile(join(a,file),join(b,file));
  const before=await readFile(join(b,'frameweave.packages.lock.json'));await restorePackages(b,[catalogDirectory]);assert.deepEqual(await readFile(join(b,'frameweave.packages.lock.json')),before);
  const restored=await installedPackages(b);assert.deepEqual((await importProbe(join(restored.records[0].directory,'dist/index.js'),b)).queries,actual.queries);
  await appendFile(join(restored.records[0].directory,'dist/index.js'),'\n// deliberately changed locked library bytes\n');await assert.rejects(()=>verifyPackages(b),{code:'E_PACKAGE_INTEGRITY'});assert.equal((await verifyPackages(a)).valid,true);
  await writeFile(join(proof,'distribution-r1-proof.json'),JSON.stringify({ok:true,reference:locked.roots['frameweave.graphics-contracts'],integrity:locked.packages['frameweave.graphics-contracts@1.1.0'].integrity,source:record.manifest.source,noEffect:true,noCapabilities:true,originalAuthorUnavailable:true,crossProjectFrozenRestore:true,lockBytesUnchanged:true,tamperRejected:true,nodeQueries:actual.queries.length,publicExports:actual.exports},null,2)+'\n');
});

async function npmCli(){for(const dir of [dirname(process.execPath),...(process.env.PATH??'').split(delimiter)]){const path=join(dir,'node_modules/npm/bin/npm-cli.js');try{if((await stat(path)).isFile())return path;}catch{}}throw Error('Cannot find installed npm CLI without downloading tools');}
test('standard offline npm pack/install is independent of engine, prototype and DOM declarations',{timeout:90000},async()=>{
  const archive=await fixture(),consumer=await fixture(),npm=await npmCli(),npmArgs={windowsHide:true,timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,npm_config_cache:join(archive,'cache'),npm_config_registry:'http://127.0.0.1:9'}};
  const packed=JSON.parse((await execute(process.execPath,[npm,'pack',catalogDirectory,'--json','--offline','--ignore-scripts','--pack-destination',archive],{...npmArgs,cwd:archive})).stdout) as {filename:string;files:{path:string}[]}[];
  assert.ok(packed[0].files.some(f=>f.path==='dist/index.js'));assert.ok(packed[0].files.some(f=>f.path==='dist/index.d.ts'));assert.ok(packed[0].files.some(f=>f.path==='src/index.ts'));assert.ok(packed[0].files.every(f=>!f.path.includes('prototype')));
  await writeFile(join(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));await execute(process.execPath,[npm,'install',join(archive,packed[0].filename),'--offline','--ignore-scripts','--no-audit','--no-fund','--save-exact'],{...npmArgs,cwd:consumer});
  await assert.rejects(()=>stat(join(consumer,'node_modules/@frameweave/engine')),{code:'ENOENT'});
  const js=join(consumer,'node_modules/@frameweave/graphics-contracts/dist/index.js');assert.equal((await importProbe(js,consumer)).queries.length,sample.samples.length+7);
  const source=`import {validateTrackData,queryTrack,createTrackReader,queryStageTrack,type PathData,type Coordinates2D} from '@frameweave/graphics-contracts';declare const input:unknown;const data=validateTrackData(input);const q=queryTrack(data,.3125);if(q.valid)q.anchor.x.toFixed(3);const reader=createTrackReader(data);declare const target:Coordinates2D;queryStageTrack(reader,1,{sourceStartSeconds:0,rate:1},target);declare let path:PathData;\n// @ts-expect-error version stays v1\npath.version=2;\n// @ts-expect-error unsupported Track query strategy\nreader.query(1,{mode:'spline'});\n`;
  await writeFile(join(consumer,'consumer.ts'),source);await writeFile(join(consumer,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',strict:true,noEmit:true,lib:['ES2022'],types:[]},files:['consumer.ts']}));
  await execute(process.execPath,[join(workspace,'node_modules/typescript/bin/tsc'),'--project',join(consumer,'tsconfig.json')],{cwd:consumer,windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
  const declarations=await readFile(join(consumer,'node_modules/@frameweave/graphics-contracts/dist/index.d.ts'),'utf8');assert.ok(!/\bimport\s*(?:\(|[{'*])/.test(declarations));
  await writeFile(join(proof,'distribution-npm-proof.json'),JSON.stringify({ok:true,name:'@frameweave/graphics-contracts',version:'1.1.0',offlinePack:true,offlineInstall:true,noEngineDependency:true,noDomAtImport:true,typecheck:{lib:['ES2022'],types:[],positiveAndNegativeCalls:true},files:packed[0].files.map(f=>f.path)},null,2)+'\n');
});

test('static library renders; default hidden-store export fails explicitly, configured vendor-store exports remain portable',{timeout:180000},async()=>{
  const project=await fixture();await installPackages(project,[catalogDirectory],{trust:[trust]});const state=await installedPackages(project),entry=join(state.records[0].directory,'dist/index.js'),specifier='./'+relative(project,entry).replaceAll('\\','/');
  await writeFile(join(project,'track.json'),sampleBytes);
  const source=`import {Composition,Stage,Resource} from '@frameweave/engine';import {defineWebStage} from '@frameweave/engine/native';import {validatePathData,validateTrackData,createTrackReader,queryStageTrack} from ${JSON.stringify(specifier)};export const follow=defineWebStage<Record<string,never>,Record<string,never>>(async({container,resources,width,height})=>{const data=validateTrackData(await (await fetch(resources.track)).json()),reader=createTrackReader(data);let canvas:HTMLCanvasElement|undefined;return {renderAt(context){if(canvas)canvas.width=canvas.height=0;canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.style.width=width+'px';canvas.style.height=height+'px';container.replaceChildren(canvas);const q=queryStageTrack(reader,context.time,{sourceStartSeconds:0,rate:1},{spaceId:'demo.canvas',unit:'px',origin:'top-left',x:'right',y:'down',width,height});if(q.visible){const c=canvas.getContext('2d')!;c.fillStyle='#00ff80';c.beginPath();c.arc(q.x,q.y,4,0,Math.PI*2);c.fill();}return {drawn:q.visible};},dispose(){if(canvas){canvas.width=canvas.height=0;canvas.remove();}}};});export default Composition({width:128,height:96,fps:16,durationInFrames:128,background:'transparent',children:[Resource({id:'track',kind:'file',src:'./track.json'}),Stage({id:'follow',factory:follow,outputs:{surface:'surface',drawn:'boolean'}})]});`;
  await writeFile(join(project,'project.ts'),source);await verifyPackages(project);
  const renderer=await Renderer.create(await buildProject(join(project,'project.ts')),{cache:false}),expected=new Map<number,Buffer>();
  try{for(const frame of [0,5,2,64,127]){const result=await renderer.renderFrame(frame);assert.equal(result.stageOutputs.follow.drawn,queryTrack(sample,frame/16).valid);expected.set(frame,await sharp(result.png).ensureAlpha().raw().toBuffer());await writeFile(join(proof,`library-stage-${frame}.png`),result.png);}}finally{await renderer.close();}
  const invalid=`export const invalid=defineWebStage<Record<string,never>,Record<string,never>>(()=>({renderAt(){validatePathData(${JSON.stringify({...makePath(),version:2})});return {};}}));`;
  await writeFile(join(project,'invalid.ts'),source.replace('export default Composition({',invalid+'export default Composition({').replace('factory:follow','factory:invalid'));
  const bad=await Renderer.create(await buildProject(join(project,'invalid.ts')),{cache:false});try{await assert.rejects(()=>bad.renderFrame(0),(e:unknown)=>e instanceof Error&&'code' in e&&e.code==='E_STAGE_RENDER'&&e.message.includes('[E_GRAPHICS_VERSION]')&&e.message.includes('$.version'));}finally{await bad.close();}
  const destination=await fixture(),tree=await exportProject(join(project,'project.ts'),{output:join(destination,'carried')}),capsule=await exportProject(join(project,'project.ts'),{output:join(destination,'portable.tsx'),singleFile:true,layout:'capsule'});
  await rename(project,project+'.offline');fixtures[fixtures.indexOf(project)]=project+'.offline';
  // Existing exporter treats '.frameweave/...' as an already-relative specifier and drops './'.
  // Record that unsupported case instead of changing exporter/Loader contracts in this library task.
  for(const output of [tree,capsule])await assert.rejects(()=>buildProject(output.entry),(e:unknown)=>e instanceof Error&&'code' in e&&e.code==='E_COMPILE'&&e.message.includes('.frameweave/packages/'));
  // R1 already supports an explicit project-local store. This remains the same verified package,
  // not a copied/unlocked substitute, and avoids the current hidden-directory export limitation.
  const vendor=await fixture();await installPackages(vendor,[catalogDirectory],{trust:[trust]});const initialVendor=await installedPackages(vendor),vendorLockBefore=await readFile(join(vendor,'frameweave.packages.lock.json'));
  await writeFile(join(vendor,'frameweave.packages.json'),JSON.stringify({...initialVendor.config,store:'./vendor/packages'}));await restorePackages(vendor,[catalogDirectory]);
  assert.deepEqual(await readFile(join(vendor,'frameweave.packages.lock.json')),vendorLockBefore);
  const vendorState=await installedPackages(vendor),vendorEntry=join(vendorState.records[0].directory,'dist/index.js'),vendorSpecifier='./'+relative(vendor,vendorEntry).replaceAll('\\','/');
  await writeFile(join(vendor,'track.json'),sampleBytes);await writeFile(join(vendor,'project.ts'),source.replace(JSON.stringify(specifier),JSON.stringify(vendorSpecifier)));await verifyPackages(vendor);
  const vendorTree=await exportProject(join(vendor,'project.ts'),{output:join(destination,'vendor-carried')}),vendorCapsule=await exportProject(join(vendor,'project.ts'),{output:join(destination,'vendor-portable.tsx'),singleFile:true,layout:'capsule'});
  await rename(vendor,vendor+'.offline');fixtures[fixtures.indexOf(vendor)]=vendor+'.offline';
  for(const output of [vendorTree,vendorCapsule]){const r=await Renderer.create(await buildProject(output.entry),{cache:false});try{for(const frame of [127,2,0,64,5])assert.deepEqual(await sharp((await r.renderFrame(frame)).png).ensureAlpha().raw().toBuffer(),expected.get(frame));}finally{await r.close();}}
  const missingLock=await readFile(join(dirname(vendorTree.entry),'frameweave.packages.lock.json')).then(()=>false,(e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return true;throw e;});assert.equal(missingLock,true);
  await writeFile(join(proof,'distribution-export-proof.json'),JSON.stringify({ok:true,standardStaticLibraryImport:true,packageVerifiedBeforeBuild:true,originalProjectUnavailable:true,sourceTree:true,capsule:true,testedStore:'./vendor/packages',defaultHiddenStoreExport:{supported:false,code:'E_COMPILE',reason:"Existing exporter drops './' before '.frameweave'"},frames:[0,5,2,64,127],freshOrder:[127,2,0,64,5],rgbaTolerance:0,r1LockIdentityCarried:false,stageDiagnostic:{hostCode:'E_STAGE_RENDER',messagePreserves:'[E_GRAPHICS_VERSION] and $.version',independentLibraryErrorUsesStructuralFields:true},scope:'Library code and declarations are collected as ordinary explicit project source using a configured nonhidden project store; current export does not recognize no-effect imports as R1 package identities'},null,2)+'\n');
});
