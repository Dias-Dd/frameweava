// Read-only reproduction of the retained rejected variable-ribbon face. Not a new geometry API.
import {readFile} from 'node:fs/promises';
import earcut,{deviation} from '../vendor/earcut/earcut.js';
let fixture;try{fixture=JSON.parse(await readFile('.frameweave/pa3-path-authoring/preparation/failure.json','utf8'));}catch{fixture=JSON.parse(await readFile('docs/pro-animation/path-authoring-validation/diagnostics/failure.json','utf8'));}
const data=[],holes=[];let count=0;for(const command of fixture.face.commands){if(command.op==='M'&&count++)holes.push(data.length/2);if(command.op!=='Z')data.push(command.point.x,command.point.y);}
const rows=[];for(const mode of ['raw','local','integer-grid']){let input=mode==='raw'?data:data.map((v,i)=>(v-data[i%2])/(mode==='integer-grid'?.0025:1));if(mode==='integer-grid')input=input.map(Math.round);const indices=earcut(input,holes,2);rows.push({mode,vertices:data.length/2,holes:holes.length,triangles:indices.length/3,deviation:deviation(input,holes,2,indices)});}
console.log(JSON.stringify({status:'known rejected input, not a successful production result',unchangedBudget:1e-10,case:{frame:fixture.frame,name:fixture.name},rows},null,2));
