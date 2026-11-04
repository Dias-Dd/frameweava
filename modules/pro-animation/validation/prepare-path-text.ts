// Explicit finite original shaping + kurbo sample preparation, no pixel processing.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as graphics from '../../graphics-contracts/index.ts';
import {pathTextServices} from '../../../tests/helpers/pa3-path-text.ts';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
import {directCurveFactory} from '../../../tests/helpers/pa3-curve.ts';
import {createCurveSampler} from '../src/curve-sampler.ts';
import {prepareParagraphMeshes} from '../src/text-layout/native.ts';
import {preparePathTextLine,layoutPathText} from '../src/path-text/index.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import {pathTextBaselines} from './path-text-scene/cases.ts';
import {pathOffset,pathDistanceControls} from './path-text-scene/animation.ts';
const directory=resolve('.frameweave/pa3-path-text/preparation'),start=performance.now();await mkdir(directory,{recursive:true});const services=await pathTextServices(),ops=await operations(),curve=await createCurveSampler(graphics,directCurveFactory,pathTextBaselines());
try{
 const mesh=await prepareParagraphMeshes(services.index,{pathOperations:ops}),lines=services.source.lines.map(line=>preparePathTextLine(services.index,{lineId:line.id})),frames=[];
 for(let frame=0;frame<8;frame++){
  const c:FrameContext={frame,time:frame/24,globalFrame:frame,globalTime:frame/24,dt:1/24,fps:{num:24,den:1},durationInFrames:8,progress:frame/7,seed:37},bases=[];
  for(let i=0;i<lines.length;i++){const f=await layoutPathText(lines[i],curve,{contour:i,offset:pathOffset,control:pathDistanceControls},c);bases.push({diagnostics:f.diagnostics,placements:f.placements.map(p=>{const {unit,...rest}=p;return {...rest,unitIndex:unit.index,pathRank:unit.pathRank,logicalRank:unit.logicalRank,pathCount:unit.pathCount,centerX:unit.centerX,baseline:unit.baseline};})});}frames.push(bases);
 }
 const data={mesh,frames},code=`// Real original HarfRust/Skrifa/Unicode16/kurbo/Clipper2/Earcut; explicit eight-frame sample data.
import type {PreparedParagraphMeshes} from '../../src/text-layout/native.ts';
import type {PathTextFrame,PathTextPlacement} from '../../src/path-text/index.ts';
import type {Diagnostic} from '../../../../src/core/types.ts';
type SerializedPlacement=Omit<PathTextPlacement,'unit'>&{unitIndex:number;pathRank:number;logicalRank:number;pathCount:number;centerX:number;baseline:number};
const data=${JSON.stringify(data)} as unknown as {mesh:PreparedParagraphMeshes;frames:{diagnostics:Diagnostic[];placements:SerializedPlacement[]}[][]};
export const prepared={mesh:data.mesh,frames:data.frames.map(bases=>bases.map(f=>({index:data.mesh.index,diagnostics:f.diagnostics,placements:f.placements.map(p=>{const {unitIndex,pathRank,logicalRank,pathCount,centerX,baseline,...rest}=p;return {...rest,unit:{...data.mesh.index.clusters[unitIndex],pathRank,logicalRank,pathCount,centerX,baseline}};})} satisfies PathTextFrame)))};
`;
 await writeFile('modules/pro-animation/validation/path-text-scene/prepared.ts',code);await writeFile(join(directory,'result.json'),JSON.stringify({seconds:(performance.now()-start)/1000,sha256:createHash('sha256').update(code).digest('hex'),source:services.source.layout.text,fonts:services.source.fontInstances,fallback:services.fallback,curveMetrics:curve.metrics,metrics:{glyphs:mesh.layout.glyphs.length,clusters:mesh.index.clusters.length,lines:lines.length,frames:frames.length,triangles:mesh.preparation.triangles,preparation:mesh.preparation},scope:'Real font shaping/fallback and original kurbo explicit distance samples with tracking/spaces precomputed for8 integer frames; compact data retains one canonical paragraph/index. Live Native pose controls never approximate resampling.'},null,2));console.log(JSON.stringify({ok:true,bytes:code.length,seconds:(performance.now()-start)/1000,frames:frames.length,clusters:mesh.index.clusters.length}));
}finally{const cleanup={curve:await curve.dispose(),paths:await ops.dispose(),...await services.dispose()};await writeFile(join(directory,'cleanup.json'),JSON.stringify(cleanup,null,2));}
