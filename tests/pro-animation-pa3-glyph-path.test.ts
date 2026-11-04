import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createCurveSampler} from '../modules/pro-animation/src/curve-sampler.ts';
import {createGlyphAnimator} from '../modules/pro-animation/src/glyph-animation.ts';
import {glyphsOnPath} from '../modules/pro-animation/src/glyph-on-path.ts';
import {keyframes} from '../src/core/animation.ts';
import {directCurveFactory,curvePath} from './helpers/pa3-curve.ts';
import {shapedFixture} from './helpers/pa3-shaped-fixture.ts';
import type {PathCommand} from '../modules/graphics-contracts/types.ts';
const ctx=(frame=0)=>({frame,time:frame/12,fps:12,globalTime:frame/12} as any),baseline=(rows:([string,...number[]])[])=>createCurveSampler(graphics,directCurveFactory,curvePath(rows,640,240));
const points=(c:PathCommand)=>c.op==='Z'?[]:c.op==='C'?[c.control1,c.control2,c.point]:c.op==='Q'?[c.control,c.point]:[c.point];

test('real kerning/ligature outlines on a straight baseline retain coordinates; offset and normal are explicit px',async()=>{
 const run=await shapedFixture('AV ffi a\u0327\u0301'),text=createGlyphAnimator(graphics,run),curve=await baseline([['M',20,70],['L',620,70]]);let error=0;
 try{for(const [offset,normal]of [[0,0],[10,20]]){
  const result=await glyphsOnPath(text,curve,{offset,normalOffset:normal},ctx());for(const item of run.glyphPaths){const output=result.glyphs[item.glyphIndex].path!;for(let i=0;i<item.path.commands.length;i++){const a=points(item.path.commands[i]),b=points(output.commands[i]);assert.equal(a.length,b.length);for(let j=0;j<a.length;j++)error=Math.max(error,Math.abs(b[j].x-(a[j].x+offset)),Math.abs(b[j].y-(a[j].y+normal)));}}
  assert.equal(result.glyphs.length,run.layout.glyphs.length);assert.ok(result.placements.some(p=>p.text==='ffi'&&p.glyphIndices.length===1));assert.deepEqual(result.fontInstance,run.fontInstance);
 }assert.ok(error<=1e-10,`${error}`);await writeFile('.frameweave/pa3-curve/glyph-straight-reference.json',JSON.stringify({maxAbsolute:error,budget:1e-10}));
 }finally{await curve.dispose();}
});

test('actual attached glyphs follow one curved cluster pose with independent coordinate reference',async()=>{
 const run=await shapedFixture('a\u0327\u0301'),text=createGlyphAnimator(graphics,run),curve=await baseline([['M',20,170],['C',160,20,480,20,620,170]]);let error=0;
 try{const result=await glyphsOnPath(text,curve,{offset:120},ctx(5));assert.equal(result.placements.length,1);assert.ok(result.placements[0].glyphIndices.length>1);const u=result.placements[0],center=u.anchor[0]+u.advanceX/2,c=Math.cos(u.sample.angleRadians!),s=Math.sin(u.sample.angleRadians!);
  for(const item of run.glyphPaths){const output=result.glyphs[item.glyphIndex].path!;for(let i=0;i<item.path.commands.length;i++){const a=points(item.path.commands[i]),b=points(output.commands[i]);for(let j=0;j<a.length;j++){const x=a[j].x-center,y=a[j].y-u.anchor[1];error=Math.max(error,Math.abs(b[j].x-(u.sample.x+c*x-s*y)),Math.abs(b[j].y-(u.sample.y+s*x+c*y)));}}}
  assert.ok(error<=1e-10,`${error}`);assert.equal(result.diagnostics.some(d=>d.code==='W_PA_GLYPH_CLUSTER_SPLIT'),false);await writeFile('.frameweave/pa3-curve/glyph-curve-reference.json',JSON.stringify({maxAbsolute:error,budget:1e-10,glyphs:run.layout.glyphs.length,clusters:1}));
 }finally{await curve.dispose();}
});

test('Arabic selector order is logical while curved glyph drawing order and shared mark clusters remain intact',async()=>{
 const run=await shapedFixture('سَلَام',{id:'notonaskharabic',script:'Arab',direction:'rtl'}),text=createGlyphAnimator(graphics,run),curve=await baseline([['M',20,160],['Q',320,20,620,160]]),called:number[]=[];
 try{const result=await glyphsOnPath(text,curve,{order:'logical',transform:u=>{called.push(u.index);return {}; }},ctx(5));assert.deepEqual(called,Array.from({length:text.units().length},(_,i)=>i));assert.deepEqual(result.glyphs.map(g=>g.glyphId),run.layout.glyphs.map(g=>g.glyphId));assert.ok(result.placements.some(p=>p.glyphIndices.length>1));assert.notDeepEqual(result.placements.map(p=>p.logicalIndex),result.placements.map(p=>p.visualIndex));
 }finally{await curve.dispose();}
});

