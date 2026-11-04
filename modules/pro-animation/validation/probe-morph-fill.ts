import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
import earcut,{deviation} from '../vendor/earcut/earcut.js';
const start=performance.now(),fixture=JSON.parse(await readFile('docs/pro-animation/path-authoring-validation/diagnostics/failure.json','utf8')),ops=await operations(),rows=[];
try{for await(const face of ops.booleanPathsStream([fixture.face],{operation:'union',tolerance:.02,gridSize:.0025})){
 const data=[],holes=[],areas=[];let ring=[],count=0;for(const c of face.commands){if(c.op==='M'){if(count++)holes.push(data.length/2);ring=[];}if(c.op!=='Z'){data.push(c.point.x,c.point.y);ring.push([c.point.x,c.point.y]);}else{const [x,y]=ring[0];let a=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];a+=(p[0]-x)*(q[1]-y)-(q[0]-x)*(p[1]-y);}areas.push(a/2);}}
 const local=data.map((v,i)=>v-data[i%2]),triangles=earcut(local,holes,2);rows.push({contours:count,vertices:data.length/2,triangles:triangles.length/3,areas,deviation:deviation(local,holes,2,triangles),face});
}}finally{await ops.dispose();}
const out='.frameweave/pa3-smart-morph/diagnostics';await mkdir(out,{recursive:true});const proof={seconds:(performance.now()-start)/1000,rows};await writeFile(out+'/canonicalization.json',JSON.stringify(proof,null,2));console.log(JSON.stringify({...proof,rows:rows.map(({face,...row})=>row)}));
