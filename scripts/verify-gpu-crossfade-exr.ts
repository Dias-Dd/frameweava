/** Independent bounded-scene F64 reference. Not a production CPU effect. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide frame-1 EXR from managed-crossfade-project.tsx');
const {surface}=await readExr(file),width=160,height=90,eps=3e-6,p=pixelsFromSurface(surface),first=[6,Math.fround(.7),Math.fround(-.1)],second=[Math.fround(-.1),.5,8],offset=[-.125,.0625,-.25];
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
let maxAbsError=0,maxScaledError=0,maxAlphaError=0,zero=0,overlap=0,firstOnly=0,secondOnly=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const a=(x-64)**2+(y-45)**2<24**2?.5:0,b=(x-96)**2+(y-45)**2<24**2?.25:0,coverage=Math.fround(a*.5+b*.5),at=(y*width+x)*4;
 assert.equal(p[at+3],coverage,'Independent RGBA interpolation coverage');maxAlphaError=Math.max(maxAlphaError,Math.abs(p[at+3]-coverage));if(!a&&!b)zero++;else if(a&&b)overlap++;else if(a)firstOnly++;else secondOnly++;
 for(let c=0;c<3;c++){const left=Math.fround(first[c]*a),right=Math.fround(second[c]*b),mixed=Math.fround(left*.5+right*.5),expected=Math.fround(mixed+offset[c]*coverage),d=Math.abs(p[at+c]-expected),scaled=d/Math.max(1,Math.abs(expected));assert.ok(Number.isFinite(p[at+c])&&scaled<=eps,`Independent Fill/Crossfade/Offset ${x},${y}:${c}`);maxAbsError=Math.max(maxAbsError,d);maxScaledError=Math.max(maxScaledError,scaled);}
}
assert.ok(zero>0&&overlap>0&&firstOnly>0&&secondOnly>0);
const result={ok:true,kind:'independent-f64-managed-crossfade-frame1-exr-oracle',file,width,height,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{frame:1,mix:.5,first:{center:[64,45],radius:24,alpha:.5,color:first},second:{center:[96,45],radius:24,alpha:.25,color:second},offset,publication:'Float32 GPU Fill Surface Ports, Float32 linear PM RGBA Crossfade, then Float32 native PM Offset'},eps,maxAbsError,maxScaledError,maxAlphaError,zero,overlap,firstOnly,secondOnly,scope:'Fixed acceptance scene; not an all-domain proof or CPU renderer fallback'};
await writeFile(join(dirname(file),'exr-crossfade-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
