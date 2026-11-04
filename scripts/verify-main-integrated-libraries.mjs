// Run with Node from an independent npm consumer. Only published SDK/CLI APIs.
import {mkdir,writeFile,copyFile,readFile,rename} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const consumer=resolve(process.argv[2]),engine=join(consumer,'node_modules/@frameweave/engine'),project=join(consumer,'main-integration-'+Date.now());await mkdir(project,{recursive:true});
const sdk=await import(new URL('./lib/node.js',new URL('file:///'+engine.replaceAll('\\','/')+'/'))),{runCLI}=await import(new URL('./lib/cli-entry.js',new URL('file:///'+engine.replaceAll('\\','/')+'/')));
process.env.FRAMEWEAVE_HOME=join(project,'home');
await sdk.installPackages(project,[join(engine,'catalog')],{add:['native-image-effects@0.6.0','pro-animation-native@0.1.0','spatial-creation@1.0.0'],trust:['local:frameweave.gpu-images','local:frameweave.animation','local:frameweave.spatial']});
await copyFile(join(engine,'modules/font-images/../../examples/font-images/bitmap.ttf'),join(project,'font.ttf')).catch(async()=>copyFile(resolve('tests/fixtures/font-images/sbix.ttf'),join(project,'font.ttf')));
const entry=join(project,'project.tsx');await writeFile(entry,`import {Composition,Stage,Resource,Layer,ref,linear709} from '@frameweave/engine';import {defineNativeStage,fontGlyphResource} from '@frameweave/engine/native';import {glyphIdentity3D} from 'pro-animation-native';import {createNativeClosureEffects} from 'native-image-effects';import {sphere3D} from 'spatial-creation';
 export const glyph=defineNativeStage(async init=>{if(glyphIdentity3D().matrix.length!==16)throw Error('PA_IMPORT');const fx=await createNativeClosureEffects(init);return {async renderAt(context){const image=await init.gpu.importResource(fontGlyphResource({version:1,id:'font',decode:'font-glyph-v1',glyphId:2,format:'sbix',strikeIndex:0,output:{width:8,height:6,format:'rgba32float',alpha:'premultiplied',color:linear709}}));return fx.processImage(image,(input,e)=>e.noiseAlpha(input,{noise:0}),{context});},dispose:()=>fx.dispose()};});
 export const object=defineNativeStage(()=>sphere3D({radius:.5,detail:1}));
 export default <Composition width={64} height={64} fps={24} durationInFrames={1} background="transparent"><Resource id="font" kind="font" src="./font.ttf"/><Stage id="glyph" factory={glyph} width={8} height={6}/><Stage id="object" factory={object}/><Layer source={ref('glyph')} scale={4}/><Layer source={ref('object')}/></Composition>;`);
const png=join(project,'installed.png');await runCLI(['frame',entry,'--frame','0','--output',png,'--allow-wasm','--json']);assert.ok((await readFile(png)).subarray(1,4).equals(Buffer.from('PNG')));
const carried=join(consumer,'main-carried-'+Date.now()+'.tsx');await sdk.exportProject(entry,{output:carried,singleFile:true,layout:'capsule'});await rename(project,project+'-hidden');process.env.FRAMEWEAVE_HOME=join(consumer,'empty-main-home-'+Date.now());const copy=join(consumer,'main-carried.png');await runCLI(['frame',carried,'--frame','0','--output',copy,'--allow-wasm','--json']);assert.deepEqual(await readFile(copy),await readFile(join(project+'-hidden','installed.png')));
console.log(JSON.stringify({ok:true,consumer,project:project+'-hidden',carried,png:copy,threeManagedLibraries:true,actualNativePng:true,capsuleBytesExact:true}));
