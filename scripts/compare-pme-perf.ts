import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const [reference,candidate,output]=process.argv.slice(2);
if(!reference||!candidate||!output)throw Error('Usage: compare-pme-perf.ts reference-directory candidate-directory output.json');
const rows=[];
for(const width of [1920,3840])for(const frame of [0,1]){
 const name=`reference-${width}-${frame}.f32`,a=await readFile(join(reference,name)),b=await readFile(join(candidate,name));assert.equal(a.length,b.length);
 const av=new Float32Array(a.buffer,a.byteOffset,a.length/4),bv=new Float32Array(b.buffer,b.byteOffset,b.length/4);let maxAbsolute=0,maxRelative=0,alphaError=0,min=Infinity,max=-Infinity,different=0;
 for(let i=0;i<av.length;i++){assert.ok(Number.isFinite(av[i])&&Number.isFinite(bv[i]));const e=Math.abs(av[i]-bv[i]);maxAbsolute=Math.max(maxAbsolute,e);maxRelative=Math.max(maxRelative,e/Math.max(1,Math.abs(av[i])));if(e)different++;if(i%4===3)alphaError=Math.max(alphaError,e);else{min=Math.min(min,bv[i]);max=Math.max(max,bv[i]);}}
 rows.push({name,bytes:a.length,referenceSha256:createHash('sha256').update(a).digest('hex'),candidateSha256:createHash('sha256').update(b).digest('hex'),maxAbsolute,maxRelative,alphaError,different,minRgb:min,maxRgb:max});
 assert.equal(maxAbsolute,0,`${name} differs from CPU reference`);assert.equal(alphaError,0);
}
await writeFile(output,JSON.stringify({version:1,reference,candidate,rows,ok:true},null,2));console.log(JSON.stringify({ok:true,output,rows}));
