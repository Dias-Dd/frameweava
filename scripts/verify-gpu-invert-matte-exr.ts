/** Independent F64 oracle for frame 1 of managed-invert-matte-project.tsx.
 * Reads a real EXR through the external codec; never used by an effect runtime. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide result.exr from the managed invert-matte frame-1 fixture');
const {surface}=await readExr(file),width=160,height=90,sigma=1.25,radius=4;
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
const seed=new Float64Array(width*height),horizontal=new Float64Array(seed.length),expected=new Float64Array(seed.length),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum;
for(let y=0;y<height;y++)for(let x=0;x<width;x++)seed[y*width+x]=(x-64)**2+(y-45)**2<22**2?0:1;
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=-radius;k<=radius;k++)horizontal[y*width+x]+=seed[y*width+Math.max(0,Math.min(width-1,x+k))]*weights[k+radius];
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=-radius;k<=radius;k++)expected[y*width+x]+=horizontal[Math.max(0,Math.min(height-1,y+k))*width+x]*weights[k+radius];
const actual=pixelsFromSurface(surface),tint=[4,.75,Math.fround(-.1)],eps=3e-6,alphaValues=new Set<number>();let maxAlphaError=0,maxRgbScaledError=0,partial=0,zero=0,full=0;
for(let i=0;i<expected.length;i++){
 const a=actual[i*4+3],error=Math.abs(a-expected[i]);maxAlphaError=Math.max(maxAlphaError,error);assert.ok(error<=eps,`Independent F64 Gaussian Alpha ${i}: ${a} vs ${expected[i]}`);alphaValues.add(a);if(a===0)zero++;else if(a===1)full++;else partial++;
 for(let c=0;c<3;c++){const e=tint[c]*expected[i],error=Math.abs(actual[i*4+c]-e)/Math.max(1,Math.abs(e));maxRgbScaledError=Math.max(maxRgbScaledError,error);assert.ok(error<=eps,`Independent HDR tint/matte ${i}:${c}`);}
}
assert.ok(zero>0&&full>0&&partial>0,'Real inverse hole, full exterior and soft edge');
const result={ok:true,kind:'independent-f64-managed-frame1-exr-oracle',file,width,height,sourceSha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{mask:{center:[64,45],radius:22,invert:true},gaussian:{sigma,radius,boundary:'clamp'},tint,frame:1},eps,maxAlphaError,maxRgbScaledError,alpha:{zero,full,partial,distinct:alphaValues.size},scope:'Shot-specific external EXR verification, not a general image size limit or production CPU effect'};
await writeFile(join(dirname(file),'exr-alpha-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
