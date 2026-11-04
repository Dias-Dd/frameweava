import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createFontShaper} from '../modules/pro-animation/src/font-shaping.ts';
import {createGlyphAnimator} from '../modules/pro-animation/src/glyph-animation.ts';
import {rangeSelector,stagger} from '../modules/pro-animation/src/selectors.ts';
import {keyframes} from '../src/core/animation.ts';
import {directShapingFactory} from './helpers/pa3-shaping.ts';
import type {ShapedRun} from '../modules/pro-animation/src/font-shaping.ts';
const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:640,height:240};
const ctx=(frame:number)=>({frame,time:frame/12,fps:12,globalTime:frame/12} as any);
async function shaped(text:string,id='notosans',script='Latn',direction:'ltr'|'rtl'='ltr',variations?:Readonly<Record<string,number>>){
 const sources=JSON.parse(await readFile('modules/pro-animation/validation/shaping-scene/font-sources.json','utf8')),record=sources.find((r:any)=>r.id===id),font=await createFontShaper(graphics,directShapingFactory,{coordinates,bytes:new Uint8Array(await readFile(`modules/pro-animation/validation/shaping-scene/fonts/${id}.ttf`)),variations,source:{resourceId:id,kind:'font',sha256:record.font.sha256,bytes:record.font.bytes}});
 try{return await font.shapeRun(text,{script,direction,fontSize:48,x:20,baseline:80});}finally{assert.deepEqual(await font.dispose(),{mode:'cooperative',remainingSessions:0});}
}

test('actual shaped glyph animation preserves kerning/ligature, no-outline spaces and exact identity after font disposal',async()=>{
 const run=await shaped('AV office ffi'),anim=createGlyphAnimator(graphics,run),out=anim.animate({},ctx(0));
 assert.ok(run.layout.glyphs.length<run.layout.text.length);assert.equal(out.glyphs.length,run.layout.glyphs.length);assert.deepEqual(out.sourceLayout,run.layout);assert.deepEqual(out.fontInstance,run.fontInstance);
 for(const item of run.glyphPaths)assert.deepEqual(out.glyphs[item.glyphIndex].path,item.path);
 for(const [i,glyph]of out.glyphs.entries())assert.equal(Boolean(glyph.path),run.glyphPaths.some(p=>p.glyphIndex===i));
 const lig=anim.units().find(u=>u.text==='ffi');assert.ok(lig);assert.equal(lig.glyphIndices.length,1);
 run.layout.glyphs[0].x+=100;run.glyphPaths[0].path.commands[0]={op:'M',point:{id:'bad',x:0,y:0}};run.fontInstance.source.sha256='0'.repeat(64);
 assert.deepEqual(anim.animate({},ctx(11)),out);const expected=structuredClone(out);out.glyphs[0].path!.commands[0]={op:'M',point:{id:'changed',x:999,y:0}};assert.deepEqual(anim.animate({},ctx(3)),expected);assert.throws(()=>{(anim.units()[0].anchor as unknown as number[])[0]=99;},TypeError);
});

test('multi-glyph mark clusters move rigidly once; independent glyph mode emits an explicit split diagnostic',async()=>{
 const run=await shaped('a\u0327\u0301'),anim=createGlyphAnimator(graphics,run),units=anim.units();assert.ok(run.layout.glyphs.length>1);assert.equal(units.length,1);let calls=0;
 const out=anim.animate({transform:u=>{calls++;return {dx:7,dy:-3,rotation:Math.PI/3,scaleX:1.2,scaleY:.8};}},ctx(5));assert.equal(calls,1);
 const [ax,ay]=units[0].anchor,c=Math.cos(Math.PI/3),s=Math.sin(Math.PI/3);let max=0;
 for(const item of run.glyphPaths){const actual=out.glyphs[item.glyphIndex].path!;for(let i=0;i<item.path.commands.length;i++){
  const from=item.path.commands[i],to=actual.commands[i];if(from.op==='Z'||to.op==='Z')continue;
  const points=(command:typeof from)=>command.op==='C'?[command.control1,command.control2,command.point]:command.op==='Q'?[command.control,command.point]:[command.point];const input=points(from),output=points(to);assert.equal(input.length,output.length);for(let j=0;j<input.length;j++){const x=(input[j].x-ax)*1.2,y=(input[j].y-ay)*.8;max=Math.max(max,Math.abs(output[j].x-(ax+7+c*x-s*y)),Math.abs(output[j].y-(ay-3+s*x+c*y)));}
 }}assert.ok(max<=1e-12,`Rigid cluster coordinate reference error ${max}`);
 const split=anim.animate({unit:'glyph',transform:u=>({dx:u.index*5})},ctx(5));assert.ok(split.diagnostics.some(d=>d.code==='W_PA_GLYPH_CLUSTER_SPLIT'));
 await mkdir('.frameweave/pa3-glyph',{recursive:true});await writeFile('.frameweave/pa3-glyph/rigid-reference.json',JSON.stringify({text:run.layout.text,glyphs:run.layout.glyphs.length,clusters:units.length,maxAbsolute:max,budget:1e-12}));
});

