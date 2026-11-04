import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import * as graphics from '../../graphics-contracts/index.ts';
import {createCurveSampler} from '../src/curve-sampler.ts';
import {sampleStrokePath,prepareStrokeMesh,constantStrokeWidth,taperStrokeWidth,waveStrokeWidth,noiseStrokeWidth,knotStrokeWidth,strokeMeshBounds,type PreparedStrokeMesh} from '../src/stroke-animation/index.ts';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
import {directCurveFactory,curvePath} from '../../../tests/helpers/pa3-curve.ts';
import type {FrameContext} from '../../../src/core/types.ts';
const context:FrameContext={frame:0,time:0,globalFrame:0,globalTime:0,dt:1/24,fps:{num:24,den:1},durationInFrames:48,progress:0,seed:37};
const specs=[
 {name:'tapered-wave',path:curvePath([['M',55,95],['C',170,-5,245,190,355,80],['C',405,25,470,45,540,100]],600,360),width:taperStrokeWidth(waveStrokeWidth(constantStrokeWidth(20),{amplitude:.5,cycles:3}),{start:.12,end:.18})},
 {name:'closed-variable-ring',path:curvePath([['M',300,140],['C',400,140,400,240,300,240],['C',200,240,200,140,300,140],['Z']],600,360),width:waveStrokeWidth(constantStrokeWidth(15),{amplitude:.6,cycles:4})},
 {name:'pressure-ribbon',path:curvePath([['M',55,290],['C',170,210,230,355,320,285],['C',410,220,450,350,540,275]],600,360),width:noiseStrokeWidth(knotStrokeWidth([{at:0,width:4},{at:.25,width:25},{at:.5,width:10},{at:.75,width:28},{at:1,width:5}]),{seed:37,amplitude:.2,frequency:6})},
];
const started=performance.now(),ops=await operations(),prepared:{name:string;mesh:PreparedStrokeMesh}[]=[],records:object[]=[];
try{for(const spec of specs){const t=performance.now(),curve=await createCurveSampler(graphics,directCurveFactory,spec.path,{accuracy:1e-6});try{const sampled=await sampleStrokePath(curve,{spacing:2}),mesh=await prepareStrokeMesh(sampled,spec.width,{pathOperations:ops,context,roundTolerance:.02,gridSize:.0025});prepared.push({name:spec.name,mesh});records.push({name:spec.name,length:sampled.length,bounds:strokeMeshBounds(mesh),...mesh.preparation,seconds:(performance.now()-t)/1000});}finally{assert.equal((await curve.dispose()).remainingSessions,0);}}}finally{assert.equal((await ops.dispose()).remainingSessions,0);}
const scene=resolve('modules/pro-animation/validation/native-stroke-scene');await mkdir(scene,{recursive:true});await writeFile(join(scene,'prepared.ts'),'// Actual kurbo/Clipper2/Earcut preparation; regenerate with validation/prepare-native-stroke.ts.\nimport type {PreparedStrokeMesh} from "../../src/stroke-animation/index.ts";\nexport const prepared:readonly {name:string;mesh:PreparedStrokeMesh}[]='+JSON.stringify(prepared)+';\n');const out=resolve('.frameweave/pa3-native-stroke/preparation');await mkdir(out,{recursive:true});await writeFile(join(out,'result.json'),JSON.stringify({version:1,seconds:(performance.now()-started)/1000,records,source:'Existing verified private kurbo/Clipper2 Kit fixtures. Not public installed capabilities.'},null,2));console.log(JSON.stringify({ok:true,records}));
