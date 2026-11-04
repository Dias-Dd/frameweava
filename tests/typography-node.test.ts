import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTypography,type TypographyOptions} from '@frameweave/engine/typography/node';
const coordinates={spaceId:'caption',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:640,height:180};
const path='modules/pro-animation/validation/shaping-scene/fonts/notosans.ttf';
const options:TypographyOptions={allowWasm:true,coordinates,fonts:[{id:'body',path}]};
const paragraph={width:560,fontSize:30,x:24,baseline:48};

test('explicit WASM consent and real declared fonts are required',async()=>{
 await assert.rejects(createTypography({...options,allowWasm:false} as any),{code:'E_PACKAGE_PERMISSION'});
 await assert.rejects(createTypography({...options,fonts:[]}),{code:'E_TYPOGRAPHY_FONT'});
 await assert.rejects(createTypography({...options,fonts:[null]} as any),{code:'E_TYPOGRAPHY_FONT'});
 const signal=AbortSignal.abort();await assert.rejects(createTypography({...options,signal}),{code:'E_RENDER_CANCELLED'});
});
test('font source SHA and malformed/duplicate sources reject with cleanup',async()=>{
 await assert.rejects(createTypography({...options,fonts:[{id:'body',path,sha256:'0'.repeat(64)}]}),{code:'E_TYPOGRAPHY_FONT_INTEGRITY'});
 await assert.rejects(createTypography({...options,fonts:[{id:'body',path},{id:'body',path}]}),{code:'E_TYPOGRAPHY_FONT'});
 const bytes=await readFile(path);await assert.rejects(createTypography({...options,fonts:[{id:'body',bytes,source:{kind:'font',resourceId:'body',sha256:'0'.repeat(64),bytes:bytes.length}}]}),{code:'E_TYPOGRAPHY_FONT_INTEGRITY'});
});
test('real Unicode layout and exact meshes repeat without hidden cache or font reinitialization',async()=>{
 const service=await createTypography(options);
 try{const a=await service.prepareParagraph('AV ffi caption',{...paragraph,wrap:'word'}),b=await service.prepareParagraph('AV ffi caption',paragraph);assert.deepEqual(a,b);assert.ok(a.positions.length>0);assert.equal(a.preparation.maxAreaDeviation<=1e-10,true);assert.equal(service.inspect().prepared,2);assert.equal(service.inspect().ownedClients,3);
  const source=a.fontInstances[0].source;assert.equal(source.sha256,createHash('sha256').update(await readFile(path)).digest('hex'));assert.equal(source.bytes,(await readFile(path)).length);
 }finally{await service.dispose();await service.dispose();}
 assert.equal(service.inspect().ownedClients,0);await assert.rejects(service.prepareParagraph('closed',paragraph),{code:'E_TYPOGRAPHY_CLOSED'});
 assert.ok(service.inspect().cleanup.every((r:any)=>r.mode==='cooperative'&&r.remainingSessions===0));
});
test('concurrent calls reject; graceful disposal drains an already-started preparation',async()=>{
 const service=await createTypography(options),work=service.prepareParagraph('Drain the original client',paragraph);
 await assert.rejects(service.prepareParagraph('not concurrent',paragraph),{code:'E_TYPOGRAPHY_BUSY'});const closing=service.dispose();assert.ok((await work).positions.length>0);await closing;assert.equal(service.inspect().ownedClients,0);
});
test('borrowed font remains usable after the borrowing provider closes',async()=>{
 const owner=await createTypography(options);try{const borrower=await createTypography({...options,fonts:[{id:'borrowed',font:owner.font('body')}]});try{assert.ok((await borrower.prepareParagraph('Borrowed font',paragraph)).positions.length>0);assert.equal(borrower.inspect().ownedClients,2);}finally{await borrower.dispose();}assert.ok((await owner.prepareParagraph('Still owned',paragraph)).positions.length>0);}finally{await owner.dispose();}
});
test('pre-cancelled preparation does not publish a result and may be closed safely',async()=>{
 const service=await createTypography(options);try{await assert.rejects(service.prepareParagraph('cancelled',{...paragraph,signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});assert.equal(service.inspect().prepared,0);}finally{await service.dispose();}
});
test('unknown font and unknown paragraph options remain explicit errors',async()=>{
 const service=await createTypography(options);try{await assert.rejects(service.prepareParagraph('font',{...paragraph,font:'missing'}),{code:'E_TYPOGRAPHY_FONT'});await assert.rejects(service.prepareParagraph('options',{...paragraph,silentFallback:true} as any));assert.ok((await service.prepareParagraph('retry',paragraph)).positions.length>0);}finally{await service.dispose();}
});
test('explicit mixed-script font selection and wrapping use the original clients',async()=>{
 const service=await createTypography({...options,fonts:[{id:'cjk',path:'modules/pro-animation/validation/shaping-scene/fonts/notosansjp.ttf'},{id:'arabic',path:'modules/pro-animation/validation/shaping-scene/fonts/notonaskharabic.ttf'}]});
 try{const mesh=await service.prepareParagraph('字幕 سَلَام 42',{...paragraph,font:'cjk',fontForRun:item=>item.script==='Arab'?'arabic':'cjk'});assert.equal(mesh.fontInstances.length,2);assert.ok(mesh.positions.length);const wrap=await service.prepareParagraph('One two three four five',{font:'cjk',width:110,fontSize:24,wrap:'word',overflow:'error'});assert.ok(wrap.layout.lines.length>1);}finally{await service.dispose();}
});
test('active cancellation latches failed clients and releases all owned sessions',async()=>{
 const controller=new AbortController(),service=await createTypography({...options,signal:controller.signal});const pending=service.prepareParagraph('Cancel geometry preparation '.repeat(10),{...paragraph,width:200});queueMicrotask(()=>controller.abort());await assert.rejects(pending,{code:'E_RENDER_CANCELLED'});assert.equal(service.inspect().failed,true);await assert.rejects(service.prepareParagraph('reopen required',paragraph),{code:'E_TYPOGRAPHY_FAILED'});await service.dispose();assert.equal(service.inspect().ownedClients,0);
});
