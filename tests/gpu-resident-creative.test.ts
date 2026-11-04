import test from 'node:test';import assert from 'node:assert/strict';
import * as K from '../modules/gpu-image-effects/resident/creative/kernels.ts';
import {validatePixelKernel} from '../modules/gpu-effects/pixel-shader.ts';
import {createCreativeFilters} from '../modules/gpu-image-effects/resident/creative/filters.ts';
import type {GpuPixelImage,GpuPixelScope} from '../modules/gpu-effects/pixel-types.ts';
import {linear709} from '../src/media/surface.ts';
test('ten distinct sealed kernels fit the existing public ABI',()=>{const ids=new Set<string>();for(const k of Object.values(K)){assert.deepEqual(validatePixelKernel(k),k);assert.ok(!ids.has(k.id));ids.add(k.id);}assert.equal(ids.size,10);});
test('creative adapters reject bad shape/range before any GPU call',async()=>{
 const i={info:{width:1,height:1,color:linear709,format:'rgba32float',alpha:'premultiplied'}} as GpuPixelImage,fx=createCreativeFilters({} as GpuPixelScope);
 const bad=[()=>fx.brightnessContrast(i,{contrast:-1}),()=>fx.tint(i,{amount:2}),()=>fx.tritone(i,{shadows:[1,2] as never}),()=>fx.colorBalance(i,{preserveLuma:'yes'} as never),()=>fx.blackAndWhite(i,{weights:[1,2] as never}),()=>fx.filmGrain(i,{seed:-1}),()=>fx.vignette(i,{radius:0}),()=>fx.sobelEdges(i,{mode:'bad'} as never),()=>fx.reliefLighting(i,i,{heightChannel:'bad'} as never),()=>fx.pixelate(i,{blockSize:[0,1]})];
 for(const call of bad)await assert.rejects(call,(e:unknown)=>(e as {code?:string}).code==='E_GPU_IMAGE_PARAMETER');
});
