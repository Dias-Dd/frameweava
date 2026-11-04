/** Diagnostic over retained data only; no new renderer or GPU execution. */
import {readFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';
import {neighborhood,type Image} from './reference.ts';
const out=resolve(process.env.FRAMEWEAVE_SPHERICAL_RUN!),record=JSON.parse(await readFile('docs/native-spherical-evidence/24-single/debug-100.json','utf8'));
const image:Image={...record.image,data:record.source,projection:'equirectangular'},rows=[];
for(const radiusDegrees of [[15,10],[18,12],[2,2]])for(const kernelSize of [1,3,5])for(const noiseLevel of [.05,.1,.2,.3,.5,1]){
 const expected=neighborhood(image,{radiusDegrees,kernelSize,noiseLevel},'random');let maximum=0,sum=0,worst=0;for(let i=0;i<expected.length;i++){const error=Math.abs(expected[i]-record.actual[i]);sum+=error;if(error>maximum){maximum=error;worst=i;}}rows.push({radiusDegrees,kernelSize,noiseLevel,maximum,sum,worst,expected:expected[worst],actual:record.actual[worst]});
}
rows.sort((a,b)=>a.sum-b.sum);await writeFile(join(out,'result.json'),JSON.stringify({best:rows.slice(0,10)},null,2)+'\n');console.log(JSON.stringify(rows.slice(0,3)));
