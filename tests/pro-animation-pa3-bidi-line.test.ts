import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createTextItemizer} from '../modules/pro-animation/src/text-itemizer.ts';
import {shapeBidiLine} from '../modules/pro-animation/src/bidi-line.ts';
import {directTextFactory} from './helpers/pa3-bidi.ts';
import {bidiFont} from './helpers/pa3-bidi-fonts.ts';
const close=(a:number,b:number,budget=1e-10)=>assert.ok(Math.abs(a-b)<=budget,`${a} vs ${b}; budget ${budget}`);

test('real explicit Latin/Hebrew fonts build canonical mixed-direction layout and world glyph geometry',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans'),hebrew=await bidiFont('notosanshebrew');
 try{
  const text='AV אבג 123 (ffi)',line=await shapeBidiLine(graphics,itemizer,text,{font:latin,fontForRun:r=>r.script==='Hebr'?hebrew:latin,fontSize:48,x:20,baseline:80});
  assert.equal(line.layout.text,text);assert.equal(line.layout.fonts.length,2);assert.equal(line.fontInstances.length,2);assert.ok(line.runs.some(r=>r.item.direction==='rtl'&&r.script==='Hebr'));assert.ok(line.runs.some(r=>r.item.direction==='ltr'&&r.script==='Latn'));assert.ok(line.glyphPaths.length>0);assert.deepEqual(graphics.validateTextLayoutData(line.layout),line.layout);
  assert.ok(line.layout.glyphs.every(g=>text.slice(g.cluster.start,g.cluster.end).length>0));assert.ok(line.layout.glyphs.some(g=>text.slice(g.cluster.start,g.cluster.end)==='ffi'));
  for(const run of line.runs)for(const [local,index]of run.globalGlyphIndices.entries()){assert.equal(line.layout.styles.find(s=>s.id===line.layout.glyphs[index].styleId)!.fontId,run.fontId);assert.ok(line.fontInstances.some(f=>f.fontId===run.fontId));assert.ok(run.localClusters[local].start<run.localClusters[local].end);}
  close(line.advance,line.layout.glyphs.reduce((s,g)=>s+g.advanceX,0));assert.ok(line.glyphPaths.every(p=>p.path.coordinates.unit==='px'));
 }finally{await itemizer.dispose();await Promise.all([latin.dispose(),hebrew.dispose()]);}
});

test('Bidi controls are excluded from shaping while ligature clusters map back across original UTF16 controls',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans');try{
  const text='f\u200ei',line=await shapeBidiLine(graphics,itemizer,text,{font:latin,fontSize:48});assert.equal(line.layout.glyphs.length,1);assert.deepEqual(line.layout.glyphs[0].cluster,{start:0,end:3});assert.deepEqual(line.ignoredRanges,[{start:1,end:2,reason:'bidi-control'}]);assert.equal(line.runs[0].text,'fi');assert.deepEqual(line.runs[0].sourceUnits,[0,2]);
  const empty=await shapeBidiLine(graphics,itemizer,'',{font:latin});assert.equal(empty.advance,0);assert.equal(empty.layout.fonts.length,1);assert.deepEqual(empty.layout.glyphs,[]);assert.deepEqual(graphics.validateTextLayoutData(empty.layout),empty.layout);
  const invisible=await shapeBidiLine(graphics,itemizer,'\u2066\u2069',{font:latin});assert.deepEqual(invisible.layout.glyphs,[]);assert.equal(invisible.ignoredRanges.length,1);
 }finally{await itemizer.dispose();await latin.dispose();}
});

