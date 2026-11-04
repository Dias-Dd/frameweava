import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {buildProject,Renderer} from '../src/node.ts';
import {nativeExecutable} from '../modules/native-gpu/executable.ts';

const base=resolve('.frameweave/main-native-admission');await mkdir(base,{recursive:true});const proof=await mkdtemp(join(base,'long-')),entry=join(proof,'project.tsx');process.env.FRAMEWEAVE_HOME=join(proof,'home');
await writeFile(entry,`import {Composition,Stage,Layer,ref,linear709} from '@frameweave/engine';
import {defineNativeStage} from '@frameweave/engine/native';
export const source=defineNativeStage(async init=>{const g=init.gpu,k=await g.compile({abiVersion:1,id:'main/native/long-storage',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(f32(p.x)/f32(outputSize().x-1u),-.25,2.,1.);}'});return {async renderAt(){const out=await g.run(k,[],{output:{width:init.width,height:init.height,format:'rgba32float',alpha:'opaque',color:linear709}});if(!g.imageToBuffer)throw Error('Native data view unavailable');const view=await g.imageToBuffer(out,{version:1});await g.publishBuffer('reference',view,{version:1});await g.releaseBuffer(view);return out;}};});
export default <Composition width={32769} height={1} fps={1} durationInFrames={1} background="transparent"><Stage id="storage" factory={source}/><Layer source={ref('storage')}/></Composition>;`);
const build=await buildProject(entry);assert.equal(build.manifest.composition.width,32769);assert.equal(build.manifest.stages[0].engine,'native-gpu');
const renderer=await Renderer.create(build,{nativeGpu:{executable:await nativeExecutable(),dynamic:'interactive',slots:1}});let stats;
try{const ticket=await renderer.submitNativeFrame(0),result=await renderer.exportNativeBuffer(ticket,'storage/reference');assert.equal(result.values.length,32769*4);assert.deepEqual(Array.from(result.values.slice(0,4)),[0,-.25,2,1]);assert.deepEqual(Array.from(result.values.slice(-4)),[1,-.25,2,1]);stats=await renderer.nativeStats();assert.equal(stats.devicesCreated,1);assert.equal(stats.imageReadbacks,0);}finally{await renderer.close();}
const result={source:process.env.FRAMEWEAVE_TEST_COMMIT,passed:true,proof,entry,size:[32769,1],path:'TSX -> TVG validation -> existing Renderer -> native storage GPU -> explicit named buffer',stats,note:'No texture/display/export or unlimited-resource claim. Fixed 16MP native-area removal belongs to the owner successor.'};await writeFile(join(proof,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
