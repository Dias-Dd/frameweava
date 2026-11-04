import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createFontShaper} from '../modules/pro-animation/src/font-shaping.ts';
import {directShapingFactory} from './helpers/pa3-shaping.ts';
const coordinates={spaceId:'canvas',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:640,height:240};
async function options(id='notosans'){
 const records=JSON.parse(await readFile('modules/pro-animation/validation/shaping-scene/font-sources.json','utf8')),record=records.find((r:any)=>r.id===id);
 return {source:{resourceId:id,kind:'font' as const,sha256:record.font.sha256,bytes:record.font.bytes},bytes:new Uint8Array(await readFile(`modules/pro-animation/validation/shaping-scene/fonts/${id}.ttf`)),coordinates};
}

test('verified immutable font produces canonical UTF16 layout and actual curve outlines; original bytes cannot alter it',async()=>{
 const p=await options(),font=await createFontShaper(graphics,directShapingFactory,p);p.bytes.fill(0);
 try{
  const run=await font.shapeRun('AV ffi a\u0301',{script:'Latn',fontSize:40,x:10,baseline:60});assert.equal(run.layout.schema,'frameweave.text-layout');assert.equal(run.layout.fonts[0].source.sha256,p.source.sha256);assert.ok(run.layout.glyphs.length<run.layout.text.length);assert.ok(run.glyphPaths.length>0);assert.ok(run.glyphPaths.some(g=>g.path.commands.some(c=>c.op==='Q'||c.op==='C')));
  for(const g of run.glyphPaths)graphics.validatePathData(g.path);graphics.validateTextLayoutData(run.layout);
  const lig=run.layout.glyphs.find(g=>run.layout.text.slice(g.cluster.start,g.cluster.end)==='ffi');assert.ok(lig);
  run.fontInstance.source.sha256='0'.repeat(64);const second=await font.shapeRun('A',{script:'Latn',fontSize:40});assert.equal(second.layout.fonts[0].source.sha256,p.source.sha256);
  const empty=await font.shapeRun('',{script:'Latn',fontSize:40});assert.deepEqual(empty.layout.glyphs,[]);assert.deepEqual(empty.glyphPaths,[]);
 }finally{assert.deepEqual(await font.dispose(),{mode:'cooperative',remainingSessions:0});}
});

test('explicit Arabic/CJK runs use existing TextLayoutData with logical clusters and visual glyph order',async()=>{
 for(const [id,text,script,language,direction]of [['notonaskharabic','سلام','Arab','ar','rtl'],['notosansjp','日本語','Hani','ja','ltr']] as const){const font=await createFontShaper(graphics,directShapingFactory,await options(id));try{const run=await font.shapeRun(text,{script,language,direction,fontSize:48,x:12,baseline:80});assert.equal(run.layout.paragraphs[0].direction,direction);assert.ok(run.layout.glyphs.every(g=>g.glyphId!==0&&g.cluster.end>g.cluster.start));assert.ok(run.glyphPaths.length>0);if(direction==='rtl')assert.ok(run.layout.glyphs.some((g,i,a)=>i>0&&g.cluster.start<a[i-1].cluster.start));graphics.validateTextLayoutData(run.layout);}finally{await font.dispose();}}
});

test('font resource integrity, unsupported runs, missing glyphs and invalid font axes fail explicitly with reuse',async()=>{
 const p=await options();let created=false;await assert.rejects(createFontShaper(graphics,async x=>{created=true;return directShapingFactory(x);},{...p,source:{...p.source,sha256:'0'.repeat(64)}}),{code:'E_GRAPHICS_INTEGRITY'});assert.equal(created,false);
 for(const variations of [{xxxx:1},{wght:10000}] as Record<string,number>[])await assert.rejects(createFontShaper(graphics,directShapingFactory,{...p,variations}),/axis|variation/i);
 const font=await createFontShaper(graphics,directShapingFactory,p);try{
  for(const text of ['a\nb','a\u202eb','\ud800','\udc00'])await assert.rejects(font.shapeRun(text,{script:'Latn',fontSize:40}),{code:'E_PA_FONT_RUN'});
  await assert.rejects(font.shapeRun('A😀B',{script:'Latn',fontSize:40}),{code:'E_PA_FONT_MISSING_GLYPH'});const missing=await font.shapeRun('A😀B',{script:'Latn',fontSize:40,missingGlyph:'notdef'});assert.equal(missing.diagnostics[0].code,'W_PA_FONT_MISSING_GLYPH');assert.ok(missing.layout.glyphs.some(g=>g.cluster.start===1&&g.cluster.end===3));
  const a=await font.shapeRun('AV',{script:'Latn',fontSize:40}),b=await font.shapeRun('AV',{script:'Latn',fontSize:40,features:{kern:0}});assert.ok(a.layout.glyphs[1].x<b.layout.glyphs[1].x);
 }finally{await font.dispose();}
});

