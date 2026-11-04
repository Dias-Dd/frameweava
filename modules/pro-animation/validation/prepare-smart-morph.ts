// Explicit finite geometry preparation, original Rust/WASM only. No pixel renderer/time runner.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import type {FrameContext} from '../../../src/core/types.ts';
import {directSmartMorphFactory} from '../../../tests/helpers/pa3-smart-morph.ts';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
import {createSmartMorphEngine,prepareSmartMorph,interpolateSmartMorph,morphMatchCost,morphCrossings,morphMetrics,preparePathFillMesh,type PreparedPathFill} from '../src/smart-path/index.ts';
import {morphSources,placeLegacyPath} from './smart-morph-scene/cases.ts';
import {morphProgress} from './smart-morph-scene/animation.ts';
const start=performance.now(),engine=await createSmartMorphEngine(directSmartMorphFactory),ops=await operations(),directory=resolve('.frameweave/pa3-smart-morph/preparation');await mkdir(directory,{recursive:true});
try{
 const {ring,star,box,turned}=morphSources(),curved=await prepareSmartMorph(engine,ring,star,{contourMap:[0,1],firstVerticesMatch:false,quality:100,addVertices:{mode:'total',value:30}}),rigid=await prepareSmartMorph(engine,box,turned,{oneToOne:true,addVertices:null,bendingResistance:100}),legacy=placeLegacyPath(JSON.parse(await readFile('docs/pro-animation/path-authoring-validation/diagnostics/failure.json','utf8')).face),legacyMesh=await preparePathFillMesh([legacy],{pathOperations:ops,tolerance:.02,gridSize:.0025}),frames:PreparedPathFill[]=[],trace:object[]=[];
 for(let frame=0;frame<8;frame++){
  const c:FrameContext={frame,time:frame/24,globalFrame:frame,globalTime:frame/24,dt:1/24,fps:{num:24,den:1},durationInFrames:8,progress:frame/7,seed:37},a=await interpolateSmartMorph(engine,curved,morphProgress,c),b=await interpolateSmartMorph(engine,rigid,morphProgress,c),mesh=await preparePathFillMesh([a,b],{pathOperations:ops,tolerance:.02,gridSize:.0025});
  frames.push({...mesh,positions:mesh.positions.concat(legacyMesh.positions),parameters:mesh.parameters.concat(legacyMesh.parameters),diagnostics:mesh.diagnostics.concat(legacyMesh.diagnostics),preparation:{...mesh.preparation,faces:mesh.preparation.faces+legacyMesh.preparation.faces,triangles:mesh.preparation.triangles+legacyMesh.preparation.triangles,maxAreaDeviation:Math.max(mesh.preparation.maxAreaDeviation,legacyMesh.preparation.maxAreaDeviation)}});trace.push({frame,paths:[a,b],cost:await morphMatchCost(engine,curved),crossings:await morphCrossings(engine,curved),metrics:await morphMetrics(engine,b)});
 }
 const proof={algorithm:curved.algorithm,curveCorrespondence:curved.diagnostics,rigidCorrespondence:rigid.diagnostics,trace,legacyDiagnostics:legacyMesh.diagnostics},source=`import type {PreparedPathFill} from "../../src/smart-path/index.ts";
export const prepared:readonly PreparedPathFill[]=${JSON.stringify(frames)};
export const proof=${JSON.stringify(proof)};
`;
 await writeFile('modules/pro-animation/validation/smart-morph-scene/prepared.ts',source);await writeFile(join(directory,'result.json'),JSON.stringify({seconds:(performance.now()-start)/1000,sha256:createHash('sha256').update(source).digest('hex'),frames:frames.map((m,i)=>({frame:i,...m.preparation,diagnostics:m.diagnostics})),scope:'Eight finite precomputed integer-frame geometries from original Rust matching/interpolation and original Clipper2/Earcut. No automatic native-host WASM or temporal upstream sampling claim.'},null,2));console.log(JSON.stringify({ok:true,frames:frames.length,triangles:frames.map(m=>m.positions.length/9),seconds:(performance.now()-start)/1000}));
}finally{await ops.dispose();await engine.dispose();}
