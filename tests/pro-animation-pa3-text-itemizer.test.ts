import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as graphics from '../modules/graphics-contracts/index.ts';
import {createTextItemizer} from '../modules/pro-animation/src/text-itemizer.ts';
import {directTextFactory} from './helpers/pa3-bidi.ts';
const make=(options={})=>createTextItemizer(graphics,directTextFactory,options);

test('original Unicode16 WASM yields mixed L2 order, resolved levels and script spans without reversing source text',async()=>{
 const text='abc אבג 123',client=await make();try{
  const r=await client.analyze(text);assert.equal(r.text,text);assert.equal(r.unicodeVersion,'16.0.0');assert.deepEqual(r.paragraphs,[{start:0,end:11,level:0,direction:'ltr'}]);assert.deepEqual(r.visualOrder,[0,1,2,3,8,9,10,7,6,5,4]);
  assert.ok(r.runs.some(run=>run.script==='Hebr'&&run.direction==='rtl'));assert.ok(r.runs.some(run=>run.script==='Latn'&&run.direction==='ltr'));assert.ok(r.runs.every(run=>run.start<run.end));
  assert.equal((await client.diagnostics()).closed,false);assert.equal(((await client.diagnostics()) as any).kernel.liveSessions,1);
  const changed=await client.analyze('xyz');assert.equal(changed.text,'xyz');assert.equal(r.text,text);assert.deepEqual(r.visualOrder,[0,1,2,3,8,9,10,7,6,5,4]);assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.flags));assert.ok(Object.isFrozen(r.runs[0]));
 }finally{assert.deepEqual(await client.dispose(),{mode:'cooperative',remainingSessions:0});}
});

test('surrogate pairs, combining marks and Script_Extensions preserve original UTF16 and grapheme diagnostics',async()=>{
 const client=await make();try{
  const r=await client.analyze('A😀אב');assert.equal(r.flags.length,5);assert.equal(r.levels[1],r.levels[2]);assert.ok(!r.visualOrder.includes(2));assert.ok(r.runs.every(run=>run.start!==2&&run.end!==2));
  const japanese=await client.analyze('a\u0301 カー');assert.ok(japanese.runs.some(run=>run.script==='Latn'&&run.start===0&&run.end>=2));assert.ok(japanese.runs.some(run=>run.script==='Kana'&&run.end===5));
  const ambiguous=await client.analyze('ー');assert.equal(ambiguous.runs[0].script,null);assert.deepEqual(new Set(ambiguous.runs[0].scriptCandidates),new Set(['Hira','Kana']));assert.ok(ambiguous.diagnostics.some(d=>d.code==='W_PA_TEXT_SCRIPT_AMBIGUOUS'));
  const conflict=await client.analyze('a\u093f');assert.ok(conflict.runs.some(r=>r.scriptConflict));assert.ok(conflict.diagnostics.some(d=>d.code==='W_PA_TEXT_SCRIPT_CONFLICT'));
 }finally{await client.dispose();}
});

test('isolates/overrides remain explicit data; paragraph direction and X9 flags are not fabricated Glyphs',async()=>{
 const client=await make();try{
  const text='A\u2067אב\u2069Z\n日本語',r=await client.analyze(text);assert.equal(r.paragraphs.length,2);assert.ok(r.flags[1]&2);assert.ok(r.flags[4]&2);assert.ok(r.flags[6]&4);assert.equal(r.text,text);assert.ok(r.runs.some(run=>run.paragraph===1&&run.script==='Hani'));
  const override=await client.analyze('\u202Eabc\u202C');assert.ok(override.flags[0]&1);assert.ok(override.flags[4]&1);assert.deepEqual(override.visualOrder,[3,2,1]);
  assert.equal((await client.analyze('אבג')).paragraphs[0].direction,'rtl');assert.equal((await client.analyze('אבג',{baseDirection:'ltr'})).paragraphs[0].direction,'ltr');assert.equal((await client.analyze('abc',{baseDirection:'rtl'})).paragraphs[0].direction,'rtl');
  const empty=await client.analyze('');assert.deepEqual(empty.paragraphs,[]);assert.deepEqual(empty.runs,[]);assert.deepEqual(empty.visualOrder,[]);
 }finally{await client.dispose();}
});