test('closed wrap and existing Signal offset/spacing are random-access exact; open clip is explicit and observable',async()=>{
 const text=createGlyphAnimator(graphics,await shapedFixture('ABC')),r=80,k=.5522847498307936*r,circle=await baseline([['M',320+r,120],['C',320+r,120+k,320+k,120+r,320,120+r],['C',320-k,120+r,320-r,120+k,320-r,120],['C',320-r,120-k,320-k,120-r,320,120-r],['C',320+k,120-r,320+r,120-k,320+r,120],['Z']]),offset=keyframes([{frame:0,value:-10},{frame:11,value:70,easing:'easeInOut'}]),seen=new Map<number,unknown>();
 try{for(const frame of [6,0,11,3,6,11,0]){const result=await glyphsOnPath(text,circle,{offset,letterSpacing:2,normalOffset:4,overflow:'wrap'},ctx(frame));assert.ok(result.placements.every(p=>p.sample.distance>=0&&p.sample.distance<circle.metrics.contours[0].length));if(seen.has(frame))assert.deepEqual(result,seen.get(frame));seen.set(frame,result);}assert.notDeepEqual(seen.get(0),seen.get(11));}finally{await circle.dispose();}
 const short=await baseline([['M',0,0],['L',5,0]]);try{await assert.rejects(glyphsOnPath(text,short,{},ctx()),{code:'E_PA_TEXT_PATH_RANGE'});const clipped=await glyphsOnPath(text,short,{overflow:'clip'},ctx());assert.ok(clipped.placements.every(p=>p.clipped));assert.ok(clipped.glyphs.every(g=>g.opacity===0));assert.ok(clipped.diagnostics.some(d=>d.code==='W_PA_TEXT_PATH_CLIPPED'));await assert.rejects(glyphsOnPath(text,short,{overflow:'wrap'},ctx()),{code:'E_PA_TEXT_PATH_CLOSURE'});}finally{await short.dispose();}
});

test('stationary cusp orientation is rejected, explicit upright/no-normal uses the actual position',async()=>{
 const text=createGlyphAnimator(graphics,await shapedFixture('A',{fontSize:1000,x:0,baseline:0})),unit=text.units()[0],curve=await baseline([['M',0,0],['Q',100,0,0,0]]),offset=50-unit.advanceX/2;
 try{await assert.rejects(glyphsOnPath(text,curve,{offset},ctx()),{code:'E_PA_TEXT_PATH_TANGENT'});const upright=await glyphsOnPath(text,curve,{offset,orient:'upright'},ctx());assert.equal(upright.placements[0].sample.tangentStatus,'undefined');assert.equal(upright.placements[0].sample.x,50);await assert.rejects(glyphsOnPath(text,curve,{offset,orient:'upright',normalOffset:2},ctx()),{code:'E_PA_TEXT_PATH_TANGENT'});}finally{await curve.dispose();}
});

test('space/parameter/async-transform errors are structured and do not poison ready geometry',async()=>{
 const text=createGlyphAnimator(graphics,await shapedFixture('ABC')),curve=await baseline([['M',20,70],['L',620,70]]);try{
  await assert.rejects(glyphsOnPath(text,curve,{sourceOriginX:NaN},ctx()),{code:'E_PA_TEXT_PATH_PARAMETER'});await assert.rejects(glyphsOnPath(text,curve,{transform:async()=>({})} as any,ctx()),{code:'E_PA_TEXT_PATH_TRANSFORM'});await assert.rejects(glyphsOnPath(text,curve,{transform:()=>({anchor:[0,0]})} as any,ctx()),{code:'E_PA_TEXT_PATH_TRANSFORM'});assert.ok((await glyphsOnPath(text,curve,{},ctx())).glyphs.length>0);
 }finally{await curve.dispose();}
 const wrong=await createCurveSampler(graphics,directCurveFactory,curvePath([['M',0,0],['L',100,0]]));try{await assert.rejects(glyphsOnPath(text,wrong,{},ctx()),{code:'E_PA_TEXT_PATH_SPACE'});}finally{await wrong.dispose();}
});

test('pre-cancel has no side effects; pending cancellation terminates only the owned metric client',async()=>{
 const text=createGlyphAnimator(graphics,await shapedFixture('ABC')),curve=await baseline([['M',20,70],['L',620,70]]);try{
  const pre=new AbortController();pre.abort();await assert.rejects(glyphsOnPath(text,curve,{signal:pre.signal},ctx()),{code:'E_PA_TEXT_PATH_CANCELLED'});assert.ok((await glyphsOnPath(text,curve,{},ctx())).glyphs.length>0);
  const active=new AbortController(),pending=glyphsOnPath(text,curve,{signal:active.signal},ctx());active.abort();await assert.rejects(pending,{code:'E_PA_CURVE_CANCELLED'});assert.equal((await curve.diagnostics()).closed,true);
 }finally{assert.deepEqual(await curve.dispose(),{mode:'terminated'});}
});
