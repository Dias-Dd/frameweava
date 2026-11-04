import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,access,cp,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gzipSync} from 'node:zlib';
import sharp from 'sharp';
import {fontGlyphResource,type NativeFontGlyphResource} from '../modules/native-gpu/font-image.ts';
import {glyphSvg,rasterGlyph} from '../modules/native-gpu/font-image-raster.ts';
import {decodeFontGlyph} from '../modules/native-gpu/font-image-decode.ts';
import {openFontImages} from '../modules/font-images/codec.ts';
import {NativeResourceImages} from '../modules/native-gpu/resource-images.ts';
import {buildProject} from '../src/compiler/build.ts';
import {linear709,fromHalf,toHalf,surfaceFromPixels} from '../src/media/surface.ts';
const fixtures=resolve('tests/fixtures/font-images');
const source=(more:Partial<NativeFontGlyphResource>={}):NativeFontGlyphResource=>({version:1,id:'font',decode:'font-glyph-v1',faceIndex:0,glyphId:2,format:'sbix',strikeIndex:0,output:{width:8,height:6,format:'rgba32float',alpha:'premultiplied',color:linear709},...more});
test('exact original font face/GID/strike parser returns authentic PNG bytes and errors',async()=>{
 const font=await openFontImages(await readFile(join(fixtures,'sbix.ttf')),0);
 try{for(const strike of [0,1]){const v=font.extract(2,'sbix',strike);assert.equal(v.metadata[6],strike?32:16);assert.deepEqual(v.data,new Uint8Array(await readFile(join(fixtures,'embedded.png'))));}
  assert.throws(()=>font.extract(2,'sbix',9),/strike/);assert.throws(()=>font.extract(9999,'sbix',0),/glyph/);
 }finally{font.close();font.close();}assert.throws(()=>font.extract(2,'sbix',0),{code:'E_NATIVE_FONT_IMAGE_CLOSED'});
 await assert.rejects(openFontImages(Uint8Array.of(0,1,2),0),{code:'E_NATIVE_FONT_IMAGE_FONT'});
});
test('fixed SDK codec rejects a changed executable before loading it',async()=>{
 const base=resolve('artifacts/font-images/codec-integrity');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'case-'));
 await cp(resolve('modules/font-images'),join(dir,'modules/font-images'),{recursive:true});await mkdir(join(dir,'src/core'),{recursive:true});await copyFile(resolve('src/core/errors.ts'),join(dir,'src/core/errors.ts'));
 await appendFile(join(dir,'modules/font-images/runtime/binding.mjs'),'\nthrow Error("UNVERIFIED_EXECUTION");');
 const code=`import {openFontImages} from ${JSON.stringify(pathToFileURL(join(dir,'modules/font-images/codec.ts')).href)};try{await openFontImages(new Uint8Array(),0);process.exitCode=2;}catch(e){if(e.code!=='E_NATIVE_FONT_IMAGE_INTEGRITY')throw e;console.log(e.code);}`;
 const result=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',code],{windowsHide:true,timeout:15000});assert.match(result.stdout,/E_NATIVE_FONT_IMAGE_INTEGRITY/);assert.equal(result.stderr,'');
});
test('SVG shared document is selected by glyph ID, preserving original viewport and gzip',async()=>{
 const frames:Buffer[]=[];
 for(const name of ['svg.ttf','svg-gzip.ttf']){const font=await openFontImages(await readFile(join(fixtures,name)),0);
  try{for(const glyphId of [2,6]){const s=source({format:'svg',glyphId,strikeIndex:0,svg:{viewBox:[0,0,1000,1000]},output:{width:100,height:100,format:'rgba32float',alpha:'straight',color:linear709}});
   const selected=font.extract(glyphId,'svg',0),rgba=await rasterGlyph(selected.data,{format:'svg',glyphId,width:100,height:100,maxBytes:1024**2,svg:{unitsPerEm:1000,viewBox:[0,0,1000,1000]}});
   const raw=(await readFile(join(fixtures,'embedded.svg'),'utf8')).replace(new RegExp('<g id="glyph'+(glyphId===2?6:2)+'">[\\s\\S]*?</g>'),'').replace('<svg ','<svg width="100" height="100" ');
   const expected=await sharp(Buffer.from(raw)).ensureAlpha().raw().toBuffer();assert.deepEqual(rgba,expected);frames.push(rgba);
   assert.equal(rgba[((glyphId===2?45:12)*100+(glyphId===2?65:10))*4+3],0,'unselected glyph cannot leak into the raster');
   const p=await decodeFontGlyph(font,s,1024**2);assert.ok(p.some((v,i)=>i%4===3&&v>0));
  }}finally{font.close();}}
 assert.deepEqual(frames[0],frames[2]);assert.deepEqual(frames[1],frames[3]);
});
test('font requests reject author bytes/path/offset and inconsistent exact selection',()=>{
 assert.equal(fontGlyphResource(source()).faceIndex,0);
 for(const bad of [{path:'secret.ttf'},{offset:0},{bytes:Uint8Array.of(0)},{faceIndex:-1},{strikeIndex:undefined},{format:'unknown'},{foreground:[2,0,0,1]}])assert.throws(()=>fontGlyphResource({...source(),...bad} as any),{code:'E_NATIVE_FONT_IMAGE_SCHEMA'});
 assert.throws(()=>fontGlyphResource(source({format:'svg',svg:{viewBox:[0,0,-1,2]}})),{code:'E_NATIVE_FONT_IMAGE_SCHEMA'});
});
test('static SVG refuses external references, executable content, cycles and configurable budgets',()=>{
 const o={format:'svg' as const,glyphId:2,width:8,height:8,maxBytes:4096,svg:{unitsPerEm:1000,viewBox:[0,0,1000,1000] as const}};
 for(const body of ['<script/>','<foreignObject/>','<image href="https://example.com/x.png"/>','<use href="file:///secret"/>','<path onclick="x()"/>','<path fill="url(https://x)"/>','<style>@import "x";</style>','<g id="a"><g id="b"><use href="#a"/></g></g>']){
  const xml=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g id="glyph2">'+body+'</g></svg>');assert.throws(()=>glyphSvg(xml,o));
 }
 assert.throws(()=>glyphSvg(Buffer.from('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg xmlns="http://www.w3.org/2000/svg" id="glyph2"/>'),o));
 const simple=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" id="glyph2"><g><path d="M0 0L1 1"/></g></svg>');
 assert.throws(()=>glyphSvg(simple,{...o,maxDepth:1}),{code:'E_NATIVE_FONT_IMAGE_BUDGET'});assert.ok(glyphSvg(simple,{...o,maxDepth:10}).length);
 assert.throws(()=>glyphSvg(gzipSync(Buffer.from(' '.repeat(20000))),o),{code:'E_NATIVE_FONT_IMAGE_BUDGET'});
});
test('packed mask and premultiplied BGRA pixels preserve explicit color/Alpha semantics',async()=>{
 const fake=(m:number[],data:Uint8Array)=>({unitsPerEm:1000,extract:()=>({metadata:m,data:Uint8Array.from(data)}),close(){}});
 const s=source({foreground:[1,.25,0,.5],output:{width:3,height:3,format:'rgba32float',alpha:'straight',color:linear709}});
 const metadata=[1,0,0,2,3,3,16,16,0,0,0,0,0,0,0,2,1,1,2],mask=await decodeFontGlyph(fake(metadata,Uint8Array.of(0xab,0)),s,4096);
 assert.deepEqual(Array.from(mask).filter((_,i)=>i%4===3),[.5,0,.5,0,.5,0,.5,.5,0]);
 const bgra=await decodeFontGlyph(fake([1,0,0,2,1,1,16,16,0,0,0,0,0,0,0,1,32,0,4],Uint8Array.of(32,64,128,128)),source({output:{...s.output,width:1,height:1}}),4096);
 assert.deepEqual(Array.from(bgra),[1,.5,.25,Math.fround(128/255)]);
});
test('sealed font admission caches once, preserves F16/F32 values and closes owned resources',async()=>{
 const base=resolve('artifacts/font-images/unit');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'p-'));await copyFile(join(fixtures,'sbix.ttf'),join(dir,'font.ttf'));
 const entry=join(dir,'project.tsx');await writeFile(entry,`import {Composition,Stage,Resource,Layer,ref,linear709} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';export const image=defineNativeStage(init=>({renderAt:()=>init.gpu.importResource({version:1,id:'font',decode:'font-glyph-v1',glyphId:2,format:'sbix',strikeIndex:0,output:{width:8,height:6,format:'rgba32float',alpha:'premultiplied',color:linear709}})}));export default <Composition width={8} height={6} fps={24} durationInFrames={1}><Resource id="font" kind="font" src="./font.ttf"/><Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
 const build=await buildProject(entry),adapter=await NativeResourceImages.create(build,undefined,{allowWasm:true,maxBytes:1024**2});
 try{const file=await adapter.image(source());assert.equal(await adapter.image(source()),file);assert.equal(adapter.stats().fonts,1);assert.equal(adapter.stats().sourceSnapshots,1);
  const bytes=await readFile(join(adapter.lease.directory,file)),actual=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),rgba=await sharp(await readFile(join(fixtures,'embedded.png'))).ensureAlpha().raw().toBuffer();
  for(let i=0;i<actual.length;i++){const a=rgba[i-i%4+3]/255,c=rgba[i]/255,expected=i%4===3?a:(c<=.04045?c/12.92:((c+.055)/1.055)**2.4)*a;assert.ok(Math.abs(actual[i]-expected)<4e-7);}
  const halfFile=await adapter.image(source({output:{...source().output,format:'rgba16float'}})),halfBytes=await readFile(join(adapter.lease.directory,halfFile)),half=new Float32Array(halfBytes.buffer.slice(halfBytes.byteOffset,halfBytes.byteOffset+halfBytes.byteLength));assert.deepEqual(Array.from(half),Array.from(actual,v=>fromHalf(toHalf(v))));
  await assert.rejects(adapter.image(source({id:'undeclared'})),{code:'E_NATIVE_RESOURCE_UNDECLARED'});
  const controller=new AbortController();controller.abort();await assert.rejects(adapter.image(source(),controller.signal),{code:'E_RENDER_CANCELLED'});
  const disabled=await NativeResourceImages.create(build);try{await assert.rejects(disabled.image(source()),{code:'E_PACKAGE_PERMISSION'});}finally{await disabled.close();}
  const small=await NativeResourceImages.create(build,undefined,{allowWasm:true,maxBytes:64});try{await assert.rejects(small.image(source()),{code:'E_NATIVE_RESOURCE_LIMIT'});}finally{await small.close();}
  const asset=build.assets[build.manifest.resources[0].src],backup=await readFile(asset);await writeFile(asset,Buffer.concat([backup,Buffer.from([0])]));const changed=await NativeResourceImages.create(build,undefined,{allowWasm:true});try{await assert.rejects(changed.image(source()),{code:'E_NATIVE_RESOURCE_INTEGRITY'});}finally{await writeFile(asset,backup);await changed.close();}
 }finally{await Promise.all([adapter.close(),adapter.close()]);}assert.equal(adapter.stats().images,0);assert.equal(adapter.stats().fonts,0);await assert.rejects(access(adapter.lease.directory));
});
test('existing sealed float Surface imports retain negative RGB, HDR and Alpha',async()=>{
 const base=resolve('artifacts/font-images/legacy');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'case-'));
 const values=Float32Array.of(2,-.25,4,.5,0,0,0,0);await writeFile(join(dir,'surface.json'),JSON.stringify(surfaceFromPixels(2,1,values,{format:'rgba32float',alpha:'premultiplied',color:linear709})));
 const entry=join(dir,'project.tsx');await writeFile(entry,`import {Composition,Resource,Stage,Layer,ref,linear709} from '@frameweave/engine';import {defineNativeStage} from '@frameweave/engine/native';export const image=defineNativeStage(init=>({renderAt:()=>init.gpu.importResource({version:1,id:'image',decode:'surface-v2',output:{width:2,height:1,format:'rgba32float',alpha:'premultiplied',color:linear709}})}));export default <Composition width={2} height={1} fps={24} durationInFrames={1} background="transparent"><Resource id="image" kind="file" src="./surface.json"/><Stage id="image" factory={image}/><Layer source={ref('image')}/></Composition>;`);
 const adapter=await NativeResourceImages.create(await buildProject(entry));try{const file=await adapter.image({version:1,id:'image',decode:'surface-v2',output:{width:2,height:1,format:'rgba32float',alpha:'premultiplied',color:linear709}}),bytes=await readFile(join(adapter.lease.directory,file));assert.deepEqual(new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),values);}finally{await Promise.all([adapter.close(),adapter.close()]);}
});
