import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {builtinDefaultOptions,nativeBuiltinEffectNames,createNativeBuiltinEffects} from '../modules/native-effects/builtin/filters.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {validatePixelKernel} from '../modules/gpu-effects/pixel-shader.ts';
import * as kernels from '../modules/native-effects/builtin/kernels.ts';

test('seven real builtin contracts, no temporal blur alias',()=>{assert.equal(new Set(nativeBuiltinEffectNames).size,7);assert.ok(!nativeBuiltinEffectNames.includes('motionBlur' as never));});
test('Native defaults preserve the frozen pre-upgrade numeric contracts',()=>{const reference=JSON.parse(readFileSync(new URL('../modules/native-effects/builtin/original-defaults.json',import.meta.url),'utf8'));assert.deepEqual(builtinDefaultOptions,reference.defaults);});

test('typed-data Gaussian avoids the 1024-word uniform limit without a new owner',()=>{assert.equal(kernels.gaussianData.abiVersion,2);assert.equal(kernels.gaussianData.parameterWords,4);assert.match(kernels.gaussianData.code,/data0\(2u\*/);for(const k of Object.values(kernels))assert.equal(validatePixelKernel(k).id,k.id);});
test('builtin module cannot treat an unadmitted recorder as a GPU',async()=>{const s=new NativeRecordingScope();assert.throws(()=>createNativeBuiltinEffects({gpu:s.api}),{code:'E_NATIVE_EFFECTS_DEVICE'});assert.equal(s.api.stats().runs,0);await s.api.dispose();});
