import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../modules/pro-animation/src/typography/fonts.ts';
import {typesettingServices} from './helpers/pa3-typesetting.ts';
import {readFile} from 'node:fs/promises';
import {directFontMetadataFactory} from './helpers/pa3-font-metadata.ts';
import sources from '../modules/pro-animation/validation/bidi-scene/font-sources.json';
import {layoutParagraph} from '../modules/pro-animation/src/text-layout/layout.ts';
import {createParagraphIndex} from '../modules/pro-animation/src/text-layout/queries.ts';
let services:Awaited<ReturnType<typeof typesettingServices>>;
before(async()=>{services=await typesettingServices();});
after(async()=>{const c=await services?.dispose();if(c){assert.equal(c.text.mode,'cooperative');assert.ok(c.fonts.every(f=>f.mode==='cooperative'&&f.remainingSessions===0));}});
test('real original Skrifa metrics/axes preserve declared resource/instance and immutable metadata',async()=>{
 const font=services.fonts.get('notosans')!,m=await f.readFontMetrics(font),axes=await f.readFontAxes(font);assert.equal(m.unitsPerEm,font.unitsPerEm);assert.ok(m.ascent>0&&m.descent<0&&m.glyphCount>1000);assert.ok(m.underline);assert.ok(axes.some(a=>a.tag==='wght'));assert.ok(Object.isFrozen(m));assert.ok(Object.isFrozen(axes));assert.match(font.instance.source.sha256!,/^[a-f0-9]{64}$/);assert.equal(await f.readFontMetrics(font),m);
});
test('original cmap reports real missing characters, duplicate order and scalar errors without pretending to shape',async()=>{
 const font=services.fonts.get('notosans')!,a=await f.mapFontCharacters(font,[65,0x65e5,65,0x10ffff]);assert.ok(a[0].glyphId!>0);assert.equal(a[1].glyphId,null);assert.deepEqual(a[0],a[2]);assert.equal(a[3].glyphId,null);const report=await f.fontCoverageReport(font,'A日😀');assert.equal(report.kind,'nominal-cmap-observation');assert.equal(report.nominallyCovered,false);assert.equal(report.shapingRequired,true);assert.equal(report.characters.at(-1)!.end,4);await assert.rejects(f.mapFontCharacters(font,[0xd800]),{code:'E_PA_FONT_INSPECTION'});
});
test('UVS absence is distinct from mapping a base glyph; unknown/non-variation selectors fail',async()=>{
 const font=services.fonts.get('notosans')!,a=await f.mapFontVariationSequences(font,[{codepoint:65,selector:0xfe0f}]);assert.equal(a[0].status,'missing');assert.equal(a[0].glyphId,null);await assert.rejects(f.mapFontVariationSequences(font,[{codepoint:65,selector:65}]),{code:'E_PA_FONT_INSPECTION'});
});
test('glyph metrics agree with original unkerned shape advances and expose font control bounds separately',async()=>{
 const font=services.fonts.get('notosans')!,run=await font.shapeRun('AV ',{script:'Latn',fontSize:1000,features:{kern:0}}),glyphs=run.layout.glyphs,metrics=await f.readGlyphMetrics(font,glyphs.map(g=>g.glyphId));for(const [i,g]of glyphs.entries())assert.equal(metrics[i].advance!*1000/font.unitsPerEm,g.advanceX);assert.ok(metrics[0].bounds);await assert.rejects(f.readGlyphMetrics(font,[0xffffffff]),/E_PA_FONT_GLYPH/);
});
test('AVAR-aware location resolution does not mutate fixed shaping instance or earlier results',async()=>{
 const font=services.fonts.get('notosans')!,before=structuredClone(font.instance),a=await f.resolveFontLocation(font,{wght:700}),b=await f.resolveFontLocation(font,{});assert.ok(a.some(v=>v!==0));assert.ok(b.every(v=>v===0));assert.deepEqual(font.instance,before);await assert.rejects(f.resolveFontLocation(font,{NOPE:1}),/unknown font axis/);await assert.rejects(f.resolveFontLocation(font,{wght:1e9}),/outside axis range/);
});
test('real font line/decor metrics and original HarfRust kern feature differential have explicit units',async()=>{
 const font=services.fonts.get('notosans')!,m=await f.readFontMetrics(font),box=f.fontLineBox(m,32,60);assert.ok(box.top<60&&box.bottom>60&&box.height>32);assert.ok(f.fontDecoration(m,32,60)!.top>60);assert.ok(f.fontDecoration(m,32,60,'strikeout')!.top<60);const k=await f.measureFontKerning(font,'AV',{script:'Latn',fontSize:32});assert.ok(k.delta<0);assert.equal(k.delta,k.withKerning-k.withoutKerning);
});
test('whole-script fallback uses actual shaping and yields contextual paragraph source mapping without OS fonts',async()=>{
 const plan=await f.prepareFontFallback('AV ffi אב 123. 日本語 سَلَام',{itemizer:services.itemizer,candidates:services.candidates,fontSize:28}),p=await layoutParagraph(plan.source,{itemizer:services.itemizer,font:plan.font,fontForRun:plan.fontForRun,scriptForRun:plan.scriptForRun,width:310,fontSize:28,lineHeight:40}),index=createParagraphIndex(p);assert.equal(index.source.layout.fonts.length,4);assert.ok(plan.report.some(r=>r.candidateIndex!==0));assert.ok(index.clusters.some(c=>c.text==='ffi'));assert.ok(index.clusters.some(c=>c.runDirection==='rtl'));await assert.rejects(f.chooseFontForRun([services.fonts.get('notosans')!],'日本語',{script:'Hani',fontSize:28}),{code:'E_PA_FONT_FALLBACK'});
});
test('pre-cancelled queries are observable and do not dispose borrowed reusable font',async()=>{
 const font=services.fonts.get('notosans')!;await assert.rejects(f.readFontMetrics(font,{signal:AbortSignal.abort()}),{code:'E_PA_FONT_QUERY_CANCELLED'});assert.ok((await f.readFontMetrics(font)).unitsPerEm>0);await assert.rejects(f.mapFontCharacters({} as any,[65]),{code:'E_PA_FONT_INSPECTION'});
});

