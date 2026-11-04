/** Independent frame-1 F64 reference for managed-replace-matte-project.tsx.
 * Shot verification only; never imported by a production effect. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide frame-1 result.exr from managed-replace-matte-project.tsx');
const {surface}=await readExr(file),width=160,height=90,radius=4,sigma=1.25,amplitude=Math.fround(.65),eps=3e-6;
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
const seed=new Float64Array(width*height),horizontal=new Float64Array(seed.length),expected=new Float64Array(seed.length),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum;
for(let y=0;y<height;y++)for(let x=0;x<width;x++)seed[y*width+x]=(x-64)**2+(y-45)**2<22**2?amplitude:0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=-radius;k<=radius;k++)horizontal[y*width+x]+=seed[y*width+Math.max(0,Math.min(width-1,x+k))]*weights[k+radius];
for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let k=-radius;k<=radius;k++)expected[y*width+x]+=horizontal[Math.max(0,Math.min(height-1,y+k))*width+x]*weights[k+radius];
const actual=pixelsFromSurface(surface);let maxAlphaError=0,maxRgbScaledError=0,zero=0,plateau=0,partial=0,revealed=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const at=y*width+x,a=actual[at*4+3],error=Math.abs(a-expected[at]);maxAlphaError=Math.max(maxAlphaError,error);assert.ok(error<=eps,`Independent replacement Alpha ${at}: ${a} vs ${expected[at]}`);
 if(a===0)zero++;else if(a===amplitude)plateau++;else partial++;
 const colour=[Math.fround(4+.01*x),Math.fround(1.25+.002*y),Math.fround(-.1-.001*x)];for(let c=0;c<3;c++){const e=colour[c]*expected[at],d=Math.abs(actual[at*4+c]-e)/Math.max(1,Math.abs(e));maxRgbScaledError=Math.max(maxRgbScaledError,d);assert.ok(d<=eps,`Independent preserved colour/replacement ${at}:${c}`);}
 if(x>=80&&a>0){assert.ok(actual[at*4]>0,'Colour hidden at original zero Alpha is revealed');revealed++;}
}
assert.ok(zero>0&&plateau>0&&partial>0&&revealed>0);
const result={ok:true,kind:'independent-f64-managed-replacement-frame1-exr-oracle',file,width,height,sourceSha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{frame:1,mask:{center:[64,45],radius:22,amplitude},gaussian:{sigma,radius,boundary:'clamp'},sourceAlpha:'x<80 ? .25 : 0; replaced, not multiplied'},eps,maxAlphaError,maxRgbScaledError,alpha:{zero,plateau,partial,revealedFromOriginalZero:revealed},scope:'Fixed acceptance scene, not an effect resolution limit or CPU render fallback'};
await writeFile(join(dirname(file),'exr-replacement-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
