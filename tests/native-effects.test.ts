import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {createNativeImageEffects,nativeImageEffectNames} from '../modules/native-effects/images.ts';
import {referencePixels} from '../modules/native-effects/reference.ts';
import {additionalNativeEffectNames,unavailableNativeImageMethods,type NativeProfessionalFilters} from '../modules/native-effects/extended.ts';
test('twenty distinct existing creative/blend functions, not aliases counted twice',()=>{
 assert.equal(nativeImageEffectNames.length,20);assert.equal(new Set(nativeImageEffectNames).size,20);
});
test('an unadmitted recorder is not a runnable hardware backend',async()=>{
 const recorder=new NativeRecordingScope();assert.throws(()=>createNativeImageEffects({gpu:recorder.api}),{code:'E_NATIVE_EFFECTS_DEVICE'});
 assert.equal(recorder.api.stats().runs,0);await recorder.api.dispose();
});
test('existing independent equations retain negative/HDR/Alpha-zero emission',()=>{
 const p=new Float32Array([2,-.25,.4,1,.2,-.1,.05,0]);
 const out=referencePixels(p,2,1,0,0);assert.ok(out[0]>1);assert.ok(out[1]<0);assert.equal(out[7],0);assert.ok(out[4]>0);
});
test('81 distinct image operations; unavailable bridges absent from the Native API',()=>{
 const names=[...nativeImageEffectNames,...additionalNativeEffectNames];assert.equal(names.length,81);assert.equal(new Set(names).size,81);for(const unavailable of unavailableNativeImageMethods)assert.ok(!names.some(n=>n===String(unavailable)));
 const excluded:Extract<keyof NativeProfessionalFilters,typeof unavailableNativeImageMethods[number]> extends never?true:false=true;assert.equal(excluded,true);
});