test('Arabic isolate shaping, attached marks and original clusters survive numeric/LTR reordering',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans'),arabic=await bidiFont('notonaskharabic');try{
  const text='ID \u2067سَلَام 42\u2069 end',line=await shapeBidiLine(graphics,itemizer,text,{font:latin,fontForRun:r=>r.script==='Arab'?arabic:latin,fontSize:54,x:5,baseline:90});
  assert.equal(line.layout.text,text);assert.equal(line.layout.fonts.length,2);assert.ok(line.runs.some(r=>r.script==='Arab'&&r.item.direction==='rtl'));assert.ok(line.layout.glyphs.some((g,i,a)=>a.findIndex(x=>x.cluster.start===g.cluster.start&&x.cluster.end===g.cluster.end)!==i));
  assert.ok(line.layout.glyphs.every(g=>!/^\p{Bidi_Control}+$/u.test(text.slice(g.cluster.start,g.cluster.end))));for(const path of line.glyphPaths)graphics.validatePathData(path.path);
  const joined=await shapeBidiLine(graphics,itemizer,'س\u200dلام',{font:arabic,fontSize:54}),unjoined=await shapeBidiLine(graphics,itemizer,'س\u200cلام',{font:arabic,fontSize:54});assert.ok(joined.layout.glyphs.some(g=>g.advanceX===0&&g.advanceY===0));assert.ok(joined.runs.some(r=>r.text.includes('\u200d')));assert.ok(unjoined.runs.some(r=>r.text.includes('\u200c')));assert.notDeepEqual(joined.layout.glyphs.map(g=>g.glyphId),unjoined.layout.glyphs.map(g=>g.glyphId));
 }finally{await itemizer.dispose();await Promise.all([latin.dispose(),arabic.dispose()]);}
});

test('alignment uses natural advance without clipping; repeated queries and immutable input text produce identical paths',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans');try{
  const options={font:latin,fontSize:40,x:10,baseline:70,width:400,align:'right' as const},a=await shapeBidiLine(graphics,itemizer,'AV ffi',options);close(a.origin[0],410-a.advance);close(a.origin[1],70);
  await shapeBidiLine(graphics,itemizer,'other',{font:latin});const b=await shapeBidiLine(graphics,itemizer,'AV ffi',options);assert.deepEqual(a,b);
  const overflow=await shapeBidiLine(graphics,itemizer,'wide text',{font:latin,width:1});assert.ok(overflow.diagnostics.some(d=>d.code==='W_PA_TEXT_LINE_OVERFLOW'));assert.ok(overflow.glyphPaths.length>0);
 }finally{await itemizer.dispose();await latin.dispose();}
});

test('explicit unsupported boundaries/scripts/missing glyphs/cancellation diagnose with source ranges; no automatic fallback',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans');try{
  for(const text of ['a\nb','a\u2028b','a\vb','a\fb'])await assert.rejects(shapeBidiLine(graphics,itemizer,text,{font:latin}),{code:'E_PA_TEXT_LINE_RANGE'});
  await assert.rejects(shapeBidiLine(graphics,itemizer,'a\tb',{font:latin}),{code:'E_PA_TEXT_LINE_TAB'});
  await assert.rejects(shapeBidiLine(graphics,itemizer,'ー',{font:latin}),{code:'E_PA_TEXT_LINE_SCRIPT'});
  await assert.rejects(shapeBidiLine(graphics,itemizer,'א',{font:latin}),error=>{assert.equal((error as any).code,'E_PA_TEXT_LINE_SHAPE');assert.deepEqual((error as any).details.sourceRange,{start:0,end:1});assert.equal((error as any).details.original.code,'E_PA_FONT_MISSING_GLYPH');return true;});
  const abort=new AbortController();abort.abort();await assert.rejects(shapeBidiLine(graphics,itemizer,'a',{font:latin,signal:abort.signal}),{code:'E_PA_TEXT_CANCELLED'});
  for(const p of [{font:latin,fontSize:0},{font:latin,width:-1},{font:latin,align:'guess'},{font:latin,unknown:1}])await assert.rejects(shapeBidiLine(graphics,itemizer,'a',p as any),{code:'E_PA_TEXT_LINE_PARAMETER'});
  assert.ok((await shapeBidiLine(graphics,itemizer,'still works',{font:latin})).glyphPaths.length>0);
 }finally{await itemizer.dispose();await latin.dispose();}
});

test('line captures fonts, selectors, direction and features before asynchronous itemization',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextFactory),latin=await bidiFont('notosans');try{
  const p={font:latin,fontSize:40,features:{liga:1},baseDirection:'ltr' as const},pending=shapeBidiLine(graphics,itemizer,'ffi',p);Reflect.set(p,'font',null);Reflect.set(p,'baseDirection','rtl');p.features.liga=0;
  const line=await pending;assert.equal(line.layout.paragraphs[0].direction,'ltr');assert.equal(line.layout.glyphs.length,1);
 }finally{await itemizer.dispose();await latin.dispose();}
});
