// Original CPU/WASM geometry queries -> existing canonical outlines; no CPU pixels.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as graphics from '../../graphics-contracts/index.ts';
import * as cg from '../src/curve-geometry/index.ts';
import {directCurveGeometryFactory} from '../../../tests/helpers/pa3-curve-geometry.ts';
import {operations} from '../../../tests/helpers/pa3-pathops.ts';
import {ellipsePath,rectanglePath,prepareSolidPathStroke} from '../src/path-authoring/index.ts';
import {joinPathContours} from '../src/smart-path/index.ts';
import {createShapeModifiers} from '../src/shape-modifiers.ts';
import type {FrameContext} from '../../../src/core/types.ts';
import type {PathData} from '../../graphics-contracts/types.ts';
import {sourceCurve} from './curve-geometry-scene/cases.ts';
import {pointSource} from './curve-geometry-scene/animation.ts';
const directory=resolve('.frameweave/pa3-curve-geometry/preparation'),start=performance.now();await mkdir(directory,{recursive:true});const source=sourceCurve(),engine=await cg.createCurveGeometry(directCurveGeometryFactory,source),ops=await operations(),shape=createShapeModifiers(graphics),frames=[],trace=[];
const environment={width:640,height:400},pointPath=(position:readonly [number,number],radius:number)=>ellipsePath({center:position,radius:[radius,radius]},environment)!,small=(path:PathData,x:number,c:FrameContext)=>{const iterator=shape.repeatPath(path,{copies:1,offset:1,position:[x,270],scale:[.25,.25],anchor:[0,0]},c),p=iterator.next();if(p.done)throw Error('Actual transformed path required');return p.value.path;};
try{
 const closed={...source,commands:[...source.commands,{op:'Z' as const}]},areaEngine=await cg.createCurveGeometry(directCurveGeometryFactory,closed);let area:number;try{area=await cg.curveSignedArea(areaEngine);}finally{await areaEngine.dispose();}
 const bounds=await cg.curveBounds(engine),controls=await cg.curveControlBounds(engine),extrema=await cg.curveExtrema(engine,{segment:0}),inflections=await cg.curveInflections(engine,{segment:0}),monotone=await cg.curveMonotonePieces(engine,{segment:0}),inflectionPieces=await cg.curveInflectionPieces(engine,{segment:0}),parts=await cg.curveSplit(engine,[.2,.6],{segment:0}),portion=await cg.curvePortion(engine,[.15,.85],{segment:0}),flatten=[] as PathData[],quadratics=[] as PathData[];
 for await(const p of cg.curveFlatten(engine,{segment:0,tolerance:.03}))flatten.push(p);for await(const p of cg.curveQuadraticPieces(engine,{segment:0,tolerance:.03}))quadratics.push(p.path);
 const clipped=await cg.curveClipRect(engine,[170,30,470,250],{segment:0}),motion=cg.curveProjectionMotion(engine,pointSource,{parameterAccuracy:1e-12});
 for(let frame=0;frame<8;frame++){
  const c:FrameContext={frame,time:frame/24,globalFrame:frame,globalTime:frame/24,dt:1/24,fps:{num:24,den:1},durationInFrames:8,progress:frame/7,seed:37},p=await motion(c);if(!p.projection||!p.position)throw Error('Actual nondegenerate projection required');
  const normals=await cg.curveNormals(engine,[.1,.3,.5,.7,.9],20,{segment:0}),circles=await cg.curveOsculatingCircles(engine,[p.projection.parameter],{segment:0}),crossing=await cg.curveLineCrossings(engine,[p.source[0],0],[p.source[0],260]),tangents=await cg.curveTangentsFrom(engine,p.source,{segment:0}),jets=await cg.curveJets(engine,[p.projection.parameter],{segment:0}),nearby=await cg.nearestCurvePoints(engine,[p.source]),contact=await cg.curveContact(engine,p.source),paths=[source,...normals.flatMap(n=>n.path?[n.path]:[]),...cg.curveProjectionLeaders(engine,[p.projection]),pointPath(p.source,5),pointPath(p.position,8),...flatten.map(path=>small(path,20,c)),...quadratics.map(path=>small(path,220,c)),...clipped.map(piece=>small(piece.path,420,c))];
  if(bounds)paths.push(rectanglePath({center:[(bounds.left+bounds.right)/2,(bounds.top+bounds.bottom)/2],size:[bounds.right-bounds.left,bounds.bottom-bounds.top]},environment)!);
  const mesh=await prepareSolidPathStroke(joinPathContours(paths),{pathOperations:ops,width:1.8,tolerance:.03,gridSize:.00375});frames.push(mesh);trace.push({frame,source:p.source,projection:p.projection,tangent:p.tangent,bounds,controls,algebraicClosedArea:area!,extrema,inflections,parts:parts.map(p=>p.parameterRange),portion:portion.parameterRange,monotone:monotone.map(p=>p.parameterRange),inflectionPieces:inflectionPieces.map(p=>p.parameterRange),circles,crossing,tangents,jets,nearby,contact});
 }
 const code=`import type {PreparedStrokeMesh} from '../../src/stroke-animation/index.ts';
import type {GeometryNearest,GeometryPoint} from '../../src/curve-geometry/index.ts';
export const prepared:readonly PreparedStrokeMesh[]=${JSON.stringify(frames)};
export const trace=${JSON.stringify(trace)} as unknown as readonly ({source:GeometryPoint;projection:GeometryNearest}&Record<string,unknown>)[];
`;await writeFile('modules/pro-animation/validation/curve-geometry-scene/prepared.ts',code);await writeFile(join(directory,'result.json'),JSON.stringify({seconds:(performance.now()-start)/1000,sha256:createHash('sha256').update(code).digest('hex'),frames:frames.map((m,i)=>({frame:i,...m.preparation,diagnostics:m.diagnostics})),source,scope:'Original kurbo nearest/quintic/geometry queries + existing Core Signal motion -> actual canonical geometry; existing Clipper2/Earcut prepares eight finite native meshes. No GPU readback or fake geometry/model result.'},null,2));console.log(JSON.stringify({ok:true,seconds:(performance.now()-start)/1000,bytes:code.length,triangles:frames.map(m=>m.positions.length/9)}));
}finally{await ops.dispose();await engine.dispose();}
