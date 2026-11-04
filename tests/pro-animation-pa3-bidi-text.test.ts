import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createTextItemizer} from '../modules/pro-animation/src/text-itemizer.ts';
import {shapeBidiText} from '../modules/pro-animation/src/bidi-text.ts';
import {createBidiAnimator} from '../modules/pro-animation/src/bidi-animation.ts';
import {directTextLinesFactory} from './helpers/pa3-text-lines.ts';
import {directTextFactory} from './helpers/pa3-bidi.ts';
import {bidiFont} from './helpers/pa3-bidi-fonts.ts';
const context=(frame:number)=>({frame,time:frame/12,fps:12,globalTime:frame/12} as any);

test('real contextual Unicode16 line retains paragraph direction, embedding and L1 whitespace reset',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory);try{
  const line=await itemizer.analyzeLine('אב 123 abc',{start:3,end:10});assert.equal(line.text,'123 abc');assert.equal(line.paragraphs[0].direction,'rtl');assert.deepEqual(line.visualOrder,[4,5,6,3,0,1,2]);assert.equal((await itemizer.analyze('123 abc')).paragraphs[0].direction,'ltr');
  const embedded=await itemizer.analyzeLine('a\u202bXYZ abc\u202c z',{start:6,end:9});assert.equal(embedded.levels[0],2);assert.equal(embedded.runs[0].level,2);
  const spaces=await itemizer.analyzeLine('a\u202bאב   גד\u202c',{start:2,end:7});assert.equal(spaces.levels[2],1);assert.equal(spaces.lineLevels[2],0);
 }finally{assert.deepEqual(await itemizer.dispose(),{mode:'cooperative',remainingSessions:0});}
});
test('line ranges reject scalar/grapheme/paragraph splits; failed results are cleared and client remains reusable',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),old=await createTextItemizer(graphics,directTextFactory);try{
  for(const [text,start,end]of [['A😀B',2,4],['a\u0301b',1,3],['abc\ndef',0,7]] as const)await assert.rejects(itemizer.analyzeLine(text,{start,end}),/E_PA_TEXT_LINE_(?:RANGE|GRAPHEME)|UTF16/);
  assert.equal((await itemizer.analyze('clean')).text,'clean');await assert.rejects(old.analyzeLine('abc',{start:0,end:3}),{code:'E_PA_TEXT_LINE_KERNEL'});assert.equal((await old.analyze('abc')).text,'abc');
 }finally{await Promise.all([itemizer.dispose(),old.dispose()]);}
});
test('hard multiline Latin/Hebrew/Arabic/CJK uses canonical fonts, global clusters, CRLF and explicit baselines',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),fonts=await Promise.all(['notosans','notosanshebrew','notonaskharabic','notosansjp'].map(bidiFont));try{
  const text='AV ffi\r\n\nשלום 123\u2028سلام\n日本語',result=await shapeBidiText(graphics,itemizer,text,{font:fonts[0],fontForRun:r=>fonts[r.script==='Hebr'?1:r.script==='Arab'?2:['Hani','Hira','Kana'].includes(r.script??'')?3:0],fontSize:32,baseline:45,lineHeight:48,width:600,x:15});
  assert.equal(result.lines.length,5);assert.equal(result.layout.fonts.length,4);assert.deepEqual(result.lines.map(l=>l.baseline),[45,93,141,189,237]);assert.deepEqual(result.lines.map(l=>l.direction),['ltr','ltr','rtl','rtl','ltr']);assert.equal(result.layout.text,text);assert.deepEqual(graphics.validateTextLayoutData(result.layout),result.layout);
  assert.ok(result.ignoredRanges.some(r=>r.reason==='hard-break'&&text.slice(r.start,r.end)==='\r\n'));assert.ok(result.layout.glyphs.some(g=>text.slice(g.cluster.start,g.cluster.end)==='ffi'));
  assert.ok(result.glyphPaths.length>0);for(const path of result.glyphPaths)graphics.validatePathData(path.path);
  const animation=createBidiAnimator(graphics,result);assert.equal(new Set(animation.units().map(u=>u.lineId)).size,4);assert.deepEqual(animation.animate({},context(0)).sourceLayout,result.layout);
  assert.equal(animation.animate({},context(0)).glyphs.length,result.layout.glyphs.length);assert.deepEqual(animation.units().map(u=>u.cluster.start),animation.units().map(u=>u.cluster.start).sort((a,b)=>a-b));
 }finally{await itemizer.dispose();await Promise.all(fonts.map(f=>f.dispose()));}
});
test('caller soft lines keep original RTL base and isolate context; shaping and source mappings are line-local',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),latin=await bidiFont('notosans'),hebrew=await bidiFont('notosanshebrew');try{
  const select=(r:any)=>r.script==='Hebr'?hebrew:latin,text='אב 123 abc',result=await shapeBidiText(graphics,itemizer,text,{font:latin,fontForRun:select,softBreaks:[3],fontSize:32,width:500});
  assert.equal(result.lines.length,2);assert.equal(result.layout.paragraphs.length,1);assert.equal(result.lines[1].direction,'rtl');assert.deepEqual(result.layout.glyphs.filter(g=>g.lineId==='line.1').map(g=>text.slice(g.cluster.start,g.cluster.end)),['a','b','c',' ','1','2','3']);
  const isolated='A\u2067אב 12 גד\u2069 Z',block=await shapeBidiText(graphics,itemizer,isolated,{font:latin,fontForRun:select,softBreaks:[5]});assert.ok(block.runs.some(r=>r.item.start>=5&&r.item.level===2));assert.deepEqual(block.ignoredRanges.filter(r=>r.reason==='bidi-control'),[{start:1,end:2,reason:'bidi-control'},{start:10,end:11,reason:'bidi-control'}]);
  const anim=createBidiAnimator(graphics,block),seen=new Map<number,unknown>();for(const frame of [5,0,11,3,5,11,0]){const draw=anim.animate({transform:u=>({dy:Math.sin(frame+u.index)*2,opacity:.8})},context(frame));if(seen.has(frame))assert.deepEqual(draw,seen.get(frame));seen.set(frame,draw);}assert.notDeepEqual(seen.get(0),seen.get(11));
 }finally{await itemizer.dispose();await Promise.all([latin.dispose(),hebrew.dispose()]);}
});
test('empty and trailing hard lines are retained, no fake glyphs or clipping, explicit overflow remains observable',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),latin=await bidiFont('notosans');try{
  for(const text of ['', '\n','\r\n','A\n','A\u2028']){const block=await shapeBidiText(graphics,itemizer,text,{font:latin});assert.equal(block.lines.length,text===''?1:2);assert.equal(block.lines.at(-1)!.glyphStart,block.lines.at(-1)!.glyphEnd);assert.deepEqual(graphics.validateTextLayoutData(block.layout),block.layout);createBidiAnimator(graphics,block);}
  const overflow=await shapeBidiText(graphics,itemizer,'wide\ntext',{font:latin,width:1});assert.ok(overflow.diagnostics.some(d=>d.code==='W_PA_TEXT_LINE_OVERFLOW'));assert.ok(overflow.glyphPaths.length>0);
 }finally{await itemizer.dispose();await latin.dispose();}
});
test('invalid/manual breaks, source errors and cancellation are structured; failed block does not poison borrowed clients',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),latin=await bidiFont('notosans');try{
  for(const softBreaks of [[0],[4],[2,1],[1,1],[1.5]])await assert.rejects(shapeBidiText(graphics,itemizer,'abcd',{font:latin,softBreaks}),{code:'E_PA_TEXT_BLOCK_BREAK'});
  await assert.rejects(shapeBidiText(graphics,itemizer,'A\r\nB',{font:latin,softBreaks:[2]}),{code:'E_PA_TEXT_BLOCK_BREAK'});
  await assert.rejects(shapeBidiText(graphics,itemizer,'a\u0301b',{font:latin,softBreaks:[1]}),error=>{assert.equal((error as any).code,'E_PA_TEXT_BLOCK_SHAPE');assert.deepEqual((error as any).details.sourceRange,{start:0,end:1});return true;});
  const abort=new AbortController();abort.abort();await assert.rejects(shapeBidiText(graphics,itemizer,'ok',{font:latin,signal:abort.signal}),{code:'E_PA_TEXT_CANCELLED'});
  await assert.rejects(shapeBidiText(graphics,itemizer,'A\nא',{font:latin}),error=>{assert.equal((error as any).code,'E_PA_TEXT_BLOCK_SHAPE');assert.deepEqual((error as any).details.sourceRange,{start:2,end:3});return true;});
  assert.equal((await shapeBidiText(graphics,itemizer,'ok',{font:latin})).layout.text,'ok');
 }finally{await itemizer.dispose();await latin.dispose();}
});
test('multiline controls snapshot before asynchronous itemization and mid-block cancellation publishes no partial layout',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),latin=await bidiFont('notosans');try{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),features={liga:1},softBreaks=[2],options={font:latin,softBreaks,fontSize:32,baseline:40,lineHeight:50,features};
  const gated={analyze:async(...args:Parameters<typeof itemizer.analyze>)=>{await gate;return itemizer.analyze(...args);},analyzeLine:itemizer.analyzeLine};
  const pending=shapeBidiText(graphics,gated,'fi ab',options);features.liga=0;softBreaks[0]=1;options.fontSize=7;options.baseline=99;options.lineHeight=3;release();const result=await pending;
  assert.deepEqual(result.lines.map(l=>l.baseline),[40,90]);assert.deepEqual(result.layout.glyphs[0].cluster,{start:0,end:2});assert.equal(result.layout.styles[0].fontSize,32);
  const abort=new AbortController();await assert.rejects(shapeBidiText(graphics,itemizer,'A\nB',{font:latin,signal:abort.signal,fontForRun:item=>{if(item.start>=2)abort.abort();return latin;}}),{code:'E_PA_TEXT_CANCELLED'});
  assert.equal((await shapeBidiText(graphics,itemizer,'still valid',{font:latin})).layout.text,'still valid');
 }finally{await itemizer.dispose();await latin.dispose();}
});
test('existing canonical paragraph budget is checked before shaping all remaining lines',async()=>{
 const itemizer=await createTextItemizer(graphics,directTextLinesFactory),latin=await bidiFont('notosans');let calls=0;
 try{const counted={shapeRun:(...args:Parameters<typeof latin.shapeRun>)=>{calls++;return latin.shapeRun(...args);}};
  await assert.rejects(shapeBidiText(graphics,itemizer,'a\n'.repeat(1025),{font:counted}),/paragraphs|1024|array/);assert.equal(calls,2,'Only first seed and first real line may shape before canonical preflight');
  assert.equal((await itemizer.analyze('ok')).text,'ok');
 }finally{await itemizer.dispose();await latin.dispose();}
});
