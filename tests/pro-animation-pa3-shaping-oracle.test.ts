import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {directShapingFactory,canonicalOutline} from './helpers/pa3-shaping.ts';

test('real WASM HarfRust matches independent native C HarfBuzz15 glyph IDs/UTF16 clusters/positions for pinned mixed fixtures',{timeout:60000},async()=>{
 const rows:any[]=[];
 for(const [font,text,script,language,direction]of [
  ['notosans','AVATAR office ffi','Latn','en','ltr'],['notosans','a\u0301 é A😀B','Latn','en','ltr'],['notosans','fi fl ffi ffl','Latn','en','ltr'],
  ['notonaskharabic','سلام','Arab','ar','rtl'],['notonaskharabic','السَّلَامُ عَلَيْكُمْ','Arab','ar','rtl'],['notonaskharabic','لا لأ لإ','Arab','ar','rtl'],
  ['notosansjp','日本語、文字。','Hani','ja','ltr'],['notosansjp','ひらがな','Hira','ja','ltr'],['notosansjp','カタカナ','Kana','ja','ltr'],
 ] as const)for(const [features,variations]of [[{},{}],[{kern:0,liga:0},{}],[{},{wght:700}]] as const)rows.push({id:'case.'+rows.length,font,text,script,language,direction,features,variations,fontPath:resolve(`modules/pro-animation/validation/shaping-scene/fonts/${font}.ttf`)});
 const input=resolve('.frameweave/pa3-shaping/oracle-input.json');await writeFile(input,JSON.stringify(rows));
 const exec=promisify(execFile),result=await exec(process.env.FRAMEWEAVE_FONT_ORACLE_PYTHON??resolve('.frameweave/pa3-shaping/python',process.platform==='win32'?'Scripts/python.exe':'bin/python'),[resolve('modules/pro-animation/validation/harfbuzz-oracle.py'),input],{windowsHide:true,maxBuffer:4*1024*1024}),native=JSON.parse(result.stdout);await writeFile('.frameweave/pa3-shaping/native-oracle-raw.json',result.stdout);assert.equal(native.harfbuzz,'15.0.0');
 const api=await directShapingFactory(),proof:any[]=[];let maxOutlineError=0,outlineScalars=0;
 try{for(const row of rows){const bytes=new Uint8Array(await readFile(row.fontPath));await api.begin_font();for(let at=0;at<bytes.length;at+=262144)await api.append_font(bytes.subarray(at,at+262144));const upem=await api.finish_font(0);const settings=(v:Record<string,number>)=>Object.entries(v).map(([k,x])=>`${k}=${x}`).join(',');await api.set_variations(settings(row.variations));const count=await api.shape_run(row.text,row.direction==='rtl'?1:0,row.script,row.language,settings(row.features)),data=await api.read_glyphs(0,count),actual=Array.from({length:count},(_,i)=>Array.from(data.subarray(i*6,i*6+6))),expected=native.rows.find((x:any)=>x.id===row.id);proof.push({id:row.id,upem,count,actual,expected:expected.glyphs});assert.equal(upem,expected.upem);assert.deepEqual(actual,expected.glyphs,row.id+' '+row.text);for(const [id,reference]of (Object.keys(row.variations).length?[]:Object.entries(expected.outlines)) as [string,number[]][]){const length=await api.outline_glyph(Number(id)),outline=canonicalOutline(await api.read_outline(0,length)),canonical=canonicalOutline(reference).map(Math.fround);assert.equal(outline.length,canonical.length,row.id+' outline command count '+id);for(let i=0;i<outline.length;i++){const d=Math.abs(outline[i]-canonical[i]);maxOutlineError=Math.max(maxOutlineError,d);outlineScalars++;assert.ok(d<=1e-4,row.id+' outline '+id+' scalar '+i+' error '+d);}}}}
 finally{await api.dispose();await writeFile('.frameweave/pa3-shaping/native-reference.json',JSON.stringify({oracle:{binding:native.binding,harfbuzz:native.harfbuzz,fontTools:native.fontTools},caseCount:rows.length,completed:proof.length,integerPositionBudget:0,outlineScope:'Default instances only; variable strict experiment runs separately and remains failing where recorded',outlineBudgetFontUnits:1e-4,maxOutlineError,outlineScalars,rows:proof},null,2));}
});
