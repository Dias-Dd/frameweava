/** Read the already produced real EXR; no browser/Renderer/re-inference is started. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,join} from 'node:path';
import assert from 'node:assert/strict';
import {readExr} from '../../../src/media/ocio.ts';
import {pixelsFromSurface} from '../../../src/media/surface.ts';
const base=resolve('.frameweave/pa3-zigzag'),proof=JSON.parse(await readFile(join(base,'zigzag-media-proof.json'),'utf8')),dir=resolve(proof.dir),rel=relative(base,dir);
assert.ok(!rel.startsWith('..')&&!isAbsolute(rel));const decoded=await readExr(join(dir,'source-rgba32float.exr')),pixels=pixelsFromSurface(decoded.surface);
const rows=[{id:'corner-hole',x:160,y:171,kind:'empty'},{id:'smooth-hole',x:480,y:171,kind:'empty'},{id:'outside',x:5,y:5,kind:'empty'},{id:'corner-band',x:160,y:145,kind:'ink'},{id:'smooth-band',x:480,y:145,kind:'ink'}].map(q=>{const i=(q.y*decoded.surface.width+q.x)*4,rgba=Array.from(pixels.subarray(i,i+4));if(q.kind==='empty')assert.deepEqual(rgba,[0,0,0,0],q.id+' must preserve real hole/background alpha');else assert.ok(rgba[0]<0&&rgba[1]>1&&rgba[2]>1&&rgba[3]>0&&rgba[3]<=1,q.id+' signed linear HDR ink');return {...q,rgba};});
await writeFile(join(base,'pixel-reference.json'),JSON.stringify({file:join(dir,'source-rgba32float.exr'),rows,emptyBudget:0,scope:'Actual decoded professional EXR, explicit sparse hole/ink probes. Not whole-image AE equivalence or arbitrary topology proof.'},null,2));console.log(JSON.stringify({samples:rows.length,rows}));
