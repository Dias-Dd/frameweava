import {test} from 'node:test';import assert from 'node:assert/strict';
import {prepareOptions,prepareSample,camera,time} from '../modules/spatial-data-effects/src/prepare.ts';
import {mesh,sample,identity,orthographic} from '../modules/spatial-data-effects/validation/fixtures.ts';
test('AOV prototype reuses Graphics mesh validation, strict input values and explicit resource planning',()=>{
  const c=prepareOptions({width:1920,height:1080,meshes:[mesh()],maxBufferBytes:512*1024*1024});assert.ok(c.geometryBytes>=4*72+6*8);assert.equal(c.planned,1920*1080*180+c.geometryBytes);assert.throws(()=>prepareOptions({width:1920,height:1080,meshes:[mesh()],maxBufferBytes:1024}),{code:'E_SPATIAL_DATA_BUDGET'});assert.throws(()=>prepareOptions({width:32,height:32,meshes:[mesh(),mesh()]}),{code:'E_SPATIAL_DATA_MESH'});const bad=mesh();bad.indices[0]=99;assert.throws(()=>prepareOptions({width:32,height:32,meshes:[bad]}));
  const input=mesh(),safe=prepareOptions({width:32,height:32,meshes:[input]});input.restPositions[0][0]=999;assert.equal(safe.meshes[0].restPositions[0][0],-1);
});
test('AOV prototype rejects implicit pose/history, nonfinite time, degenerate camera and model matrices',()=>{
  const {meshes}=prepareOptions({width:32,height:32,meshes:[mesh()]});assert.throws(()=>prepareSample({...sample(),objects:[]},meshes,32,32),{code:'E_SPATIAL_DATA_POSE'});for(const seconds of [NaN,Infinity,null,'0'])assert.throws(()=>time({...sample().context,time:seconds} as any),{code:'E_SPATIAL_DATA_PARAMETER'});assert.throws(()=>time({...sample().context,time:1}),{code:'E_SPATIAL_DATA_TIME'});assert.throws(()=>time({...sample().context,fps:null} as any),{code:'E_SPATIAL_DATA_PARAMETER'});assert.throws(()=>camera({...orthographic,position:[0,0,0]},32,32),{code:'E_SPATIAL_DATA_CAMERA'});assert.throws(()=>camera({...orthographic,up:[0,0,1]},32,32),{code:'E_SPATIAL_DATA_CAMERA'});const zero=[...identity];zero[0]=0;assert.throws(()=>prepareSample(sample(0,zero as any),meshes,32,32),{code:'E_SPATIAL_DATA_POSE'});
  const p=sample();p.objects[0].positions=[[-1,-1,0]];assert.throws(()=>prepareSample(p,meshes,32,32),{code:'E_SPATIAL_DATA_POSE'});
});
