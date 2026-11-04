/** Independent bounded-scene F64 Gaussian/difference/Fill EXR verification. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide frame-1 EXR from managed-subtract-matte-project.tsx');
const {surface}=await readExr(file),width=160,height=90,eps=3e-6,p=pixelsFromSurface(surface),radius=4,sigma=1.25;
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
const w=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*sigma*sigma))),sum=w.reduce((a,b)=>a+b,0);for(let i=0;i<w.length;i++)w[i]/=sum;
const tint=[4,Math.fround(.7),Math.fround(-.1)];let maxAbsError=0,maxScaledError=0,maxAlphaError=0,zero=0,covered=0,cut=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 let a=0,b=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy)),weight=w[dy+radius]*w[dx+radius];if((xx-80)**2+(yy-45)**2<28**2)a+=Math.fround(.8)*weight;if((xx-88)**2+(yy-45)**2<22**2)b+=weight;}
 // Explicit public Surface F32 boundaries after both feather operations and difference.
 const coverage=Math.fround(Math.fround(a)*(1-Math.fround(b))),at=(y*width+x)*4;maxAlphaError=Math.max(maxAlphaError,Math.abs(p[at+3]-coverage));assert.ok(Math.abs(p[at+3]-coverage)<=eps,'Independent F64 Gaussian coverage difference');if(coverage===0)zero++;else covered++;if(a>.1&&b>.9)cut++;
 for(let c=0;c<3;c++){const expected=Math.fround(tint[c]*coverage),d=Math.abs(p[at+c]-expected),scaled=d/Math.max(1,Math.abs(expected));assert.ok(Number.isFinite(p[at+c])&&scaled<=eps,`Independent difference/fill ${x},${y}:${c}`);maxAbsError=Math.max(maxAbsError,d);maxScaledError=Math.max(maxScaledError,scaled);}
}
assert.ok(zero>0&&covered>0&&cut>0);
const result={ok:true,kind:'independent-f64-managed-subtract-matte-frame1-exr-oracle',file,width,height,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{frame:1,first:{center:[80,45],radius:28,coverage:Math.fround(.8)},cut:{center:[88,45],radius:22,coverage:1},gaussian:{sigma,radius,boundary:'clamp'},publication:'Float32 Feather A and B Surface Ports, Float32 A*(1-B) Surface Port, Float32 GPU Fill',tint},eps,maxAbsError,maxScaledError,maxAlphaError,zero,covered,cut,scope:'Fixed acceptance scene, not an all-domain proof or CPU effect fallback'};
await writeFile(join(dirname(file),'exr-subtract-matte-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
