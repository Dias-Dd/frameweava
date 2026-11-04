import {test} from 'node:test';import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';import {writeFile,mkdir} from 'node:fs/promises';
import {blur,glow,displacement,surfaceFromCoverage,wiggle,applyFloatKernel} from '../modules/pro-animation/src/index.ts';
import {surfaceFromPixels,pixelsFromSurface,linear709,acescg,linear2020,srgb,pq2020,type AlphaMode,type PixelFormat} from '../src/media/surface.ts';
import {transformPixels} from '../src/media/color.ts';import {keyframes} from '../src/core/animation.ts';
const close=(a:ArrayLike<number>,b:ArrayLike<number>,eps=2e-6)=>{assert.equal(a.length,b.length);for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-b[i])<=eps*Math.max(1,Math.abs(b[i])),`${i}: ${a[i]} != ${b[i]}`);};
const fixture=(format:PixelFormat,alpha:AlphaMode)=>{const p=new Float32Array(5*3*4);for(let i=0;i<p.length;i+=4){const a=[0,.25,.5,1][i/4%4];p.set([-1+i/8,8-i/16,.125,a],i);if(alpha==='premultiplied')for(let c=0;c<3;c++)p[i+c]*=a;}return surfaceFromPixels(5,3,p,{format,color:linear709,alpha,rowStride:format==='rgba16float'?48:96});};
// Independent direct 2D Gaussian (production uses two separable F32 passes).
function reference(p:Float32Array,w:number,h:number,sigma:number){const r=Math.ceil(3*sigma),kernel=Array.from({length:2*r+1},(_,i)=>Math.exp(-.5*((i-r)/sigma)**2)),sum=kernel.reduce((a,b)=>a+b,0),out=new Float64Array(p.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;out[(y*w+x)*4+c]+=p[((y+dy)*w+x+dx)*4+c]*kernel[dx+r]*kernel[dy+r]/sum**2;}}return out;}

