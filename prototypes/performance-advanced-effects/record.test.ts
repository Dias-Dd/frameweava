import test from 'node:test';
import assert from 'node:assert/strict';
import {RecipeRecorder} from './record.ts';
import {recipe,names} from './recipe.ts';
import type {FrameContext} from '../../src/core/types.ts';
const context=(frame:number):FrameContext=>({frame,globalFrame:frame,time:frame/24,globalTime:frame/24,dt:1/24,fps:{num:24,den:1},durationInFrames:120,progress:frame/119,seed:51});
test('real 12-function recipe compiles stable explicit native tape; no GPU simulation',async()=>{
 const r=new RecipeRecorder();let kernels=0;
 for(const frame of [0,7,119,7]){
  r.reset();const result=await recipe(r.api,context(frame),64,36);await result.release();
  const p=r.program();assert.equal(p.passes.length,12);assert.equal(names.length,12);assert.equal(p.images.length,12);
  assert.equal(p.display,null);assert.equal(p.slots,2);
  if(kernels)assert.equal(p.kernels.length,kernels);kernels=p.kernels.length;
  for(const [i,pass]of p.passes.entries()){
   assert.equal(pass.output,i);assert.ok(pass.inputs.every(n=>n<i));
   assert.equal(r.parameters[i].length,p.kernels[pass.kernel].parameterWords);
   assert.doesNotMatch(p.kernels[pass.kernel].code,/fw_errors/);
   assert.equal(p.images[i].format,'rgba32float');assert.equal(p.images[i].alpha,'premultiplied');
  }
 }
});
