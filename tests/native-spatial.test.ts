import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeSpatialFrame,nativeSpatialNames,type NativeSpatialFrame} from '../modules/native-effects/spatial/frame.ts';
import * as mesh from '../modules/mesh-deformation/index.ts';
import * as compute from '../modules/spatial-compute/index.ts';
import * as vfx from '../modules/spatial-vfx/index.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import type {FrameContext} from '../src/core/types.ts';
test('all 61 actual existing spatial algorithm names are included without readback utilities',()=>{
 assert.deepEqual([...nativeSpatialNames.mesh].sort(),Object.keys(mesh).filter(n=>n!=='readDeformedPositions').sort());assert.deepEqual([...nativeSpatialNames.compute].sort(),Object.keys(compute).sort());assert.deepEqual([...nativeSpatialNames.vfx].sort(),Object.keys(vfx).sort());assert.equal(nativeSpatialNames.fields.length,16);assert.equal(Object.values(nativeSpatialNames).reduce((n,a)=>n+a.length,0),61);
 const forbidden:Extract<keyof NativeSpatialFrame['fields'],'readSpatialField'|'validateSpatialFields'|'importSpatialCapture'|'createSpatialDataRenderer'> extends never?true:false=true;assert.equal(forbidden,true);
});
test('standalone recording scope cannot masquerade as an admitted Native device',async()=>{
 const scope=new NativeRecordingScope(),c:FrameContext={frame:0,globalFrame:0,time:0,globalTime:0,dt:1/24,fps:{num:24,den:1},seed:91,progress:0,durationInFrames:240};assert.throws(()=>nativeSpatialFrame({gpu:scope.api,width:64,height:32},c),{code:'E_NATIVE_EFFECTS_DEVICE'});assert.equal(scope.api.stats().runs,0);await scope.api.dispose();
});
