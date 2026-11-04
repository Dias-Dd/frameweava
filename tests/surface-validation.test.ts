import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertSurfaceSampleRange} from '../src/render/surface-validation.ts';
import {pixelsFromSurface,encodeBytes,srgb,linear709,surfaceFromPixels,type ProfessionalSurface,type AlphaMode} from '../src/media/surface.ts';
import {ownSurfaceBytes} from '../src/media/surface-storage.ts';

function fixture(width:number,height:number,alpha:AlphaMode,stride=width*4,deferred=true){
  const bytes=new Uint8Array(stride*height);for(let i=0;i<bytes.length;i++)bytes[i]=(i*197+37)%256;
  if(alpha==='opaque')for(let y=0;y<height;y++)for(let x=0;x<width;x++)bytes[y*stride+x*4+3]=255;
  const surface:ProfessionalSurface={kind:'surface',schemaVersion:'frameweave.surface/2',format:'rgba8unorm',width,height,rowStride:stride,bitDepth:8,numericRange:'unorm',color:{...srgb},alpha,storage:{location:'cpu-inline',encoding:'base64',byteOrder:'little-endian',ownership:'value',lifetime:'frame',data:deferred?'':encodeBytes(bytes)}};
  if(deferred)ownSurfaceBytes(surface,bytes,encodeBytes);return {surface,bytes};
}
function result(run:()=>unknown){try{run();return {ok:true};}catch(e){return {ok:false,code:(e as any).code,message:(e as Error).message};}}
const same=(s:ProfessionalSurface)=>assert.deepEqual(result(()=>assertSurfaceSampleRange(s)),result(()=>pixelsFromSurface(s)));

test('RGBA8 all byte patterns, Alpha modes, private/inline bytes and padding agree with Float reference',()=>{
  for(const deferred of [false,true])for(const alpha of ['straight','premultiplied','opaque'] as const)for(const [w,h,padding]of [[1,1,0],[64,1,4],[17,9,12],[256,1,0]]){
    const {surface,bytes}=fixture(w,h,alpha,w*4+padding,deferred);same(surface);
    if(deferred&&alpha==='opaque'){bytes[(h-1)*surface.rowStride+(w-1)*4+3]=254;same(surface);}
  }
});

test('RGBA8 malformed descriptors/storage and opaque Alpha preserve errors without masking failures',()=>{
  const changes:((s:ProfessionalSurface)=>void)[]=[s=>s.rowStride--,s=>s.bitDepth=16,s=>s.numericRange='extended',s=>s.color.transfer='invalid' as any,s=>s.storage.data='!',s=>s.storage.data='',s=>s.alpha='invalid' as any,s=>s.width=0,s=>s.height=16385];
  for(const change of changes){const {surface}=fixture(2,2,'straight');change(surface);same(surface);assert.equal(result(()=>assertSurfaceSampleRange(surface)).ok,false);}
  for(const alpha of [0,1,127,254]){const {surface,bytes}=fixture(2,2,'opaque');bytes[3]=alpha;same(surface);assert.equal(result(()=>assertSurfaceSampleRange(surface)).ok,false);}
});

test('extended float range, negative RGB and non-finite/invalid Alpha keep original validation',()=>{
  for(const format of ['rgba16float','rgba32float'] as const){
    const s=surfaceFromPixels(1,1,new Float32Array([-3,2,12,.5]),{format,color:linear709,deferBase64:true});same(s);
    const bad=structuredClone(s),bytes=new Uint8Array(format==='rgba32float'?16:8),view=new DataView(bytes.buffer);
    if(format==='rgba32float')view.setFloat32(0,NaN,true);else view.setUint16(0,0x7c00,true);
    bad.storage.data=encodeBytes(bytes);same(bad);assert.equal(result(()=>assertSurfaceSampleRange(bad)).ok,false);
  }
});
