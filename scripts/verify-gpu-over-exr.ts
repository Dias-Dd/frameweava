/** Independent bounded-scene F64 reference for the exported frame-1 EXR.
 * Does not import the effect, its range preflight or its binary L1 oracle. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide frame-1 result.exr from managed-over-project.tsx');
const {surface}=await readExr(file),width=160,height=90,eps=3e-6,p=pixelsFromSurface(surface),opacity=.25+(.9-.25)*.5;
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
let maxAbsError=0,maxScaledError=0,covered=0,backgroundOnly=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const a=(x-64)**2+(y-45)**2<22**2?.75:0,front=[Math.fround(4*a),Math.fround(Math.fround(.3)*a),Math.fround(Math.fround(-.1)*a)],back=[Math.fround(-.1),Math.fround(.3+.001*y),1.5],at=(y*width+x)*4;
 assert.equal(p[at+3],1,'Opaque background keeps output coverage one');if(a)covered++;else backgroundOnly++;
 for(let c=0;c<3;c++){const expected=front[c]*opacity+back[c]*(1-a*opacity),d=Math.abs(p[at+c]-expected),scaled=d/Math.max(1,Math.abs(expected));assert.ok(Number.isFinite(p[at+c])&&scaled<=eps,`Independent F64 over ${x},${y}:${c}`);maxAbsError=Math.max(maxAbsError,d);maxScaledError=Math.max(maxScaledError,scaled);}
}
assert.ok(covered>0&&backgroundOnly>0);
const result={ok:true,kind:'independent-f64-managed-over-frame1-exr-oracle',file,width,height,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{frame:1,opacity,foreground:{center:[64,45],radius:22,alpha:.75,gpuFillColor:[4,.3,-.1]},background:'scene-linear HDR blue gradient, negative R, Alpha1'},eps,maxAbsError,maxScaledError,covered,backgroundOnly,scope:'Fixed acceptance scene; not a resolution limit, an all-domain proof or a CPU effect fallback'};
await writeFile(join(dirname(file),'exr-over-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
