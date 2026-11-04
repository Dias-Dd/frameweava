import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {directShapingFactory} from './helpers/pa3-shaping.ts';
async function font(api:any,id:string){const bytes=await readFile(`modules/pro-animation/validation/shaping-scene/fonts/${id}.ttf`),records=JSON.parse(await readFile('modules/pro-animation/validation/shaping-scene/font-sources.json','utf8')),record=records.find((r:any)=>r.id===id);assert.equal(createHash('sha256').update(bytes).digest('hex'),record.font.sha256);await api.begin_font();for(let start=0;start<bytes.length;start+=262144)await api.append_font(new Uint8Array(bytes.subarray(start,start+262144)));return api.finish_font(0);}
async function shape(api:any,text:string,script='Latn',language='en',direction=0,features=''){const n=await api.shape_run(text,direction,script,language,features),flat=await api.read_glyphs(0,n);assert.ok(flat instanceof Float64Array);assert.equal(flat.length,n*6);return Array.from({length:n},(_,i)=>Array.from(flat.subarray(i*6,i*6+6)) as number[]);}

test('real HarfRust WASM: Latin kerning/ligatures and UTF16 clusters derive from pinned font data',async()=>{
 const api=await directShapingFactory();try{
  assert.equal(await font(api,'notosans'),1000);const av=await shape(api,'AV'),un=await shape(api,'AV','Latn','en',0,'kern=0');assert.ok(av.reduce((s,r)=>s+r[2],0)<un.reduce((s,r)=>s+r[2],0));
  const lig=await shape(api,'ffi'),separate=await shape(api,'ffi','Latn','en',0,'liga=0');assert.equal(lig.length,1);assert.equal(separate.length,3);assert.equal(lig[0][1],0);
  const mark=await shape(api,'a\u0301');assert.ok(mark.length<=2);assert.ok(mark.every(r=>r[1]===0));const surrogate=await shape(api,'A😀B');assert.deepEqual([...new Set(surrogate.map(r=>r[1]))],[0,1,3]);assert.ok(surrogate.some(r=>r[0]===0),'Missing emoji must remain observable as .notdef, not invented fallback');
 }finally{assert.deepEqual(await api.dispose(),{remainingSessions:0});}
});

test('real HarfRust WASM shapes an explicit RTL Arabic run and real CJK glyphs without claiming paragraph bidi',async()=>{
 const api=await directShapingFactory();try{
  await font(api,'notonaskharabic');const arabic=await shape(api,'سلام','Arab','ar',1);assert.ok(arabic.length>0&&arabic.every(r=>r[0]!==0));assert.ok(arabic.some((r,i)=>i>0&&r[1]<arabic[i-1][1]));
  await font(api,'notosansjp');const jp=await shape(api,'日本語','Hani','ja');assert.equal(jp.length,3);assert.ok(jp.every(r=>r[0]!==0&&r[2]>0));assert.deepEqual(jp.map(r=>r[1]),[0,1,2]);
 }finally{await api.dispose();}
});

test('same actual font instance provides variation-aware outlines; malformed data/indices/errors are observable',async()=>{
 const api=await directShapingFactory();try{
  await font(api,'notosans');const glyph=(await shape(api,'A'))[0][0];await api.set_variations('wght=100');let n=await api.outline_glyph(glyph);assert.ok(n>0);const thin=await api.read_outline(0,n);await api.set_variations('wght=900');n=await api.outline_glyph(glyph);const bold=await api.read_outline(0,n);assert.notDeepEqual(thin,bold);
  await api.set_variations('');assert.ok((await shape(api,'A'))[0][0]>0);await assert.rejects(api.outline_glyph(0xffffffff),/glyph index/i);await assert.rejects(api.shape_run('text',8,'Latn','en',''),/direction/i);await assert.rejects(api.shape_run('text',0,'bad','en',''),/script/i);
  await api.begin_font();await api.append_font(new Uint8Array([0,1,2]));await assert.rejects(api.finish_font(0),/font|parse/i);await font(api,'notosans');assert.ok((await shape(api,'A'))[0][0]>0);
  await writeFile('.frameweave/pa3-shaping/kernel-smoke.json',JSON.stringify({backend:'real HarfRust0.15/Skrifa0.49 WASM official Kit direct',fontSource:'font-source-receipt.json',diagnostics:await api.diagnostics(),claims:['Latin kerning/ligature','UTF16 cluster offsets','explicit Arabic RTL run','real CJK glyphs','same-model variable glyph outlines'],notClaimed:['paragraph bidi','professional HDR raster/Stage','independent native HarfBuzz equivalence','public R1 release']},null,2));
 }finally{await api.dispose();}
});
