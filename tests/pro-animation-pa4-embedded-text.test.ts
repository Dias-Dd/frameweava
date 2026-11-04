import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {directFontExecutionFactory} from './helpers/pa4-font.ts';
import {createFontExecutionFont} from '../modules/pro-animation/src/font-execution/kernel.ts';
import {prepareEmbeddedFontRun,embeddedBitmapRect} from '../modules/pro-animation/src/font-execution/embedded.ts';
import * as graphics from '../modules/graphics-contracts/index.ts';
const coordinates={spaceId:'stage',unit:'px' as const,origin:'top-left' as const,x:'right' as const,y:'down' as const,width:320,height:160};
async function open(name:string){const bytes=await readFile('docs/pro-animation/font-embedded-validation/fixtures/'+name+'.ttf');return createFontExecutionFont(directFontExecutionFactory,{bytes,coordinates,source:{kind:'font',resourceId:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}});}
test('actual SVG glyph preparation keeps shaped GID, clusters, advance and source identity',async()=>{
 const font=await open('svg');try{const run=await prepareEmbeddedFontRun(font,'A B',{script:'Latn',fontSize:100,x:10,baseline:80,coordinates,source:{format:'svg',viewBox:[0,-800,1000,1000]}});assert.deepEqual(graphics.validateTextLayoutData(run.layout),run.layout);assert.deepEqual(run.layout.glyphs.map(g=>g.glyphId),[2,1,6]);assert.deepEqual(run.layout.glyphs.map(g=>g.x),[10,90,170]);assert.deepEqual(run.embeddedGlyphs.map(g=>g.glyphIndex),[0,2]);assert.deepEqual(run.embeddedGlyphs.map(g=>g.rect),[[10,0,100,100],[170,0,100,100]]);assert.deepEqual(run.embeddedGlyphs[0].rasterSize,[100,100]);assert.equal(run.embeddedGlyphs[0].source.id,'svg');assert.equal(run.embeddedGlyphs[0].source.decode,'font-glyph-v1');assert.equal('bytes'in run.embeddedGlyphs[0],false);assert.equal(run.glyphPaths.length,0);assert.ok(Object.isFrozen(run.embeddedGlyphs));}finally{await font.dispose();}
});
test('actual sbix bottom-left bearings keep original strike raster and shaped advances',async()=>{
 const font=await open('sbix');try{const run=await prepareEmbeddedFontRun(font,'AA',{script:'Latn',fontSize:32,x:10,baseline:60,coordinates,source:{format:'sbix',strikeIndex:1}});assert.deepEqual(run.embeddedGlyphs[0].rasterSize,[8,6]);assert.deepEqual(run.embeddedGlyphs[0].rect,[12,55,8,6]);assert.equal(run.layout.glyphs[1].x,35.6);assert.equal(run.embeddedGlyphs[1].source.glyphId,2);assert.equal(run.embeddedGlyphs[1].source.strikeIndex,1);assert.equal(run.embeddedGlyphs[0].originalMetrics.metricsLocation,'font-default');}finally{await font.dispose();}
});
test('bitmap placement uses separate font/pixel metrics and never flips top-left image rows',()=>{
 const m={width:10,height:6,ppemX:20,ppemY:40,bearingX:100,bearingY:200,innerBearingX:2,innerBearingY:3,origin:'top-left',advance:99,encoding:'mask',maskBitsPerPixel:8,packed:false,metricsLocation:'font-default'} as const;
 assert.deepEqual(embeddedBitmapRect(m,{x:7,y:30},40,1000),[15,19,20,6]);assert.deepEqual(embeddedBitmapRect({...m,origin:'bottom-left'},{x:7,y:30},40,1000),[15,13,20,6]);assert.throws(()=>embeddedBitmapRect({...m,ppemX:0},{x:0,y:0},40,1000),{code:'E_PA_FONT_EMBEDDED'});
});
test('SVG resolution and crop are explicit while gzip remains a Core-controlled source',async()=>{
 const font=await open('svg-gzip');try{const run=await prepareEmbeddedFontRun(font,'B',{script:'Latn',fontSize:40,coordinates,source:{format:'svg',viewBox:[0,-800,1000,1000],pixelsPerEm:80}});assert.deepEqual(run.embeddedGlyphs[0].rasterSize,[80,80]);assert.deepEqual(run.embeddedGlyphs[0].rect,[0,8,40,40]);assert.equal((run.embeddedGlyphs[0].originalMetrics.document as any).gzip,true);}finally{await font.dispose();}
});
test('missing original artwork, missing glyph and undeclared selector shape fail visibly',async()=>{
 const font=await open('svg');try{const p={script:'Latn',fontSize:40,coordinates,source:{format:'svg',viewBox:[0,-800,1000,1000]}as const};await assert.rejects(prepareEmbeddedFontRun(font,'C',p),/no SVG document covers/);await assert.rejects(prepareEmbeddedFontRun(font,'Z',p),/notdef/);for(const source of [{format:'svg',viewBox:[0,0,0,4]},{format:'sbix',strikeIndex:-1},{format:'svg',viewBox:[0,0,1,1],bytes:[1]},{format:'svg',viewBox:[0,0,1,1],foreground:[2,0,0,1]}])await assert.rejects(prepareEmbeddedFontRun(font,'A',{...p,source:source as any}),{code:'E_PA_FONT_EMBEDDED'});}finally{await font.dispose();}
});
test('cancelled preparation publishes no run and failed source query leaves owned font usable',async()=>{
 const font=await open('sbix');try{const p={script:'Latn',fontSize:32,coordinates,source:{format:'sbix',strikeIndex:1}as const};await assert.rejects(prepareEmbeddedFontRun(font,'A',{...p,signal:AbortSignal.abort()}),{code:'E_RENDER_CANCELLED'});await assert.rejects(prepareEmbeddedFontRun(font,'B',p));assert.equal((await prepareEmbeddedFontRun(font,'A',p)).embeddedGlyphs.length,1);}finally{await font.dispose();}
});
