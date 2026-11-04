import test from 'node:test';
import assert from 'node:assert/strict';
import type {FrameContext} from '../src/core/types.ts';
import {keyframes} from '../src/core/animation.ts';
import * as text from '../modules/pro-animation/src/text-animation/index.ts';
import {prepared} from '../modules/pro-animation/validation/native-text-scene/prepared.ts';
import {operations} from './helpers/pa3-pathops.ts';
import type {ShapedRun} from '../modules/pro-animation/src/font-shaping.ts';
import type {PathData} from '../modules/graphics-contracts/types.ts';
const c:FrameContext={frame:12,time:.5,globalFrame:12,globalTime:.5,dt:1/24,fps:{num:24,den:1},durationInFrames:25,progress:.5,seed:37};
const latin=prepared[0],unit=latin.mesh.units.find(u=>u.text==='ffi')!;
const near=(a:number,b:number,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<=tolerance,JSON.stringify({a,b,tolerance}));
const apply=(m:readonly number[],x:number,y:number)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
test('actual shaped Latin ligature and Arabic mark clusters remain whole units',()=>{
 assert.ok(unit);assert.equal(unit.cluster.end-unit.cluster.start,3);assert.equal(unit.glyphIndices.length,1);
 const arabic=prepared[1].mesh;assert.ok(arabic.units.some(u=>u.glyphIndices.length>1));assert.ok(arabic.units.every(u=>u.direction==='rtl'));assert.ok(prepared[2].mesh.layout.text==='日本語');
});
test('original UTF16 overlap/contained ranges and exact substrings do not split ligatures',()=>{
 assert.equal(text.clusterRangeSelector(latin.mesh.layout.text,{start:4,end:5})(unit,c),1);assert.equal(text.clusterRangeSelector(latin.mesh.layout.text,{start:4,end:5,match:'contained'})(unit,c),0);
 assert.equal(text.textMatchSelector(latin.mesh.layout.text,'ffi')(unit,c),1);assert.equal(text.textMatchSelector(latin.mesh.layout.text,'ffi',{occurrence:1})(unit,c),0);
 assert.throws(()=>text.clusterRangeSelector('a😀b',{start:2,end:3}),{code:'E_PA_TEXT_ANIMATION'});
});
test('logical/visual index sets, explicit words and canonical lines select real units',()=>{
 assert.equal(text.indexSetSelector([unit.logicalIndex])(unit,c),1);assert.equal(text.indexSetSelector([unit.visualIndex],{order:'visual'})(unit,c),1);
 assert.equal(text.wordRangeSelector(latin.mesh.layout.text,latin.words,{start:1,end:2})(unit,c),1);assert.equal(text.wordRangeSelector(latin.mesh.layout.text,latin.words,{start:0,end:1})(unit,c),0);
 assert.equal(text.lineSelector([unit.lineId])(unit,c),1);assert.equal(text.lineSelector(['absent'])(unit,c),0);
});
test('physical anchor-distance/axis selectors evaluate existing Signals without ink-bound guesses',()=>{
 assert.equal(text.distanceSelector({center:unit.anchor,radius:0})(unit,c),1);near(text.axisSelector({start:unit.anchor[0]-10,end:unit.anchor[0]+10})(unit,c),.5);
 near(text.axisSelector({axis:'y',start:unit.anchor[1]-20,end:unit.anchor[1],reverse:true})(unit,c),0);
 assert.equal(text.distanceSelector({center:[-1,-1],radius:1})(unit,c),0);
});
test('lazy set combinators reuse existing scalar selector equations',()=>{
 const a=()=>.25,b=()=>.5;near(text.selectorUnion(a,b)(unit,c),.5);near(text.selectorIntersection(a,b)(unit,c),.125);near(text.selectorSubtract(b,a)(unit,c),.25);near(text.selectorInvert(a)(unit,c),.75);
 assert.equal(text.selectorThreshold(a,{threshold:.3})(unit,c),0);near(text.selectorThreshold(a,{threshold:.25,softness:.5})(unit,c),.5);near(text.selectorEase(b,'easeIn')(unit,c),.25);
});
test('seeded smooth selection and per-unit retiming are stateless with no 4096-unit API cap',()=>{
 const noise=text.noiseSelector({seed:37,frequency:.2,speed:.5}),a=noise(unit,c);assert.ok(a>=0&&a<=1);assert.equal(a,noise(unit,c));assert.notEqual(a,text.noiseSelector({seed:38})(unit,c));
 const delayed=text.staggerGlyphSelector((_u,at)=>Math.max(0,Math.min(1,at.time)),{delaySeconds:.1});near(delayed(unit,c),Math.max(0,c.time-unit.logicalIndex*.1));
 const large={...unit,logicalIndex:10000,visualIndex:10000,index:10000,count:10001};assert.equal(text.indexSetSelector([10000])(large,c),1);assert.ok(Number.isFinite(noise(large,c)));
});
test('real affine composition preserves order, pivot and nonuniform scale',()=>{
 const all=()=>1,combined=text.composeGlyphTransforms(text.glyphScale(all,{scaleX:2,scaleY:3,anchor:[0,0]}),text.glyphRotate(all,{rotationDegrees:90,anchor:[0,0]}),text.glyphTranslate(all,{x:10,y:-4}));
 const v=combined(unit,c),p=apply(v.matrix,1,1);near(p[0],7);near(p[1],-2);assert.equal(v.opacity,1);
 const moved=text.glyphTranslate(()=>.5,{x:10,y:-20})(unit,c);near(moved.matrix[4],5);near(moved.matrix[5],-10);
});
test('opacity and tracking retain separate Alpha and RTL/logical contracts',()=>{
 near(text.glyphOpacity(()=>.5,{opacity:0})(unit,c).opacity,.5);
 const rtl=prepared[1].mesh.units.find(u=>u.logicalIndex>0)!;near(text.glyphTracking(()=>1,{amount:2})(rtl,c).matrix[4],-2*rtl.logicalIndex);
 near(text.glyphTracking(()=>1,{amount:2,order:'visual'})(rtl,c).matrix[4],2*rtl.visualIndex);
 assert.throws(()=>text.glyphTracking(()=>1,{amount:1})({...unit,direction:undefined},c),{code:'E_PA_TEXT_ANIMATION'});
});
test('all controls support existing keys and preserve input layout/provenance',()=>{
 const before=structuredClone(latin.mesh),value=text.glyphTranslate(()=>1,{y:keyframes([{frame:0,value:0},{frame:24,value:20}])})(unit,c);near(value.matrix[5],10);assert.deepEqual(latin.mesh,before);
});
test('real Clipper2 + Earcut keeps holes and filled area in a canonical counter fixture',async()=>{
 const p=(id:string,x:number,y:number)=>({id,x,y}),path:PathData={schema:'frameweave.path',version:1,id:'counter',coordinates:latin.mesh.layout.coordinates,fillRule:'nonzero',commands:[{op:'M',point:p('a',0,0)},{op:'L',point:p('b',20,0)},{op:'L',point:p('c',20,20)},{op:'L',point:p('d',0,20)},{op:'Z'},{op:'M',point:p('e',5,5)},{op:'L',point:p('f',5,15)},{op:'L',point:p('g',15,15)},{op:'L',point:p('h',15,5)},{op:'Z'}]},run:ShapedRun={layout:latin.mesh.layout,glyphPaths:[{glyphIndex:0,path}],fontInstance:latin.mesh.fontInstance,diagnostics:[]},ops=await operations();
 try{const mesh=await text.prepareGlyphMeshes(run,{pathOperations:ops}),v=mesh.positions;let area=0;const inside=(x:number,y:number)=>{for(let i=0;i<v.length;i+=9){const ax=v[i],ay=v[i+1],bx=v[i+3],by=v[i+4],cx=v[i+6],cy=v[i+7],cross=(px:number,py:number,qx:number,qy:number)=>px*qy-py*qx,a=cross(bx-ax,by-ay,x-ax,y-ay),b=cross(cx-bx,cy-by,x-bx,y-by),c=cross(ax-cx,ay-cy,x-cx,y-cy);if(a>=0&&b>=0&&c>=0||a<=0&&b<=0&&c<=0)return true;}return false;};
  for(let i=0;i<v.length;i+=9)area+=Math.abs((v[i+3]-v[i])*(v[i+7]-v[i+1])-(v[i+4]-v[i+1])*(v[i+6]-v[i]))/2;near(area,300);assert.equal(inside(10,10),false);assert.equal(inside(2,10),true);assert.ok(mesh.preparation.maxAreaDeviation<=1e-10);
 }finally{assert.equal((await ops.dispose()).mode,'cooperative');}
});
test('invalid selector/transform options and pre-abort fail with structured diagnostics',async()=>{
 const invalid=[()=>text.indexSetSelector([-1]),()=>text.wordRangeSelector('a',[{start:0,end:2}]),()=>text.axisSelector({start:1,end:0})(unit,c),()=>text.selectorInvert(()=>NaN)(unit,c),()=>text.glyphOpacity(()=>1,{opacity:2})(unit,c),()=>text.composeGlyphTransforms(()=>({matrix:[1,0,0,1,0,0],opacity:2}))(unit,c),()=>text.clusterRangeSelector('a',{start:0,end:1,extra:true} as never)];for(const action of invalid)assert.throws(action,{code:'E_PA_TEXT_ANIMATION'});
 await assert.rejects(text.prepareGlyphMeshes({} as never,{pathOperations:{async *booleanPathsStream(){throw Error('No kernel should run');}},signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});
});
