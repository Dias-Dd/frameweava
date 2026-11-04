import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createTextItemizer} from '../modules/pro-animation/src/text-itemizer.ts';
import {shapeBidiLine,type ShapedBidiLine} from '../modules/pro-animation/src/bidi-line.ts';
import {createBidiAnimator} from '../modules/pro-animation/src/bidi-animation.ts';
import {keyframes} from '../src/core/animation.ts';
import {rangeSelector,stagger} from '../modules/pro-animation/src/selectors.ts';
import {directTextFactory} from './helpers/pa3-bidi.ts';
import {bidiFont} from './helpers/pa3-bidi-fonts.ts';
const ctx=(frame:number)=>({frame,time:frame/12,fps:12,globalTime:frame/12} as any);
async function prepared(text='AV \u2067סַלَאם 42\u2069 ffi'){
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans'),arabic=await bidiFont('notonaskharabic'),hebrew=await bidiFont('notosanshebrew');
 try{return await shapeBidiLine(graphics,itemizer,text,{font:latin,fontForRun:r=>r.script==='Arab'?arabic:r.script==='Hebr'?hebrew:latin,fontSize:48,x:20,baseline:80});}
 finally{await itemizer.dispose();await Promise.all([latin.dispose(),arabic.dispose(),hebrew.dispose()]);}
}
test('mixed-font animator uses sole canonical geometry after all original kernels are disposed',async()=>{
 const line=await prepared('AV \u2067סַלָאם 42\u2069 ffi'),anim=createBidiAnimator(graphics,line),out=anim.animate({},ctx(5));
 assert.equal(out.glyphs.length,line.layout.glyphs.length);assert.deepEqual(out.sourceLayout,line.layout);assert.deepEqual(out.fontInstances,line.fontInstances);assert.ok(out.fontInstances.length>=2);
 for(const p of line.glyphPaths)assert.deepEqual(out.glyphs[p.glyphIndex].path,p.path);for(const [i,g]of out.glyphs.entries()){assert.deepEqual(g.cluster,line.layout.glyphs[i].cluster);assert.equal(Boolean(g.path),line.glyphPaths.some(p=>p.glyphIndex===i));}
 const expected=structuredClone(out);line.layout.text='changed';line.glyphPaths[0].path.commands=[];Reflect.set(line.runs[0],'sourceUnits',[]);line.fontInstances[0].source.sha256='0'.repeat(64);assert.deepEqual(anim.animate({},ctx(0)),expected);assert.throws(()=>{(anim.units()[0].anchor as unknown as number[])[0]=99;},TypeError);
});
test('global logical/visual units retain original UTF16 spans, distinct fonts and rigid attached clusters',async()=>{
 const line=await prepared('AV \u2067סַלָאם 42\u2069 ffi'),anim=createBidiAnimator(graphics,line),logical=anim.units(),visual=anim.units({order:'visual'});
 assert.deepEqual(logical.map(u=>u.cluster.start),logical.map(u=>u.cluster.start).sort((a,b)=>a-b));assert.notDeepEqual(logical.map(u=>u.cluster.start),visual.map(u=>u.cluster.start));assert.ok(logical.some(u=>u.glyphIndices.length>1));assert.ok(logical.some(u=>u.text==='ffi'));assert.ok(logical.every(u=>u.count===logical.length&&u.text===line.layout.text.slice(u.cluster.start,u.cluster.end)));
 let calls=0;const moved=anim.animate({transform:u=>{calls++;assert.equal(u.index,u.logicalIndex);assert.ok(u.fontId&&Number.isInteger(u.runIndex));return {dx:u.index*2,dy:-3};}},ctx(3));assert.equal(calls,logical.length);
 for(const u of logical)for(const i of u.glyphIndices){const p=line.glyphPaths.find(p=>p.glyphIndex===i);if(!p)continue;const a=p.path.commands.find(c=>c.op!=='Z')!,b=moved.glyphs[i].path!.commands.find(c=>c.op!=='Z')!;assert.ok(Math.abs(b.point.x-a.point.x-u.index*2)<=1e-12);assert.ok(Math.abs(b.point.y-a.point.y+3)<=1e-12);}
 assert.ok(anim.animate({unit:'glyph'},ctx(0)).diagnostics.some(d=>d.code==='W_PA_GLYPH_CLUSTER_SPLIT'));
});
test('existing selectors, keyframes and random frames remain deterministic across mixed Bidi runs',async()=>{
 const anim=createBidiAnimator(graphics,await prepared('AV \u2067سَلَام 42\u2069 ffi')),seen=new Map<number,unknown>(),dx=keyframes([{frame:0,value:-5},{frame:11,value:7,easing:'easeInOut'}]);
 for(const frame of [5,0,11,3,5,11,0]){const c=ctx(frame),weights=rangeSelector(anim.units().length,{end:1,shape:'triangle'},c),drawing=anim.animate({transform:u=>({dx,dy:(1-stagger(u.index,{delay:.025,duration:.3},c))*20,opacity:.5+.5*weights[u.index]})},c);if(seen.has(frame))assert.deepEqual(drawing,seen.get(frame));seen.set(frame,drawing);}assert.notDeepEqual(seen.get(0),seen.get(11));
});
test('bad source/font/cluster mappings, unsupported transforms and cancellation are explicit; blank line is valid',async()=>{
 const line=await prepared('AV אבג'),bad=(change:(l:ShapedBidiLine)=>void)=>{const copy=structuredClone(line);change(copy);assert.throws(()=>createBidiAnimator(graphics,copy),{code:'E_PA_BIDI_ANIMATION_MAPPING'});};
 bad(l=>Reflect.set(l.runs[0],'sourceUnits',[999]));bad(l=>Reflect.set(l.runs[0],'fontId','unknown'));bad(l=>Reflect.set(l.runs[0].localClusters,0,{start:0,end:999}));bad(l=>l.runs.pop());bad(l=>Reflect.set(l.runs[0],'globalGlyphIndices',[0,0]));bad(l=>l.fontInstances[0].source.sha256='0'.repeat(64));
 const anim=createBidiAnimator(graphics,line);for(const transform of [()=>({opacity:2}),()=>({dx:Infinity}),async()=>({dx:2})])assert.throws(()=>anim.animate({transform} as any,ctx(0)),{code:'E_PA_GLYPH_TRANSFORM'});const abort=new AbortController();abort.abort();assert.throws(()=>anim.animate({signal:abort.signal},ctx(0)),{code:'E_PA_GLYPH_CANCELLED'});
 const blank=createBidiAnimator(graphics,await prepared(''));assert.deepEqual(blank.units(),[]);assert.deepEqual(blank.animate({},ctx(5)).glyphs,[]);assert.throws(()=>blank.animate({unit:'word'} as any,ctx(0)),{code:'E_PA_GLYPH_PARAMETER'});
});
