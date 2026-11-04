/** Independent scene/F64 EXR oracle; not an effect implementation or fallback. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide frame-1 result.exr from managed-offset-rgb-project.tsx');
const {surface}=await readExr(file),width=160,height=90,eps=3e-6,p=pixelsFromSurface(surface),radius=4,sigma=1.25;
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
const weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*sigma*sigma))),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum;
let maxAbsError=0,maxScaledError=0,maxAlphaError=0,covered=0,empty=0,partial=0,revealed=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 let a=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy));if((xx-96)**2+(yy-45)**2<22**2)a+=.75*weights[dy+radius]*weights[dx+radius];}
 const at=(y*width+x)*4,source=[Math.fround(4+.01*x),Math.fround(.4+.002*y),Math.fround(-.1-.001*x)],first=[.25,.25,.5],last=[.5,-.125,-.5];
 maxAlphaError=Math.max(maxAlphaError,Math.abs(p[at+3]-a));assert.ok(Math.abs(p[at+3]-a)<=eps,'Independent Gaussian mask coverage');if(a===0)empty++;else{covered++;if(a<.75-1e-12)partial++;if(x>=80)revealed++;}
 for(let c=0;c<3;c++){const shifted=Math.fround(source[c]+first[c]),matte=Math.fround(shifted*a),expected=Math.fround(matte+last[c]*a),d=Math.abs(p[at+c]-expected),scaled=d/Math.max(1,Math.abs(expected));assert.ok(Number.isFinite(p[at+c])&&scaled<=eps,`Independent offset/matte chain ${x},${y}:${c}`);maxAbsError=Math.max(maxAbsError,d);maxScaledError=Math.max(maxScaledError,scaled);}
}
assert.ok(covered>0&&empty>0&&partial>0&&revealed>0);
const result={ok:true,kind:'independent-f64-managed-offset-rgb-frame1-exr-oracle',file,width,height,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{frame:1,firstOffset:[.25,.25,.5],lastOffset:[.5,-.125,-.5],mask:{center:[96,45],radius:22,coverage:.75,sigma,kernelRadius:radius,boundary:'clamp'},publication:'Float32 straight RGB offset, replacement PM Surface Port, then Float32 native PM RGB offset; independent F64 Gaussian coverage'},eps,maxAbsError,maxScaledError,maxAlphaError,covered,empty,partial,revealed,scope:'Fixed acceptance scene, not an all-domain proof or CPU effect fallback'};
await writeFile(join(dirname(file),'exr-offset-rgb-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
