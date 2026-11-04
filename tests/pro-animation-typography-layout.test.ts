import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../modules/pro-animation/src/typography/layout.ts';
import {prepareFontFallback} from '../modules/pro-animation/src/typography/fonts.ts';
import {typesettingServices} from './helpers/pa3-typesetting.ts';
import {layoutParagraph} from '../modules/pro-animation/src/text-layout/layout.ts';
import {createParagraphIndex,paragraphMetrics,selectionRects} from '../modules/pro-animation/src/text-layout/queries.ts';
import {paragraphText} from './helpers/pa3-paragraph.ts';
import {keyframes} from '../src/core/animation.ts';
import type {FrameContext} from '../src/core/types.ts';
let services:Awaited<ReturnType<typeof typesettingServices>>,source:Awaited<ReturnType<typeof layoutParagraph>>;
before(async()=>{services=await typesettingServices();const plan=await prepareFontFallback(paragraphText,{itemizer:services.itemizer,candidates:services.candidates,fontSize:28});source=await layoutParagraph(paragraphText,{itemizer:services.itemizer,font:plan.font,fontForRun:plan.fontForRun,scriptForRun:plan.scriptForRun,width:300,fontSize:28,lineHeight:42,x:20,baseline:45});});
after(async()=>{await services?.dispose();});
const identity=(result:typeof source|ReturnType<typeof t.alignParagraphLines>)=>{assert.equal(result.layout.text,source.layout.text);assert.deepEqual(result.layout.glyphs.map(g=>[g.glyphId,g.cluster]),source.layout.glyphs.map(g=>[g.glyphId,g.cluster]));assert.deepEqual(result.fontInstances,source.fontInstances);createParagraphIndex(result);};
test('physical/directional align and first/rest indent preserve original glyph identities and source snapshot',()=>{
 const before=structuredClone(source),aligned=t.alignParagraphLines(source,{x:30,width:600,align:'end'});identity(aligned);for(const line of aligned.lines)assert.ok(Math.abs(line.origin[0]-(line.direction==='ltr'?630-line.advance:30))<1e-9);const indented=t.indentParagraphLines(aligned,{first:10,rest:3});identity(indented);assert.deepEqual(source,before);assert.ok(Object.isFrozen(indented));
});
test('word spacing and cluster tracking update canonical advances; RTL logical starting edge stays fixed',()=>{
 const index=createParagraphIndex(source),word=t.spaceParagraphWords(source,{amount:2}),tracked=t.trackParagraphClusters(source,{amount:1.25});identity(word);identity(tracked);for(const [i,line]of tracked.lines.entries()){const old=source.lines[i],count=index.clusters.filter(c=>c.lineId===line.id).length;assert.ok(Math.abs(line.advance-old.advance-Math.max(0,count-1)*1.25)<1e-9);if(line.direction==='rtl')assert.ok(Math.abs(line.origin[0]+line.advance-old.origin[0]-old.advance)<1e-9);}assert.throws(()=>t.spaceParagraphWords(source,{amount:-100}),{code:'E_PA_TYPESET'});
});
test('space-only justification reaches target, preserves last lines and reports absent CJK/kashida gaps',()=>{
 const justified=t.justifyParagraphLines(source,{width:360});identity(justified);for(const [i,line]of justified.lines.entries()){const last=i===justified.lines.length-1||justified.lines[i+1].paragraphId!==line.paragraphId;if(last)assert.equal(line.advance,source.lines[i].advance);else assert.ok(Math.abs(line.advance-360)<1e-8);}const all=t.justifyParagraphLines(source,{width:700,lastLine:'justify'});identity(all);assert.ok(all.lines[0].advance>=source.lines[0].advance);
});
test('leading/paragraph gap/baseline shift/grid all move canonical outlines and line anchors together',()=>{
 const leading=t.setParagraphLeading(source,{lineHeight:50,paragraphGap:8}),shift=t.shiftParagraphBaseline(leading,{amount:2,lineIds:['line.0']}),snap=t.snapParagraphBaselines(shift,{grid:8,offset:1});identity(snap);assert.equal(leading.lines[1].baseline-leading.lines[0].baseline,50);assert.equal(shift.lines[0].baseline-leading.lines[0].baseline,2);assert.ok(snap.lines.every(l=>(l.baseline-1)%8===0));assert.throws(()=>t.shiftParagraphBaseline(source,{amount:1,lineIds:['missing']}),{code:'E_PA_TYPESET'});
});
test('finite columns retain every logical line and reject overflow without truncation or hidden rewrap',()=>{
 const columns=t.flowParagraphColumns(source,{x:20,y:20,width:300,height:126,gap:20,columns:2});identity(columns);assert.equal(columns.lines.length,source.lines.length);assert.ok(columns.lines.some(l=>l.origin[0]>=340));assert.throws(()=>t.flowParagraphColumns(source,{x:20,y:20,width:300,height:42,gap:20,columns:1}),{code:'E_PA_TYPESET_OVERFLOW'});assert.throws(()=>t.flowParagraphColumns(source,{x:0,y:0,width:1,height:126,columns:2}),{code:'E_PA_TYPESET'});
});
test('uniform box fit preserves actual glyph geometry and exposes a verified GPU cluster-affine mapping',()=>{
 const fit=t.fitParagraphBox(source,{box:{left:20,top:220,right:300,bottom:350,width:280,height:130}});identity(fit);const a=createParagraphIndex(source),b=createParagraphIndex(fit),controls=t.paragraphLayoutTransform(a,b),metrics=paragraphMetrics(b);assert.ok(metrics.advanceBounds!.right<=300+1e-8);assert.ok(metrics.advanceBounds!.bottom<=350+1e-8);for(const u of a.clusters){const v=controls(u);assert.ok(v.matrix.every(Number.isFinite));assert.equal(v.opacity,1);}assert.ok(selectionRects(b,{start:0,end:10}).rects.length);
 const bad=structuredClone(fit);bad.glyphPaths[0].path.commands.forEach(c=>{if(c.op!=='Z')c.point.x+=1;});assert.throws(()=>t.paragraphLayoutTransform(a,createParagraphIndex(bad)),{code:'E_PA_TYPESET'});
});
test('random/repeated Signal-driven typography uses only existing frame context and produces identical canonical data',()=>{
 const tracking=keyframes([{frame:0,value:0},{frame:7,value:1.4}]),seen=new Map<number,unknown>();for(const frame of [4,0,7,4]){const context={frame,time:frame/24,fps:{num:24,den:1},globalTime:frame/24,globalFrame:frame,dt:1/24,progress:frame/7,durationInFrames:8,seed:1} satisfies FrameContext,result=t.trackParagraphClusters(source,{amount:tracking},context);if(seen.has(frame))assert.deepEqual(result,seen.get(frame));seen.set(frame,result);}assert.notDeepEqual(seen.get(0),seen.get(7));assert.throws(()=>t.trackParagraphClusters(source,{amount:tracking}),{code:'E_PA_TYPESET'});
});

test('native affine reuse rejects changed coordinate identity even when outline topology matches',()=>{
 const changed=structuredClone(source);changed.layout.coordinates.spaceId='other-space';for(const p of changed.glyphPaths)p.path.coordinates.spaceId='other-space';assert.throws(()=>t.paragraphLayoutTransform(createParagraphIndex(source),createParagraphIndex(changed)),{code:'E_PA_TYPESET'});
});
