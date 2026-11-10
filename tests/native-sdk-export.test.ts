import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildProject} from '../src/compiler/build.ts';
import {exportProject} from '../src/compiler/export.ts';

test('public Native SDK exports retain SDK dependencies with the original project unavailable',async()=>{
  const parent=resolve('.frameweave/native-sdk-export');await mkdir(parent,{recursive:true});
  const root=await mkdtemp(join(parent,'case-')),source=join(root,'source');await mkdir(source);
  const entry=join(source,'project.tsx');
  await writeFile(entry,`import {Composition,Stage,Layer,ref} from '@frameweave/engine';
import {defineNativeStage,linear709} from '@frameweave/engine/native';
export const image=defineNativeStage(async init=>{const kernel=await init.gpu.compile({abiVersion:1,id:'test/carried-native',version:'1.0.0',inputCount:0,parameterWords:0,code:'fn pixel(p:vec2u)->vec4f{return vec4f(.2,.3,4.,1.);}'});return {renderAt(){return init.gpu.run(kernel,[],{output:{width:8,height:8,format:'rgba32float',alpha:'opaque',color:linear709}});}};});
export default <Composition width={8} height={8} fps={24} durationInFrames={2}><Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
  const carried=await exportProject(entry,{output:join(root,'carried'),sources:'preserve',modules:'copy',assets:'copy'});
  assert.equal(carried.selfContained,true);assert.deepEqual(carried.externalFiles,[]);
  await rename(source,source+'-offline');
  const rebuilt=await buildProject(carried.entry);
  assert.equal(rebuilt.manifest.composition.width,8);assert.ok(rebuilt.manifest.stages.some(stage=>stage.id==='image'));
});
