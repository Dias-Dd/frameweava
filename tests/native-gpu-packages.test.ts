import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {packagesCLI} from '../src/packages/cli.ts';
import {installedPackages} from '../src/packages/manager.ts';
import {validatePackage} from '../src/packages/manifest.ts';
import {packageModuleLoader,type RuntimePackage} from '../src/packages/runtime.ts';
import {buildProject} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {exportProject} from '../src/compiler/export.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';

const base=resolve('.frameweave/nr1');
const metadata={schemaVersion:1,apiVersion:1,id:'test.native-proof',version:'1.0.0',name:'Native GPU proof',description:'Reviewed test-only native binding',compatible:'0.1.0',source:{kind:'local',authority:'test.native'},platforms:['web'],capabilities:['native-gpu'],permissions:{filesystem:false,network:false,process:false},modules:{main:{format:'javascript',path:'index.ts'}},bindings:{schemaVersion:2,module:'main',types:'api.d.ts',engine:'native-gpu',initialize:'initialize',gpu:'required',gpuApi:'native-wgpu',gpuExports:['nativeFill']}};
const moduleSource=`import type {NativePluginInit} from '@frameweave/engine/plugins';
import {linear709} from '@frameweave/engine/native';
export function initialize(ctx:NativePluginInit){const gpu=ctx.gpu;if(!gpu||gpu.capabilities().backend!=='native-wgpu'||!gpu.capabilities().hardwareVerified)throw Error('NO_NATIVE_DEVICE');return {exports:{async nativeFill(width:number,height:number,value:number){const kernel=await gpu.compile({abiVersion:1,id:'test/native-proof',version:'1.0.0',inputCount:0,parameterWords:1,code:'fn pixel(p:vec2u)->vec4f{return vec4f(paramF32(0u),-.25,2.,1.);}'});return gpu.run(kernel,[],{parameters:new Float32Array([value]),output:{width,height,format:'rgba32float',alpha:'opaque',color:linear709}});}},async dispose(){await gpu.dispose();}};}`;
const source=`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {nativeFill} from 'test.native-proof';export const scene=defineNativeStage(init=>({renderAt(ctx){return nativeFill(init.width,init.height,ctx.frame*.1);}}));export default <Composition width={64} height={36} fps={24} durationInFrames={12} background="transparent"><Stage id="native" factory={scene}/><Layer source={ref('native')}/></Composition>;`;
test('R1 native binding schemas are explicit and legacy Web cannot claim native GPU compatibility',()=>{
 validatePackage(metadata);
 for(const mutate of [(m:any)=>{m.bindings.schemaVersion=1;},(m:any)=>{m.bindings.gpuApi='webgpu';},(m:any)=>{m.capabilities=[];},(m:any)=>{delete m.bindings.initialize;}]){const m=structuredClone(metadata);mutate(m);assert.throws(()=>validatePackage(m),(e:any)=>/^E_PACKAGE_/.test(e.code));}
 assert.throws(()=>validatePackage({...metadata,bindings:{...metadata.bindings,engine:'web'}}),{code:'E_WEB_REMOVED'});
});
test('module loader refuses forged or absent native GPU evidence before JavaScript executes',async()=>{
 let loaded=false;const packages:Record<string,RuntimePackage>={'test.native-proof@1.0.0':{integrity:'sha256-test',source:{kind:'local',authority:'test.native'},capabilities:['native-gpu'],dependencies:{},modules:{main:{format:'javascript',integrity:'sha256-test'}}}};
 for(const nativeGpu of [undefined,{}, {capabilities:()=>({backend:'native-wgpu',hardwareVerified:true})}]){const load=packageModuleLoader('test.native-proof@1.0.0',packages,{'test.native-proof@1.0.0/main':async()=>{loaded=true;return {};}},{},{nativeGpu});await assert.rejects(load({module:'main',format:'javascript'}),{code:'E_PACKAGE_CAPABILITY'});}
 assert.equal(loaded,false);
});
test('installed exact native R1 named import reaches the real GPU, preserves the device and rejects tampering',async()=>{
 await mkdir(base,{recursive:true});const directory=await mkdtemp(join(base,'p-')),pack=join(directory,'catalog'),project=join(directory,'author');process.env.FRAMEWEAVE_HOME=join(directory,'home');await mkdir(pack);await mkdir(project);
 await writeFile(join(pack,'frameweave.package.json'),JSON.stringify(metadata));await writeFile(join(pack,'index.ts'),moduleSource);await writeFile(join(pack,'api.d.ts'),`import type {GpuPixelImage} from '@frameweave/engine/native';export declare function nativeFill(width:number,height:number,value:number):Promise<GpuPixelImage>;`);const entry=join(project,'project.tsx');await writeFile(entry,source);
 await assert.rejects(packagesCLI(['install',pack,'--project',project,'--add','test.native-proof@1.0.0']),{code:'E_PACKAGE_TRUST'});
 await packagesCLI(['install',pack,'--project',project,'--add','test.native-proof@1.0.0','--trust','local:test.native']);const state=await installedPackages(project);assert.equal(state.lock!.roots['test.native-proof'],'test.native-proof@1.0.0');
 const executable=await nativeExecutable();
 const build=await buildProject(entry),renderer=await Renderer.create(build,{nativeGpu:{executable,dynamic:'interactive'}});
 try{for(const frame of [0,5,0]){const t=await renderer.submitNativeFrame(frame);await t.completed;}const stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.submitted,3);assert.equal(stats.imageReadbacks,0);assert.equal(stats.capabilities.backend,'native-wgpu');}finally{await renderer.close();await renderer.close();}
 const facade=join(directory,'suite');
 await mkdir(facade);
 const suite={...metadata,id:'test.native-suite',capabilities:[],dependencies:{'test.native-proof':'1.0.0'},
   bindings:{schemaVersion:2,module:'main',types:'api.d.ts',engine:'native-gpu',
     forward:{fill:{dependency:'test.native-proof',name:'nativeFill'}}}};
 assert.throws(()=>validatePackage({...suite,dependencies:{}}),{code:'E_PACKAGE_BINDING'});
 await writeFile(join(facade,'frameweave.package.json'),JSON.stringify(suite));
 await writeFile(join(facade,'index.ts'),"throw Error('A forwarding package must not execute its entry');");
 await writeFile(join(facade,'api.d.ts'),"export {nativeFill as fill} from 'test.native-proof';");
 await packagesCLI(['install',facade,'--project',project,'--add','test.native-suite@1.0.0']);
 await writeFile(entry,source.replace("import {nativeFill} from 'test.native-proof'","import {fill as nativeFill} from 'test.native-suite'"));
 // Both portable forms retain forwarding, the original provider and its lease.
 for(const layout of ['capsule','flat'] as const){const destination=join(directory,layout+'.tsx'),result=await exportProject(entry,{output:destination,singleFile:true,layout}),oldHome:string|undefined=process.env.FRAMEWEAVE_HOME;process.env.FRAMEWEAVE_HOME=join(directory,'empty-'+layout);
  try{const carried=await Renderer.create(await buildProject(result.entry),{nativeGpu:{executable,dynamic:'interactive'}});try{const t=await carried.submitNativeFrame(5);await t.completed;assert.equal((await carried.nativeStats()).devicesCreated,1);}finally{await carried.close();}}finally{process.env.FRAMEWEAVE_HOME=oldHome;}
 }
 const record=state.records.find(r=>r.manifest.id==='test.native-proof')!;await appendFile(join(record.directory,'index.ts'),'\n// tampered after exact lock');await assert.rejects(buildProject(entry),{code:'E_PACKAGE_INTEGRITY'});
});