test('large chunks and many paragraphs remain deterministic and keep no previous-query results',async()=>{
 const client=await make();try{
  const text='A אבג 123\n'.repeat(1500),r=await client.analyze(text);assert.equal(r.paragraphs.length,1500);assert.equal(r.flags.length,text.length);assert.ok(r.runs.length>3000);
  for(const source of ['AV אב (12)','日本語 42','سَلَام xyz','AV אב (12)']){const a=await client.analyze(source);await client.analyze('irrelevant');assert.deepEqual(await client.analyze(source),a);}
 }finally{await client.dispose();}
});

test('invalid UTF16/options/budget fail before computation; same client remains usable',async()=>{
 const client=await make();try{
  for(const text of ['\ud800','a\udc00','\ud800x'])await assert.rejects(client.analyze(text),{code:'E_PA_TEXT_UTF16'});
  await assert.rejects(client.analyze(123 as any),{code:'E_PA_TEXT_INPUT'});await assert.rejects(client.analyze('a'.repeat(graphics.LIMITS.string+1)),{code:'E_GRAPHICS_LIMIT'});
  for(const options of [null,[],{baseDirection:'reverse'},{script:'guess'}])await assert.rejects(client.analyze('abc',options as any),{code:'E_PA_TEXT_PARAMETER'});
  assert.equal((await client.analyze('abc')).text,'abc');await client.dispose();await assert.rejects(client.analyze('abc'),{code:'E_PA_TEXT_CLOSED'});assert.equal((await client.diagnostics()).closed,true);assert.equal('kernel' in await client.diagnostics(),false);
 }finally{await client.dispose();}
});

test('existing owned Kit serial operation, pre-cancel, active cancel and initialization cancel are observable',async()=>{
 const client=await make();try{
  const pending=client.analyze('abc אבג'.repeat(1000));await assert.rejects(client.analyze('other'),{code:'E_PA_TEXT_BUSY'});await pending;
  const pre=new AbortController();pre.abort();await assert.rejects(client.analyze('abc',{signal:pre.signal}),{code:'E_PA_TEXT_CANCELLED'});assert.equal((await client.analyze('abc')).text,'abc');
  const active=new AbortController(),query=client.analyze('abc אבג'.repeat(1000),{signal:active.signal});active.abort();await assert.rejects(query,{code:'E_PA_TEXT_CANCELLED'});assert.equal((await client.diagnostics()).closed,true);
 }finally{assert.deepEqual(await client.dispose(),{mode:'terminated'});}
 const initialization=new AbortController(),starting=make({signal:initialization.signal});initialization.abort();await assert.rejects(starting,{code:'E_PA_TEXT_CANCELLED'});
});

test('a genuine kernel with incompatible data version is rejected, cleaned and reused; raw range/state errors remain visible',async()=>{
 let once=true;
 const client=await createTextItemizer(graphics,async options=>{const actual=await directTextFactory(options);return new Proxy(actual,{get(target,name){if(name==='metadata')return async()=>{const m=await actual.metadata();if(once){once=false;m[6]=17;}return m;};return Reflect.get(target,name);}});});
 try{await assert.rejects(client.analyze('abc'),{code:'E_PA_TEXT_OUTPUT'});assert.equal((await client.analyze('abc')).unicodeVersion,'16.0.0');}finally{await client.dispose();}
 const raw=await directTextFactory({signal:new AbortController().signal});try{
  await assert.rejects(raw.metadata(),/E_PA_TEXT_STATE/);await assert.rejects(raw.analyze('abc',99),/E_PA_TEXT_DIRECTION/);await raw.analyze('A😀אב',0);assert.equal((await raw.metadata())[0],5);await assert.rejects(raw.read_runs(999,1),/E_PA_TEXT_RANGE/);await raw.reset_results();await assert.rejects(raw.metadata(),/E_PA_TEXT_STATE/);
 }finally{assert.deepEqual(await raw.dispose(),{remainingSessions:0});}
});

test('captured options retain original cancellation listener across caller mutation',async()=>{
 const client=await make(),original=new AbortController(),other=new AbortController(),options={signal:original.signal,baseDirection:'rtl' as const};
 const query=client.analyze('abc אבג'.repeat(1000),options);options.signal=other.signal;original.abort();
 try{await assert.rejects(query,{code:'E_PA_TEXT_CANCELLED'});}finally{assert.deepEqual(await client.dispose(),{mode:'terminated'});}
});
