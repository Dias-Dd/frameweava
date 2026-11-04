import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {canonicalFilledFaces,filledContourAreas} from '../modules/pro-animation/src/filled-faces.ts';
import {operations} from './helpers/pa3-pathops.ts';
import earcut,{deviation} from '../modules/pro-animation/vendor/earcut/earcut.js';
import {hitTestStrokeMesh,prepareStrokeMesh,constantStrokeWidth,sampleStrokePath} from '../modules/pro-animation/src/stroke-animation/index.ts';
import {createCurveSampler} from '../modules/pro-animation/src/curve-sampler.ts';
import {directCurveFactory} from './helpers/pa3-curve.ts';
import * as graphics from '../modules/graphics-contracts/index.ts';
import type {PathData} from '../modules/graphics-contracts/types.ts';
import {areaPath} from '../modules/pro-animation/src/path-authoring/index.ts';
const fixture=JSON.parse(await readFile('docs/pro-animation/path-authoring-validation/diagnostics/failure.json','utf8')).face as PathData;
const rows=(face:PathData)=>{const result:{x:number;y:number}[][]=[];for(const c of face.commands){if(c.op==='M')result.push([]);if(c.op!=='Z')result.at(-1)!.push(c.point);}return result;};
function tessellate(face:PathData){const data:number[]=[],holes:number[]=[];for(const [i,ring]of rows(face).entries()){if(i)holes.push(data.length/2);for(const p of ring)data.push(p.x,p.y);}const local=data.map((v,i)=>v-data[i%2]),indices=earcut(local,holes,2),positions=indices.flatMap(i=>[data[i*2],data[i*2+1],.5]);return {deviation:deviation(local,holes,2,indices),positions};}
test('frozen rejected face retains old failure, then existing same-grid NonZero solver returns correct winding/unchanged area guard',async()=>{
 assert.ok(tessellate(fixture).deviation>1e-10);const ops=await operations(),diagnostics:unknown[]=[],faces:PathData[]=[];let ended=false;
 try{const source=(async function*(){try{yield fixture;}finally{ended=true;}})(),borrowed={booleanPathsStream:(...args:Parameters<typeof ops.booleanPathsStream>)=>{assert.equal(ended,true,'No recursive solve on a busy source client');return ops.booleanPathsStream(...args);}};
 for await(const face of canonicalFilledFaces(source,borrowed,{gridSize:.0025,tolerance:.02,onDiagnostic:d=>diagnostics.push(d)}))faces.push(face);
 assert.equal(faces.length,1);assert.equal(diagnostics.length,1);assert.deepEqual(filledContourAreas(faces[0]).map(Math.sign),[1,-1]);const mesh=tessellate(faces[0]);assert.ok(mesh.deviation<=1e-10);
 const ring=rows(fixture),segments=ring.flatMap(r=>r.map((p,i)=>[p,r[(i+1)%r.length]] as const)),winding=(x:number,y:number)=>{let count=0;for(const [a,b]of segments){const q=(b.x-a.x)*(y-a.y)-(b.y-a.y)*(x-a.x);if(a.y<=y&&y<b.y&&q>0)count++;if(b.y<=y&&y<a.y&&q<0)count--;}return count!==0;},distance=(x:number,y:number)=>{let best=Infinity;for(const [a,b]of segments){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy)));best=Math.min(best,Math.hypot(x-a.x-t*dx,y-a.y-t*dy));}return best;};let checked=0,nearGridBoundary=0;
 for(let y=0;y<64;y++)for(let x=0;x<128;x++){const p:[number,number]=[-43+(x+.5)*86/128,-22+(y+.5)*46/64];if(distance(...p)<=.005){nearGridBoundary++;continue;}assert.equal(hitTestStrokeMesh(mesh,p),winding(...p),JSON.stringify(p));checked++;}
 await mkdir('.frameweave/pa3-smart-morph/fill',{recursive:true});await writeFile('.frameweave/pa3-smart-morph/fill/result.json',JSON.stringify({checked,nearGridBoundary,semanticOracle:'Independent raw source NonZero winding versus actual output triangle inclusion, excluding explicit2grid near-boundary ambiguity; not an unquantized topology/Hausdorff certificate',gridSize:.0025,sourceAreas:filledContourAreas(fixture),outputAreas:filledContourAreas(faces[0]),deviation:mesh.deviation,unchangedBudget:1e-10,diagnostics},null,2));
 }finally{await ops.dispose();}
});
test('ordinary simple returned faces pass through byte/object identity; cancellation and missing normalizer are explicit',async()=>{
 const ops=await operations();let normal:PathData|undefined;try{for await(const f of ops.booleanPathsStream([fixture],{operation:'union',gridSize:.0025,tolerance:.02})){normal=f;break;}}finally{await ops.dispose();}assert.ok(normal);const output=[];for await(const f of canonicalFilledFaces((async function*(){yield normal!;})(),undefined,{}))output.push(f);assert.equal(output[0],normal);
 await assert.rejects(async()=>{for await(const _ of canonicalFilledFaces((async function*(){yield fixture;})(),undefined,{}))void _;},{code:'E_PA_FILL_NORMALIZER'});
 await assert.rejects(async()=>{for await(const _ of canonicalFilledFaces((async function*(){yield normal!;})(),undefined,{signal:AbortSignal.abort()}))void _;},{code:'E_RENDER_CANCELLED'});
});
test('current regenerated areaPath -> original kurbo ribbon -> canonical mesh succeeds; exact legacy intermediate is tested separately',async()=>{
 const c={frame:0,time:0,globalFrame:0,globalTime:0,dt:1/24,fps:{num:24,den:1},durationInFrames:8,progress:0,seed:37},path=areaPath({points:[[-40,20,-10],[-20,20,-24],[0,20,-8],[20,20,-18],[40,20,-10]],curve:'basis'},{width:640,height:480})!,curve=await createCurveSampler(graphics,directCurveFactory,path),ops=await operations();try{const line=await sampleStrokePath(curve,{spacing:1}),mesh=await prepareStrokeMesh(line,constantStrokeWidth(2.8),{pathOperations:ops,context:c,roundTolerance:.02,gridSize:.0025});assert.ok(mesh.positions.length);assert.ok(mesh.preparation.maxAreaDeviation<=1e-10);assert.ok(mesh.diagnostics.every(d=>['W_PA_PATHOPS_GRID_COLLAPSE','W_PA_FILL_RENORMALIZED'].includes((d as {code:string}).code)));await writeFile('.frameweave/pa3-smart-morph/fill/regenerated.json',JSON.stringify({scope:'Current regenerated recipe, not byte-identical to retained older intermediate',preparation:mesh.preparation,diagnostics:mesh.diagnostics},null,2));}finally{await ops.dispose();await curve.dispose();}
});