test('Arabic RTL logical selector order is distinct from original visual glyph drawing order',async()=>{
 const run=await shaped('سَلَام','notonaskharabic','Arab','rtl'),anim=createGlyphAnimator(graphics,run),logical=anim.units(),visual=anim.units({order:'visual'});
 assert.ok(logical.some(u=>u.glyphIndices.length>1));assert.ok(logical.length>1);assert.notDeepEqual(logical.map(u=>u.cluster.start),visual.map(u=>u.cluster.start));
 assert.deepEqual(logical.map(u=>u.cluster.start),logical.map(u=>u.cluster.start).sort((a,b)=>a-b));
 const out=anim.animate({order:'logical',transform:u=>({dy:u.index*2})},ctx(3));assert.deepEqual(out.glyphs.map(g=>g.glyphId),run.layout.glyphs.map(g=>g.glyphId));assert.equal(out.diagnostics.some(d=>d.code==='W_PA_GLYPH_CLUSTER_SPLIT'),false);
});

test('existing range/stagger/Keyframes compose without a second timeline and random frames remain exact',async()=>{
 const run=await shaped('日本語','notosansjp','Hani'),anim=createGlyphAnimator(graphics,run),seen=new Map<number,unknown>(),dx=keyframes([{frame:0,value:-5},{frame:11,value:7,easing:'easeInOut'}]);
 for(const frame of [6,0,11,3,6,11,0]){const context=ctx(frame),weights=rangeSelector(anim.units().length,{end:.75,shape:'triangle'},context),out=anim.animate({transform:u=>({dx,dy:(1-stagger(u.index,{delay:.04,duration:.3},context))*20,rotation:weights[u.index]*.1,opacity:.5+.5*weights[u.index]})},context);if(seen.has(frame))assert.deepEqual(out,seen.get(frame));seen.set(frame,out);}
 assert.notDeepEqual(seen.get(0),seen.get(11));
});

test('invalid mapping/space/transform/async callbacks are structured errors and do not poison prepared data',async()=>{
 const run=await shaped('AV');let bad=structuredClone(run);bad.glyphPaths.push(bad.glyphPaths[0]);assert.throws(()=>createGlyphAnimator(graphics,bad),{code:'E_PA_GLYPH_MAPPING'});
 bad=structuredClone(run);bad.glyphPaths[0].glyphIndex=999;assert.throws(()=>createGlyphAnimator(graphics,bad),{code:'E_PA_GLYPH_MAPPING'});
 bad=structuredClone(run);bad.glyphPaths[0].path.coordinates.spaceId='other';assert.throws(()=>createGlyphAnimator(graphics,bad),{code:'E_PA_GLYPH_SPACE'});
 const anim=createGlyphAnimator(graphics,run),original=anim.animate({},ctx(0));
 for(const transform of [()=>({opacity:1.1}),()=>({dx:Infinity}),()=>({bad:0}),async()=>({dx:1}),()=>({anchor:[0]})])assert.throws(()=>anim.animate({transform} as any,ctx(0)),{code:'E_PA_GLYPH_TRANSFORM'});
 assert.throws(()=>anim.animate({unit:'word'} as any,ctx(0)),{code:'E_PA_GLYPH_PARAMETER'});assert.deepEqual(anim.animate({},ctx(0)),original);
});

test('cancellation before and inside a callback yields no partially published drawing and no persistent state',async()=>{
 const anim=createGlyphAnimator(graphics,await shaped('ABC')),signal=new AbortController();signal.abort();assert.throws(()=>anim.animate({signal:signal.signal},ctx(0)),{code:'E_PA_GLYPH_CANCELLED'});
 const live=new AbortController();assert.throws(()=>anim.animate({signal:live.signal,transform:()=>{live.abort();return {}; }},ctx(0)),{code:'E_PA_GLYPH_CANCELLED'});assert.equal(anim.animate({},ctx(0)).glyphs.length,3);
 const empty=await shaped('');assert.deepEqual(createGlyphAnimator(graphics,empty).animate({},ctx(0)).glyphs,[]);
});

test('real experimental axes provenance and warnings survive animation; it does not certify an unaccepted font instance',async()=>{
 const run=await shaped('office','notosans','Latn','ltr',{wght:700}),anim=createGlyphAnimator(graphics,run),out=anim.animate({transform:()=>({rotation:.1})},ctx(5));
 assert.ok(run.diagnostics.some(d=>d.code==='W_PA_FONT_EXPERIMENTAL_AXES'));assert.deepEqual(out.fontInstance,run.fontInstance);assert.deepEqual(out.diagnostics,run.diagnostics);
 assert.deepEqual(out.fontInstance.variations,{wght:700});assert.ok(out.fontInstance.normalizedCoordinates.length>0);
});
