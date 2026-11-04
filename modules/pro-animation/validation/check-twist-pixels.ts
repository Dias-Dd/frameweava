/** Independent sparse probes of already decoded real 32F EXR. No browser or rendering started. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import assert from 'node:assert/strict';
import {readExr} from '../../../src/media/ocio.ts';
import {pixelsFromSurface} from '../../../src/media/surface.ts';
const base=resolve('.frameweave/pa3-twist'),proof=JSON.parse(await readFile(join(base,'twist-media-proof.json'),'utf8')),dir=resolve(proof.dir),rel=relative(base,dir);assert.ok(!rel.startsWith('..')&&!isAbsolute(rel));
const decoded=await readExr(join(dir,'source-rgba32float.exr')),pixels=pixelsFromSurface(decoded.surface),g=proof.stats[5].geometry[2].lastGeometry;
// This fixture's known ring-band point (160,163), transformed with the independent polar formula.
const source=[160,163],dx=source[0]-g.center[0],dy=source[1]-g.center[1],r=Math.hypot(dx,dy),theta=Math.atan2(dy,dx)+g.angleDegrees*Math.PI/180*r/g.radius,ink={x:Math.round(g.center[0]+r*Math.cos(theta)),y:Math.round(g.center[1]+r*Math.sin(theta))};
const rows=[{id:'ring-hole',x:160,y:186,kind:'empty'},{id:'outside',x:5,y:5,kind:'empty'},{id:'transformed-ring-band',...ink,kind:'ink'}].map(q=>{const i=(q.y*decoded.surface.width+q.x)*4,rgba=Array.from(pixels.subarray(i,i+4));if(q.kind==='empty')assert.deepEqual(rgba,[0,0,0,0],q.id+' must retain transparent alpha');else assert.ok(rgba[0]<0&&rgba[1]>1&&rgba[2]>1&&rgba[3]>0&&rgba[3]<=1,'Signed linear HDR ink survives geometry deformation/GPU composition');return {...q,rgba};});
await writeFile(join(base,'pixel-reference.json'),JSON.stringify({file:join(dir,'source-rgba32float.exr'),sourceBandPoint:source,transformedProbe:ink,rows,emptyBudget:0,scope:'Sparse actual decoded EXR hole/background/ink reference, not full-image AE equivalence'},null,2));console.log(JSON.stringify({samples:rows.length,rows}));
