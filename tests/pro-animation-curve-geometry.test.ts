import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as cg from '../modules/pro-animation/src/curve-geometry/index.ts';
import {directCurveGeometryFactory} from './helpers/pa3-curve-geometry.ts';
import {curvePath,directCurveFactory} from './helpers/pa3-curve.ts';
import {createCurveSampler} from '../modules/pro-animation/src/curve-sampler.ts';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {cubicPoint,type Cubic} from '../modules/pro-animation/src/geometry.ts';
import type {PathData} from '../modules/graphics-contracts/types.ts';
import type {FrameContext} from '../src/core/types.ts';
const near=(a:number,b:number,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,JSON.stringify({a,b,e})),arch:Cubic=[[0,0],[0,100],[100,100],[100,0]],a=()=>curvePath([['M',...arch[0]],['C',...arch[1],...arch[2],...arch[3]]],640,240);
async function owned(path:PathData,work:(g:cg.CurveGeometry)=>Promise<void>){const g=await cg.createCurveGeometry(directCurveGeometryFactory,path);try{await work(g);}finally{assert.deepEqual(await g.dispose(),{mode:'cooperative',remainingSessions:0});}}
function cubic(path:PathData):Cubic{const m=path.commands[0],c=path.commands[1];assert.ok(m.op==='M'&&c.op==='C');return [[m.point.x,m.point.y],[c.control1.x,c.control1.y],[c.control2.x,c.control2.y],[c.point.x,c.point.y]];}
const context=(frame:number):FrameContext=>({frame,time:frame/24,globalFrame:frame,globalTime:frame/24,dt:1/24,fps:{num:24,den:1},durationInFrames:8,progress:frame/7,seed:37});
test('original tight bounds/control hull and closed algebraic area are distinct numerical capabilities',async()=>{
 await owned(curvePath([['M',0,0],['Q',2,4,4,0]],640,240),async g=>{assert.deepEqual(await cg.curveBounds(g),{left:0,top:0,right:4,bottom:2});assert.deepEqual(await cg.curveControlBounds(g),{left:0,top:0,right:4,bottom:4});await assert.rejects(cg.curveSignedArea(g),{code:'E_PA_GEOMETRY_OPEN'});});
 await owned(curvePath([['M',0,0],['L',4,0],['L',4,3],['L',0,3],['Z']],640,240),async g=>{near(await cg.curveSignedArea(g),12);assert.deepEqual(await cg.curveWindingAt(g,[[2,1],[8,1],[2,1]]),[1,0,1]);assert.equal((await cg.curveContact(g,[2,1])).inside,true);assert.equal((await cg.curveContact(g,[4,1])).status,'boundary');});
});
test('original nearest solver retains query order/duplicates and agrees with analytical line projection',async()=>owned(curvePath([['M',20,30],['L',120,30]],640,240),async g=>{
 const points=Array.from({length:1025},(_,i)=>[45+i%2,50] as const),out=await cg.nearestCurvePoints(g,points);assert.equal(out.length,1025);for(let i=0;i<out.length;i++){const p=out[i]!;near(p.parameter,(points[i][0]-20)/100);near(p.point[0],points[i][0]);near(p.point[1],30);near(p.distance,20);near(p.arcDistance,points[i][0]-20);}assert.deepEqual(out[0],out[1024]);
}));
test('cubic quintic nearest result is no worse than dense independent samples, with actual derivative stationarity',async()=>owned(a(),async g=>{
 const [n]=await cg.nearestCurvePoints(g,[[50,95]],{parameterAccuracy:1e-12});assert.ok(n);near(n.parameter,.5,1e-10);near(n.point[0],50);near(n.point[1],75);near(n.distance,20);let dense=Infinity;for(let i=0;i<=10000;i++){const p=cubicPoint(arch,i/10000);dense=Math.min(dense,Math.hypot(p[0]-50,p[1]-95));}assert.ok(n.distance<=dense+1e-8);const [j]=await cg.curveJets(g,[n.parameter],{segment:0});near((n.point[0]-50)*j.derivative[0]+(n.point[1]-95)*j.derivative[1],0);await assert.rejects(cg.nearestCurvePoints(g,[[0,0]],{parameterAccuracy:2}),{code:'E_PA_CURVE_GEOMETRY'});
}));
test('original derivative/curvature convention yields analytical normal and osculating circle, stationary is explicit',async()=>owned(curvePath([['M',0,0],['Q',1,1,2,0]],640,240),async g=>{
 const [j]=await cg.curveJets(g,[.5],{segment:0});assert.deepEqual(j.derivative,[2,0]);assert.deepEqual(j.secondDerivative,[0,-4]);near(j.curvature!,-1);const [circle]=await cg.curveOsculatingCircles(g,[.5],{segment:0});assert.equal(circle.status,'resolved');near(circle.radius!,1);near(circle.center![0],1);near(circle.center![1],-.5);const [normal]=await cg.curveNormals(g,[.5],3,{segment:0});assert.equal(normal.status,'resolved');const end=normal.path!.commands[1];assert.ok(end.op==='L');near(end.point.x,1);near(end.point.y,3.5);
}));
test('original extrema/inflection splitting retains exact cubic subsegments and monotone parameter intervals',async()=>owned(curvePath([['M',0,0],['C',0,1,1,-1,1,0]],640,240),async g=>{
 const extrema=await cg.curveExtrema(g,{segment:0}),inflections=await cg.curveInflections(g,{segment:0});assert.equal(extrema.length,2);assert.equal(inflections.length,1);near(inflections[0].parameter,.5);assert.equal((await cg.curveMonotonePieces(g,{segment:0})).length,3);assert.equal((await cg.curveInflectionPieces(g,{segment:0})).length,2);
}));
test('exact portions/splits preserve independent Bernstein geometry including reversed ranges',async()=>owned(a(),async g=>{
 for(const range of [[.2,.8],[.8,.2]] as const){const p=await cg.curvePortion(g,range,{segment:0}),c=cubic(p.path);for(let i=0;i<=32;i++){const actual=cubicPoint(c,i/32),expected=cubicPoint(arch,range[0]+(range[1]-range[0])*i/32);near(actual[0],expected[0]);near(actual[1],expected[1]);}}
 const parts=await cg.curveSplit(g,[.2,.6],{segment:0});assert.equal(parts.length,3);await assert.rejects(cg.curveSplit(g,[.6,.2],{segment:0}),{code:'E_PA_CURVE_GEOMETRY'});
}));
test('original isolated line roots and external tangents have explicit coincidence limitations',async()=>owned(a(),async g=>{
 const crossed=await cg.curveLineCrossings(g,[50,-100],[50,100]);assert.ok(crossed.crossings.some(p=>p.withinSegment&&Math.abs(p.parameter-.5)<1e-10));for(const p of crossed.crossings){near(p.point[0],50);assert.ok(p.probeParameter>=0&&p.probeParameter<=1);}const t=await cg.curveTangentsFrom(g,[50,200],{segment:0});for(const e of t.candidates){const [j]=await cg.curveJets(g,[e.parameter],{segment:0});near((50-j.point[0])*j.derivative[1]-(200-j.point[1])*j.derivative[0],0,1e-7);}assert.ok(t.semantics.includes('continuum'));
}));
test('original flatten/quadratic approximation and centerline clipping obey independent pixel/parameter references',async()=>owned(a(),async g=>{
 const flat=[];for await(const p of cg.curveFlatten(g,{segment:0,tolerance:.1}))flat.push(p);assert.ok(flat.length);const vertices=flat.flatMap(p=>p.commands.filter(c=>c.op!=='Z').map(c=>c.point));let maxFlatten=0;for(let i=0;i<=1000;i++){const p=cubicPoint(arch,i/1000);let d=Infinity;for(let j=1;j<vertices.length;j++){const a=vertices[j-1],b=vertices[j],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p[0]-a.x)*dx+(p[1]-a.y)*dy)/(dx*dx+dy*dy)));d=Math.min(d,Math.hypot(p[0]-a.x-t*dx,p[1]-a.y-t*dy));}maxFlatten=Math.max(maxFlatten,d);}assert.ok(maxFlatten<=.1);
 let maxQuadratic=0,quadCount=0;for await(const p of cg.curveQuadraticPieces(g,{segment:0,tolerance:.1})){quadCount++;const m=p.path.commands[0],q=p.path.commands[1];assert.ok(m.op==='M'&&q.op==='Q');for(let i=0;i<=32;i++){const t=i/32,u=1-t,actual=[u*u*m.point.x+2*u*t*q.control.x+t*t*q.point.x,u*u*m.point.y+2*u*t*q.control.y+t*t*q.point.y],expected=cubicPoint(arch,p.parameterRange[0]+(p.parameterRange[1]-p.parameterRange[0])*t);maxQuadratic=Math.max(maxQuadratic,Math.hypot(actual[0]-expected[0],actual[1]-expected[1]));}}assert.ok(maxQuadratic<=.1);const clipped=await cg.curveClipRect(g,[25,-1,75,100],{segment:0});assert.ok(clipped.length);for(const p of clipped)for(let i=0;i<=100;i++){const q=cubicPoint(cubic(p.path),i/100);assert.ok(q[0]>=25-1e-8&&q[0]<=75+1e-8);}
 await mkdir('.frameweave/pa3-curve-geometry/unit',{recursive:true});await writeFile('.frameweave/pa3-curve-geometry/unit/numerics.json',JSON.stringify({maxFlatten,maxQuadratic,tolerance:.1,quadCount,scope:'Independent dense original polynomial versus returned original library flatten/quadratics; open centerline clipping retains original cubic portions, not filled Boolean certification'}));
}));
test('ordinary existing motion callbacks project deterministically and yield actual leader geometry',async()=>owned(a(),async g=>{
 const motion=cg.curveProjectionMotion(g,c=>[30+c.frame*4,110]);let repeated:unknown;for(const frame of [4,0,7,4]){const p=await motion(context(frame));assert.equal(p.status,'projected');if(frame===4){if(repeated)assert.deepEqual(p,repeated);repeated=p;}assert.ok(p.projection);assert.equal([...cg.curveProjectionLeaders(g,[p.projection])].length,1);}
}));
test('degenerate points/zero segments never fabricate projection, bounds or valid curvature',async()=>owned(curvePath([['M',1,1]],640,240),async g=>{
 assert.equal(await cg.curveBounds(g),null);assert.deepEqual(await cg.nearestCurvePoints(g,[[2,3]]),[null]);assert.equal((await cg.curveContact(g,[2,3])).status,'degenerate');await assert.rejects(cg.curveJets(g,[0],{segment:0}),{code:'E_PA_GEOMETRY_SEGMENT'});
}));
test('one original owned session retains cancellation and busy/disposal semantics',async()=>{
 const g=await cg.createCurveGeometry(directCurveGeometryFactory,a());const pre=AbortSignal.abort();await assert.rejects(cg.curveBounds(g,{signal:pre}),{code:'E_RENDER_CANCELLED'});const pending=cg.nearestCurvePoints(g,[[1,2],[50,110]]);await assert.rejects(cg.curveBounds(g),{code:'E_PA_GEOMETRY_BUSY'});await pending;const c=new AbortController(),cancelled=cg.nearestCurvePoints(g,[[1,2]],{signal:c.signal});c.abort();await assert.rejects(cancelled);assert.equal((await g.dispose()).mode,'terminated');await assert.rejects(cg.curveBounds(g),{code:'E_PA_GEOMETRY_CLOSED'});
});
test('all named source capabilities and original adapter lineage remain explicit',async()=>{
 const names=Object.keys(cg);assert.equal(names.length,23);const original=await readFile('modules/pro-animation/rust/curve-geometry/src/original-curve.rs');assert.equal(createHash('sha256').update(original).digest('hex'),'2ed8bbc29adf863b95522b5b44ef4cd7e2210e404bc5a4419b6139e9a5fc9d85');await mkdir('.frameweave/pa3-curve-geometry/unit',{recursive:true});await writeFile('.frameweave/pa3-curve-geometry/unit/api.json',JSON.stringify({functions:names.filter(n=>n!=='createCurveGeometry'),uncountedFactory:'createCurveGeometry',status:'L0 source only; no Native/media verification implied'},null,2));
});

