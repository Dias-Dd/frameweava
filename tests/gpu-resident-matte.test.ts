import test from 'node:test';import assert from 'node:assert/strict';
import {morphologySteps} from '../modules/gpu-image-effects/resident/matte.ts';
import {morphology} from '../modules/gpu-image-effects/resident/validation/matte-reference.ts';
test('morphology radius planner expands a gap-free exact interval without fixed radius cap',()=>{
 for(const r of [0,1,2,3,4,5,8,9,13,27,64,1024,16384,2**24]){const steps=morphologySteps(r);let covered=0;for(const step of steps){assert.ok(step>0&&step<=2*covered+1);covered+=step;}assert.equal(covered,r);assert.ok(steps.length<32);}
 for(const r of [-1,NaN,Infinity,.5,2**54])assert.throws(()=>morphologySteps(r));
});
test('independent reference distinguishes full 2D fractional radii and finite-canvas boundaries',()=>{
 const a=Float32Array.of(0,0,0,0,1,0,0,0,0),q=morphology(a,3,3,.5,'dilate');assert.equal(q[0],.5);assert.equal(q[4],1);
 const opaque=new Float32Array(9).fill(1);assert.deepEqual(morphology(opaque,3,3,1,'erode'),Float32Array.of(0,0,0,0,1,0,0,0,0));assert.deepEqual(morphology(opaque,3,3,1,'erode','both',true),opaque);
 // The declared finite-canvas composition re-applies the boundary each primitive.
 assert.deepEqual(morphology(opaque,3,3,1,'close'),Float32Array.of(0,0,0,0,1,0,0,0,0));
});
