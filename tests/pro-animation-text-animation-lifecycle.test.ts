import test from 'node:test';
import assert from 'node:assert/strict';
import type {FrameContext} from '../src/core/types.ts';
import {keyframes} from '../src/core/animation.ts';
import {NativeRecordingScope} from '../modules/native-gpu/scope.ts';
import {createNativeGlyphRenderer,type PreparedGlyphGeometry} from '../modules/pro-animation/src/text-animation/index.ts';
import {prepared} from '../modules/pro-animation/validation/native-text-scene/prepared.ts';
const context:FrameContext={frame:12,time:.5,globalFrame:12,globalTime:.5,dt:1/24,fps:{num:24,den:1},durationInFrames:48,progress:12/47,seed:37};
// Recording/lifetime unit tests only. Actual hardware, pixels and XYZ are verified in the Stage test.
function fixture(){
 const scope=new NativeRecordingScope(),g=scope.api,caps=g.capabilities.bind(g),buffers=new Set<object>(),images=new Set<object>();let gate:Promise<void>|undefined,allocateHook:(()=>void)|undefined,paletteParameters:Float32Array|undefined;
 g.capabilities=()=>({...caps(),hardwareVerified:true,nativeMesh:{version:1,float32Blendable:true,exactAdmission:'session-budget'}});
 for(const key of ['createField','createBuffer'] as const){const original=g[key].bind(g);(g as any)[key]=async(...args:unknown[])=>{const value=await Reflect.apply(original,g,args);buffers.add(value);allocateHook?.();await gate;return value;};}
 const release=g.releaseBuffer.bind(g);g.releaseBuffer=async b=>{await release(b);assert.ok(buffers.delete(b),'one release per owned buffer');};
 for(const key of ['run','drawMesh'] as const){const original=g[key].bind(g);(g as any)[key]=async(...args:unknown[])=>{if(key==='run'&&(args[0] as {info:{id:string}}).info.id.endsWith('coverage-ink'))paletteParameters=new Float32Array((args[2] as {parameters:Float32Array}).parameters);const image=await Reflect.apply(original,g,args);images.add(image);return image;};}
 const imageRelease=g.release.bind(g);g.release=async image=>{await imageRelease(image);assert.ok(images.delete(image),'one release per owned image');};
 return {g,scope,buffers,images,palette:()=>paletteParameters,hold(p:Promise<void>|undefined){gate=p;},hook(fn:(()=>void)|undefined){allocateHook=fn;},renderer:()=>createNativeGlyphRenderer({gpu:g,width:600,height:360})};
}
test('prepared data snapshots and deep-frozen units stay separate from caller-owned draw results',async()=>{
 const f=fixture(),r=f.renderer(),data=structuredClone(prepared[0].mesh),h=await r.prepare(data);assert.equal(f.buffers.size,3);assert.ok(Object.isFrozen(h.units[0].anchor));assert.equal(Reflect.set(h.units[0].anchor,'0',123),false);
 const result=await r.at(context).draw(h);assert.equal(f.buffers.size,3);assert.equal(f.images.size,1);await r.dispose();assert.equal(f.buffers.size,0);assert.equal(f.images.size,1);assert.equal(f.g.stats().disposed,false);await f.g.release(result);assert.equal(f.images.size,0);await r.dispose();await f.g.dispose();
});
test('foreign handles, transform failures and late prepare reject without retiring stable geometry',async()=>{
 const f=fixture(),r=f.renderer(),other=f.renderer(),h=await r.prepare(prepared[0].mesh);await assert.rejects(other.at(context).draw(h),{code:'E_PA_TEXT_ANIMATION'});
 await assert.rejects(r.at(context).draw(h,{transform(){throw Error('authored transform failed');}}),/authored transform failed/);assert.equal(f.buffers.size,3);assert.equal(f.images.size,0);
 const result=await r.at(context).draw(h);await f.g.release(result);await assert.rejects(r.prepare(prepared[0].mesh),{code:'E_PA_TEXT_PREPARE'});await r.dispose();await other.dispose();assert.equal(f.buffers.size,0);await f.g.dispose();
});
test('pre-cancel and cancellation after allocation release temporary data and permit a new draw',async()=>{
 const f=fixture(),r=f.renderer(),h=await r.prepare(prepared[0].mesh),cancel=new AbortController();await assert.rejects(r.at(context).draw(h,{signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});assert.equal(f.buffers.size,3);
 f.hook(()=>cancel.abort());await assert.rejects(r.at(context).draw(h,{signal:cancel.signal}),{code:'E_RENDER_CANCELLED'});f.hook(undefined);assert.equal(f.buffers.size,3);assert.equal(f.images.size,0);
 const result=await r.at(context).draw(h);await f.g.release(result);await r.dispose();assert.equal(f.buffers.size,0);await f.g.dispose();
});
test('dispose waits for blocked preparation and cleans partial initialization',async()=>{
 const f=fixture(),r=f.renderer();let release!:()=>void;f.hold(new Promise<void>(resolve=>{release=resolve;}));const preparing=r.prepare(prepared[0].mesh),rejected=assert.rejects(preparing,{code:'E_PA_TEXT_CLOSED'}),closing=r.dispose();release();await Promise.all([rejected,closing]);assert.equal(f.buffers.size,0);assert.equal(f.images.size,0);assert.equal(f.g.stats().disposed,false);await f.g.dispose();
});
test('empty canonical text records actual transparent output and invalid input has structured diagnostics',async()=>{
 const f=fixture(),r=f.renderer(),original=prepared[0].mesh,empty:PreparedGlyphGeometry={...original,layout:{...original.layout,text:'',paragraphs:[],lines:[],glyphs:[]},units:[],positions:[],vertexUnits:[]},h=await r.prepare(empty);assert.equal(f.buffers.size,0);const image=await r.at(context).draw(h);assert.equal(f.g.stats().runs,1);await f.g.release(image);
 await assert.rejects(r.at(context).draw(h,{ink:[1,1,1,2]}),{code:'E_PA_TEXT_ANIMATION'});await r.dispose();await assert.rejects(r.at(context).draw(h),{code:'E_PA_TEXT_CLOSED'});assert.equal(f.images.size,0);await f.g.dispose();
});
test('inconsistent canonical mappings and Half overflow produce function-specific diagnostics',async()=>{
 const f=fixture(),r=f.renderer(),bad={...prepared[0].mesh,units:prepared[0].mesh.units.map(u=>({...u,index:0}))};
 await assert.rejects(r.prepare(bad),error=>{const e=error as {code:string;message:string};assert.equal(e.code,'E_PA_TEXT_ANIMATION');assert.match(e.message,/createNativeGlyphRenderer.prepare/);return true;});assert.equal(f.buffers.size,0);
 const h=await r.prepare(prepared[0].mesh);await assert.rejects(r.at(context).draw(h,{ink:[1e5,1,1,1],format:'rgba16float'}),error=>{const e=error as {code:string;message:string};assert.equal(e.code,'E_GPU_FLOAT_PRECISION');assert.match(e.message,/createNativeGlyphRenderer.draw/);return true;});assert.equal(f.images.size,0);await r.dispose();assert.equal(f.buffers.size,0);await f.g.dispose();
});
test('frame-bound ink uses existing keyframes before the unchanged GPU palette kernel',async()=>{
 const f=fixture(),r=f.renderer(),h=await r.prepare(prepared[0].mesh),image=await r.at(context).draw(h,{ink:[keyframes([{frame:0,value:0},{frame:24,value:2}]),2,3,.5]});const p=f.palette()!;assert.ok(p);assert.equal(p[0]+p[1],1);assert.equal(p[2]+p[3],2);assert.equal(p[4]+p[5],3);assert.equal(p[6]+p[7],.5);await f.g.release(image);await r.dispose();assert.equal(f.buffers.size,0);await f.g.dispose();
});