test('true interior stationary derivative remains null; EvenOdd is not confused with algebraic winding area',async()=>{
 await owned(curvePath([['M',0,0],['C',1,0,0,0,1,0]],640,240),async g=>{const [j]=await cg.curveJets(g,[.5],{segment:0});assert.equal(j.speed,0);assert.equal(j.tangent,null);assert.equal(j.curvature,null);const [c]=await cg.curveOsculatingCircles(g,[.5],{segment:0});assert.equal(c.status,'stationary');assert.equal(c.radius,null);});
 const twice=curvePath([['M',0,0],['L',4,0],['L',4,3],['L',0,3],['L',0,0],['L',4,0],['L',4,3],['L',0,3],['Z']],640,240);twice.fillRule='evenodd';await owned(twice,async g=>{const contact=await cg.curveContact(g,[2,1]);assert.equal(contact.winding,2);assert.equal(contact.inside,false);near(await cg.curveSignedArea(g),24);});
});
test('original source geometry beyond1024segments is chunked for queries rather than artistically truncated',async()=>{
 const path=curvePath([['M',0,0],...Array.from({length:1300},(_,i)=>['L',i+1,0] as [string,...number[]])],2000,240);await owned(path,async g=>{assert.equal(g.metrics.contours[0].segments,1300);const [p]=await cg.nearestCurvePoints(g,[[647.5,2]]);assert.ok(p);assert.equal(p.segment,647);near(p.parameter,.5);near(p.point[0],647.5);const hits=await cg.curveLineCrossings(g,[647.5,-2],[647.5,2]);assert.ok(hits.crossings.some(h=>h.segment===647&&h.withinSegment));});
});

test('original arclength reader retains identical sampled values through the extended owned query carrier',async()=>{
 const original=await createCurveSampler(graphics,directCurveFactory,a()),extended=await createCurveSampler(graphics,directCurveGeometryFactory,a());try{assert.deepEqual(extended.metrics,original.metrics);const length=original.metrics.contours[0].length,distances=[length/2,0,length,length/2];assert.deepEqual(await extended.sampleBatch(distances),await original.sampleBatch(distances));}finally{await original.dispose();await extended.dispose();}
});