test('float blur: independent 2D reference, 16F/32F, stride, signed HDR, alpha and immutable input',async()=>{
 const rows=[];
 for(const format of ['rgba16float','rgba32float'] as const){const straight=fixture(format,'straight'),premultiplied=fixture(format,'premultiplied'),before=straight.storage.data;const src=pixelsFromSurface(straight);for(let i=0;i<src.length;i+=4)for(let c=0;c<3;c++)src[i+c]*=src[i+3];const expected=reference(src,5,3,.7);
  const a=blur(straight,{radius:.7,alpha:'premultiplied'}),b=blur(premultiplied,{radius:.7,alpha:'premultiplied'});assert.equal(a.format,format);rows.push({format,rowStride:straight.rowStride,maxAbsolute:Math.max(...pixelsFromSurface(a).map((v,i)=>Math.abs(v-expected[i])))});close(pixelsFromSurface(a),expected,format==='rgba16float'?6e-4:3e-6);close(pixelsFromSurface(a),pixelsFromSurface(b),format==='rgba16float'?1e-3:3e-6);assert.equal(straight.storage.data,before);assert.ok(pixelsFromSurface(a).some(v=>v>1));assert.ok(pixelsFromSurface(blur(surfaceFromPixels(1,1,[-2,8,0,1],{format,color:linear709}),{radius:0}))[0]<0);
 }
 await mkdir('.frameweave/pa1',{recursive:true});await writeFile('.frameweave/pa1/numeric-proof.json',JSON.stringify({reference:'independent f64 direct 2D Gaussian',rows},null,2));
});
test('glow linear HDR extraction, negative preservation, transparent hidden RGB and defined coverage expansion',()=>{
 const bright=surfaceFromPixels(1,1,[8,8,8,.5],{format:'rgba32float',color:linear709});close(pixelsFromSurface(glow(bright,{radius:0,intensity:.5,threshold:1})),[11.5/(.5+.5*.5*.5*.875)*.5,11.5/(.5+.5*.5*.5*.875)*.5,11.5/(.5+.5*.5*.5*.875)*.5,.5+.5*.5*.5*.875]);
 const invisible=surfaceFromPixels(1,1,[300,-12,4,0],{format:'rgba32float',color:linear709});close(pixelsFromSurface(glow(invisible,{radius:2,intensity:3,threshold:0})),[0,0,0,0]);
 const signed=surfaceFromPixels(1,1,[-2,8,2,1],{format:'rgba16float',color:linear709});assert.ok(pixelsFromSurface(glow(signed,{radius:0,intensity:.5,threshold:0}))[0]<-2);
 const center=surfaceFromPixels(3,1,[0,0,0,0,8,8,8,.5,0,0,0,0],{format:'rgba32float',color:linear709});const halo=pixelsFromSurface(glow(center,{radius:.5,intensity:1,threshold:1}));assert.ok(halo[3]>0);assert.ok(halo[0]>1);
});
test('bilinear displacement: negative/subpixel coordinates, alpha correctness, clamp/transparent and identity',()=>{
 const s=surfaceFromPixels(2,1,[8,0,0,.5,0,300,0,0],{format:'rgba32float',color:linear709,alpha:'straight'}),base={amount:0,offset:[.5,0] as const};
 close(pixelsFromSurface(displacement(s,base)),[8,0,0,.25,0,0,0,0]);close(pixelsFromSurface(displacement(s,{amount:0,offset:[-.5,0]})),[8,0,0,.25,8,0,0,.25]);
 close(pixelsFromSurface(displacement(s,{...base,boundary:'clamp'})),[8,0,0,.25,0,0,0,0]);
 const hdr=fixture('rgba16float','premultiplied');close(pixelsFromSurface(displacement(hdr,{amount:0})),pixelsFromSurface(hdr));
 assert.throws(()=>displacement(s,{amount:1,seed:.5}),{code:'E_PA_PARAMETER'});
});
test('encoded colors require an explicit linear working space, controlled conversion and output precision',()=>{
 const p=new Float32Array([.5,.3,.1,.5]),source=surfaceFromPixels(1,1,p,{format:'rgba32float',color:srgb});assert.throws(()=>glow(source,{radius:0,intensity:0}),{code:'E_PA_WORKING_COLOR'});
 for(const color of [linear709,linear2020,acescg]){const got=glow(source,{radius:0,intensity:0,workingColor:color});close(pixelsFromSurface(got),transformPixels(p,srgb,color,'straight').pixels);assert.deepEqual(got.color,color);}
 const pq=surfaceFromPixels(1,1,transformPixels(p,linear709,pq2020,'straight').pixels,{format:'rgba32float',color:pq2020});close(pixelsFromSurface(glow(pq,{radius:0,intensity:0,workingColor:linear709})),p,3e-5);
 assert.throws(()=>glow(source,{radius:0,intensity:0,workingColor:srgb}),{code:'E_PA_WORKING_COLOR'});
 assert.throws(()=>blur({...source,rowStride:1},{radius:0,workingColor:linear709}),{code:'E_MEDIA_LAYOUT'});
 assert.throws(()=>blur({...source,format:'rgba8unorm'} as any,{radius:0}),{code:'E_PA_PRECISION'});
 assert.throws(()=>blur(source,{radius:65,workingColor:linear709}),{code:'E_PA_PARAMETER'});
 assert.throws(()=>blur(source,{radius:0,workingColor:linear709,backend:'webgpu'} as any),{code:'E_PA_PARAMETER'});
 assert.throws(()=>blur(fixture('rgba32float','straight'),{radius:0,maxWorkingBytes:1024}),{code:'E_PA_LIMIT'});
});
test('coverage ink and frozen absolute-time Signal/wiggle composition remain float and random-access',()=>{
 const s=surfaceFromCoverage([0,.25,.5,1],{width:4,height:1,ink:[-2,8,4,1],workingColor:acescg,format:'rgba16float'});close(pixelsFromSurface(s),[0,0,0,0,-.5,2,1,.25,-1,4,2,.5,-2,8,4,1]);
 const seen=new Map<number,Float32Array>();for(const frame of [8,0,3,8,3]){const ctx={frame,time:frame/24,fps:24,seed:51,delta:1/24} as any;const amount=Math.abs(wiggle({frequency:2,amplitude:1},ctx)[0]);const out=glow(displacement(s,{amount,boundary:'clamp'},ctx),{radius:0,intensity:keyframes([{frame:0,value:0},{frame:8,value:1}]),threshold:0},ctx),p=pixelsFromSurface(out);if(seen.has(frame))assert.deepEqual(p,seen.get(frame));seen.set(frame,p);}
 assert.notDeepEqual(seen.get(0),seen.get(8));assert.throws(()=>blur(s,{radius:keyframes([{frame:0,value:0}])}),{code:'E_PA_CONTEXT'});
});
test('bounded CPU performance measurement: real float effect combination, no FPS claim',async()=>{
 const w=128,h=72,p=new Float32Array(w*h*4);for(let i=0;i<p.length;i+=4)p.set([i%17-.5,4,.2,.5],i);const s=surfaceFromPixels(w,h,p,{color:acescg,format:'rgba32float'}),times=[];for(let i=0;i<4;i++){const t=performance.now();const out=glow(displacement(s,{amount:2,time:i/24}),{radius:2,intensity:.8,threshold:1});assert.ok(Math.max(...pixelsFromSurface(out))>1);times.push(performance.now()-t);}await mkdir('.frameweave/pa1',{recursive:true});await writeFile('.frameweave/pa1/cpu-performance.json',JSON.stringify({width:w,height:h,format:'rgba32float',backend:'cpu',coldFirstAndThreeWarmMs:times,includes:'PME validation/unpack/color, displacement, Gaussian bloom, float packing; deferred Base64; no browser/GPU'},null,2));
});

test('public CPU kernel reuses PME validation/color/alpha, owns output and rejects async/nonfinite/malformed results',()=>{
 const s=surfaceFromPixels(1,1,[8,-2,1,.25],{format:'rgba32float',color:linear709}),before=s.storage.data;let scratch:Float32Array;const out=applyFloatKernel(s,{},image=>{assert.equal(image.alpha,'premultiplied');close(image.pixels,[2,-.5,.25,.25]);scratch=image.pixels;image.pixels[0]*=2;return image.pixels;});close(pixelsFromSurface(out),[16,-2,1,.25]);scratch![0]=999;close(pixelsFromSurface(out),[16,-2,1,.25]);assert.equal(s.storage.data,before);
 assert.throws(()=>applyFloatKernel(s,{},()=>new Float32Array(3)),{code:'E_PA_KERNEL'});assert.throws(()=>applyFloatKernel(s,{},(async()=>new Float32Array(4)) as any),{code:'E_PA_KERNEL'});assert.throws(()=>applyFloatKernel(s,{},()=>new Float32Array([NaN,0,0,.5])),{code:'E_MEDIA_RANGE'});assert.throws(()=>applyFloatKernel(s,{},()=>new Float32Array([1,0,0,2])),{code:'E_MEDIA_RANGE'});
});
