import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,copyFile,rename,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import {packagesCLI} from '../src/packages/cli.ts';
import {installedPackages} from '../src/packages/manager.ts';
import {buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';
import {Renderer} from '../src/render/renderer.ts';
import {renderNativeProject} from '../modules/native-gpu/service.ts';
import {ffmpegPath,probeVideo} from '../src/encoding/ffmpeg.ts';
const exec=promisify(execFile),root=resolve('.');
test('real native glyph imports, R1 ownership, random frames, media and carried module',{timeout:150000},async()=>{
 const base=resolve('artifacts/font-images/native');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'case-')),pack=join(dir,'catalog'),project=join(dir,'author');await mkdir(pack);await mkdir(project);
 const oldHome=process.env.FRAMEWEAVE_HOME;process.env.FRAMEWEAVE_HOME=join(dir,'home');
 try{
 const metadata={schemaVersion:1,apiVersion:1,id:'test.font-images',version:'1.0.0',name:'Font image proof',description:'Sealed test font glyph imports',compatible:'0.1.0',source:{kind:'local',authority:'test.font-images'},platforms:['web'],capabilities:['native-gpu'],permissions:{filesystem:false,network:false,process:false},modules:{main:{format:'javascript',path:'index.ts'},font:{format:'resource',path:'font.ttf'}},bindings:{schemaVersion:2,module:'main',types:'api.d.ts',engine:'native-gpu',initialize:'initialize',gpu:'required',gpuApi:'native-wgpu',gpuExports:['drawGlyph']}};
 await writeFile(join(pack,'frameweave.package.json'),JSON.stringify(metadata));await copyFile(resolve('tests/fixtures/font-images/svg-gzip.ttf'),join(pack,'font.ttf'));
 await writeFile(join(pack,'api.d.ts'),`import type {GpuPixelImage} from '@frameweave/engine/native';export declare function drawGlyph(frame:number):Promise<GpuPixelImage>;`);
 await writeFile(join(pack,'index.ts'),`import type {NativePluginInit} from '@frameweave/engine/plugins';import {fontGlyphResource} from '@frameweave/engine/native';import {linear709} from '@frameweave/engine/native';export function initialize(init:NativePluginInit){const gpu=init.gpu!,m=init.moduleResources!;if(!Object.isFrozen(m)||!Object.isFrozen(m.font)||Object.keys(m).join(',')!=='font'||m.font.format!=='resource'||!m.font.integrity)throw Error('OWN_MODULE_IDENTITY');return {exports:{drawGlyph(frame:number){return gpu.importResource(fontGlyphResource({version:1,id:m.font.resourceId,decode:'font-glyph-v1',glyphId:frame===2?6:2,format:'svg',svg:{viewBox:[0,0,1000,1000]},output:{width:100,height:100,format:'rgba32float',alpha:'premultiplied',color:linear709}}));}},dispose:()=>gpu.dispose()};}`);
 const entry=join(project,'project.tsx');await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';import {drawGlyph} from 'test.font-images';export const image=defineNativeStage(init=>({renderAt(ctx){return drawGlyph(ctx.frame);}}));export default <Composition width={100} height={100} fps={24} durationInFrames={3} background="transparent"><Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
 await packagesCLI(['install',pack,'--project',project,'--add','test.font-images@1.0.0','--trust','local:test.font-images']);
 const build=await buildProject(entry),renderer=await Renderer.create(build,{allowWasm:true,nativeGpu:{executable:resolve('.frameweave/native-target/release/frameweave-native-gpu.exe'),dynamic:'interactive'}});
 let stats;try{for(const frame of [0,2,0]){const t=await renderer.submitNativeFrame(frame);await t.completed;}stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.submitted,3);assert.equal(stats.imageReadbacks,0);assert.equal(stats.capabilities.hardwareVerified,true);}finally{await renderer.close();await renderer.close();}
 const noWasm=await Renderer.create(build,{nativeGpu:{executable:resolve('.frameweave/native-target/release/frameweave-native-gpu.exe'),dynamic:'interactive'}});try{await assert.rejects(noWasm.submitNativeFrame(0),{code:'E_PACKAGE_PERMISSION'});}finally{await noWasm.close();}
 const options={allowWasm:true,build,output:'',encoder:'libx264' as const},frames:Buffer[]=[];
 for(const [name,frame]of [['glyph2',0],['glyph6',2],['glyph2-repeat',0]] as const){const output=join(dir,name+'.png');await renderNativeProject(entry,{...options,output,start:frame,end:frame+1});frames.push(await sharp(output).ensureAlpha().raw().toBuffer());}
 assert.deepEqual(frames[0],frames[2]);assert.notDeepEqual(frames[0],frames[1]);assert.ok(frames[0].some((v,i)=>i%4===3&&v>0));assert.equal(frames[0][(45*100+65)*4+3],0);assert.equal(frames[1][(12*100+10)*4+3],0);
 await renderNativeProject(entry,{...options,output:join(dir,'glyph.exr'),start:0,end:1});
 const raw=join(dir,'exr.f32');await exec(ffmpegPath(),['-v','error','-y','-i',join(dir,'glyph.exr'),'-pix_fmt','gbrapf32le','-f','rawvideo',raw],{windowsHide:true,timeout:15000});const rawBytes=await readFile(raw);assert.equal(rawBytes.length,100*100*16);const decoded=new Float32Array(rawBytes.buffer.slice(rawBytes.byteOffset,rawBytes.byteOffset+rawBytes.byteLength));assert.ok(decoded.every(Number.isFinite));assert.ok(decoded.some(v=>v>0));
 const movie=join(dir,'glyphs.mp4');await renderNativeProject(entry,{...options,output:movie});const video=await probeVideo(movie);assert.equal(video.frames,3);await exec(ffmpegPath(),['-v','error','-i',movie,'-f','null','-'],{windowsHide:true,timeout:15000});
 const carried=await exportProject(entry,{output:join(dir,'carried.tsx'),singleFile:true,layout:'capsule'});await rename(project,project+'-hidden');await rename(pack,pack+'-hidden');await rename(join(dir,'home'),join(dir,'home-hidden'));process.env.FRAMEWEAVE_HOME=join(dir,'empty-home');
 const portableBuild=await buildProject(carried.entry);await renderNativeProject(carried.entry,{...options,build:portableBuild,output:join(dir,'carried.png'),start:0,end:1});assert.deepEqual(await sharp(join(dir,'carried.png')).ensureAlpha().raw().toBuffer(),frames[0]);
 process.env.FRAMEWEAVE_HOME=join(dir,'home-hidden');const state=await installedPackages(project+'-hidden');const record=state.records.find(r=>r.manifest.id==='test.font-images')!;await appendFile(join(record.directory,'font.ttf'),'tamper');await assert.rejects(buildProject(join(project+'-hidden','project.tsx')),{code:'E_PACKAGE_INTEGRITY'});
 // A project-declared bitmap follows the same existing importer, with no kernel/pass.
 const bitmap=join(dir,'bitmap.tsx');await copyFile(resolve('tests/fixtures/font-images/sbix.ttf'),join(dir,'sbix.ttf'));await writeFile(bitmap,`import {Composition,Stage,Layer,Resource,ref,linear709} from '@frameweave/engine';import {defineNativeStage,fontGlyphResource} from '@frameweave/engine/native';export const image=defineNativeStage(init=>({renderAt(){return init.gpu.importResource(fontGlyphResource({version:1,id:'font',decode:'font-glyph-v1',glyphId:2,format:'sbix',strikeIndex:0,output:{width:8,height:6,format:'rgba16float',alpha:'premultiplied',color:linear709}}));}}));export default <Composition width={8} height={6} fps={24} durationInFrames={1} background="transparent"><Resource id="font" kind="font" src="./sbix.ttf"/><Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
 await renderNativeProject(bitmap,{allowWasm:true,output:join(dir,'bitmap.png'),start:0,end:1});const bp=await sharp(join(dir,'bitmap.png')).ensureAlpha().raw().toBuffer(),expected=await sharp(resolve('tests/fixtures/font-images/embedded.png')).ensureAlpha().raw().toBuffer();assert.equal(bp.length,expected.length);assert.ok(Math.max(...bp.map((v,i)=>Math.abs(v-expected[i])))<=1,'F16/display bitmap error must stay within 1/255');
 await writeFile(resolve('artifacts/font-images/native-result.json'),JSON.stringify({directory:dir,stats,video,decoded:true,randomFrames:[0,2,0],repeatPixelsExact:true,capsuleExact:true,permissionDenied:true,fontTamperDenied:true,bitmapMaxError:Math.max(...bp.map((v,i)=>Math.abs(v-expected[i]))),platform:process.platform},null,2));
 }finally{if(oldHome===undefined)delete process.env.FRAMEWEAVE_HOME;else process.env.FRAMEWEAVE_HOME=oldHome;}
});
test('editable example uses configurable admission budgets through the public Renderer',{timeout:45000},async()=>{
 const entry=resolve('examples/font-images/project.tsx'),build=await buildProject(entry),executable=resolve('.frameweave/native-target/release/frameweave-native-gpu.exe');
 const renderer=await Renderer.create(build,{allowWasm:true,nativeGpu:{executable,dynamic:'interactive',resourceLimits:{maxBytes:1024**2,maxSourceBytes:65536,maxSvgNodes:1000,maxSvgDepth:32}}});
 try{const ticket=await renderer.submitNativeFrame(0);await ticket.completed;assert.equal((await renderer.nativeStats()).capabilities.hardwareVerified,true);}finally{await renderer.close();}
 const small=await Renderer.create(build,{allowWasm:true,nativeGpu:{executable,dynamic:'interactive',resourceLimits:{maxBytes:64}}});
 try{await assert.rejects(small.submitNativeFrame(0),{code:'E_NATIVE_RESOURCE_LIMIT'});}finally{await small.close();}
 await assert.rejects(Renderer.create(build,{allowWasm:false,nativeGpu:{executable,resourceLimits:{allowWasm:true} as any}}),{code:'E_NATIVE_OPTIONS'});
 await renderNativeProject(entry,{allowWasm:true,build,output:resolve('artifacts/font-images/example.png'),start:0,end:1});
});
