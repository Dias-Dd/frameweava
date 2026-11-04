/** Independent frame-1 numerical reference for the exported EXR, not a runtime
 * effect or a substitute for actual GPU dispatch/Stage/encoding acceptance. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {readExr} from '../src/media/ocio.ts';
import {pixelsFromSurface} from '../src/media/surface.ts';
const file=process.argv[2];if(!file)throw Error('Provide frame-1 result.exr from managed-modulate-project.tsx');
const {surface}=await readExr(file),width=160,height=90,eps=3e-6,p=pixelsFromSurface(surface);
assert.equal(surface.width,width);assert.equal(surface.height,height);assert.equal(surface.format,'rgba32float');assert.equal(surface.alpha,'premultiplied');
let maxScaledError=0,maxAbsError=0,negativeInputToPositive=0,transparent=0,partial=0;
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 const a=x>=16&&x<144&&y>=10&&y<80?.5:0,source=[Math.fround((4+.01*x)*a),Math.fround((1.25+.002*y)*a),Math.fround((-.1-.001*x)*a)],gain=[Math.fround(.05+1.2*x/159),Math.fround(-.1+.8*y/89),-4],at=(y*width+x)*4;
 assert.ok(Object.is(p[at+3],a),'Image coverage survives independent map with zero Alpha');if(a===0)transparent++;else partial++;
 for(let c=0;c<3;c++){const expected=source[c]*gain[c],d=Math.abs(p[at+c]-expected),scaled=d/Math.max(1,Math.abs(expected));assert.ok(Number.isFinite(p[at+c])&&scaled<=eps,`Independent F64 spatial gain ${x},${y}:${c} ${p[at+c]} vs ${expected}`);maxAbsError=Math.max(maxAbsError,d);maxScaledError=Math.max(maxScaledError,scaled);}
 if(source[2]<0&&p[at+2]>0)negativeInputToPositive++;
}
assert.ok(transparent>0&&partial>0&&negativeInputToPositive===partial);
const result={ok:true,kind:'independent-f64-managed-modulate-frame1-exr-oracle',file,width,height,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),reference:{frame:1,source:'scene-linear gradient, PM Alpha .5 inside fixed rectangle, zero outside',gain:'raw independent per-channel spatial gains; map Alpha zero; exposure frame1 gain=1'},eps,maxScaledError,maxAbsError,transparent,partial,negativeInputToPositive,scope:'Fixed acceptance scene, not an effect resolution limit or CPU fallback'};
await writeFile(join(dirname(file),'exr-modulate-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
