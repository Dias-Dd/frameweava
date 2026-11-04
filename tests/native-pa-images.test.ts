import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {createNativePaImageEffects,nativePaImageNames} from '../modules/native-effects/pa/filters.ts';
import {validatePixelKernel} from '../modules/gpu-effects/pixel-shader.ts';
import * as kernels from '../modules/native-effects/pa/kernels.ts';
test('six actual image adapters; no CPU kernel callback advertised as GPU',()=>{assert.equal(new Set(nativePaImageNames).size,6);assert.ok(!nativePaImageNames.includes('applyFloatKernel' as never));assert.ok(!nativePaImageNames.includes('createDisplacementMap' as never));});
test('PA adapters preserve the existing hardware admission boundary',async()=>{const scope=new NativeRecordingScope();assert.throws(()=>createNativePaImageEffects({gpu:scope.api}),{code:'E_NATIVE_EFFECTS_DEVICE'});await scope.api.dispose();});
test('all PA adapters use the existing Pixel ABI',()=>{for(const source of Object.values(kernels))assert.equal(validatePixelKernel(source).id.startsWith('frameweave/native-pa-'),true);});