test('real NotoJP UVS default and variant mappings match fixed original font table values',async()=>{
 const font=services.fonts.get('notosansjp')!,result=await f.mapFontVariationSequences(font,[{codepoint:12289,selector:65024},{codepoint:20398,selector:65024}]),base=await f.mapFontCharacters(font,[12289]);assert.equal(result[0].status,'default');assert.equal(result[0].glyphId,base[0].glyphId);assert.equal(result[1].status,'variant');assert.equal(result[1].glyphId,15189);
});
test('owned client rejects concurrent calls, cleans pending query disposal and authenticates bytes before loading',async()=>{
 const font=services.fonts.get('notosans')!,pending=f.readFontMetrics(font),busy=assert.rejects(f.readFontAxes(font),{code:'E_PA_FONT_BUSY'});await pending;await busy;
 const source=sources.find(s=>s.id==='notosans')!,bytes=await readFile('modules/pro-animation/validation/bidi-scene/'+source.asset),options={bytes,coordinates:{spaceId:'test',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:720,height:400},source:{resourceId:source.id,kind:'font' as const,sha256:source.font.sha256,bytes:source.font.bytes}};
 const own=await f.createFontInspector(directFontMetadataFactory,options),late=f.readFontMetrics(own),rejected=assert.rejects(late,{code:'E_PA_FONT_CLOSED'}),cleanup=await own.dispose();await rejected;assert.equal(cleanup.mode,'cooperative');if(cleanup.mode==='cooperative')assert.equal(cleanup.remainingSessions,0);await assert.rejects(f.readFontMetrics(own),{code:'E_PA_FONT_CLOSED'});
 await assert.rejects(f.createFontInspector(directFontMetadataFactory,{...options,source:{...options.source,sha256:'0'.repeat(64)}}),{code:'E_GRAPHICS_INTEGRITY'});
 assert.throws(()=>f.fontLineBox({...awaitableMetrics(),unitsPerEm:0},32,40),{code:'E_PA_FONT_INSPECTION'});
 function awaitableMetrics(){return {unitsPerEm:0,glyphCount:1,monospace:false,italicAngle:0,ascent:1,descent:-1,leading:0,capHeight:null,xHeight:null,averageWidth:null,maxWidth:null,underline:null,strikeout:null,bounds:null};}
});
