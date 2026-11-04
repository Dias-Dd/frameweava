import {test} from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {buildProject,engineRoot} from '../src/compiler/build.ts';
import {Renderer} from '../src/render/renderer.ts';
import {surfaceFromPixels,pixelsFromSurface,toHalf,fromHalf,acescg,linear709,linear2020,srgb,pq2020,hlg2020} from '../src/media/surface.ts';
import {pqEncode,pqDecode,transformSurface,parseCube,applyCube} from '../src/media/color.ts';
import {compositeMedia} from '../src/media/compositor.ts';
import {assertProfessionalRuntime} from '../src/media/stage.ts';
import {dimensions} from '../modules/gpu-effects/parameters.ts';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {ProfessionalVideoEncoder} from '../src/media/encoding.ts';

test('binary16 known patterns, negative/extended range, alpha, padding and malformed descriptors',()=>{
  for(const [v,h]of [[0,0],[1,0x3c00],[-2,0xc000],[65504,0x7bff],[2**-24,1],[2**-14,0x400],[1+2**-11,0x3c00],[1+3*2**-11,0x3c02]]){assert.equal(toHalf(v),h);assert.equal(fromHalf(h),v===1+2**-11?1:v===1+3*2**-11?1+2**-9:v);}
  const s=surfaceFromPixels(2,1,[-.25,4,.18,.25,2,-1,0,1],{color:acescg,rowStride:24});assert.equal(s.rowStride,24);assert.equal(pixelsFromSurface(s)[0],-.25);assert.equal(pixelsFromSurface(s)[4],2);
  assert.throws(()=>surfaceFromPixels(1,1,[NaN,0,0,1],{color:acescg}),{code:'E_MEDIA_RANGE'});
  assert.throws(()=>pixelsFromSurface({...s,format:'yuv420p12le' as any}),{code:'E_MEDIA_FORMAT'});assert.throws(()=>pixelsFromSurface({...s,storage:{...s.storage,data:s.storage.data.slice(1)}}),{code:'E_MEDIA_BYTES'});
  assert.throws(()=>surfaceFromPixels(1,1,[0,0,0,.5],{format:'rgb10a2unorm',color:srgb,alpha:'opaque'}),{code:'E_MEDIA_ALPHA'});
});
test('Surface v2 handshake refuses older hosts; GPU budget remains opt-in',()=>{
 assert.throws(()=>assertProfessionalRuntime({} as any),{code:'E_MEDIA_RUNTIME_VERSION'});
 assert.throws(()=>assertProfessionalRuntime({media:{surfaceSchema:'frameweave.surface/2'}} as any),{code:'E_MEDIA_RUNTIME_VERSION'});
 assertProfessionalRuntime({media:{surfaceSchema:'frameweave.surface/2',transports:['cpu-inline']}} as any);
 assert.throws(()=>dimensions(3840,2160),/E_GPU_SIZE/);assert.doesNotThrow(()=>dimensions(3840,2160,3840*2160));
});
test('TIFF refuses a second frame instead of reporting a silently truncated video',async()=>{
 const parent=join(engineRoot,'artifacts/professional-media');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'tiff-count-'));
 const encoder=await ProfessionalVideoEncoder.create(join(directory,'still.tiff'),{preset:'tiff16',width:2,height:2,fps:{num:24,den:1},outputColor:srgb,conversion:{kind:'colorimetric',clip:false},alpha:{mode:'preserve'}});
 const s=surfaceFromPixels(2,2,Array.from({length:16},(_,i)=>i%4===3?1:.25),{color:linear709});
 try{await encoder.write(s);await assert.rejects(encoder.write(s),{code:'E_MEDIA_FRAME_COUNT'});assert.equal((await encoder.finish()).frames,1);}finally{await encoder.abort();}
});
test('the same real Stage DAG evaluates data-only ports without fabricating image outputs',async()=>{
 const parent=join(engineRoot,'artifacts/professional-media');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'data-only-'));
 await writeFile(join(directory,'stage.ts'),`import {defineMediaStage} from '@frameweave/engine/native';export const a=defineMediaStage<{}, {}, {count:number}>(()=>({renderAt(t){return {count:t.frame+2}}}));export const b=defineMediaStage<{count:number}, {}, {result:{count:number;kind:string}}>(()=>({renderAt(_t,input){return {result:{count:input.count*3,kind:'analysis-data'}}}}));`);
 await writeFile(join(directory,'project.tsx'),`import {Composition,Stage,ref} from '@frameweave/engine';export default <Composition width={8} height={8} fps={24} durationInFrames={4}><Stage id="a" entry="./stage.ts" exportName="a" outputs={{count:'number'}}/><Stage id="b" entry="./stage.ts" exportName="b" inputs={{count:ref('a','count')}} inputTypes={{count:'number'}} outputs={{result:'json'}}/></Composition>;`);
 const renderer=await Renderer.create(await buildProject(join(directory,'project.tsx')));
 try{for(const f of [3,0,3]){const result=await renderer.evaluateFrame(f);assert.deepEqual(result.stageOutputs.b,{result:{count:(f+2)*3,kind:'analysis-data'}});assert.equal(Object.hasOwn(result.stageOutputs.a,'surface'),false);}}
 finally{await renderer.close();}
});
test('malformed professional output retains its format error and Stage/frame location',async()=>{
 const parent=join(engineRoot,'artifacts/professional-media');await mkdir(parent,{recursive:true});const directory=await mkdtemp(join(parent,'malformed-'));
 await writeFile(join(directory,'stage.ts'),`import {defineMediaStage,surfaceFromPixels,linear709} from '@frameweave/engine/native';export default defineMediaStage(()=>({renderAt(){const surface=surfaceFromPixels(1,1,[0,0,0,1],{color:linear709});surface.rowStride=1;return {surface}}}));`);
 await writeFile(join(directory,'project.tsx'),`import {Composition,Stage} from '@frameweave/engine';export default <Composition width={1} height={1} fps={24} durationInFrames={2}><Stage id="broken" entry="./stage.ts" outputs={{surface:'surface'}}/></Composition>;`);
 const renderer=await Renderer.create(await buildProject(join(directory,'project.tsx')));try{await assert.rejects(renderer.evaluateFrame(1),e=>(e as any).code==='E_MEDIA_LAYOUT'&&(e as any).stageId==='broken'&&(e as any).frame===1);}finally{await renderer.close();}
});
test('linear Source-over, Add, Multiply, Screen, mask, and isolated group opacity retain float values',()=>{
 const r=surfaceFromPixels(1,1,[4,0,0,1],{color:linear709}),b=surfaceFromPixels(1,1,[0,0,2,1],{color:linear709});
 const base={width:1,height:1,compositionWidth:1,compositionHeight:1,background:'transparent',surfaces:{r,b},sizes:{},workingColor:linear709,frame:0};
 const leaf=(id:string,source:string,parent?:string)=>({id,start:0,end:1,source:{$ref:source,port:''},parent});const surfaces={'r:':r,'b:':b};
 const isolated=pixelsFromSurface(compositeMedia({...base,surfaces,layers:[{id:'g',start:0,end:1,opacity:.5},leaf('a','r','g'),leaf('b','b','g')]}));
 const individual=pixelsFromSurface(compositeMedia({...base,surfaces,layers:[{...leaf('a','r'),opacity:.5},{...leaf('b','b'),opacity:.5}]}));
 assert.deepEqual([...isolated],[0,0,1,.5]);assert.deepEqual([...individual],[1,0,1,.75]);
 const added=pixelsFromSurface(compositeMedia({...base,surfaces,layers:[leaf('a','r'),{...leaf('b','b'),blend:'lighter'}]}));assert.deepEqual([...added],[4,0,2,1]);
 for(const blend of ['multiply','screen'] as const){const p=pixelsFromSurface(compositeMedia({...base,surfaces,layers:[leaf('a','r'),{...leaf('b','b'),blend}]}));assert.deepEqual([...p],blend==='multiply'?[0,0,0,1]:[4,0,2,1]);}
 const mask=surfaceFromPixels(1,1,[0,0,0,.25],{color:linear709});const masked=pixelsFromSurface(compositeMedia({...base,surfaces:{...surfaces,'m:':mask},layers:[{...leaf('a','r'),mask:{$ref:'m',port:''}}]}));assert.deepEqual([...masked],[1,0,0,.25]);
});
test('PQ absolute reference, gamut/white adaptation roundtrip, HLG display OOTF, LUT and alpha edges',()=>{
 assert.ok(Math.abs(pqEncode(100)-.508078421517399)<1e-10);assert.ok(Math.abs(pqDecode(pqEncode(1000))-1000)<1e-7);
 for(const color of [acescg,linear2020,srgb,pq2020,hlg2020]){
  const s=surfaceFromPixels(2,1,[.18,.2,.15,.5,1,1,1,1],{format:'rgba32float',color:linear709});const a=transformSurface(s,color).surface,b=transformSurface(a,linear709).surface,p=pixelsFromSurface(b);assert.ok(Math.abs(p[0]-.18)<2e-5,JSON.stringify(color));assert.equal(p[3],.5);
 }
 const lut=parseCube('LUT_1D_SIZE 2\n0 0 0\n1 1 1');assert.deepEqual([...applyCube(new Float32Array([.2,.4,.8,.25]),lut)],[...new Float32Array([.2,.4,.8,.25])]);
 let cube='LUT_3D_SIZE 2\n';for(let b=0;b<2;b++)for(let g=0;g<2;g++)for(let r=0;r<2;r++)cube+=`${r} ${g} ${b}\n`;
 const values=new Float32Array([.1,.6,.9,.3]);assert.deepEqual(applyCube(values,parseCube(cube)),values);assert.throws(()=>applyCube(new Float32Array([2,0,0,1]),lut),{code:'E_MEDIA_LUT_DOMAIN'});
 assert.throws(()=>pqEncode(-1),{code:'E_MEDIA_RANGE'});
});
test('real isolated Web Stage DAG carries RGBA16F without PNG quantization, random access and explicit preview',async()=>{
 const build=await buildProject(join(engineRoot,'examples/professional-media/project.tsx')),renderer=await Renderer.create(build,{media:{workingColor:acescg,preview:{color:srgb,clip:true}}});
 try{
  const first=await renderer.renderMediaFrame(0,'exposure'),p=pixelsFromSurface(first.surface);assert.equal(first.surface.format,'rgba16float');assert.equal(p[0],-.25);assert.ok(p[4*127]>7);assert.deepEqual([p[3],p[4*32+3],p[4*64+3],p[4*127+3]],[0,.25,.5,1]);
  await renderer.renderMediaFrame(5);const again=await renderer.renderMediaFrame(0,'exposure');assert.equal(again.surface.storage.data,first.surface.storage.data);
  const composed=await renderer.renderMediaFrame(0);assert.equal(composed.surface.format,'rgba32float');assert.ok(Math.max(...pixelsFromSurface(composed.surface))>1);
  const preview=await renderer.renderFrame(0);assert.equal(preview.png[0],137);
 }finally{await renderer.close();await renderer.close();}
});