test('fixed font variations affect positioned canonical outlines and remain deterministic across repeated text queries',async()=>{
 const p=await options(),thin=await createFontShaper(graphics,directShapingFactory,{...p,variations:{wght:100}}),bold=await createFontShaper(graphics,directShapingFactory,{...p,variations:{wght:900}});
 try{const a=await thin.shapeRun('AV',{script:'Latn',fontSize:40}),b=await bold.shapeRun('AV',{script:'Latn',fontSize:40});assert.notDeepEqual(a.glyphPaths,b.glyphPaths);assert.deepEqual(a.fontInstance.variations,{wght:100});assert.equal(a.diagnostics[0].code,'W_PA_FONT_EXPERIMENTAL_AXES');assert.ok(a.fontInstance.normalizedCoordinates.every(Number.isFinite));await thin.shapeRun('ffi',{script:'Latn',fontSize:40});assert.deepEqual(await thin.shapeRun('AV',{script:'Latn',fontSize:40}),a);}
 finally{await Promise.all([thin.dispose(),bold.dispose()]);}
});

test('owned font concurrency, cancellation and cleanup errors use the existing Kit lifecycle',async()=>{
 const p=await options(),abort=new AbortController(),font=await createFontShaper(graphics,directShapingFactory,{...p,signal:abort.signal}),pending=font.shapeRun('A',{script:'Latn',fontSize:40});await assert.rejects(font.shapeRun('B',{script:'Latn',fontSize:40}),{code:'E_PA_FONT_BUSY'});await pending;abort.abort();await assert.rejects(font.shapeRun('A',{script:'Latn',fontSize:40}));assert.deepEqual(await font.dispose(),{mode:'terminated'});
 const bad=await createFontShaper(graphics,async options=>{const api=await directShapingFactory(options);return {...api,async reset_results(){await api.reset_results();throw Error('injected shaping cleanup fault');}};},p);await assert.rejects(bad.shapeRun('A',{script:'Latn',fontSize:40}),(e:any)=>e.code==='E_PA_FONT_CLEANUP'&&/injected/.test(e.details.cleanup.message));assert.deepEqual(await bad.dispose(),{mode:'terminated'});
});

test('default-ignorable blank marker acceptance never hides a non-space zero-advance missing outline',async()=>{
 const p=await options(),text='a\u0327\u0301\u200d',normal=await createFontShaper(graphics,directShapingFactory,p);let markId:number;
 try{const run=await normal.shapeRun(text,{script:'Latn',fontSize:48}),mark=run.layout.glyphs.find((g,i)=>g.advanceX===0&&run.glyphPaths.some(p=>p.glyphIndex===i));assert.ok(mark);markId=mark.glyphId;assert.ok(markId>0);assert.equal(run.glyphPaths.length,2);assert.ok(run.layout.glyphs.some(g=>g.advanceX===0&&!run.glyphPaths.some(p=>p.glyphIndex===run.layout.glyphs.indexOf(g))));}
 finally{await normal.dispose();}
 // Real shaping/outline pipeline, with one actual non-space mark's outline deliberately unavailable.
 const checked=await createFontShaper(graphics,async o=>{const kernel=await directShapingFactory(o);return {...kernel,outline_glyph:async(gid:number)=>gid===markId?0:kernel.outline_glyph(gid)};},p);
 try{await assert.rejects(checked.shapeRun(text,{script:'Latn',fontSize:48}),(e:any)=>e.code==='E_PA_FONT_OUTLINE'&&e.details.glyphId===markId);assert.ok((await checked.shapeRun('AV',{script:'Latn',fontSize:48})).glyphPaths.length>0);}
 finally{await checked.dispose();}
});
